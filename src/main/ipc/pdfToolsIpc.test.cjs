const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadPdfToolsIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'pdfToolsIpc.ts')
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
  const openDialogOptions = []

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
            openDialogOptions.push(options)
            if (options?.properties?.includes('openDirectory')) {
              return { canceled: false, filePaths: ['D:\\Exports'] }
            }
            return {
              canceled: false,
              filePaths: ['D:\\Docs\\a.pdf', 'D:\\Docs\\b.pdf', 'D:\\Pictures\\cover.png']
            }
          }
        }
      }
    }

    if (specifier === '../services/PdfToolsService') {
      return {
        pdfToolsService: overrides.pdfToolsService || {
          convert: async (request) => ({ success: true, data: { request } }),
          openPath: async (targetPath) => ({ success: true, data: { targetPath } })
        }
      }
    }

    if (specifier === '../../shared/pdfTools') {
      return require(path.join(__dirname, '../../shared/pdfTools.ts'))
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

  return { ...module.exports, handlers, openDialogOptions }
}

test('registerPdfToolsIpc wires file picking, conversion, output folder, and open path handlers', async () => {
  const serviceCalls = []
  const { registerPdfToolsIpc, handlers, openDialogOptions } = loadPdfToolsIpcModule({
    pdfToolsService: {
      convert: async (request) => {
        serviceCalls.push(['convert', request])
        return { success: true, data: { outputFiles: [] } }
      },
      openPath: async (targetPath) => {
        serviceCalls.push(['openPath', targetPath])
        return { success: true, data: { targetPath } }
      }
    }
  })

  registerPdfToolsIpc(() => ({ id: 'main-window' }))

  const pdfFiles = await handlers['pdf-tools-choose-files']({}, 'merge-pdfs')
  const imageFiles = await handlers['pdf-tools-choose-files']({}, 'images-to-pdf')
  const outputDirectory = await handlers['pdf-tools-choose-output-dir']()
  const converted = await handlers['pdf-tools-convert']({}, {
    mode: 'merge-pdfs',
    inputPaths: ['D:\\Docs\\a.pdf'],
    outputDirectory: 'D:\\Exports'
  })
  const opened = await handlers['pdf-tools-open-path']({}, 'D:\\Exports')

  assert.deepEqual(JSON.parse(JSON.stringify(pdfFiles)), {
    success: true,
    data: { canceled: false, paths: ['D:\\Docs\\a.pdf', 'D:\\Docs\\b.pdf'] }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(imageFiles)), {
    success: true,
    data: { canceled: false, paths: ['D:\\Pictures\\cover.png'] }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(outputDirectory)), {
    success: true,
    data: { canceled: false, path: 'D:\\Exports' }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(converted)), {
    success: true,
    data: { outputFiles: [] }
  })
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), {
    success: true,
    data: { targetPath: 'D:\\Exports' }
  })
  assert.deepEqual(serviceCalls, [
    ['convert', {
      mode: 'merge-pdfs',
      inputPaths: ['D:\\Docs\\a.pdf'],
      outputDirectory: 'D:\\Exports'
    }],
    ['openPath', 'D:\\Exports']
  ])
  assert.equal(openDialogOptions[0].filters[0].extensions.includes('pdf'), true)
  assert.equal(openDialogOptions[1].filters[0].extensions.includes('png'), true)
})
