const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadMemoryDiaryIpcModule(overrides = {}) {
  const filePath = path.join(__dirname, 'memoryDiaryIpc.ts')
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

    if (specifier === '../services/ScreenpipeManagementService') {
      return { screenpipeManagementService: overrides.managementService }
    }

    if (specifier === '../services/MemoryTimelineService') {
      return { memoryTimelineService: overrides.timelineService }
    }

    if (specifier === '../services/MemoryDiaryService') {
      return { memoryDiaryService: overrides.diaryService }
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

test('registerMemoryDiaryIpc wires screenpipe management, timeline and diary handlers', async () => {
  const { registerMemoryDiaryIpc, handlers } = loadMemoryDiaryIpcModule({
    managementService: {
      getStoredState: () => ({ success: true, data: { config: { apiUrl: 'http://localhost:3030' } } }),
      getCliStatus: async () => ({ success: true, data: { installed: true } }),
      updateConfig: (updates) => ({ success: true, data: { config: updates } }),
      start: async () => ({ success: true, data: { state: 'starting' } }),
      stop: async () => ({ success: true, data: { state: 'stopped' } }),
      getAuthToken: async () => ({ success: true, data: { apiKey: 'token' } }),
      getLogs: () => ({ success: true, data: [] })
    },
    timelineService: {
      queryTimeline: async (request) => ({ success: true, data: [{ id: request.date }] })
    },
    diaryService: {
      generate: async (request) => ({ success: true, data: { markdown: request.userNotes } }),
      list: () => ({ success: true, data: [] }),
      save: async (request) => ({ success: true, data: { id: request.id } }),
      delete: async (id) => ({ success: true, data: { id } })
    }
  })

  registerMemoryDiaryIpc()

  assert.equal((await handlers['memory-screenpipe-get-state']()).data.config.apiUrl, 'http://localhost:3030')
  assert.equal((await handlers['memory-screenpipe-get-cli-status']()).data.installed, true)
  assert.equal((await handlers['memory-screenpipe-update-config']({}, { apiUrl: 'http://127.0.0.1:3030' })).data.config.apiUrl, 'http://127.0.0.1:3030')
  assert.equal((await handlers['memory-screenpipe-start']()).data.state, 'starting')
  assert.equal((await handlers['memory-screenpipe-stop']()).data.state, 'stopped')
  assert.equal((await handlers['memory-screenpipe-get-token']()).data.apiKey, 'token')
  assert.deepEqual((await handlers['memory-screenpipe-get-logs']()).data, [])
  assert.equal((await handlers['memory-timeline-query']({}, { date: '2026-05-26' })).data[0].id, '2026-05-26')
  assert.equal((await handlers['memory-diary-generate']({}, { userNotes: '# diary' })).data.markdown, '# diary')
  assert.deepEqual((await handlers['memory-diary-list']()).data, [])
  assert.equal((await handlers['memory-diary-save']({}, { id: 'draft-1' })).data.id, 'draft-1')
  assert.equal((await handlers['memory-diary-delete']({}, 'draft-1')).data.id, 'draft-1')
})
