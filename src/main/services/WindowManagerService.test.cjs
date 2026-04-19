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
    Tray: function Tray() {},
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

  return { ...module.exports, browserWindowInstances }
}

test('createFloatBallWindow creates a focusable float ball window for native drag and drop', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()

  assert.equal(browserWindowInstances.length, 1)
  assert.equal(browserWindowInstances[0].options.focusable, true)
  assert.equal(browserWindowInstances[0].options.transparent, true)
  assert.equal(browserWindowInstances[0].options.skipTaskbar, true)
})
