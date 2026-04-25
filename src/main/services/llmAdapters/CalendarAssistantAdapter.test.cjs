const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarAssistantAdapterModule() {
  const filePath = path.join(__dirname, 'CalendarAssistantAdapter.ts')
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
    process
  }, { filename: filePath })

  return module.exports
}

test('CalendarAssistantAdapter builds a strict calendar extraction prompt with local context', () => {
  const { CalendarAssistantAdapter } = loadCalendarAssistantAdapterModule()
  const adapter = new CalendarAssistantAdapter()

  const prompts = adapter.buildCompletion({
    message: '下周三下午三点和林澈开方案会，地点湖景会议室',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: [
        { title: '早会', date: '2025-07-23', start: '08:00', end: '09:00', calendar: '工作' }
      ]
    }
  })

  assert.match(prompts.systemPrompt, /自然语言日历意图解析器/)
  assert.match(prompts.systemPrompt, /只返回 JSON/)
  assert.match(prompts.userPrompt, /当前日期：2025-07-23/)
  assert.match(prompts.userPrompt, /当前选中日期：2025-07-23/)
  assert.match(prompts.userPrompt, /下周三下午三点/)
  assert.match(prompts.userPrompt, /早会/)
})

test('CalendarAssistantAdapter maps a model create response into a safe event draft', () => {
  const { CalendarAssistantAdapter } = loadCalendarAssistantAdapterModule()
  const adapter = new CalendarAssistantAdapter()

  const result = adapter.mapAssistantResult({
    message: '下周三下午三点和林澈开方案会，地点湖景会议室',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: []
    }
  }, {
    action: 'create',
    message: '已创建方案会',
    event: {
      title: '方案会',
      date: '2025-07-30',
      start: '15:00',
      end: '16:00',
      calendar: '工作',
      location: '湖景会议室',
      participants: '林澈',
      description: '讨论方案结构'
    }
  })

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    type: 'create',
    message: '已创建方案会',
    event: {
      title: '方案会',
      date: '2025-07-30',
      start: '15:00',
      end: '16:00',
      calendar: '工作',
      color: '#38b887',
      location: '湖景会议室',
      participants: '林澈',
      description: '讨论方案结构'
    }
  })
})

test('CalendarAssistantAdapter normalizes broad morning requests to a full morning block', () => {
  const { CalendarAssistantAdapter } = loadCalendarAssistantAdapterModule()
  const adapter = new CalendarAssistantAdapter()

  const result = adapter.mapAssistantResult({
    message: '后天上午有培训',
    context: {
      selectedDate: '2026-04-25',
      today: '2026-04-25',
      events: []
    }
  }, {
    action: 'create',
    message: '已创建培训',
    event: {
      title: '培训',
      date: '2026-04-27',
      start: '09:00',
      end: '10:00',
      calendar: '工作'
    }
  })

  assert.equal(result.type, 'create')
  assert.equal(result.event.start, '09:00')
  assert.equal(result.event.end, '12:00')
})

test('CalendarAssistantAdapter falls back to help when the model omits required event fields', () => {
  const { CalendarAssistantAdapter } = loadCalendarAssistantAdapterModule()
  const adapter = new CalendarAssistantAdapter()

  const result = adapter.mapAssistantResult({
    message: '安排一下',
    context: {
      selectedDate: '2025-07-23',
      today: '2025-07-23',
      events: []
    }
  }, {
    action: 'create',
    event: {
      title: '方案会',
      date: '2025-07-30',
      start: '15:00'
    }
  })

  assert.equal(result.type, 'help')
  assert.match(result.message, /标题、日期、开始和结束时间/)
})
