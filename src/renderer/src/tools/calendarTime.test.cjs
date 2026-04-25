const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadCalendarTimeModule() {
  const filePath = path.join(__dirname, 'calendarTime.ts')
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

const {
  DEFAULT_CALENDAR_GRID_CONFIG,
  calculateSelectionPosition,
  resolveDraggedEventPreview,
  resolveDraggedEventTime,
  resolveSelectionRange
} = loadCalendarTimeModule()

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value))
}

test('resolveSelectionRange snaps a forward drag to 15-minute boundaries', () => {
  const range = resolveSelectionRange(115, 207, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.deepEqual(
    {
      start: range.start,
      end: range.end,
      startMinutes: range.startMinutes,
      endMinutes: range.endMinutes
    },
    {
      start: '09:15',
      end: '10:15',
      startMinutes: 555,
      endMinutes: 615
    }
  )
  assert.deepEqual(toPlainObject(calculateSelectionPosition(range, DEFAULT_CALENDAR_GRID_CONFIG)), {
    top: 115,
    height: 92
  })
})

test('resolveSelectionRange supports reverse dragging while preserving the intended range', () => {
  const range = resolveSelectionRange(322, 230, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.equal(range.start, '10:30')
  assert.equal(range.end, '11:30')
})

test('resolveSelectionRange expands tiny drags to the minimum event duration', () => {
  const range = resolveSelectionRange(184, 190, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.equal(range.start, '10:00')
  assert.equal(range.end, '10:30')
})

test('resolveDraggedEventTime moves an event to the target date and snapped start time', () => {
  const moved = resolveDraggedEventTime({
    date: '2025-07-24',
    durationMinutes: 60,
    grabOffsetY: 0,
    pointerY: 207
  }, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.deepEqual(
    {
      date: moved.date,
      start: moved.start,
      end: moved.end,
      top: moved.top
    },
    {
      date: '2025-07-24',
      start: '10:15',
      end: '11:15',
      top: 207
    }
  )
})

test('resolveDraggedEventPreview follows the pointer smoothly and keeps a snapped drop target', () => {
  const preview = resolveDraggedEventPreview({
    date: '2025-07-24',
    durationMinutes: 60,
    grabOffsetY: 0,
    pointerY: 101
  }, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.equal(preview.date, '2025-07-24')
  assert.equal(preview.top, 101)
  assert.equal(preview.height, 82)
  assert.deepEqual(
    {
      start: preview.drop.start,
      end: preview.drop.end,
      top: preview.drop.top
    },
    {
      start: '09:00',
      end: '10:00',
      top: 92
    }
  )
})

test('resolveDraggedEventTime clamps moved events inside the visible workday', () => {
  const moved = resolveDraggedEventTime({
    date: '2025-07-24',
    durationMinutes: 120,
    grabOffsetY: 0,
    pointerY: 736
  }, DEFAULT_CALENDAR_GRID_CONFIG)

  assert.equal(moved.start, '16:00')
  assert.equal(moved.end, '18:00')
})

test('default grid range keeps evening events reachable for deletion and editing', () => {
  assert.equal(DEFAULT_CALENDAR_GRID_CONFIG.startHour, 8)
  assert.equal(DEFAULT_CALENDAR_GRID_CONFIG.endHour, 18)
})
