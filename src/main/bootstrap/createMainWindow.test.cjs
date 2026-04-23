const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCreateMainWindowModule() {
  const filePath = path.join(__dirname, 'createMainWindow.ts')
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

  return module.exports
}

test('createMainWindow builds the frameless shell and loads the renderer entry', () => {
  const { createMainWindow } = loadCreateMainWindowModule()
  const eventHandlers = new Map()
  const webContentsHandlers = new Map()
  const shellCalls = []
  const preloadCalls = []
  const bindCalls = []
  const timeoutCalls = []
  const loadCalls = []
  let capturedOptions = null

  class FakeBrowserWindow {
    constructor(options) {
      capturedOptions = options
      this.webContents = {
        on(event, handler) {
          webContentsHandlers.set(event, handler)
        },
        setWindowOpenHandler(handler) {
          webContentsHandlers.set('windowOpenHandler', handler)
        }
      }
    }

    on(event, handler) {
      eventHandlers.set(event, handler)
    }

    show() {
      loadCalls.push('show')
    }

    hide() {
      loadCalls.push('hide')
    }

    loadURL(url) {
      loadCalls.push(['loadURL', url])
    }

    loadFile(file) {
      loadCalls.push(['loadFile', file])
    }
  }

  const mainWindow = createMainWindow({
    BrowserWindow: FakeBrowserWindow,
    shell: {
      openExternal(url) {
        shellCalls.push(url)
      }
    },
    runtime: {
      isDevelopment: true,
      rendererUrl: 'http://127.0.0.1:5173'
    },
    assets: {
      iconPath: 'D:/icon.png',
      preloadPath: 'D:/preload/index.js',
      rendererHtmlPath: 'D:/renderer/index.html'
    },
    settingsService: {
      getSettings() {
        return { minimizeToTray: true }
      }
    },
    windowManagerService: {
      getIsQuitting() {
        return false
      }
    },
    clipboardService: {
      startWatcher() {
        loadCalls.push('clipboard.startWatcher')
      }
    },
    logger: {
      error(...args) {
        loadCalls.push(['logger.error', ...args])
      }
    },
    shouldHideMainWindowOnClose() {
      return true
    },
    createWindowIcon(pathValue) {
      return `icon:${pathValue}`
    },
    createPreloadPreferences(preloadPath) {
      preloadCalls.push(preloadPath)
      return { preload: preloadPath, sandbox: true }
    },
    bindMainWindowServices(window) {
      bindCalls.push(window)
    },
    onWindowClosed(window) {
      bindCalls.push(['closed', window])
    },
    scheduleTimeout(handler, timeoutMs) {
      timeoutCalls.push(timeoutMs)
      handler()
      return timeoutMs
    }
  })

  assert.equal(bindCalls[0], mainWindow)
  assert.equal(capturedOptions.frame, false)
  assert.equal(capturedOptions.autoHideMenuBar, true)
  assert.equal(capturedOptions.icon, 'icon:D:/icon.png')
  assert.deepEqual(JSON.parse(JSON.stringify(capturedOptions.webPreferences)), {
    preload: 'D:/preload/index.js',
    sandbox: true
  })
  assert.deepEqual(preloadCalls, ['D:/preload/index.js'])
  assert.deepEqual(JSON.parse(JSON.stringify(loadCalls)), [['loadURL', 'http://127.0.0.1:5173']])

  eventHandlers.get('ready-to-show')()
  assert.deepEqual(JSON.parse(JSON.stringify(timeoutCalls)), [1000])
  assert.ok(loadCalls.includes('show'))
  assert.ok(loadCalls.includes('clipboard.startWatcher'))

  const closeEvent = {
    prevented: false,
    preventDefault() {
      this.prevented = true
    }
  }
  eventHandlers.get('close')(closeEvent)
  assert.equal(closeEvent.prevented, true)
  assert.ok(loadCalls.includes('hide'))

  eventHandlers.get('closed')()
  assert.equal(bindCalls[1][0], 'closed')
  assert.equal(bindCalls[1][1], mainWindow)

  assert.deepEqual(
    JSON.parse(JSON.stringify(webContentsHandlers.get('windowOpenHandler')({ url: 'https://example.com' }))),
    { action: 'deny' }
  )
  assert.deepEqual(shellCalls, ['https://example.com'])
})

test('createMainWindow falls back to file loading outside development mode', () => {
  const { createMainWindow } = loadCreateMainWindowModule()
  const loadCalls = []

  class FakeBrowserWindow {
    constructor() {
      this.webContents = {
        on() {},
        setWindowOpenHandler() {}
      }
    }

    on() {}

    loadURL(url) {
      loadCalls.push(['loadURL', url])
    }

    loadFile(file) {
      loadCalls.push(['loadFile', file])
    }
  }

  createMainWindow({
    BrowserWindow: FakeBrowserWindow,
    shell: { openExternal() {} },
    runtime: {
      isDevelopment: false,
      rendererUrl: null
    },
    assets: {
      iconPath: 'D:/icon.png',
      preloadPath: 'D:/preload/index.js',
      rendererHtmlPath: 'D:/renderer/index.html'
    },
    settingsService: {
      getSettings() {
        return { minimizeToTray: false }
      }
    },
    windowManagerService: {
      getIsQuitting() {
        return false
      }
    },
    clipboardService: {
      startWatcher() {}
    },
    logger: {
      error() {}
    },
    shouldHideMainWindowOnClose() {
      return false
    },
    createWindowIcon() {
      return undefined
    },
    createPreloadPreferences() {
      return {}
    },
    bindMainWindowServices() {},
    onWindowClosed() {}
  })

  assert.deepEqual(JSON.parse(JSON.stringify(loadCalls)), [['loadFile', 'D:/renderer/index.html']])
})
