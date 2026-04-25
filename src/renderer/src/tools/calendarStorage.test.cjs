const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarStorageModule() {
  const filePath = path.join(__dirname, 'calendarStorage.ts')
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

test('getTodayDate uses the current local calendar date instead of a hard-coded demo date', () => {
  const { getTodayDate } = loadCalendarStorageModule()

  assert.equal(getTodayDate(new Date(2026, 3, 25, 9, 30, 0)), '2026-04-25')
})

test('loadCalendarEvents returns an empty calendar for first-time users', () => {
  const { loadCalendarEvents } = loadCalendarStorageModule()
  const storage = {
    getItem() {
      return null
    }
  }

  assert.deepEqual(JSON.parse(JSON.stringify(loadCalendarEvents(storage))), [])
})

test('loadCalendarEvents removes old seeded demo events while preserving user events', () => {
  const { loadCalendarEvents } = loadCalendarStorageModule()
  const storage = {
    getItem() {
      return JSON.stringify([
        {
          id: 'seed-family-dinner',
          title: '家庭聚餐',
          date: '2025-07-27',
          start: '14:00',
          end: '15:00',
          calendar: '家庭',
          color: '#35a47f',
          location: '家中餐厅',
          participants: '家人',
          description: '旧示例日程'
        },
        {
          id: 'user-1',
          title: '真实日程',
          date: '2026-04-25',
          start: '10:00',
          end: '11:00',
          calendar: '工作',
          color: '#38b887',
          location: '',
          participants: '',
          description: ''
        }
      ])
    }
  }

  assert.deepEqual(JSON.parse(JSON.stringify(loadCalendarEvents(storage).map((event) => event.id))), ['user-1'])
})

test('loadCalendarTimeRange defaults to a range that keeps 17:00-18:00 events visible', () => {
  const { loadCalendarTimeRange } = loadCalendarStorageModule()
  const storage = {
    getItem() {
      return null
    }
  }

  assert.deepEqual(JSON.parse(JSON.stringify(loadCalendarTimeRange(storage))), {
    startHour: 8,
    endHour: 18
  })
})

test('loadCalendarTimeRange ignores invalid stored ranges', () => {
  const { loadCalendarTimeRange } = loadCalendarStorageModule()
  const storage = {
    getItem() {
      return JSON.stringify({ startHour: 22, endHour: 2 })
    }
  }

  assert.deepEqual(JSON.parse(JSON.stringify(loadCalendarTimeRange(storage))), {
    startHour: 8,
    endHour: 18
  })
})

test('expandCalendarTimeRangeToEvent expands the visible range for generated events outside the current window', () => {
  const { expandCalendarTimeRangeToEvent } = loadCalendarStorageModule()

  assert.deepEqual(
    JSON.parse(JSON.stringify(expandCalendarTimeRangeToEvent(
      { startHour: 8, endHour: 18 },
      { start: '19:30', end: '20:15' }
    ))),
    { startHour: 8, endHour: 21 }
  )

  assert.deepEqual(
    JSON.parse(JSON.stringify(expandCalendarTimeRangeToEvent(
      { startHour: 8, endHour: 18 },
      { start: '06:30', end: '07:30' }
    ))),
    { startHour: 6, endHour: 18 }
  )
})
