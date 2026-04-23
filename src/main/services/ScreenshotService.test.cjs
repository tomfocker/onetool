const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadScreenshotServiceModule() {
  const filePath = path.join(__dirname, 'ScreenshotService.ts')
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
  const eventLog = []

  class BrowserWindowMock {
    static fromWebContents(webContents) {
      return webContents.windowRef || null
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        app: {
          getPath: () => 'C:/tmp'
        },
        BrowserWindow: BrowserWindowMock,
        desktopCapturer: {},
        screen: {},
        nativeImage: {},
        dialog: {},
        clipboard: {}
      }
    }

    if (specifier === '@electron-toolkit/utils') {
      return {
        is: {
          dev: false
        }
      }
    }

    if (specifier === './SettingsService') {
      return {
        settingsService: {
          getSettings: () => ({})
        }
      }
    }

    if (specifier === '../utils/windowSecurity') {
      return {
        createIsolatedPreloadWebPreferences: () => ({})
      }
    }

    if (specifier === '../../shared/types') {
      return {}
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

  return {
    ...module.exports,
    eventLog
  }
}

test('closeSelectionWindow sends the selection result before closing overlay windows', async () => {
  const { ScreenshotService, eventLog } = loadScreenshotServiceModule()
  const service = new ScreenshotService()

  const senderWindow = {
    getBounds: () => ({ x: 100, y: 200, width: 800, height: 600 })
  }

  const sender = { windowRef: senderWindow }

  service.mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        eventLog.push(['send', channel, payload])
      }
    }
  }

  service.selectionResultsChannel = 'recorder-selection-result'
  service.selectionWindows = [
    {
      isDestroyed: () => false,
      hide() {
        eventLog.push(['hide', 'overlay-1'])
      }
    },
    {
      isDestroyed: () => false,
      hide() {
        eventLog.push(['hide', 'overlay-2'])
      }
    }
  ]

  service.closeSelectionWindow(sender, { x: 10, y: 20, width: 300, height: 200 })

  assert.equal(
    JSON.stringify(eventLog[0]),
    JSON.stringify([
      'send',
      'recorder-selection-result',
      { x: 110, y: 220, width: 300, height: 200 }
    ])
  )

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(
    JSON.stringify(eventLog.slice(1)),
    JSON.stringify([
      ['hide', 'overlay-1'],
      ['hide', 'overlay-2']
    ])
  )
})

test('openSelectionWindow reuses hidden selection windows on subsequent sessions', () => {
  const filePath = path.join(__dirname, 'ScreenshotService.ts')
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
  const createdWindows = []

  class BrowserWindowMock {
    static fromWebContents(webContents) {
      return webContents.windowRef || null
    }

    constructor(options) {
      this.options = options
      this.visible = false
      this.closed = false
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      this.webContents = { send() {} }
      createdWindows.push(this)
    }

    setIgnoreMouseEvents() {}
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setMenu() {}
    setMenuBarVisibility() {}
    loadURL() {}
    on() {}
    isDestroyed() { return this.closed }
    getBounds() { return this.bounds }
    show() { this.visible = true }
    hide() { this.visible = false }
    close() { this.closed = true }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return {
        app: { getPath: () => 'C:/tmp' },
        BrowserWindow: BrowserWindowMock,
        desktopCapturer: {},
        screen: {
          getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
        },
        nativeImage: {},
        dialog: {},
        clipboard: {}
      }
    }

    if (specifier === '@electron-toolkit/utils') {
      return { is: { dev: false } }
    }

    if (specifier === './SettingsService') {
      return { settingsService: { getSettings: () => ({}) } }
    }

    if (specifier === '../utils/windowSecurity') {
      return { createIsolatedPreloadWebPreferences: () => ({}) }
    }

    if (specifier === '../../shared/types') {
      return {}
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

  const { ScreenshotService } = module.exports
  const service = new ScreenshotService()

  service.openSelectionWindow()
  assert.equal(createdWindows.length, 1)
  assert.equal(createdWindows[0].visible, true)

  service.selectionWindows[0].hide()
  service.openSelectionWindow()

  assert.equal(createdWindows.length, 1)
  assert.equal(service.selectionWindows[0], createdWindows[0])
})
