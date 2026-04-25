const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTableOcrIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'tableOcrIpc.ts')
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
          showOpenDialog: async (_window, options) => {
            if (options?.properties?.includes('openDirectory')) {
              return { canceled: false, filePaths: ['D:\\Exports'] }
            }
            return { canceled: false, filePaths: ['D:\\Pictures\\table.png'] }
          }
        }
      }
    }

    if (specifier === '../services/TableOcrService') {
      return {
        tableOcrService: overrides.tableOcrService || {
          getStatus: async () => ({ success: true, data: { ready: true } }),
          recognize: async (request) => ({ success: true, data: { request } }),
          openPath: async (targetPath) => ({ success: true, data: { targetPath } })
        }
      }
    }

    if (specifier === '../../shared/tableOcr') {
      return {
        TABLE_OCR_IMAGE_EXTENSIONS: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff']
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

test('registerTableOcrIpc wires status, recognition, file picking, and open path handlers', async () => {
  const serviceCalls = []
  const sentMessages = []
  const { registerTableOcrIpc, handlers } = loadTableOcrIpcModule({
    tableOcrService: {
      onStateChanged: (listener) => {
        listener({ installStatus: 'running' })
        return () => undefined
      },
      getStatus: async () => ({ success: true, data: { ready: false } }),
      prepareRuntime: async () => {
        serviceCalls.push(['prepareRuntime'])
        return { success: true, data: { installStatus: 'running' } }
      },
      cancelPrepare: async () => {
        serviceCalls.push(['cancelPrepare'])
        return { success: true, data: { installStatus: 'cancelled' } }
      },
      recognize: async (request) => {
        serviceCalls.push(['recognize', request])
        return { success: true, data: { outputPath: 'D:\\Exports\\table.xlsx' } }
      },
      openPath: async (targetPath) => {
        serviceCalls.push(['openPath', targetPath])
        return { success: true, data: { targetPath } }
      }
    }
  })

  registerTableOcrIpc(() => ({
    isDestroyed: () => false,
    webContents: {
      send: (...args) => sentMessages.push(args)
    }
  }))

  const status = await handlers['table-ocr-get-status']()
  const prepared = await handlers['table-ocr-prepare-runtime']()
  const cancelled = await handlers['table-ocr-cancel-prepare']()
  const recognized = await handlers['table-ocr-recognize']({}, { inputPath: 'D:\\Pictures\\table.png' })
  const image = await handlers['table-ocr-choose-image']()
  const outputDir = await handlers['table-ocr-choose-output-dir']()
  const opened = await handlers['table-ocr-open-path']({}, 'D:\\Exports\\table.xlsx')

  assert.deepEqual(JSON.parse(JSON.stringify(status)), { success: true, data: { ready: false } })
  assert.deepEqual(JSON.parse(JSON.stringify(prepared)), { success: true, data: { installStatus: 'running' } })
  assert.deepEqual(JSON.parse(JSON.stringify(cancelled)), { success: true, data: { installStatus: 'cancelled' } })
  assert.deepEqual(JSON.parse(JSON.stringify(recognized)), { success: true, data: { outputPath: 'D:\\Exports\\table.xlsx' } })
  assert.deepEqual(JSON.parse(JSON.stringify(image)), { success: true, data: { canceled: false, path: 'D:\\Pictures\\table.png' } })
  assert.deepEqual(JSON.parse(JSON.stringify(outputDir)), { success: true, data: { canceled: false, path: 'D:\\Exports' } })
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), { success: true, data: { targetPath: 'D:\\Exports\\table.xlsx' } })
  assert.deepEqual(serviceCalls, [
    ['prepareRuntime'],
    ['cancelPrepare'],
    ['recognize', { inputPath: 'D:\\Pictures\\table.png' }],
    ['openPath', 'D:\\Exports\\table.xlsx']
  ])
  assert.deepEqual(sentMessages, [['table-ocr-state-changed', { installStatus: 'running' }]])
})
