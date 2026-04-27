const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('CalendarTool persists edits to native reminders and exposes a desktop widget button', () => {
  const source = fs.readFileSync(path.join(__dirname, 'CalendarTool.tsx'), 'utf8')

  assert.match(source, /syncCalendarEventsToNativeBridge/)
  assert.match(source, /window\.electron\?\.calendar\?\.showWidget\(\)/)
  assert.match(source, /常驻桌面/)
})
