const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadOcrServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'OcrService.ts')
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
  const customRequire = (specifier) => {
    if (specifier === 'fs') {
      return overrides.fsModule || {
        writeFileSync() {},
        unlinkSync() {},
        existsSync() {
          return true
        }
      }
    }

    if (specifier === 'path') {
      return overrides.pathModule || {
        join: (...parts) => parts.join('/')
      }
    }

    if (specifier === 'os') {
      return overrides.osModule || {
        tmpdir() {
          return 'C:/tmp'
        }
      }
    }

    if (specifier === '../../shared/types') {
      return {}
    }

    if (specifier === '../../shared/screenOverlay') {
      return {
        normalizeOcrTextLine(text) {
          return String(text).replace(/\s+/g, ' ').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, '$1').trim()
        }
      }
    }

    if (specifier === 'tesseract.js') {
      return overrides.tesseractModule || {
        async createWorker() {
          return {
            async recognize() {
              return {
                data: {
                  words: []
                }
              }
            }
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
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

test('recognize falls back to OCR words when line data is unavailable', async () => {
  const { OcrService } = loadOcrServiceModule({
    tesseractModule: {
      async createWorker() {
        return {
          async recognize() {
            return {
              data: {
                words: [
                  {
                    text: 'Hello',
                    bbox: { x0: 10, y0: 20, x1: 70, y1: 42 }
                  },
                  {
                    text: 'A',
                    bbox: { x0: 90, y0: 20, x1: 100, y1: 42 }
                  }
                ]
              }
            }
          }
        }
      }
    }
  })

  const service = new OcrService()
  const result = await service.recognize('data:image/png;base64,ZmFrZQ==')

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [
    {
      index: 0,
      text: 'Hello',
      x: 10,
      y: 20,
      width: 60,
      height: 22
    }
  ])
})

test('recognize requests block output and extracts lines from blocks when default line output is absent', async () => {
  let recognizeArgs = null
  const { OcrService } = loadOcrServiceModule({
    tesseractModule: {
      async createWorker() {
        return {
          async recognize(...args) {
            recognizeArgs = args
            return {
              data: {
                blocks: [
                  {
                    paragraphs: [
                      {
                        lines: [
                          {
                            text: '沉浸式截屏翻译',
                            bbox: { x0: 12, y0: 24, x1: 180, y1: 58 }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    }
  })

  const service = new OcrService()
  const result = await service.recognize('data:image/png;base64,ZmFrZQ==')

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [
    {
      index: 0,
      text: '沉浸式截屏翻译',
      x: 12,
      y: 24,
      width: 168,
      height: 34
    }
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(recognizeArgs[1] ?? {})), {})
  assert.deepEqual(JSON.parse(JSON.stringify(recognizeArgs[2] ?? {})), { blocks: true })
})

test('warmup initializes the OCR worker once and subsequent recognize reuses it', async () => {
  let createWorkerCalls = 0
  let recognizeCalls = 0
  const { OcrService } = loadOcrServiceModule({
    tesseractModule: {
      async createWorker() {
        createWorkerCalls += 1
        return {
          async recognize() {
            recognizeCalls += 1
            return {
              data: {
                words: [
                  {
                    text: 'Warm',
                    bbox: { x0: 0, y0: 0, x1: 40, y1: 18 }
                  }
                ]
              }
            }
          }
        }
      }
    }
  })

  const service = new OcrService()
  await service.warmup()
  const result = await service.recognize('data:image/png;base64,ZmFrZQ==')

  assert.equal(result.success, true)
  assert.equal(createWorkerCalls, 1)
  assert.equal(recognizeCalls, 1)
})
