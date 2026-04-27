const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadWidgetModelModule() {
  const filePath = path.join(__dirname, 'desktopCalendarWidgetModel.ts')
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

const baseEvents = [
  {
    id: 'standup',
    title: '站会',
    date: '2026-04-27',
    start: '09:30',
    end: '10:00',
    calendar: '工作',
    color: '#38b887',
    location: '会议室 A',
    participants: '',
    description: ''
  },
  {
    id: 'review',
    title: '设计评审',
    date: '2026-04-28',
    start: '14:00',
    end: '15:00',
    calendar: '重要',
    color: '#ca8528',
    location: '',
    participants: '',
    description: ''
  }
]

test('buildDesktopCalendarWidgetModel marks today, selected date, and event density in a stable month grid', () => {
  const { buildDesktopCalendarWidgetModel } = loadWidgetModelModule()

  const model = buildDesktopCalendarWidgetModel({
    events: baseEvents,
    selectedDate: '2026-04-27',
    now: new Date(2026, 3, 27, 8, 30, 0)
  })

  assert.equal(model.monthLabel, '2026年4月')
  assert.equal(model.dayLabel, '4月27日 周一')
  assert.equal(model.cells.length, 42)
  assert.equal(model.cells[0].date, '2026-03-29')

  const todayCell = model.cells.find((cell) => cell.date === '2026-04-27')
  assert.equal(todayCell.isToday, true)
  assert.equal(todayCell.isSelected, true)
  assert.equal(todayCell.eventCount, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(todayCell.eventColors)), ['#38b887'])
})

test('buildDesktopCalendarWidgetModel keeps in-progress and upcoming events sorted from the current time', () => {
  const { buildDesktopCalendarWidgetModel } = loadWidgetModelModule()

  const model = buildDesktopCalendarWidgetModel({
    events: [
      {
        ...baseEvents[0],
        id: 'done',
        title: '已结束',
        start: '07:30',
        end: '08:00'
      },
      ...baseEvents,
      {
        ...baseEvents[1],
        id: 'tomorrow',
        title: '明日准备会',
        date: '2026-04-28',
        start: '09:00',
        end: '09:30'
      }
    ],
    selectedDate: '2026-04-27',
    now: new Date(2026, 3, 27, 9, 45, 0)
  })

  assert.deepEqual(JSON.parse(JSON.stringify(model.todayEvents.map((event) => event.id))), ['standup'])
  assert.deepEqual(JSON.parse(JSON.stringify(model.upcomingEvents.map((event) => event.id))), ['standup', 'tomorrow', 'review'])
})
