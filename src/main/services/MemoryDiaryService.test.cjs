const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(overrides = {}) {
  const filePath = path.join(__dirname, 'MemoryDiaryService.ts')
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
    if (specifier === 'electron') {
      return { app: overrides.appModule || { getPath: () => 'D:\\UserData' } }
    }

    if (specifier === 'fs') {
      return overrides.fsModule || { promises: overrides.fsPromises || {} }
    }

    if (specifier === 'path') {
      return path
    }

    if (specifier === './StoreService') {
      return { storeService: overrides.storeService }
    }

    if (specifier === './LlmService') {
      return { llmService: overrides.llmService }
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
    Date,
    setTimeout,
    clearTimeout
  }, { filename: filePath })

  return module.exports
}

function createState() {
  return {
    memoryDiary: {
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
      diaryHistory: [],
      deploymentLogs: []
    }
  }
}

function createService(overrides = {}) {
  const state = overrides.state || createState()
  const writes = []
  const fsCalls = []
  const { MemoryDiaryService } = loadModule({
    appModule: overrides.appModule || { getPath: () => 'D:\\UserData' },
    fsPromises: overrides.fsPromises || {
      mkdir: async (...args) => fsCalls.push(['mkdir', ...args]),
      writeFile: async (...args) => fsCalls.push(['writeFile', ...args]),
      unlink: async (...args) => fsCalls.push(['unlink', ...args])
    },
    storeService: overrides.storeService || {
      get: (key) => state[key],
      set: (key, value) => {
        writes.push([key, value])
        state[key] = value
      }
    },
    llmService: overrides.llmService || {
      generateMemoryDiary: async (request) => ({
        success: true,
        data: {
          id: 'draft-1',
          date: request.date,
          title: '今日工作简报',
          summary: '完成 ScreenPipe 日报管线',
          markdown: '# 今日工作简报',
          createdAt: '2026-05-26T12:00:00.000Z'
        }
      })
    }
  })

  return {
    service: new MemoryDiaryService({
      appModule: overrides.appModule || { getPath: () => 'D:\\UserData' },
      fsPromises: overrides.fsPromises,
      storeService: overrides.storeService,
      llmService: overrides.llmService,
      now: overrides.now
    }),
    state,
    writes,
    fsCalls
  }
}

test('generate forwards diary requests to the llm service', async () => {
  const llmCalls = []
  const { service } = createService({
    llmService: {
      generateMemoryDiary: async (request) => {
        llmCalls.push(request)
        return {
          success: true,
          data: {
            id: 'draft-1',
            date: request.date,
            title: '今日工作简报',
            summary: '完成 ScreenPipe 日报管线',
            markdown: '# 今日工作简报',
            createdAt: '2026-05-26T12:00:00.000Z'
          }
        }
      }
    }
  })

  const request = { date: '2026-05-26', timezone: 'Asia/Shanghai', buckets: [], config: createState().memoryDiary.config, userNotes: '加上时间线' }
  const result = await service.generate(request)

  assert.equal(result.success, true)
  assert.equal(result.data.markdown, '# 今日工作简报')
  assert.deepEqual(llmCalls, [request])
})

test('save writes markdown and stores a history entry', async () => {
  const { service, state, fsCalls, writes } = createService({
    now: () => new Date('2026-05-26T12:30:00.000Z')
  })

  const result = await service.save({
    id: 'draft-1',
    date: '2026-05-26',
    title: '今日工作简报',
    summary: '完成 ScreenPipe 日报管线',
    markdown: '# 今日工作简报',
    createdAt: '2026-05-26T12:00:00.000Z'
  })

  assert.equal(result.success, true)
  assert.equal(result.data.id, 'draft-1')
  assert.equal(state.memoryDiary.diaryHistory.length, 1)
  assert.equal(state.memoryDiary.diaryHistory[0].updatedAt, '2026-05-26T12:30:00.000Z')
  assert.equal(writes.at(-1)[0], 'memoryDiary')
  assert.deepEqual(fsCalls.map((call) => call[0]), ['mkdir', 'writeFile'])
  assert.match(fsCalls[1][1], /memory-diary[\\/]daily[\\/]draft-1\.md$/)
  assert.equal(fsCalls[1][2], '# 今日工作简报')
})

test('list returns history newest first', () => {
  const state = createState()
  state.memoryDiary.diaryHistory = [
    { id: 'old', date: '2026-05-25', title: '旧日报', summary: 'old', markdownPath: 'old.md', createdAt: '2026-05-25T12:00:00.000Z', updatedAt: '2026-05-25T12:00:00.000Z' },
    { id: 'new', date: '2026-05-26', title: '新日报', summary: 'new', markdownPath: 'new.md', createdAt: '2026-05-26T12:00:00.000Z', updatedAt: '2026-05-26T12:00:00.000Z' }
  ]
  const { service } = createService({ state })

  const result = service.list()

  assert.equal(result.success, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.map((item) => item.id))), ['new', 'old'])
})

test('delete removes the history entry and attempts to unlink the markdown file', async () => {
  const state = createState()
  state.memoryDiary.diaryHistory = [
    { id: 'draft-1', date: '2026-05-26', title: '日报', summary: 'summary', markdownPath: 'D:\\UserData\\memory-diary\\daily\\draft-1.md', createdAt: '2026-05-26T12:00:00.000Z', updatedAt: '2026-05-26T12:00:00.000Z' }
  ]
  const { service, fsCalls } = createService({ state })

  const result = await service.delete('draft-1')

  assert.equal(result.success, true)
  assert.equal(state.memoryDiary.diaryHistory.length, 0)
  assert.deepEqual(fsCalls[0], ['unlink', 'D:\\UserData\\memory-diary\\daily\\draft-1.md'])
})
