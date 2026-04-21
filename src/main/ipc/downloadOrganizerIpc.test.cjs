const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadDownloadOrganizerIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'downloadOrganizerIpc.ts')
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

  const customRequire = (specifier) => {
    if (specifier === 'electron') {
      return overrides.electronModule || {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        },
        dialog: {
          showOpenDialog: async () => ({ canceled: false, filePaths: ['D:\\Sorted'] })
        }
      }
    }

    if (specifier === '../services/DownloadOrganizerService') {
      return {
        downloadOrganizerService: overrides.downloadOrganizerService || {
          getState: () => ({ success: true, data: {} }),
          updateConfig: async () => ({ success: true, data: { watcherActive: true } }),
          preview: async () => ({ success: true, data: {} }),
          applyPreview: async () => ({ success: true, data: {} }),
          setMainWindow() {}
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

  return { ...module.exports, handlers }
}

test('registerDownloadOrganizerIpc forwards config updates and pushes changed state to the window', async () => {
  const sendCalls = []
  let changedHandler = null

  const { registerDownloadOrganizerIpc, handlers } = loadDownloadOrganizerIpcModule({
    downloadOrganizerService: {
      getState: () => ({ success: true, data: { watcherActive: false } }),
      updateConfig: async (updates) => ({ success: true, data: { config: updates, watcherActive: true } }),
      preview: async () => ({ success: true, data: {} }),
      applyPreview: async () => ({ success: true, data: {} }),
      onStateChanged(handler) {
        changedHandler = handler
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

  registerDownloadOrganizerIpc(() => mainWindow)

  const updateResult = await handlers['download-organizer-update-config']({}, { enabled: true })
  changedHandler({ watcherActive: true })

  assert.deepEqual(updateResult, { success: true, data: { config: { enabled: true }, watcherActive: true } })
  assert.deepEqual(sendCalls, [['download-organizer-state-changed', { watcherActive: true }]])
})
