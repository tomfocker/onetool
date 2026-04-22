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
      this.loadedFiles = []
      this.loadedUrls = []
      this._bounds = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? 0,
        height: options.height ?? 0
      }
      this._boundsHistory = [{ ...this._bounds }]
      this.webContents = {
        isLoading: () => false,
        once() {},
        on() {},
        send() {},
        getURL: () => 'about:blank',
        capturePage: async () => ({ toPNG: () => Buffer.from('') })
      }
      this._handlers = new Map()
      browserWindowInstances.push(this)
    }

    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    loadURL(url) {
      this.loadedUrls.push(url)
    }
    loadFile(filePath, options) {
      this.loadedFiles.push({ filePath, options })
    }
    setPosition(x, y) {
      this.setBounds({ x, y })
    }
    once(event, handler) {
      this.on(event, handler)
    }
    on(event, handler) {
      if (!this._handlers.has(event)) {
        this._handlers.set(event, [])
      }
      this._handlers.get(event).push(handler)
    }
    isDestroyed() { return false }
    isVisible() { return false }
    showInactive() {}
    hide() {}
    moveTop() {}
    getBounds() { return this._bounds }
    setBounds(bounds) {
      this._bounds = { ...this._bounds, ...bounds }
      this._boundsHistory.push({ ...this._bounds })
    }
    emit(event, ...args) {
      const handlers = this._handlers.get(event) || []
      handlers.slice().forEach((handler) => handler(...args))
    }
  }

  const defaultElectronModule = {
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
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
    }
  }
  const electronModule = {
    ...defaultElectronModule,
    ...overrides.electronModule,
    screen: {
      ...defaultElectronModule.screen,
      ...(overrides.electronModule?.screen || {})
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
    Buffer,
    setInterval(callback) {
      for (let index = 0; index < 16; index += 1) {
        callback()
      }
      return { id: 'fake-interval' }
    },
    clearInterval() {}
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
  assert.equal(browserWindowInstances[0].options.width, 96)
  assert.equal(browserWindowInstances[0].options.height, 96)
  assert.equal(browserWindowInstances[0].options.x, 1822)
  assert.equal(browserWindowInstances[0].options.y, 84)
})

test('createFloatBallWindow loads the packaged renderer entry from out/renderer', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()

  assert.equal(browserWindowInstances[0].loadedFiles.length, 1)
  assert.equal(
    browserWindowInstances[0].loadedFiles[0].filePath,
    path.join(__dirname, '../renderer/index.html')
  )
  assert.equal(browserWindowInstances[0].loadedFiles[0].options.hash, '/float-ball')
})

test('createFloatBallWindow aligns the compact ball to the display edge near the main window top band', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.setMainWindow({
    isDestroyed: () => false,
    getBounds: () => ({ x: 120, y: 100, width: 1320, height: 820 })
  })
  service.createFloatBallWindow()

  assert.equal(browserWindowInstances[0].options.width, 96)
  assert.equal(browserWindowInstances[0].options.height, 96)
  assert.equal(browserWindowInstances[0].options.x, 1822)
  assert.equal(browserWindowInstances[0].options.y, 184)
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

test('finishFloatBallDrag docks to the nearest right edge and keeps the ball fully visible', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 1860, screenY: 260 })
  const result = service.endFloatBallDrag()

  assert.equal(result.success, true)
  assert.equal(result.data.dockSide, 'right')
  assert.equal(result.data.dockState, 'docked')
  assert.equal(result.data.bounds.x, 1920 - result.data.visibleWidth - 2)
  assert.ok(floatBallWindow._boundsHistory.length > 2)
  assert.equal(floatBallWindow.getBounds().x, result.data.bounds.x)
  assert.equal(floatBallWindow.getBounds().y, result.data.bounds.y)
  assert.equal(floatBallWindow.getBounds().width, result.data.bounds.width)
  assert.equal(floatBallWindow.getBounds().height, result.data.bounds.height)
})

test('finishFloatBallDrag keeps the float ball free when released away from both edges', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 860, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 980, screenY: 260 })
  const result = service.endFloatBallDrag()

  assert.equal(result.success, true)
  assert.equal(result.data.dockSide, null)
  assert.equal(result.data.dockState, 'free')
  assert.equal(result.data.bounds.x, 944)
  assert.equal(floatBallWindow._boundsHistory.length, 4)
})

test('closed float ball window clears drag session before the next drag attempt', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  floatBallWindow.emit('closed')
  service.createFloatBallWindow()

  const result = service.dragFloatBallTo({ screenX: 1860, screenY: 260 })

  assert.equal(result.success, false)
  assert.equal(result.error, '拖拽会话不存在')
})

test('finishFloatBallDrag leaves the float ball free when the nearest edge is outside the docking threshold', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 930, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 966, screenY: 256 })
  const result = service.endFloatBallDrag()

  assert.equal(result.success, true)
  assert.equal(result.data.dockSide, null)
  assert.equal(result.data.dockState, 'free')
  assert.equal(result.data.bounds.x, 930)
})

test('restoreFloatBallDock returns the expanded float ball to its last docked side after hover-out', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  browserWindowInstances[0].setBounds({ x: 1866, y: 240, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 1880, screenY: 280 })
  service.endFloatBallDrag()
  service.peekFloatBall()

  const result = service.restoreFloatBallDock()

  assert.equal(result.success, true)
  assert.equal(result.data.dockState, 'docked')
  assert.equal(result.data.dockSide, 'right')
})

test('dragFloatBallTo follows the pointer display and docks fully inside the second monitor after fully crossing the display boundary', () => {
  const displays = [
    { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  ]
  const getDisplayForBounds = (bounds) => (
    bounds.x >= 1920 ? displays[1] : displays[0]
  )
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    electronModule: {
      screen: {
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: getDisplayForBounds,
        getDisplayNearestPoint: (point) => (point.x >= 1920 ? displays[1] : displays[0]),
        getAllDisplays: () => displays
      }
    }
  })
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  const dragResult = service.dragFloatBallTo({ screenX: 1990, screenY: 260 })
  const releaseResult = service.endFloatBallDrag()

  assert.equal(dragResult.success, true)
  assert.equal(dragResult.data.bounds.x, 1954)
  assert.equal(releaseResult.success, true)
  assert.equal(releaseResult.data.dockSide, 'left')
  assert.equal(releaseResult.data.visibleWidth, 120)
  assert.equal(releaseResult.data.bounds.x, 1922)
})

test('dragFloatBallTo keeps the float ball on the primary display while the shared-edge switch threshold is not crossed', () => {
  const displays = [
    { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  ]
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    electronModule: {
      screen: {
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: (bounds) => (bounds.x >= 1920 ? displays[1] : displays[0]),
        getDisplayNearestPoint: (point) => (point.x >= 1920 ? displays[1] : displays[0]),
        getAllDisplays: () => displays
      }
    }
  })
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  const dragResult = service.dragFloatBallTo({ screenX: 1860, screenY: 260 })
  const releaseResult = service.endFloatBallDrag()

  assert.equal(dragResult.success, true)
  assert.equal(dragResult.data.bounds.x, 1800)
  assert.equal(releaseResult.success, true)
  assert.equal(releaseResult.data.dockSide, 'right')
  assert.equal(releaseResult.data.visibleWidth, 120)
  assert.equal(releaseResult.data.bounds.x, 1798)
})

test('dragFloatBallTo switches to the second monitor once the ball target clears the shared-edge drag dead zone', () => {
  const displays = [
    { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  ]
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    electronModule: {
      screen: {
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: (bounds) => (bounds.x >= 1920 ? displays[1] : displays[0]),
        getDisplayNearestPoint: (point) => (point.x >= 1920 ? displays[1] : displays[0]),
        getAllDisplays: () => displays
      }
    }
  })
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  const dragResult = service.dragFloatBallTo({ screenX: 1904, screenY: 260 })

  assert.equal(dragResult.success, true)
  assert.equal(dragResult.data.bounds.x, 1920)
})

test('dragFloatBallTo stays on the second monitor after switching instead of bouncing across the shared edge', () => {
  const displays = [
    { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
  ]
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule({
    electronModule: {
      screen: {
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: (bounds) => (bounds.x >= 1920 ? displays[1] : displays[0]),
        getDisplayNearestPoint: (point) => (point.x >= 1920 ? displays[1] : displays[0]),
        getAllDisplays: () => displays
      }
    }
  })
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  const firstDragResult = service.dragFloatBallTo({ screenX: 1904, screenY: 260 })
  const secondDragResult = service.dragFloatBallTo({ screenX: 1904, screenY: 260 })

  assert.equal(firstDragResult.success, true)
  assert.equal(firstDragResult.data.bounds.x, 1920)
  assert.equal(secondDragResult.success, true)
  assert.equal(secondDragResult.data.bounds.x, 1920)
})

test('dragFloatBallTo prefers setPosition while dragging when the float ball size is unchanged', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  let setPositionCalls = 0
  const originalSetPosition = floatBallWindow.setPosition.bind(floatBallWindow)
  floatBallWindow.setPosition = (x, y) => {
    setPositionCalls += 1
    originalSetPosition(x, y)
  }
  floatBallWindow.setBounds({ x: 860, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  const result = service.dragFloatBallTo({ screenX: 980, screenY: 260 })

  assert.equal(result.success, true)
  assert.equal(setPositionCalls, 1)
})
