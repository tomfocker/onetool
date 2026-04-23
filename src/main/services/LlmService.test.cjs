const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLlmServiceModule(overrides = {}) {
  const filePath = path.join(__dirname, 'LlmService.ts')
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
  const fetchCalls = []
  const fetchImpl = overrides.fetchImpl || (async (...args) => {
    fetchCalls.push(args)
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({ ok: true })
              }
            }
          ]
        }
      }
    }
  })

  const customRequire = (specifier) => {
    if (specifier === './SettingsService') {
      return {
        settingsService: overrides.settingsService || {
          getSettings() {
            return {
              translateApiUrl: 'https://api.openai.com/v1',
              translateApiKey: 'sk-test',
              translateModel: 'gpt-4o-mini'
            }
          }
        }
      }
    }

    if (specifier === './OcrService') {
      return {
        ocrService: overrides.ocrService || {
          async recognize() {
            return {
              success: true,
              data: [{ index: 0, text: 'Hello world' }]
            }
          }
        }
      }
    }

    if (specifier === '../../shared/types' || specifier === '../../shared/llm') {
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
    Buffer,
    setTimeout,
    clearTimeout,
    fetch: async (...args) => {
      fetchCalls.push(args)
      return fetchImpl(...args)
    }
  }, { filename: filePath })

  return {
    ...module.exports,
    fetchCalls
  }
}

test('getConfigStatus reports missing global llm fields', () => {
  const { LlmService } = loadLlmServiceModule({
    settingsService: {
      getSettings() {
        return {
          translateApiUrl: '',
          translateApiKey: '',
          translateModel: ''
        }
      }
    }
  })

  const service = new LlmService()
  const result = service.getConfigStatus()

  assert.equal(result.success, true)
  assert.equal(result.data.configured, false)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.missing)), ['baseUrl', 'apiKey', 'model'])
})

test('translateImage uses the shared llm config and maps translated OCR lines', async () => {
  const { LlmService, fetchCalls } = loadLlmServiceModule({
    ocrService: {
      async recognize() {
        return {
          success: true,
          data: [
            { index: 0, text: 'Hello' },
            { index: 1, text: 'World' }
          ]
        }
      }
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  lines: [
                    { index: 0, translatedText: '你好' },
                    { index: 1, translatedText: '世界' }
                  ]
                })
              }
            }
          ]
        }
      }
    })
  })

  const service = new LlmService()
  const result = await service.translateImage('data:image/png;base64,abc')

  assert.equal(result.success, true)
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0][0], 'https://api.openai.com/v1/chat/completions')
  assert.deepEqual(result.data.map((line) => line.translatedText), ['你好', '世界'])
})

test('translateImage returns OCR text directly without hitting the llm when mode is ocr', async () => {
  const { LlmService, fetchCalls } = loadLlmServiceModule({
    ocrService: {
      async recognize() {
        return {
          success: true,
          data: [
            { index: 0, text: 'Hello', x: 10, y: 20, width: 40, height: 18 },
            { index: 1, text: 'World', x: 10, y: 50, width: 50, height: 18 }
          ]
        }
      }
    }
  })

  const service = new LlmService()
  const result = await service.translateImage('data:image/png;base64,abc', 'ocr')

  assert.equal(result.success, true)
  assert.equal(fetchCalls.length, 0)
  assert.deepEqual(normalize(result.data), [
    { index: 0, text: 'Hello', x: 10, y: 20, width: 40, height: 18, translatedText: null },
    { index: 1, text: 'World', x: 10, y: 50, width: 50, height: 18, translatedText: null }
  ])
})

test('suggestRename normalizes llm suggestions back onto the input file extensions', async () => {
  const { LlmService } = loadLlmServiceModule({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: '按项目和顺序重命名',
                  namingPattern: 'project-001.ext',
                  warnings: [],
                  suggestions: [
                    { index: 0, newName: 'project-001' },
                    { index: 1, newName: 'project-002.md' }
                  ]
                })
              }
            }
          ]
        }
      }
    })
  })

  const service = new LlmService()
  const result = await service.suggestRename({
    instructions: '按项目整理并统一命名',
    files: [
      { name: 'draft.txt', path: 'D:/docs/draft.txt', size: 120 },
      { name: 'notes.md', path: 'D:/docs/notes.md', size: 220 }
    ]
  })

  assert.equal(result.success, true)
  assert.equal(result.data.summary, '按项目和顺序重命名')
  assert.deepEqual(result.data.suggestions.map((item) => item.newName), ['project-001.txt', 'project-002.md'])
})

function normalize(value) {
  return JSON.parse(JSON.stringify(value))
}
