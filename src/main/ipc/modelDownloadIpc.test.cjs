const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModelDownloadIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'modelDownloadIpc.ts')
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
          showOpenDialog: async () => ({ canceled: false, filePaths: ['D:\\Downloads'] })
        }
      }
    }

    if (specifier === '../services/ModelDownloadService') {
      return {
        modelDownloadService: overrides.modelDownloadService || {
          getState: () => ({ success: true, data: {} }),
          startDownload: async (request) => ({ success: true, data: request }),
          cancelDownload: async () => ({ success: true }),
          openPath: async (targetPath) => ({ success: true, data: { targetPath } }),
          onStateChanged() {}
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

test('registerModelDownloadIpc forwards task commands and pushes state changes to the window', async () => {
  const sendCalls = []
  let changedHandler = null

  const { registerModelDownloadIpc, handlers } = loadModelDownloadIpcModule({
    modelDownloadService: {
      getState: () => ({ success: true, data: { status: 'idle' } }),
      startDownload: async (request) => ({ success: true, data: { accepted: request.repoId } }),
      cancelDownload: async () => ({ success: true, data: { status: 'cancelled' } }),
      openPath: async (targetPath) => ({ success: true, data: { targetPath } }),
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

  registerModelDownloadIpc(() => mainWindow)

  const startResult = await handlers['model-download-start']({}, { repoId: 'Qwen/Qwen2.5' })
  const cancelResult = await handlers['model-download-cancel']()
  const choosePathResult = await handlers['model-download-choose-save-path']()
  const openResult = await handlers['model-download-open-path']({}, 'D:\\Downloads')

  changedHandler({ status: 'running' })

  assert.deepEqual(startResult, { success: true, data: { accepted: 'Qwen/Qwen2.5' } })
  assert.deepEqual(cancelResult, { success: true, data: { status: 'cancelled' } })
  assert.equal(choosePathResult.success, true)
  assert.equal(choosePathResult.data.canceled, false)
  assert.equal(choosePathResult.data.path, 'D:\\Downloads')
  assert.deepEqual(openResult, { success: true, data: { targetPath: 'D:\\Downloads' } })
  assert.deepEqual(sendCalls, [['model-download-state-changed', { status: 'running' }]])
})
