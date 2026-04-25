const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarAssistantModule() {
  const filePath = path.join(__dirname, 'calendarAssistant.ts')
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

const { parseCalendarAssistantMessage } = loadCalendarAssistantModule()

const context = {
  selectedDate: '2025-07-23',
  today: '2025-07-23'
}

test('parses a same-day natural language event with explicit time range', () => {
  const result = parseCalendarAssistantMessage('今天 14:30-15:30 和客户电话，地点 远程会议', context)

  assert.equal(result.type, 'create')
  assert.deepEqual(
    {
      title: result.event.title,
      date: result.event.date,
      start: result.event.start,
      end: result.event.end,
      location: result.event.location,
      calendar: result.event.calendar
    },
    {
      title: '客户电话',
      date: '2025-07-23',
      start: '14:30',
      end: '15:30',
      location: '远程会议',
      calendar: '工作'
    }
  )
})

test('parses tomorrow afternoon shorthand and applies one-hour default duration', () => {
  const result = parseCalendarAssistantMessage('明天下午3点安排设计评审', context)

  assert.equal(result.type, 'create')
  assert.equal(result.event.title, '设计评审')
  assert.equal(result.event.date, '2025-07-24')
  assert.equal(result.event.start, '15:00')
  assert.equal(result.event.end, '16:00')
})

test('parses weekday references in the selected week', () => {
  const result = parseCalendarAssistantMessage('周五上午10点到11点写进度报告', context)

  assert.equal(result.type, 'create')
  assert.equal(result.event.title, '进度报告')
  assert.equal(result.event.date, '2025-07-25')
  assert.equal(result.event.start, '10:00')
  assert.equal(result.event.end, '11:00')
})

test('parses broad morning wording as a full morning block', () => {
  const result = parseCalendarAssistantMessage('后天上午有培训', context)

  assert.equal(result.type, 'create')
  assert.equal(result.event.title, '培训')
  assert.equal(result.event.date, '2025-07-25')
  assert.equal(result.event.start, '09:00')
  assert.equal(result.event.end, '12:00')
})

test('returns help when the assistant cannot infer a title and time', () => {
  const result = parseCalendarAssistantMessage('帮我安排一下', context)

  assert.equal(result.type, 'help')
  assert.match(result.message, /例如/)
})
