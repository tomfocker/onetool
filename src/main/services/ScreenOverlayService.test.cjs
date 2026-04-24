const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function loadScreenOverlayServiceModule(mocks) {
  const filePath = path.join(__dirname, 'ScreenOverlayService.ts')
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
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return mocks.electron
    if (request === '@electron-toolkit/utils') return mocks.electronToolkitUtils
    if (request === '../utils/windowSecurity') return mocks.windowSecurity
    if (request === '../utils/logger') return mocks.loggerModule || { logger: { info() {}, warn() {}, error() {}, debug() {} } }
    if (request === '../../shared/types' || request === '../../shared/llm') return {}
    if (request === './OcrService') return mocks.ocrServiceModule
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    vm.runInNewContext(transpiled, {
      module,
      exports: module.exports,
      require,
      __dirname: path.dirname(filePath),
      __filename: filePath,
      console,
      process,
      Buffer,
      setTimeout,
      clearTimeout
    }, { filename: filePath })
  } finally {
    Module._load = originalLoad
  }

  return module.exports
}

test('start creates overlay windows immediately before screen capture resolves', async () => {
  const getSourcesDeferred = deferred()
  const browserWindows = []
  const readyHandlers = []
  let warmupCalls = 0
  let ipcReadyHandler = null

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.webContents = {
        id: browserWindows.length + 1,
        send() {}
      }
      browserWindows.push(this)
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once(event, handler) {
      if (event === 'ready-to-show') readyHandlers.push(handler)
    }
    on() {}
    isDestroyed() { return false }
    close() {}
    show() {}
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          return getSourcesDeferred.promise
        }
      },
      ipcMain: {
        on(channel, handler) {
          if (channel === 'screen-overlay:ready') ipcReadyHandler = handler
        }
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          warmupCalls += 1
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  const startPromise = service.start('ocr')

  assert.equal(browserWindows.length, 1)
  assert.equal(warmupCalls, 1)
  assert.equal(browserWindows[0].options.show, false)

  getSourcesDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,screen' }
      }
    }
  ])

  const result = await startPromise
  assert.equal(result.success, true)
  assert.equal(typeof ipcReadyHandler, 'function')
  assert.equal(readyHandlers.length, 0)
})

test('start does not wait for pending overlay precreation to resolve', async () => {
  const getSourcesDeferred = deferred()
  let warmupCalls = 0

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        id: 1,
        send() {}
      }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {}
    show() {}
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          return getSourcesDeferred.promise
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          warmupCalls += 1
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  const prepareWindowsDeferred = deferred()
  service.prepareWindows = () => prepareWindowsDeferred.promise

  const startResult = await Promise.race([
    service.start('translate'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 25))
  ])

  assert.notEqual(startResult, 'timeout')
  assert.equal(warmupCalls, 1)

  prepareWindowsDeferred.resolve()
  getSourcesDeferred.resolve([])
})

test('ready windows receive captured screenshot after async capture completes', async () => {
  const getSourcesDeferred = deferred()
  const browserWindows = []
  let ipcReadyHandler = null
  const sentScreenshots = []

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        id: 99,
        send(channel, payload) {
          sentScreenshots.push([channel, payload])
        }
      }
      browserWindows.push(this)
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    show() {}
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          return getSourcesDeferred.promise
        }
      },
      ipcMain: {
        on(channel, handler) {
          if (channel === 'screen-overlay:ready') ipcReadyHandler = handler
        }
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  const startResult = await Promise.race([
    service.start('translate'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 25))
  ])
  assert.notEqual(startResult, 'timeout')
  ipcReadyHandler({ sender: { id: 99 } })

  getSourcesDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,screen' }
      }
    }
  ])

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(JSON.parse(JSON.stringify(sentScreenshots.filter(([channel]) => channel === 'screen-overlay:screenshot'))), [
    ['screen-overlay:screenshot', 'data:image/png;base64,screen']
  ])
})

test('setMainWindow prepares hidden overlay windows and later reuses them across sessions', async () => {
  const browserWindows = []
  const sentEvents = []

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.visible = Boolean(options.show)
      this.closed = false
      this.webContents = {
        id: browserWindows.length + 1,
        send(channel, payload) {
          sentEvents.push([channel, payload])
        }
      }
      browserWindows.push(this)
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on(event, handler) {
      if (event === 'closed') {
        this.onClosed = handler
      }
    }
    isDestroyed() { return this.closed }
    close() {
      this.closed = true
      this.onClosed?.()
    }
    hide() {
      this.visible = false
    }
    show() {
      this.visible = true
    }
  }

  const displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return displays
        }
      },
      desktopCapturer: {
        getSources() {
          return Promise.resolve([
            {
              display_id: '1',
              thumbnail: {
                getSize() { return { width: 1920, height: 1080 } },
                toDataURL() { return 'data:image/png;base64,screen' }
              }
            }
          ])
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  service.setMainWindow({})
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(browserWindows.length, 1)
  assert.equal(browserWindows[0].options.show, false)

  await service.start('translate')
  const firstWindow = browserWindows[0]
  assert.equal(firstWindow.visible, true)

  await service.close()
  assert.equal(firstWindow.visible, false)
  assert.equal(firstWindow.closed, false)

  await service.start('ocr')
  assert.equal(browserWindows.length, 1)
  assert.equal(browserWindows[0], firstWindow)
  assert.deepEqual(JSON.parse(JSON.stringify(sentEvents.filter(([channel]) => channel === 'screen-overlay:session-start'))), [
    ['screen-overlay:session-start', { mode: 'translate' }],
    ['screen-overlay:session-start', { mode: 'ocr' }]
  ])
})

test('setMainWindow prewarms screenshot cache before the first overlay session', async () => {
  let captureCallCount = 0
  const firstCaptureDeferred = deferred()
  const secondCaptureDeferred = deferred()

  class FakeBrowserWindow {
    constructor() {
      this.webContents = { id: 11, send() {} }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {}
    show() {}
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          captureCallCount += 1
          return captureCallCount === 1 ? firstCaptureDeferred.promise : secondCaptureDeferred.promise
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  service.setMainWindow({})

  firstCaptureDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,prewarm' }
      }
    }
  ])
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(service.screenMap.get(1), 'data:image/png;base64,prewarm')

  await service.start('translate')
  assert.equal(captureCallCount, 1)

  await service.close()
  assert.equal(captureCallCount, 2)

  secondCaptureDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,fresh' }
      }
    }
  ])
})

test('restart reuses the previous screenshot cache on the next session', async () => {
  const sentEvents = []
  let ipcReadyHandler = null
  const firstCaptureDeferred = deferred()
  let captureCallCount = 0

  class FakeBrowserWindow {
    constructor() {
      this.visible = false
      this.webContents = {
        id: 7,
        send(channel, payload) {
          sentEvents.push([channel, payload])
        }
      }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {
      this.visible = false
    }
    show() {
      this.visible = true
    }
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          captureCallCount += 1
          return firstCaptureDeferred.promise
        }
      },
      ipcMain: {
        on(channel, handler) {
          if (channel === 'screen-overlay:ready') ipcReadyHandler = handler
        }
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  service.setMainWindow({})
  await new Promise((resolve) => setImmediate(resolve))

  await service.start('translate')
  ipcReadyHandler({ sender: { id: 7 } })
  firstCaptureDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,first' }
      }
    }
  ])
  await new Promise((resolve) => setImmediate(resolve))

  await service.close()
  const screenshotsBeforeRestart = sentEvents.filter(([channel]) => channel === 'screen-overlay:screenshot').length

  await service.start('ocr')
  const screenshotsAfterRestart = sentEvents.filter(([channel]) => channel === 'screen-overlay:screenshot')
  assert.equal(screenshotsAfterRestart.length, screenshotsBeforeRestart + 1)
  assert.deepEqual(JSON.parse(JSON.stringify(screenshotsAfterRestart.at(-1))), ['screen-overlay:screenshot', 'data:image/png;base64,first'])
})

test('start does not recapture screenshots while overlays are visible', async () => {
  let captureCallCount = 0
  const firstCaptureDeferred = deferred()

  class FakeBrowserWindow {
    constructor() {
      this.webContents = { id: 1, send() {} }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {}
    show() {}
  }

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        }
      },
      desktopCapturer: {
        getSources() {
          captureCallCount += 1
          return firstCaptureDeferred.promise
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  service.setMainWindow({})
  firstCaptureDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 1920, height: 1080 } },
        toDataURL() { return 'data:image/png;base64,prewarm' }
      }
    }
  ])
  await new Promise((resolve) => setImmediate(resolve))

  await service.start('translate')
  assert.equal(captureCallCount, 1)
})

test('start sizes deferred capture around the active display instead of the largest display', async () => {
  const getSourcesDeferred = deferred()
  const captureRequests = []

  class FakeBrowserWindow {
    constructor() {
      this.webContents = { id: 1, send() {} }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {}
    show() {}
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 } }
  ]

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return displays
        },
        getCursorScreenPoint() {
          return { x: 2200, y: 200 }
        },
        getDisplayNearestPoint() {
          return displays[1]
        }
      },
      desktopCapturer: {
        getSources(options) {
          captureRequests.push(options)
          return getSourcesDeferred.promise
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  await service.start('translate')
  for (let attempt = 0; attempt < 4 && captureRequests.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }

  assert.equal(captureRequests.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(captureRequests[0].thumbnailSize)), {
    width: 1280,
    height: 720
  })

  getSourcesDeferred.resolve([
    {
      display_id: '1',
      thumbnail: {
        getSize() { return { width: 2560, height: 1440 } },
        toDataURL() { return 'data:image/png;base64,screen-1' }
      }
    },
    {
      display_id: '2',
      thumbnail: {
        getSize() { return { width: 1280, height: 720 } },
        toDataURL() { return 'data:image/png;base64,screen-2' }
      }
    }
  ])
})

test('start shows the active display overlay before secondary displays', async () => {
  const showOrder = []

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.webContents = { id: options.x === 0 ? 1 : 2, send() {} }
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    close() {}
    hide() {}
    show() {
      showOrder.push(this.options.x === 0 ? 'primary' : 'secondary')
    }
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 } }
  ]

  const { ScreenOverlayService } = loadScreenOverlayServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getAllDisplays() {
          return displays
        },
        getCursorScreenPoint() {
          return { x: 2300, y: 200 }
        },
        getDisplayNearestPoint() {
          return displays[1]
        }
      },
      desktopCapturer: {
        getSources() {
          return Promise.resolve([])
        }
      },
      ipcMain: {
        on() {}
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    },
    ocrServiceModule: {
      ocrService: {
        warmup() {
          return Promise.resolve()
        }
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ScreenOverlayService()
  service.setMainWindow({})
  for (let attempt = 0; attempt < 4 && showOrder.length === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }

  await service.start('translate')
  assert.equal(showOrder[0], 'secondary')

  for (let attempt = 0; attempt < 4 && showOrder.length < 2; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.deepEqual(showOrder.slice(0, 2), ['secondary', 'primary'])
})
