const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(overrides = {}) {
  const filePath = path.join(__dirname, 'MemoryTimelineService.ts')
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
    if (specifier === './ScreenpipeClient') {
      return { screenpipeClient: overrides.screenpipeClient }
    }

    if (specifier === './StoreService') {
      return { storeService: overrides.storeService }
    }

    if (specifier === '../../shared/memoryDiary') {
      return require(path.join(__dirname, '../../shared/memoryDiary.ts'))
    }

    if (specifier === '../../shared/types') return {}

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
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

function createState(overrides = {}) {
  return {
    config: {
      apiUrl: 'http://localhost:3030',
      apiKey: 'token',
      enabledContentTypes: ['accessibility', 'ocr'],
      includeAudio: false,
      includeInput: false,
      sensitiveAppPatterns: ['1Password'],
      sensitiveWindowPatterns: [],
      timelineBucketMinutes: 15,
      diaryStyle: 'worklog',
      ...overrides
    },
    diaryHistory: [],
    deploymentLogs: []
  }
}

test('queryTimeline filters sensitive content and groups records into 15 minute buckets', async () => {
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          { id: '1', timestamp: '2026-05-26T01:00:00.000Z', contentType: 'ocr', appName: 'Code', windowName: 'memoryDiary.ts', url: '', text: 'timeline implementation' },
          { id: '2', timestamp: '2026-05-26T01:08:00.000Z', contentType: 'accessibility', appName: 'Chrome', windowName: 'ScreenPipe docs', url: 'https://docs.screenpi.pe', text: 'search api docs' },
          { id: '3', timestamp: '2026-05-26T01:10:00.000Z', contentType: 'ocr', appName: '1Password', windowName: 'Vault', url: '', text: 'secret' }
        ]
      })
    },
    storeService: {
      get: () => createState()
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].items.length, 2)
  assert.deepEqual(Array.from(result.data[0].appNames), ['Code', 'Chrome'])
  assert.deepEqual(Array.from(result.data[0].contentTypes), ['ocr', 'accessibility'])
})

test('queryTimeline asks ScreenPipe for the privacy-enabled content types', async () => {
  let searchRequest = null
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async (request) => {
        searchRequest = request
        return { success: true, data: [] }
      }
    },
    storeService: {
      get: () => createState({
        enabledContentTypes: ['ocr'],
        includeAudio: true,
        includeInput: false
      })
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.deepEqual(Array.from(searchRequest.contentTypes), ['ocr', 'audio'])
  assert.equal(searchRequest.apiUrl, 'http://localhost:3030')
  assert.equal(searchRequest.apiKey, 'token')
  assert.equal(searchRequest.limit, 3000)
})

test('queryTimeline keeps long OCR snippets compact for the timeline view', async () => {
  const longText = 'Codex.exe '.repeat(80) + 'screenpipe timeline overflow regression'
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'long-ocr',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'ocr',
            appName: 'Codex',
            windowName: 'Preview',
            url: '',
            text: longText
          }
        ]
      })
    },
    storeService: {
      get: () => createState()
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(result.data[0].summary.length <= 160, true)
  assert.equal(result.data[0].keyTexts[0].length <= 140, true)
  assert.match(result.data[0].summary, /\.\.\.$/)
  assert.equal(result.data[0].items[0].text, longText)
})
