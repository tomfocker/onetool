const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTypeScriptModule(fileName, extraRequire = require) {
  const filePath = path.join(__dirname, fileName)
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
    require: extraRequire,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

function loadCalendarEventLayoutModule() {
  const calendarTime = loadTypeScriptModule('calendarTime.ts')
  return loadTypeScriptModule('calendarEventLayout.ts', (request) => {
    if (request === './calendarTime') return calendarTime
    return require(request)
  })
}

test('layoutCalendarEventsForDay places overlapping events side by side', () => {
  const { layoutCalendarEventsForDay } = loadCalendarEventLayoutModule()

  const layout = layoutCalendarEventsForDay([
    { id: 'a', start: '09:00', end: '10:00' },
    { id: 'b', start: '09:30', end: '10:30' }
  ])

  assert.deepEqual(layout.map((item) => ({
    id: item.event.id,
    leftPercent: item.leftPercent,
    widthPercent: item.widthPercent,
    overlapCount: item.overlapCount
  })), [
    { id: 'a', leftPercent: 0, widthPercent: 50, overlapCount: 2 },
    { id: 'b', leftPercent: 50, widthPercent: 50, overlapCount: 2 }
  ])
})

test('layoutCalendarEventsForDay keeps adjacent events full width', () => {
  const { layoutCalendarEventsForDay } = loadCalendarEventLayoutModule()

  const layout = layoutCalendarEventsForDay([
    { id: 'a', start: '09:00', end: '10:00' },
    { id: 'b', start: '10:00', end: '11:00' }
  ])

  assert.deepEqual(layout.map((item) => ({
    id: item.event.id,
    leftPercent: item.leftPercent,
    widthPercent: item.widthPercent,
    overlapCount: item.overlapCount
  })), [
    { id: 'a', leftPercent: 0, widthPercent: 100, overlapCount: 1 },
    { id: 'b', leftPercent: 0, widthPercent: 100, overlapCount: 1 }
  ])
})

test('findCalendarEventConflicts returns only events that overlap the same date and time', () => {
  const { findCalendarEventConflicts } = loadCalendarEventLayoutModule()

  const conflicts = findCalendarEventConflicts([
    { id: 'a', date: '2026-04-27', start: '09:00', end: '10:00' },
    { id: 'b', date: '2026-04-27', start: '10:00', end: '11:00' },
    { id: 'c', date: '2026-04-28', start: '09:30', end: '10:30' }
  ], {
    id: 'target',
    date: '2026-04-27',
    start: '09:30',
    end: '10:30'
  })

  assert.deepEqual(conflicts.map((event) => event.id), ['a', 'b'])
})
