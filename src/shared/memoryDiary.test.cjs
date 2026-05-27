const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadMemoryDiaryModule() {
  const filePath = path.join(__dirname, 'memoryDiary.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
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
    Buffer
  }, { filename: filePath })

  return module.exports
}

test('createDefaultMemoryDiaryStoredState uses privacy-conservative defaults', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const state = memoryDiary.createDefaultMemoryDiaryStoredState()

  assert.equal(state.config.apiUrl, 'http://localhost:3030')
  assert.equal(state.config.screenpipeExecutablePath, '')
  assert.equal(state.config.includeAudio, false)
  assert.equal(state.config.includeInput, false)
  assert.equal(state.config.aiEventOptimizationEnabled, true)
  assert.deepEqual(toPlainObject(state.config.enabledContentTypes), ['accessibility', 'ocr'])
  assert.equal(state.config.timelineBucketMinutes, 15)
  assert.equal(state.config.diaryStyle, 'brief')
  assert.equal(state.config.diaryTone, 'daily')
  assert.equal(state.config.autoDailySummaryEnabled, false)
  assert.equal(state.config.autoDailySummaryTime, '21:30')
  assert.equal(state.diaryHistory.length, 0)
})

test('filterMemoryDiaryItems removes disabled content types and sensitive windows', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const config = {
    ...memoryDiary.createDefaultMemoryDiaryConfig(),
    sensitiveAppPatterns: ['1Password'],
    sensitiveWindowPatterns: ['支付', 'password']
  }
  const items = [
    {
      id: '1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'README.md',
      url: '',
      text: 'implemented timeline'
    },
    {
      id: '2',
      timestamp: '2026-05-26T01:01:00.000Z',
      contentType: 'audio',
      appName: 'Meet',
      windowName: 'Standup',
      url: '',
      text: 'private call'
    },
    {
      id: '3',
      timestamp: '2026-05-26T01:02:00.000Z',
      contentType: 'ocr',
      appName: '1Password',
      windowName: 'Vault',
      url: '',
      text: 'secret'
    },
    {
      id: '4',
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'accessibility',
      appName: 'Chrome',
      windowName: '支付页面',
      url: '',
      text: 'secret'
    }
  ]

  assert.deepEqual(toPlainObject(memoryDiary.filterMemoryDiaryItems(items, config).map((item) => item.id)), ['1'])
})

test('createMemoryDiaryBucketStart floors timestamps to bucket boundaries', () => {
  const memoryDiary = loadMemoryDiaryModule()

  assert.equal(
    memoryDiary.createMemoryDiaryBucketStart('2026-05-26T09:17:32.000+08:00', 15),
    '2026-05-26T01:15:00.000Z'
  )
})

test('countMemoryDiaryItemsByType returns a stable capture source distribution', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const items = [
    {
      id: '1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'README.md',
      url: '',
      text: 'implemented timeline'
    },
    {
      id: '2',
      timestamp: '2026-05-26T01:01:00.000Z',
      contentType: 'accessibility',
      appName: 'Chrome',
      windowName: 'ScreenPipe docs',
      url: '',
      text: 'clean UI text'
    },
    {
      id: '3',
      timestamp: '2026-05-26T01:02:00.000Z',
      contentType: 'accessibility',
      appName: 'Chrome',
      windowName: 'ScreenPipe docs',
      url: '',
      text: 'more UI text'
    },
    {
      id: '4',
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'input',
      appName: 'Codex',
      windowName: 'OneTool',
      url: '',
      text: 'typed question'
    }
  ]

  assert.deepEqual(toPlainObject(memoryDiary.countMemoryDiaryItemsByType(items)), {
    accessibility: 2,
    ocr: 1,
    audio: 0,
    input: 1
  })
})

test('buildMemoryDiaryTimelineInsight deduplicates repeated OCR and classifies development work', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const items = [
    {
      id: 'ui-1',
      timestamp: '2026-05-26T01:00:00.000Z',
      contentType: 'accessibility',
      appName: 'Code',
      windowName: 'MemoryTimelineService.ts - OneTool',
      url: '',
      text: 'Implement buildMemoryDiaryTimelineInsight for ScreenPipe timeline'
    },
    {
      id: 'ocr-1',
      timestamp: '2026-05-26T01:01:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'MemoryTimelineService.ts - OneTool',
      url: '',
      text: 'Implement buildMemoryDiaryTimelineInsight for ScreenPipe timeline'
    },
    {
      id: 'ocr-2',
      timestamp: '2026-05-26T01:02:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'MemoryTimelineService.ts - OneTool',
      url: '',
      text: 'File Edit Selection View Terminal Help'
    },
    {
      id: 'ocr-3',
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'ocr',
      appName: 'Code',
      windowName: 'MemoryTimelineService.ts - OneTool',
      url: '',
      text: 'File Edit Selection View Terminal Help'
    }
  ]

  const insight = memoryDiary.buildMemoryDiaryTimelineInsight(items)

  assert.equal(insight.activityKind, 'development')
  assert.equal(insight.activityLabel, '开发')
  assert.equal(insight.dominantAppName, 'Code')
  assert.equal(insight.dominantWindowName, 'MemoryTimelineService.ts - OneTool')
  assert.deepEqual(toPlainObject(insight.projectHints), ['OneTool', 'MemoryTimelineService.ts'])
  assert.equal(insight.uniqueTextCount, 1)
  assert.equal(insight.duplicateTextCount, 3)
  assert.equal(insight.duplicateRatio, 0.75)
  assert.deepEqual(toPlainObject(insight.evidenceTexts), [
    'Implement buildMemoryDiaryTimelineInsight for ScreenPipe timeline'
  ])
})

test('buildMemoryDiaryWorkEvent turns capture fragments into a readable work event', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const items = [
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
      timestamp: '2026-05-26T01:03:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: '添加自动记忆系统',
      url: '',
      text: '继续把 ScreenPipe 数据理解层做到完善，时间轴展示每个时间节点正在干什么'
    },
    {
      id: 'ocr-noise',
      timestamp: '2026-05-26T01:04:00.000Z',
      contentType: 'ocr',
      appName: 'electron.exe',
      windowName: 'OneTool PLATFORM V1.0 - 记忆日报',
      url: '',
      text: 'File Edit View Window Help API 地址 API Token Accessibility OCR OCR'
    }
  ]

  const event = memoryDiary.buildMemoryDiaryWorkEvent(items)

  assert.equal(event.title, '调试 OneTool')
  assert.equal(event.summary, '主要在 OneTool 调试：继续把 ScreenPipe 数据理解层做到完善，时间轴展示每个时间节点正在干什么。')
  assert.equal(event.activityKind, 'development')
  assert.equal(event.primaryProject, 'OneTool')
  assert.deepEqual(toPlainObject(event.topics.slice(0, 3)), ['ScreenPipe', '时间线', '数据理解层'])
  assert.equal(event.topics.includes('记忆日报'), false)
})

test('buildMemoryDiaryWorkEvent keeps concrete evidence in the event summary', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const items = [
    {
      id: 'ui-1',
      timestamp: '2026-05-27T01:30:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: '添加自动记忆系统',
      url: '',
      text: '默认开启 AI 优化时间轴，模型失败时回退到本地规则'
    },
    {
      id: 'ui-2',
      timestamp: '2026-05-27T01:34:00.000Z',
      contentType: 'accessibility',
      appName: 'Codex',
      windowName: '记忆日报时间线',
      url: '',
      text: '时间线卡片需要显示具体线索，不要只写了解相关内容'
    }
  ]

  const event = memoryDiary.buildMemoryDiaryWorkEvent(items)

  assert.match(event.summary, /默认开启 AI 优化时间轴/)
  assert.match(event.summary, /模型失败时回退到本地规则/)
  assert.doesNotMatch(event.summary, /了解.+相关内容/)
})

test('buildMemoryDiaryWorkEvent treats memory diary as module context instead of every event subject', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const items = [
    {
      id: 'ui-1',
      timestamp: '2026-05-27T02:00:00.000Z',
      contentType: 'accessibility',
      appName: 'Weixin',
      windowName: '图片和视频 - 记忆日报',
      url: '',
      text: '查看图片和视频内容，确认 API 地址和 Token 是否生效'
    },
    {
      id: 'ui-2',
      timestamp: '2026-05-27T02:04:00.000Z',
      contentType: 'accessibility',
      appName: 'Weixin',
      windowName: '图片和视频 - 记忆日报',
      url: '',
      text: '新版窗口不再显示 CLI 未安装，继续检查 ScreenPipe 配置'
    }
  ]

  const event = memoryDiary.buildMemoryDiaryWorkEvent(items)

  assert.doesNotMatch(event.title, /记忆日报/)
  assert.doesNotMatch(event.summary, /的记忆日报/)
})

test('buildMemoryDiaryDailyInsight aggregates activity mix and focus blocks', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const buckets = [
    {
      id: '1',
      start: '2026-05-26T01:00:00.000Z',
      end: '2026-05-26T01:15:00.000Z',
      title: 'Code',
      summary: 'Implement service',
      appNames: ['Code'],
      windowNames: ['MemoryTimelineService.ts - OneTool'],
      urls: [],
      contentTypes: ['accessibility'],
      keyTexts: ['Implement service'],
      items: [
        { id: 'a', timestamp: '2026-05-26T01:00:00.000Z', contentType: 'accessibility', appName: 'Code', windowName: 'MemoryTimelineService.ts - OneTool', url: '', text: 'Implement service' }
      ],
      insight: {
        activityKind: 'development',
        activityLabel: '开发',
        confidence: 0.8,
        dominantAppName: 'Code',
        dominantWindowName: 'MemoryTimelineService.ts - OneTool',
        projectHints: ['OneTool'],
        keywords: ['implement'],
        sourceCounts: { accessibility: 1, ocr: 0, audio: 0, input: 0 },
        uniqueTextCount: 1,
        duplicateTextCount: 0,
        duplicateRatio: 0,
        evidenceTexts: ['Implement service']
      }
    },
    {
      id: '2',
      start: '2026-05-26T01:15:00.000Z',
      end: '2026-05-26T01:30:00.000Z',
      title: 'Code',
      summary: 'Update UI',
      appNames: ['Code'],
      windowNames: ['MemoryDiaryTool.tsx - OneTool'],
      urls: [],
      contentTypes: ['accessibility'],
      keyTexts: ['Update UI'],
      items: [
        { id: 'b', timestamp: '2026-05-26T01:15:00.000Z', contentType: 'accessibility', appName: 'Code', windowName: 'MemoryDiaryTool.tsx - OneTool', url: '', text: 'Update UI' }
      ],
      insight: {
        activityKind: 'development',
        activityLabel: '开发',
        confidence: 0.8,
        dominantAppName: 'Code',
        dominantWindowName: 'MemoryDiaryTool.tsx - OneTool',
        projectHints: ['OneTool'],
        keywords: ['update'],
        sourceCounts: { accessibility: 1, ocr: 0, audio: 0, input: 0 },
        uniqueTextCount: 1,
        duplicateTextCount: 0,
        duplicateRatio: 0,
        evidenceTexts: ['Update UI']
      }
    },
    {
      id: '3',
      start: '2026-05-26T02:00:00.000Z',
      end: '2026-05-26T02:15:00.000Z',
      title: 'Chrome',
      summary: 'ScreenPipe docs',
      appNames: ['Chrome'],
      windowNames: ['ScreenPipe docs'],
      urls: ['https://docs.screenpi.pe'],
      contentTypes: ['accessibility'],
      keyTexts: ['ScreenPipe docs'],
      items: [
        { id: 'c', timestamp: '2026-05-26T02:00:00.000Z', contentType: 'accessibility', appName: 'Chrome', windowName: 'ScreenPipe docs', url: 'https://docs.screenpi.pe', text: 'ScreenPipe docs' }
      ],
      insight: {
        activityKind: 'research',
        activityLabel: '资料',
        confidence: 0.7,
        dominantAppName: 'Chrome',
        dominantWindowName: 'ScreenPipe docs',
        projectHints: ['ScreenPipe'],
        keywords: ['docs'],
        sourceCounts: { accessibility: 1, ocr: 0, audio: 0, input: 0 },
        uniqueTextCount: 1,
        duplicateTextCount: 0,
        duplicateRatio: 0,
        evidenceTexts: ['ScreenPipe docs']
      }
    }
  ]

  const dailyInsight = memoryDiary.buildMemoryDiaryDailyInsight(buckets)

  assert.equal(dailyInsight.activeMinutes, 45)
  assert.deepEqual(toPlainObject(dailyInsight.topApps), [
    { label: 'Code', count: 2, share: 0.67 },
    { label: 'Chrome', count: 1, share: 0.33 }
  ])
  assert.deepEqual(toPlainObject(dailyInsight.activityMix), [
    { kind: 'development', label: '开发', count: 2, share: 0.67 },
    { kind: 'research', label: '资料', count: 1, share: 0.33 }
  ])
  assert.equal(dailyInsight.focusBlocks[0].title, '开发 · OneTool')
  assert.equal(dailyInsight.focusBlocks[0].bucketCount, 2)
})

test('buildMemoryDiaryDailyInsight merges adjacent buckets that share a work theme across apps', () => {
  const memoryDiary = loadMemoryDiaryModule()
  const buckets = [
    {
      id: '1',
      start: '2026-05-26T01:00:00.000Z',
      end: '2026-05-26T01:15:00.000Z',
      title: '开发 OneTool',
      summary: '围绕 ScreenPipe 进行开发',
      appNames: ['Code'],
      windowNames: ['MemoryDiaryTool.tsx - OneTool'],
      urls: [],
      contentTypes: ['accessibility'],
      keyTexts: ['开发 OneTool'],
      items: [
        { id: 'a', timestamp: '2026-05-26T01:00:00.000Z', contentType: 'accessibility', appName: 'Code', windowName: 'MemoryDiaryTool.tsx - OneTool', url: '', text: '开发 OneTool' }
      ],
      insight: {
        activityKind: 'development',
        activityLabel: '开发',
        confidence: 0.8,
        dominantAppName: 'Code',
        dominantWindowName: 'MemoryDiaryTool.tsx - OneTool',
        projectHints: ['OneTool', 'MemoryDiaryTool.tsx'],
        keywords: ['screenpipe', 'timeline'],
        sourceCounts: { accessibility: 1, ocr: 0, audio: 0, input: 0 },
        uniqueTextCount: 1,
        duplicateTextCount: 0,
        duplicateRatio: 0,
        evidenceTexts: ['开发 OneTool']
      }
    },
    {
      id: '2',
      start: '2026-05-26T01:15:00.000Z',
      end: '2026-05-26T01:30:00.000Z',
      title: '调试 OneTool',
      summary: '围绕 ScreenPipe 进行调试',
      appNames: ['Codex'],
      windowNames: ['添加自动记忆系统'],
      urls: [],
      contentTypes: ['accessibility'],
      keyTexts: ['调试 OneTool'],
      items: [
        { id: 'b', timestamp: '2026-05-26T01:15:00.000Z', contentType: 'accessibility', appName: 'Codex', windowName: '添加自动记忆系统', url: '', text: '调试 OneTool' }
      ],
      insight: {
        activityKind: 'development',
        activityLabel: '开发',
        confidence: 0.8,
        dominantAppName: 'Codex',
        dominantWindowName: '添加自动记忆系统',
        projectHints: ['OneTool'],
        keywords: ['screenpipe', 'timeline'],
        sourceCounts: { accessibility: 1, ocr: 0, audio: 0, input: 0 },
        uniqueTextCount: 1,
        duplicateTextCount: 0,
        duplicateRatio: 0,
        evidenceTexts: ['调试 OneTool']
      }
    }
  ]

  const dailyInsight = memoryDiary.buildMemoryDiaryDailyInsight(buckets)

  assert.equal(dailyInsight.focusBlocks[0].title, '开发 · OneTool')
  assert.equal(dailyInsight.focusBlocks[0].bucketCount, 2)
  assert.deepEqual(toPlainObject(dailyInsight.focusBlocks[0].projectHints), ['OneTool', 'MemoryDiaryTool.tsx'])
})
