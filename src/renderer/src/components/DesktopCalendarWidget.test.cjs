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
  assert.match(source, /setWidgetAlwaysOnTop/)
  assert.match(source, /setWidgetBackgroundMode/)
})

test('DesktopCalendarWidget defaults to an opaque white shell and offers a thicker glass option', () => {
  const source = readSource('DesktopCalendarWidget.tsx')

  assert.match(source, /calendarWidgetSurfaceClass/)
  assert.match(source, /'border-slate-200 bg-white shadow-2xl/)
  assert.match(source, /'border-white\/80 bg-white\/\[0\.98\] shadow-2xl/)
  assert.match(source, /bg-slate-50\/\[0\.97\]/)
  assert.match(source, /backdrop-blur-2xl/)
  assert.doesNotMatch(source, /bg-white\/90|bg-white\/92/)
  assert.doesNotMatch(source, /bg-white\/88/)
  assert.doesNotMatch(source, /bg-white\/72|bg-white\/76|bg-slate-50\/86/)
})
