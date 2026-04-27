const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('main runtime passes the calendar reminder service into startup wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')

  assert.match(source, /calendarReminderService/)
  assert.match(source, /from '\.\/services\/CalendarReminderService'/)
  assert.match(source, /calendarReminderService,/)
})
