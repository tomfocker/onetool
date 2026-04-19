const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenRecorderServiceModule() {
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
      this.webContents = {
        send() {}
      }
      browserWindowInstances.push(this)
    }

    loadURL(url) {
      this.loadedUrls.push(url)
    }

    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents() {}
    isDestroyed() { return false }
    close() {}
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
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
    }

    if (specifier === 'child_process') {
      return {
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
        screenshotService: {
          capture: async () => ({ success: true, data: 'data:image/png;base64,preview' })
        }
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
