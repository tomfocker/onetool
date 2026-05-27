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
        },
        event: {
          title: '调试 OneTool',
          summary: '围绕 ScreenPipe、时间线、数据理解层进行开发，主要使用 Code。',
          activityKind: 'development',
          activityLabel: '开发',
          primaryApp: 'Code',
          primaryProject: 'OneTool',
          topics: ['ScreenPipe', '时间线', '数据理解层'],
          keywords: ['implement', 'timeline'],
          confidence: 0.85,
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
      diaryStyle: 'worklog',
      diaryTone: 'daily'
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
  assert.match(completion.userPrompt, /事件：调试 OneTool/)
  assert.match(completion.userPrompt, /主题：ScreenPipe, 时间线, 数据理解层/)
  assert.match(completion.userPrompt, /主项目：OneTool/)
  assert.match(completion.userPrompt, /重复率：80%/)
  assert.match(completion.userPrompt, /\[原始时间线摘要\]/)
})

test('buildCompletion gives the model a concrete brief format when diary style is brief', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const completion = adapter.buildCompletion(createRequest({
    config: {
      ...createRequest().config,
      diaryStyle: 'brief'
    }
  }))

  assert.match(completion.systemPrompt, /一页工作简报/)
  assert.match(completion.systemPrompt, /今日概况/)
  assert.match(completion.systemPrompt, /关键进展/)
  assert.match(completion.systemPrompt, /时间线/)
  assert.match(completion.systemPrompt, /风险\/待办/)
  assert.match(completion.userPrompt, /\[简报输出要求\]/)
  assert.match(completion.userPrompt, /不写长篇博客/)
})

test('buildCompletion applies the selected brief tone independently of diary structure', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const completion = adapter.buildCompletion(createRequest({
    config: {
      ...createRequest().config,
      diaryStyle: 'brief',
      diaryTone: 'professional'
    }
  }))

  assert.match(completion.systemPrompt, /专业分析风格/)
  assert.match(completion.systemPrompt, /进展、证据、风险、下一步/)
  assert.match(completion.userPrompt, /表达口吻：专业分析风格/)
  assert.match(completion.userPrompt, /优先写清楚判断依据/)
})

test('buildEventOptimizationCompletion sends compact event evidence to the model', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()

  const request = {
    date: '2026-05-26',
    timezone: 'Asia/Shanghai',
    buckets: createRequest().buckets
  }
  const completion = adapter.buildEventOptimizationCompletion(request)

  assert.match(completion.systemPrompt, /中文工作时间线整理器/)
  assert.match(completion.systemPrompt, /必须保留每个事件的 id/)
  assert.match(completion.userPrompt, /id: bucket-1/)
  assert.match(completion.userPrompt, /本地标题：调试 OneTool/)
  assert.match(completion.userPrompt, /证据：Implement ScreenPipe data understanding/)
  assert.match(completion.userPrompt, /具体线索/)
  assert.match(completion.systemPrompt, /不要写“了解.*相关内容”/)
})

test('buildEventOptimizationCompletion sends richer sanitized source context to the model', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()
  const request = createRequest()
  request.buckets[0].items = [
    {
      id: 'source-1',
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: 'OneTool 记忆日报',
      url: '',
      text: '默认开启自动刷新时间线，并让 LLM 分析 15 分钟内的整体操作'
    },
    {
      id: 'source-2',
      timestamp: '2026-05-26T01:04:00.000Z',
      contentType: 'ocr',
      appName: 'OneTool',
      windowName: 'API Token 设置',
      url: '',
      text: 'Authorization: Bearer screenpipe-secret-token password=plain-text-secret sk-test123456789'
    }
  ]

  const completion = adapter.buildEventOptimizationCompletion({
    date: '2026-05-26',
    timezone: 'Asia/Shanghai',
    buckets: request.buckets
  })

  assert.match(completion.userPrompt, /默认开启自动刷新时间线/)
  assert.match(completion.userPrompt, /Codex/)
  assert.match(completion.userPrompt, /accessibility/)
  assert.doesNotMatch(completion.userPrompt, /screenpipe-secret-token/)
  assert.doesNotMatch(completion.userPrompt, /plain-text-secret/)
  assert.doesNotMatch(completion.userPrompt, /sk-test123456789/)
  assert.match(completion.userPrompt, /\[SECRET\]/)
})

test('mapEventOptimizationResult merges model wording without losing local evidence', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()
  const request = {
    date: '2026-05-26',
    timezone: 'Asia/Shanghai',
    buckets: createRequest().buckets
  }

  const result = adapter.mapEventOptimizationResult(request, {
    events: [
      {
        id: 'bucket-1',
        title: '梳理 ScreenPipe 时间线',
        summary: '把采集片段整理成可读的工作事件。',
        activityLabel: '开发',
        topics: ['自动记忆', 'ScreenPipe', '时间线']
      }
    ]
  })

  assert.equal(result[0].title, '梳理 ScreenPipe 时间线')
  assert.equal(result[0].summary, '把采集片段整理成可读的工作事件。')
  assert.equal(result[0].event.title, '梳理 ScreenPipe 时间线')
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].event.topics)), ['自动记忆', 'ScreenPipe', '时间线'])
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].event.evidenceTexts)), ['Implement ScreenPipe data understanding'])
})

test('mapEventOptimizationResult rejects generic model summaries when local evidence is more concrete', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()
  const request = createRequest()
  request.buckets[0].summary = '主要在 Code 调试记忆日报：默认开启 AI 优化时间轴，模型失败时回退到本地规则。'
  request.buckets[0].event.summary = request.buckets[0].summary
  request.buckets[0].event.evidenceTexts = [
    '默认开启 AI 优化时间轴，模型失败时回退到本地规则'
  ]

  const result = adapter.mapEventOptimizationResult(request, {
    events: [
      {
        id: 'bucket-1',
        title: '查阅 OneTool 的记忆日报',
        summary: '在 Codex 上阅读 OneTool 的记忆日报，了解 ScreenPipe、时间线、数据理解层相关内容。',
        topics: ['ScreenPipe', '时间线']
      }
    ]
  })

  assert.equal(result[0].summary, '主要在 Code 调试记忆日报：默认开启 AI 优化时间轴，模型失败时回退到本地规则。')
  assert.equal(result[0].event.summary, '主要在 Code 调试记忆日报：默认开启 AI 优化时间轴，模型失败时回退到本地规则。')
})

test('mapEventOptimizationResult rejects model titles that append memory diary to every event', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()
  const request = createRequest()
  request.buckets[0].title = '调试 OneTool'
  request.buckets[0].event.title = '调试 OneTool'

  const result = adapter.mapEventOptimizationResult(request, {
    events: [
      {
        id: 'bucket-1',
        title: '调试 OneTool 记忆日报',
        summary: '检查 OneTool 配置和 ScreenPipe 状态。',
        topics: ['OneTool', 'ScreenPipe']
      }
    ]
  })

  assert.equal(result[0].title, '调试 OneTool')
  assert.equal(result[0].event.title, '调试 OneTool')
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

test('mapDiaryResult builds a useful local brief when the model payload is partial', () => {
  const { MemoryDiaryAdapter } = loadModule()
  const adapter = new MemoryDiaryAdapter()
  const request = createRequest({
    config: {
      ...createRequest().config,
      diaryStyle: 'brief'
    }
  })

  const result = adapter.mapDiaryResult(request, { summary: '' })

  assert.equal(result.title, '2026-05-26 工作简报')
  assert.match(result.summary, /1 个时间段/)
  assert.match(result.markdown, /^# 2026-05-26 工作简报/)
  assert.match(result.markdown, /## 今日概况/)
  assert.match(result.markdown, /## 关键进展/)
  assert.match(result.markdown, /## 时间线/)
  assert.match(result.markdown, /## 风险\/待办/)
  assert.match(result.markdown, /调试 OneTool/)
})
