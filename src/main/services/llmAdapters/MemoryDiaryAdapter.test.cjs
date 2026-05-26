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
  const customRequire = (specifier) => {
    if (specifier === '../../../shared/memoryDiary') {
      return require(path.join(__dirname, '../../../shared/memoryDiary.ts'))
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
        title: 'Code',
        summary: 'Implement ScreenPipe data understanding',
        appNames: ['Code'],
        windowNames: ['MemoryTimelineService.ts - OneTool'],
        urls: ['https://docs.screenpi.pe'],
        contentTypes: ['accessibility', 'ocr'],
        keyTexts: ['Implement ScreenPipe data understanding'],
        items: [],
        insight: {
          activityKind: 'development',
          activityLabel: '开发',
          confidence: 0.85,
          dominantAppName: 'Code',
          dominantWindowName: 'MemoryTimelineService.ts - OneTool',
          projectHints: ['OneTool', 'ScreenPipe'],
          keywords: ['implement', 'timeline'],
          sourceCounts: { accessibility: 8, ocr: 12, audio: 0, input: 0 },
          uniqueTextCount: 4,
          duplicateTextCount: 16,
          duplicateRatio: 0.8,
          evidenceTexts: ['Implement ScreenPipe data understanding']
        }
      }
    ],
    config: {
      apiUrl: 'http://localhost:3030',
      screenpipeExecutablePath: '',
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
  assert.match(completion.userPrompt, /Implement ScreenPipe data understanding/)
  assert.match(completion.userPrompt, /重点写清楚 ScreenPipe 管理功能/)
})

test('buildCompletion includes structured understanding before raw timeline snippets', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const completion = adapter.buildCompletion(createRequest({
    userNotes: '突出数据理解层'
  }))

  assert.match(completion.userPrompt, /\[今日概览\]/)
  assert.match(completion.userPrompt, /\[理解后的活动\]/)
  assert.match(completion.userPrompt, /活动：开发/)
  assert.match(completion.userPrompt, /主应用：Code/)
  assert.match(completion.userPrompt, /项目线索：OneTool, ScreenPipe/)
  assert.match(completion.userPrompt, /重复率：80%/)
  assert.match(completion.userPrompt, /\[原始时间线摘要\]/)
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
