const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarModule() {
  const filePath = path.join(__dirname, 'calendar.ts')
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

test('normalizeCalendarEvents keeps complete user events and drops malformed entries', () => {
  const { normalizeCalendarEvents } = loadCalendarModule()

  const events = normalizeCalendarEvents([
    {
      id: 'event-1',
      title: '设计评审',
      date: '2026-04-27',
      start: '14:00',
      end: '15:00',
      calendar: '工作',
      color: '#38b887',
      location: '会议室 A',
      participants: '林澈',
      description: ''
    },
    { id: 'broken', title: '缺少时间' }
  ])

  assert.equal(events.length, 1)
  assert.equal(events[0].id, 'event-1')
})

test('getCalendarEventStartTimestamp parses local date and time', () => {
  const { getCalendarEventStartTimestamp } = loadCalendarModule()
  const timestamp = getCalendarEventStartTimestamp({
    id: 'event-1',
    title: '站会',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '',
    participants: '',
    description: ''
  })
  const date = new Date(timestamp)

  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 3)
  assert.equal(date.getDate(), 27)
  assert.equal(date.getHours(), 9)
  assert.equal(date.getMinutes(), 30)
})

test('getCalendarReminderDelay schedules future and soon-starting events without scheduling past events', () => {
  const { getCalendarReminderDelay } = loadCalendarModule()
  const now = new Date(2026, 3, 27, 8, 55, 0).getTime()
  const future = { date: '2026-04-27', start: '09:30' }
  const soon = { date: '2026-04-27', start: '09:00' }
  const past = { date: '2026-04-27', start: '08:30' }

  assert.equal(getCalendarReminderDelay(future, now, 10), 25 * 60 * 1000)
  assert.equal(getCalendarReminderDelay(soon, now, 10), 0)
  assert.equal(getCalendarReminderDelay(past, now, 10), null)
})

test('createCalendarReminderKey changes when an event occurrence changes', () => {
  const { createCalendarReminderKey } = loadCalendarModule()
  const base = {
    id: 'event-1',
    title: '站会',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '',
    participants: '',
    description: ''
  }

  assert.equal(createCalendarReminderKey(base), 'event-1:2026-04-27:09:30')
  assert.equal(createCalendarReminderKey({ ...base, start: '10:30' }), 'event-1:2026-04-27:10:30')
})

test('normalizeCalendarWidgetGlassSettings clamps user-controlled glass parameters', () => {
  const {
    normalizeCalendarWidgetGlassBlur,
    normalizeCalendarWidgetGlassOpacity
  } = loadCalendarModule()

  assert.equal(normalizeCalendarWidgetGlassOpacity(undefined), 60)
  assert.equal(normalizeCalendarWidgetGlassOpacity(8), 20)
  assert.equal(normalizeCalendarWidgetGlassOpacity(120), 95)
  assert.equal(normalizeCalendarWidgetGlassOpacity(62.4), 62)
  assert.equal(normalizeCalendarWidgetGlassBlur(undefined), 32)
  assert.equal(normalizeCalendarWidgetGlassBlur(-4), 0)
  assert.equal(normalizeCalendarWidgetGlassBlur(90), 64)
  assert.equal(normalizeCalendarWidgetGlassBlur(28.6), 29)
})
