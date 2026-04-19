const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadSettingsIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'settingsIpc.ts')
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
  const handlers = {}
  const sendCalls = []

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return overrides.electronModule || {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        }
      }
    }

    if (specifier === '../services/SettingsService') {
      return {
        settingsService: overrides.settingsService || {
          getSettings: () => ({}),
          updateSettings: async () => ({ success: true }),
          on: () => undefined
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

  return { ...module.exports, handlers, sendCalls }
}

test('registerSettingsIpc returns the service result and forwards changed events to the window', async () => {
  const sendCalls = []
  const settingsService = {
    getSettings: () => ({ autoCheckForUpdates: true }),
    updateSettings: async () => ({ success: false, error: 'disk full' }),
    on(event, handler) {
      this.handler = handler
    }
  }
  const { registerSettingsIpc, handlers } = loadSettingsIpcModule({
    settingsService,
    electronModule: {
      ipcMain: {
        handle(channel, handler) {
          handlers[channel] = handler
        }
      }
    }
  })
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        sendCalls.push([channel, payload])
      }
    }
  }

  registerSettingsIpc(() => mainWindow)

  const updateResult = await handlers['settings-update']({}, { autoCheckForUpdates: false })
  settingsService.handler({ autoCheckForUpdates: false })

  assert.deepEqual(updateResult, { success: false, error: 'disk full' })
  assert.deepEqual(sendCalls, [['settings-changed', { autoCheckForUpdates: false }]])
})
