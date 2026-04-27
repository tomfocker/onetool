const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readSource(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), 'utf8')
}

test('DesktopCalendarWidget renders from the calendar widget model and native event subscription', () => {
  const source = readSource('DesktopCalendarWidget.tsx')

  assert.match(source, /buildDesktopCalendarWidgetModel/)
  assert.match(source, /loadCalendarEvents\(window\.localStorage\)/)
  assert.match(source, /calendar\?\.onEventsUpdated/)
  assert.match(source, /setEvents\(events\)/)
})

test('DesktopCalendarWidget exposes a draggable desktop shell and native window controls', () => {
  const source = readSource('DesktopCalendarWidget.tsx')

  assert.match(source, /calendar-widget-drag-region/)
  assert.match(source, /WebkitAppRegion: 'drag'/)
  assert.match(source, /calendar\?\.hideWidget\(\)/)
  assert.match(source, /calendar\?\.showWidget\(\)/)
})
