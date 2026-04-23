const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadColorPickerServiceModule(mocks) {
  const filePath = path.join(__dirname, 'ColorPickerService.ts')
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
    if (request === '../../shared/types') return {}
    if (request === '../../shared/colorPicker') return mocks.colorPickerShared
    if (request === '../utils/windowSecurity') return mocks.windowSecurity
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

function createIpcMainMock() {
  const listeners = new Map()
  const onceListeners = new Map()

  return {
    ipcMain: {
      on(channel, handler) {
        listeners.set(channel, handler)
      },
      once(channel, handler) {
        onceListeners.set(channel, handler)
      },
      removeListener(channel) {
        listeners.delete(channel)
        onceListeners.delete(channel)
      }
    },
    listeners,
    onceListeners
  }
}

test('setMainWindow precreates hidden picker overlay windows', async () => {
  const createdWindows = []
  const { ipcMain } = createIpcMainMock()

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.webContents = { id: createdWindows.length + 1, send() {}, on() {} }
      createdWindows.push(this)
    }
    setVisibleOnAllWorkspaces() {}
    once() {}
    on() {}
    loadURL() {}
    loadFile() {}
    isDestroyed() { return false }
    show() {}
    hide() {}
    close() {}
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 1 }
  ]

  const { ColorPickerService } = loadColorPickerServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
      desktopCapturer: { getSources() { return Promise.resolve([]) } },
      ipcMain,
      screen: {
        getAllDisplays() {
          return displays
        }
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    colorPickerShared: {
      buildCaptureThumbnailSize() {
        return { width: 1920, height: 1080 }
      },
      mapCaptureSourcesToDisplays() {
        return { screenshots: new Map(), missingDisplayIds: [] }
      }
    },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ColorPickerService()
  service.setMainWindow({})
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(createdWindows.length, 2)
  assert.equal(createdWindows[0].options.show, false)
  assert.equal(createdWindows[1].options.show, false)
})

test('pick reuses precreated picker overlay windows across sessions', async () => {
  const createdWindows = []
  const { ipcMain, onceListeners } = createIpcMainMock()

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.visible = false
      this.closed = false
      this.webContents = { id: createdWindows.length + 1, send() {}, on() {} }
      createdWindows.push(this)
    }
    setVisibleOnAllWorkspaces() {}
    once() {}
    on() {}
    loadURL() {}
    loadFile() {}
    isDestroyed() { return this.closed }
    show() { this.visible = true }
    hide() { this.visible = false }
    close() { this.closed = true }
  }

  const mainWindow = {
    hidden: false,
    shown: false,
    focused: false,
    isDestroyed() { return false },
    hide() { this.hidden = true },
    show() { this.shown = true },
    focus() { this.focused = true }
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
  ]

  const { ColorPickerService } = loadColorPickerServiceModule({
    electron: {
      BrowserWindow: FakeBrowserWindow,
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
      ipcMain,
      screen: {
        getAllDisplays() {
          return displays
        }
      }
    },
    electronToolkitUtils: { is: { dev: true } },
    colorPickerShared: {
      buildCaptureThumbnailSize() {
        return { width: 1920, height: 1080 }
      },
      mapCaptureSourcesToDisplays() {
        return { screenshots: new Map([[1, 'data:image/png;base64,screen']]), missingDisplayIds: [] }
      }
    },
    windowSecurity: {
      createIsolatedPreloadWebPreferences() {
        return {}
      }
    }
  })

  process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
  const service = new ColorPickerService()
  service.setMainWindow(mainWindow)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(createdWindows.length, 1)

  const firstWindow = createdWindows[0]
  const firstPickPromise = service.pick()
  await new Promise((resolve) => setImmediate(resolve))
  onceListeners.get('color-picker:confirm-pick')({}, { hex: '#ffffff' })
  await firstPickPromise

  assert.equal(createdWindows.length, 1)
  assert.equal(firstWindow.closed, false)
  assert.equal(firstWindow.visible, false)

  const secondPickPromise = service.pick()
  await new Promise((resolve) => setImmediate(resolve))
  onceListeners.get('color-picker:cancel-pick')()
  await secondPickPromise

  assert.equal(createdWindows.length, 1)
  assert.equal(createdWindows[0], firstWindow)
})
