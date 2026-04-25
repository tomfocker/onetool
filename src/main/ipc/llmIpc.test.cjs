const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadLlmIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'llmIpc.ts')
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
      return {
        ipcMain: {
          handle(channel, handler) {
            handlers[channel] = handler
          }
        }
      }
    }

    if (specifier === '../services/LlmService') {
      return {
        llmService: overrides.llmService
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
    process
  }, { filename: filePath })

  return { ...module.exports, handlers }
}

test('registerLlmIpc wires calendar assistant parsing through the llm service', async () => {
  const requests = []
  const llmService = {
    getConfigStatus: () => ({ success: true }),
    testConnection: async () => ({ success: true }),
    analyzeSystem: async () => ({ success: true }),
    suggestRename: async () => ({ success: true }),
    suggestSpaceCleanup: async () => ({ success: true }),
    parseCalendarAssistant: async (input) => {
      requests.push(input)
      return { success: true, data: { type: 'help', message: 'ok' } }
    }
  }

  const { registerLlmIpc, handlers } = loadLlmIpcModule({ llmService })
  registerLlmIpc()

  const input = {
    message: '明天三点开会',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: []
    }
  }
  const result = await handlers['llm-parse-calendar-assistant']({}, input)

  assert.deepEqual(result, { success: true, data: { type: 'help', message: 'ok' } })
  assert.deepEqual(requests, [input])
})
