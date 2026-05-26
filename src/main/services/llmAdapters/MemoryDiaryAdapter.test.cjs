const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule() {
  const filePath = path.join(__dirname, 'MemoryDiaryAdapter.ts')
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
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require,
    __dirname,
    __filename: filePath,
    console,
    process,
    Buffer,
    Date
  }, { filename: filePath })

  return module.exports
}

function createRequest(overrides = {}) {
  return {
    date: '2026-05-26',
    timezone: 'Asia/Shanghai',
    buckets: [
      {
        id: 'bucket-1',
        start: '2026-05-26T01:00:00.000Z',
        end: '2026-05-26T01:15:00.000Z',
        title: 'Code / Chrome',
        summary: 'timeline implementation',
        appNames: ['Code', 'Chrome'],
        windowNames: ['memoryDiary.ts', 'ScreenPipe docs'],
        urls: ['https://docs.screenpi.pe'],
        contentTypes: ['ocr', 'accessibility'],
        keyTexts: ['timeline implementation', 'search api docs'],
        items: []
      }
    ],
    config: {
      apiUrl: 'http://localhost:3030',
      apiKey: 'token',
      enabledContentTypes: ['accessibility', 'ocr'],
      includeAudio: false,
      includeInput: false,
      sensitiveAppPatterns: [],
      sensitiveWindowPatterns: [],
      timelineBucketMinutes: 15,
      diaryStyle: 'worklog'
    },
    userNotes: '重点写清楚 ScreenPipe 管理功能',
    ...overrides
  }
}

test('buildCompletion includes date, privacy flags and timeline bucket summaries', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const completion = adapter.buildCompletion(createRequest())

  assert.match(completion.systemPrompt, /中文工作日报助手/)
  assert.match(completion.systemPrompt, /不要编造/)
  assert.match(completion.userPrompt, /日期：2026-05-26/)
  assert.match(completion.userPrompt, /时区：Asia\/Shanghai/)
  assert.match(completion.userPrompt, /包含音频：否/)
  assert.match(completion.userPrompt, /包含 input：否/)
  assert.match(completion.userPrompt, /timeline implementation/)
  assert.match(completion.userPrompt, /重点写清楚 ScreenPipe 管理功能/)
})

test('mapDiaryResult fills safe markdown defaults when the model payload is partial', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const result = adapter.mapDiaryResult(createRequest(), { summary: '完成了日报管线' })

  assert.match(result.id, /^2026-05-26-/)
  assert.equal(result.date, '2026-05-26')
  assert.equal(result.title, '2026-05-26 工作日报')
  assert.equal(result.summary, '完成了日报管线')
  assert.match(result.markdown, /^# 2026-05-26 工作日报/)
  assert.match(result.createdAt, /^\d{4}-\d{2}-\d{2}T/)
})
