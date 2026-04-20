const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenRecorderServiceModule(options = {}) {
  const filePath = path.join(__dirname, 'ScreenRecorderService.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  const browserWindowInstances = []

  class BrowserWindowMock {
    constructor(options) {
      this.options = options
      this.loadedUrls = []
      this.closed = false
      this.bounds = { ...options }
      this.ignoreMouseEventsCalls = []
      this.contentProtectionCalls = []
      this.webContents = {
        send() {}
      }
      browserWindowInstances.push(this)
    }

    loadURL(url) {
      this.loadedUrls.push(url)
    }

    setBounds(bounds) {
      this.bounds = { ...this.bounds, ...bounds }
    }
    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents(...args) {
      this.ignoreMouseEventsCalls.push(args)
    }
    setContentProtection(enabled) {
      this.contentProtectionCalls.push(enabled)
    }
    isDestroyed() { return false }
    close() { this.closed = true }
  }

  const defaultElectronModule = {
    app: {
      isPackaged: false,
      getPath: () => 'C:/tmp'
    },
    BrowserWindow: BrowserWindowMock,
    dialog: {},
    desktopCapturer: {},
    screen: {
      getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
    }
  }
  const electronModule = {
    ...defaultElectronModule,
    ...options.electronModule,
    BrowserWindow: options.electronModule?.BrowserWindow || BrowserWindowMock,
    screen: options.electronModule?.screen || defaultElectronModule.screen
  }

  const screenshotService = options.screenshotService || {
    capture: async () => ({ success: true, data: 'data:image/png;base64,preview' })
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return electronModule
    }

    if (specifier === 'child_process') {
      return options.childProcessModule || {
        spawn() {
          throw new Error('spawn should not run in this unit test')
        },
        execSync() {
          return ''
        }
      }
    }

    if (specifier === 'fluent-ffmpeg') {
      return {
        setFfmpegPath() {}
      }
    }

    if (specifier === 'ffmpeg-static') {
      return 'C:/tmp/ffmpeg.exe'
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/screenRecorderSession') {
      return require(path.join(__dirname, '../../shared/screenRecorderSession.ts'))
    }

    if (specifier === './ProcessRegistry') {
      return {
        processRegistry: {
          register() {},
          unregister() {}
        }
      }
    }

    if (specifier === './ScreenshotService') {
      return {
        screenshotService
      }
    }

    if (specifier === '../utils/windowSecurity') {
      return {
        createIsolatedPreloadWebPreferences(preload) {
          return {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      }
    }

    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return { ...module.exports, browserWindowInstances }
}

const { ScreenRecorderService, browserWindowInstances } = loadScreenRecorderServiceModule()

test('expandPanel refuses to restore the main window while recording is active', () => {
  const recorder = new ScreenRecorderService()
  const calls = []
  recorder.mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
  recorder.session = {
    status: 'recording',
    mode: 'full',
    outputPath: 'C:/tmp/capture.mp4',
    recordingTime: '00:00:15',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: 'display-1'
  }

  const result = recorder.expandPanel()
  assert.equal(result.success, false)
  assert.equal(result.error, '录制中无法展开主面板')
  assert.deepEqual(calls, [])
})

test('indicator and border windows use isolated preload preferences', () => {
  browserWindowInstances.length = 0
  const recorder = new ScreenRecorderService()

  recorder.createIndicatorWindow({ x: 10, y: 20, width: 300, height: 200 })
  recorder.createBorderWindow({ x: 10, y: 20, width: 300, height: 200 })

  assert.equal(browserWindowInstances.length, 2)
  assert.equal(browserWindowInstances[0].options.webPreferences.contextIsolation, true)
  assert.equal(browserWindowInstances[0].options.webPreferences.nodeIntegration, false)
  assert.equal(browserWindowInstances[0].options.webPreferences.sandbox, true)
  assert.equal(browserWindowInstances[1].options.webPreferences.contextIsolation, true)
  assert.equal(browserWindowInstances[1].options.webPreferences.nodeIntegration, false)
  assert.equal(browserWindowInstances[1].options.webPreferences.sandbox, true)
  assert.deepEqual(browserWindowInstances[0].contentProtectionCalls, [true])
  assert.deepEqual(browserWindowInstances[1].contentProtectionCalls, [true])
})

test('indicator HTML uses preload bridge instead of require electron', () => {
  browserWindowInstances.length = 0
  const recorder = new ScreenRecorderService()

  recorder.createIndicatorWindow({ x: 10, y: 20, width: 300, height: 200 })

  const htmlDataUrl = browserWindowInstances[0].loadedUrls[0]
  const html = decodeURIComponent(htmlDataUrl.replace('data:text/html;charset=utf-8,', ''))

  assert.equal(html.includes("require('electron')"), false)
  assert.equal(html.includes('window.electron.screenRecorder.stopRecording()'), true)
  assert.equal(html.includes('window.electron.screenRecorder.onIndicatorTimeUpdated('), true)
})

test('getScreens returns the actual Electron display id even when desktop sources omit display_id', async () => {
  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      BrowserWindow: class BrowserWindowMock {},
      dialog: {},
      desktopCapturer: {
        getSources: async () => ([
          {
            id: 'screen:2:0',
            name: 'Display 2',
            display_id: '',
            thumbnail: {
              getSize: () => ({ width: 2560, height: 1440 }),
              toDataURL: () => 'data:image/png;base64,thumb'
            }
          }
        ])
      },
      screen: {
        getPrimaryDisplay: () => ({ id: 202, scaleFactor: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }),
        getAllDisplays: () => [
          { id: 202, scaleFactor: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }
        ]
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const result = await recorder.getScreens()

  assert.equal(result.success, true)
  assert.equal(result.data[0].display_id, '202')
})

test('prepareSelection keeps a persistent border preview without requiring an in-app image snapshot', async () => {
  const {
    ScreenRecorderService,
    browserWindowInstances: localBrowserWindowInstances
  } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
        getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      }
    },
    screenshotService: {
      capture: async () => {
        throw new Error('capture should not be used for recorder selection preview')
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const result = await recorder.prepareSelection({ x: 10, y: 20, width: 300, height: 200 })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(result.success, true)
  assert.equal(result.data.previewDataUrl, '')
  assert.equal(localBrowserWindowInstances.length, 1)
  assert.equal(recorder.session.selectionPreviewDataUrl, null)
  assert.equal(recorder.session.status, 'ready-to-record')
})

test('hideSelectionPreview closes the existing prepared border preview window', async () => {
  const {
    ScreenRecorderService,
    browserWindowInstances: localBrowserWindowInstances
  } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
        getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      }
    },
    screenshotService: {
      capture: async () => ({ success: true, data: 'unused' })
    }
  })

  const recorder = new ScreenRecorderService()
  await recorder.prepareSelection({ x: 10, y: 20, width: 300, height: 200 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(localBrowserWindowInstances.length, 1)

  recorder.hideSelectionPreview()

  assert.equal(localBrowserWindowInstances[0].closed, true)
  assert.equal(recorder.borderWindow, null)
})

test('prepareSelection updates the recorder session immediately before the border preview window is created', async () => {
  const {
    ScreenRecorderService,
    browserWindowInstances: localBrowserWindowInstances
  } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
        getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const result = await recorder.prepareSelection({ x: 40, y: 50, width: 200, height: 120 })

  assert.equal(result.success, true)
  assert.equal(recorder.session.status, 'ready-to-record')
  assert.equal(JSON.stringify(recorder.session.selectionBounds), JSON.stringify({ x: 40, y: 50, width: 200, height: 120 }))
  assert.equal(localBrowserWindowInstances.length, 0)

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(localBrowserWindowInstances.length, 1)
})

test('border preview stays interactive so the prepared selection can be dragged directly', () => {
  browserWindowInstances.length = 0
  const recorder = new ScreenRecorderService()

  recorder.createBorderWindow({ x: 10, y: 20, width: 300, height: 200 })

  const borderWindow = browserWindowInstances[0]
  const htmlDataUrl = borderWindow.loadedUrls[0]
  const html = decodeURIComponent(htmlDataUrl.replace('data:text/html;charset=utf-8,', ''))

  assert.equal(borderWindow.ignoreMouseEventsCalls.length, 1)
  assert.equal(borderWindow.ignoreMouseEventsCalls[0][0], false)
  assert.equal(html.includes('window.electron.screenRecorder.moveSelectionBy('), true)
  assert.equal(html.includes('cursor: move;'), true)
})

test('recording border preview becomes click-through so the selected area remains usable', async () => {
  const {
    ScreenRecorderService,
    browserWindowInstances: localBrowserWindowInstances
  } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
        getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      }
    }
  })

  const recorder = new ScreenRecorderService()
  await recorder.prepareSelection({ x: 10, y: 20, width: 300, height: 200 })
  await new Promise((resolve) => setTimeout(resolve, 0))

  recorder.createBorderWindow({ x: 10, y: 20, width: 300, height: 200 }, false)

  assert.equal(localBrowserWindowInstances.length, 1)
  assert.equal(localBrowserWindowInstances[0].ignoreMouseEventsCalls.at(-1)[0], true)
  assert.equal(localBrowserWindowInstances[0].ignoreMouseEventsCalls.at(-1)[1].forward, true)
})

test('movePreparedSelectionBy updates the prepared recorder bounds and repositions the border window', async () => {
  const {
    ScreenRecorderService,
    browserWindowInstances: localBrowserWindowInstances
  } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
        getDisplayNearestPoint: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
      }
    }
  })

  const recorder = new ScreenRecorderService()
  await recorder.prepareSelection({ x: 10, y: 20, width: 300, height: 200 })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const result = recorder.movePreparedSelectionBy(50, 40)

  assert.equal(result.success, true)
  assert.deepEqual(recorder.session.selectionBounds, { x: 60, y: 60, width: 300, height: 200 })
  assert.equal(localBrowserWindowInstances.length, 1)
  assert.deepEqual(localBrowserWindowInstances[0].bounds, {
    ...localBrowserWindowInstances[0].bounds,
    x: 56,
    y: 56,
    width: 308,
    height: 208
  })
})

test('getScreens requests lightweight thumbnails for the recorder picker', async () => {
  let requestedThumbnailSize = null

  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {
        getSources: async (options) => {
          requestedThumbnailSize = options.thumbnailSize
          return [
            {
              id: 'screen:1:0',
              name: 'Display 1',
              display_id: '101',
              thumbnail: {
                getSize: () => ({ width: 320, height: 180 }),
                toDataURL: () => 'data:image/png;base64,thumb'
              }
            }
          ]
        }
      },
      screen: {
        getPrimaryDisplay: () => ({ id: 101, scaleFactor: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 } }),
        getAllDisplays: () => [
          { id: 101, scaleFactor: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 } }
        ]
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const result = await recorder.getScreens()

  assert.equal(result.success, true)
  assert.equal(
    JSON.stringify(requestedThumbnailSize),
    JSON.stringify({ width: 320, height: 180 })
  )
})

test('getDefaultPath uses a stable human-readable recorder filename pattern', () => {
  const recorder = new ScreenRecorderService()

  const result = recorder.getDefaultPath('gif')

  assert.equal(result.success, true)
  assert.match(
    result.data.replace(/\\/g, '/'),
    /C:\/tmp\/OneTool-Recording-\d{8}-\d{6}-\d{3}\.gif$/
  )
})

test('selectOutput uses the active recorder format for the suggested default filename', async () => {
  let receivedOptions = null
  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      BrowserWindow: class BrowserWindowMock {},
      dialog: {
        showSaveDialog: async (_window, options) => {
          receivedOptions = options
          return { canceled: true, filePath: null }
        }
      },
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const result = await recorder.selectOutput({}, 'gif')

  assert.equal(result.success, true)
  assert.match(receivedOptions.defaultPath.replace(/\\/g, '/'), /\.gif$/)
  assert.match(receivedOptions.defaultPath.replace(/\\/g, '/'), /OneTool-Recording-\d{8}-\d{6}-\d{3}\.gif$/)
})

test('bindRecorderProcess rotates a fresh default output path after a successful auto-named recording', () => {
  const recorder = new ScreenRecorderService()
  const sentEvents = []
  const firstAutoPath = 'C:/tmp/OneTool-Recording-20260420-120000-123.mp4'

  recorder.mainWindow = {
    isDestroyed: () => false,
    show: () => {},
    webContents: {
      send: (...args) => sentEvents.push(args)
    }
  }
  recorder.recorderProcess = {
    stderr: { on() {} },
    on(event, handler) {
      if (event === 'close') {
        this.closeHandler = handler
      }
    }
  }
  recorder.session = {
    status: 'finishing',
    mode: 'full',
    outputPath: firstAutoPath,
    recordingTime: '00:00:10',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: '1'
  }
  recorder.buildDefaultOutputPath = () => 'C:/tmp/OneTool-Recording-20260420-120001-456.mp4'

  recorder.bindRecorderProcess({
    outputPath: firstAutoPath,
    format: 'mp4'
  })
  recorder.recorderProcess.closeHandler(0)

  assert.equal(recorder.session.outputPath, 'C:/tmp/OneTool-Recording-20260420-120001-456.mp4')
  assert.equal(sentEvents.at(-1)[0], 'screen-recorder-stopped')
  assert.equal(sentEvents.at(-1)[1].outputPath, firstAutoPath)
})

test('buildCaptureArgs converts secondary full-screen bounds through Windows DIP-to-screen coordinates', () => {
  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 2, size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [
          { id: 1, scaleFactor: 2, size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
          { id: 2, scaleFactor: 1, size: { width: 2560, height: 1440 }, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }
        ],
        dipToScreenRect: (_window, rect) => ({
          x: 3840,
          y: 0,
          width: 2560,
          height: 1440
        }),
        dipToScreenPoint: ({ x, y }) => {
          if (x === 1920) {
            return { x: 3840, y }
          }
          if (x === 4480) {
            return { x: 6400, y: 1440 }
          }
          return { x, y }
        }
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const args = recorder.buildCaptureArgs({
    outputPath: 'C:/tmp/out.mp4',
    format: 'mp4',
    displayId: '2'
  })

  assert.equal(
    JSON.stringify(args),
    JSON.stringify([
      '-y', '-f', 'gdigrab', '-framerate', '30',
      '-offset_x', '3840',
      '-offset_y', '0',
      '-video_size', '2560x1440',
      '-i', 'desktop'
    ])
  )
})

test('buildCaptureArgs preserves the full primary display rect without trimming two pixels', () => {
  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1.5, size: { width: 2560, height: 1440 }, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }),
        getAllDisplays: () => [
          { id: 1, scaleFactor: 1.5, size: { width: 2560, height: 1440 }, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }
        ],
        dipToScreenRect: (_window, rect) => ({
          x: 0,
          y: 0,
          width: 3840,
          height: 2160
        })
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const args = recorder.buildCaptureArgs({
    outputPath: 'C:/tmp/out.mp4',
    format: 'mp4'
  })

  assert.equal(
    JSON.stringify(args),
    JSON.stringify([
      '-y', '-f', 'gdigrab', '-framerate', '30',
      '-offset_x', '0',
      '-offset_y', '0',
      '-video_size', '3840x2160',
      '-i', 'desktop'
    ])
  )
})

test('start regenerates a fresh auto-generated output path before launching ffmpeg', async () => {
  let spawnedArgs = null
  const fakeProcess = {
    stdin: { writable: true, write() {} },
    stdout: { on() {} },
    stderr: { on() {} },
    kill() {},
    on() {}
  }
  const { ScreenRecorderService } = loadScreenRecorderServiceModule({
    childProcessModule: {
      spawn(_command, args) {
        spawnedArgs = args
        return fakeProcess
      },
      execSync() {
        return ''
      }
    },
    electronModule: {
      app: {
        isPackaged: false,
        getPath: () => 'C:/tmp'
      },
      dialog: {},
      desktopCapturer: {},
      screen: {
        getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        getAllDisplays: () => [
          { id: 1, scaleFactor: 1, size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
        ],
        dipToScreenRect: (_window, rect) => rect
      }
    }
  })

  const recorder = new ScreenRecorderService()
  const firstAutoPath = 'C:/tmp/OneTool-Recording-20260420-130000-100.mp4'
  const rotatedAutoPath = 'C:/tmp/OneTool-Recording-20260420-130500-200.mp4'
  recorder.getFfmpegPath = () => __filename
  recorder.buildDefaultOutputPath = () => rotatedAutoPath
  recorder.mainWindow = {
    isDestroyed: () => false,
    minimize() {},
    webContents: { send() {} }
  }

  const result = await recorder.start({
    outputPath: firstAutoPath,
    format: 'mp4',
    quality: 'medium'
  })

  assert.equal(result.success, true)
  assert.equal(recorder.session.outputPath, rotatedAutoPath)
  assert.equal(spawnedArgs.at(-1), rotatedAutoPath)
})
