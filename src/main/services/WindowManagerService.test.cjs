const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWindowManagerServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'WindowManagerService.ts')
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
  const trayInstances = []

  class BrowserWindowMock {
    constructor(options) {
      this.options = options
      this._bounds = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? 0,
        height: options.height ?? 0
      }
      this.webContents = {
        isLoading: () => false,
        once() {},
        on() {},
        send() {},
        getURL: () => 'about:blank',
        capturePage: async () => ({ toPNG: () => Buffer.from('') })
      }
      browserWindowInstances.push(this)
    }

    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL() {}
    loadFile() {}
    once() {}
    on() {}
    isDestroyed() { return false }
    isVisible() { return false }
    showInactive() {}
    hide() {}
    moveTop() {}
    getBounds() { return this._bounds }
    setBounds(bounds) { this._bounds = { ...this._bounds, ...bounds } }
  }

  const electronModule = overrides.electronModule || {
    BrowserWindow: BrowserWindowMock,
    Tray: class TrayMock {
      constructor(icon) {
        this.icon = icon
        this.destroyed = false
        trayInstances.push(this)
      }

      setToolTip() {}
      setContextMenu() {}
      on() {}
      destroy() {
        this.destroyed = true
      }
    },
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }), createEmpty: () => ({}) },
    app: { isPackaged: false },
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    }
  }

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return electronModule
    }

    if (specifier === '@electron-toolkit/utils') {
      return { is: { dev: true } }
    }

    if (specifier === '../../shared/types') {
      return {}
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
    Buffer
  }, { filename: filePath })

  return { ...module.exports, browserWindowInstances, trayInstances }
}

test('createFloatBallWindow creates a focusable float ball window for native drag and drop', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()

  assert.equal(browserWindowInstances.length, 1)
  assert.equal(browserWindowInstances[0].options.focusable, true)
  assert.equal(browserWindowInstances[0].options.transparent, true)
  assert.equal(browserWindowInstances[0].options.skipTaskbar, true)
  assert.equal(browserWindowInstances[0].options.webPreferences.contextIsolation, true)
  assert.equal(browserWindowInstances[0].options.webPreferences.nodeIntegration, false)
  assert.equal(browserWindowInstances[0].options.webPreferences.sandbox, true)
})

test('setTrayEnabled creates and destroys the tray idempotently', () => {
  const { WindowManagerService, trayInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.setTrayEnabled(true)
  service.setTrayEnabled(true)
  assert.equal(trayInstances.length, 1)

  service.setTrayEnabled(false)
  assert.equal(trayInstances[0].destroyed, true)
})
