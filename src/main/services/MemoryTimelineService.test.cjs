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

    if (specifier === './LlmService') {
      return {
        llmService: overrides.eventOptimizer || {
          optimizeMemoryDiaryEvents: async () => ({ success: false, error: 'LLM disabled in test' })
        }
      }
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
      aiEventOptimizationEnabled: true,
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
  assert.match(result.data[0].keyTexts[0], /\.\.\.$/)
  assert.equal(result.data[0].items[0].text, longText)
})

test('queryTimeline prefers accessibility text over OCR noise for bucket summaries', async () => {
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'ocr-noise',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'ocr',
            appName: 'Codex',
            windowName: 'Preview',
            url: '',
            text: 'File Edit View Window Help hidden sidebar everything all menus repeated OCR noise'
          },
          {
            id: 'ui-clean',
            timestamp: '2026-05-26T01:02:00.000Z',
            contentType: 'accessibility',
            appName: 'Codex',
            windowName: 'ScreenPipe bridge notes',
            url: '',
            text: 'ScreenPipe bridge now reads accessibility records'
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
  assert.equal(result.data[0].summary, '主要在 Codex 调试 Preview：ScreenPipe bridge now reads accessibility records。')
  assert.equal(result.data[0].event.topics.includes('Accessibility'), false)
  assert.deepEqual(Array.from(result.data[0].keyTexts), [
    'ScreenPipe bridge now reads accessibility records'
  ])
  assert.equal(result.data[0].insight.activityKind, 'development')
  assert.equal(result.data[0].insight.uniqueTextCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data[0].insight.sourceCounts)), {
    accessibility: 1,
    ocr: 1,
    audio: 0,
    input: 0
  })
})

test('queryTimeline returns readable work events instead of raw capture fragments', async () => {
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'ui-1',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'accessibility',
            appName: 'electron.exe',
            windowName: 'OneTool PLATFORM V1.0 - 记忆日报',
            url: '',
            text: 'ScreenPipe 管理 今日时间线 数据来源 原始重复度 记忆日报'
          },
          {
            id: 'ui-2',
            timestamp: '2026-05-26T01:04:00.000Z',
            contentType: 'accessibility',
            appName: 'Codex',
            windowName: '添加自动记忆系统',
            url: '',
            text: '继续把 ScreenPipe 数据理解层做到完善，时间轴展示每个时间节点正在干什么'
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
  assert.equal(result.data[0].title, '调试 OneTool')
  assert.equal(result.data[0].summary, '主要在 OneTool 调试：继续把 ScreenPipe 数据理解层做到完善，时间轴展示每个时间节点正在干什么。')
  assert.equal(result.data[0].event.title, '调试 OneTool')
  assert.deepEqual(Array.from(result.data[0].event.topics.slice(0, 3)), ['ScreenPipe', '时间线', '数据理解层'])
  assert.equal(result.data[0].event.primaryApp, 'OneTool')
})

test('queryTimeline optimizes local work events with AI by default', async () => {
  const optimizerCalls = []
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'ui-1',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'accessibility',
            appName: 'OneTool',
            windowName: '记忆日报',
            url: '',
            text: 'ScreenPipe 时间线 数据理解层'
          }
        ]
      })
    },
    eventOptimizer: {
      optimizeMemoryDiaryEvents: async (request) => {
        optimizerCalls.push(request)
        return {
          success: true,
          data: [
            {
              ...request.buckets[0],
              title: '梳理自动记忆时间线',
              summary: '用 AI 将 ScreenPipe 采集结果整理为自然工作事件。',
              event: {
                ...request.buckets[0].event,
                title: '梳理自动记忆时间线',
                summary: '用 AI 将 ScreenPipe 采集结果整理为自然工作事件。',
                topics: ['自动记忆', 'ScreenPipe', '时间线']
              }
            }
          ]
        }
      }
    },
    storeService: {
      get: () => createState()
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(optimizerCalls.length, 1)
  assert.equal(optimizerCalls[0].date, '2026-05-26')
  assert.equal(result.data[0].title, '梳理自动记忆时间线')
  assert.equal(result.data[0].summary, '用 AI 将 ScreenPipe 采集结果整理为自然工作事件。')
  assert.deepEqual(Array.from(result.data[0].event.topics), ['自动记忆', 'ScreenPipe', '时间线'])
})

test('queryTimeline falls back to local events when AI optimization fails', async () => {
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'ui-1',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'accessibility',
            appName: 'OneTool',
            windowName: '记忆日报',
            url: '',
            text: 'ScreenPipe 时间线 数据理解层'
          }
        ]
      })
    },
    eventOptimizer: {
      optimizeMemoryDiaryEvents: async () => ({ success: false, error: 'LLM offline' })
    },
    storeService: {
      get: () => createState()
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(result.data[0].title, '查阅 OneTool')
})

test('queryTimeline skips AI optimization when disabled in memory diary config', async () => {
  let optimizerCalls = 0
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          {
            id: 'ui-1',
            timestamp: '2026-05-26T01:00:00.000Z',
            contentType: 'accessibility',
            appName: 'OneTool',
            windowName: '记忆日报',
            url: '',
            text: 'ScreenPipe 时间线 数据理解层'
          }
        ]
      })
    },
    eventOptimizer: {
      optimizeMemoryDiaryEvents: async () => {
        optimizerCalls += 1
        return { success: true, data: [] }
      }
    },
    storeService: {
      get: () => createState({ aiEventOptimizationEnabled: false })
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(optimizerCalls, 0)
  assert.equal(result.data[0].title, '查阅 OneTool')
})

test('queryTimeline reuses AI-optimized buckets when ScreenPipe data is unchanged', async () => {
  const optimizerCalls = []
  const { MemoryTimelineService } = loadModule()
  const records = [
    {
      id: 'ui-1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: 'OneTool 记忆日报',
      url: '',
      text: '自动刷新时间线并整理 ScreenPipe 返回数据'
    }
  ]
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({ success: true, data: records })
    },
    eventOptimizer: {
      optimizeMemoryDiaryEvents: async (request) => {
        optimizerCalls.push(request.buckets.map((bucket) => bucket.id))
        return {
          success: true,
          data: request.buckets.map((bucket) => ({
            ...bucket,
            title: `AI ${bucket.items[0].id}`,
            summary: 'AI 已整理这个时间段。',
            event: {
              ...bucket.event,
              title: `AI ${bucket.items[0].id}`,
              summary: 'AI 已整理这个时间段。'
            }
          }))
        }
      }
    },
    storeService: {
      get: () => createState()
    }
  })

  const first = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })
  const second = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(first.success, true)
  assert.equal(second.success, true)
  assert.equal(optimizerCalls.length, 1)
  assert.equal(second.data[0].title, 'AI ui-1')
})

test('queryTimeline only asks AI to optimize new or changed buckets', async () => {
  const optimizerCalls = []
  let records = [
    {
      id: 'ui-1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: 'OneTool 记忆日报',
      url: '',
      text: '自动刷新时间线并整理 ScreenPipe 返回数据'
    }
  ]
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({ success: true, data: records })
    },
    eventOptimizer: {
      optimizeMemoryDiaryEvents: async (request) => {
        optimizerCalls.push(request.buckets.map((bucket) => bucket.items.map((item) => item.id)))
        return {
          success: true,
          data: request.buckets.map((bucket) => ({
            ...bucket,
            title: `AI ${bucket.items[0].id}`,
            summary: 'AI 已整理这个时间段。',
            event: {
              ...bucket.event,
              title: `AI ${bucket.items[0].id}`,
              summary: 'AI 已整理这个时间段。'
            }
          }))
        }
      }
    },
    storeService: {
      get: () => createState()
    }
  })

  await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })
  records = [
    ...records,
    {
      id: 'ui-2',
      timestamp: '2026-05-26T01:20:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: 'OneTool 记忆日报',
      url: '',
      text: '继续让模型拿到更多经过脱敏的上下文'
    }
  ]
  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(optimizerCalls.length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(optimizerCalls[1])), [['ui-2']])
  assert.equal(result.data[0].title, 'AI ui-1')
  assert.equal(result.data[1].title, 'AI ui-2')
})
