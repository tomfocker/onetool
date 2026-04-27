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
  assert.match(source, /setWidgetGlassSettings/)
})

test('DesktopCalendarWidget defaults to an opaque white shell and offers a 60% glass option', () => {
  const source = readSource('DesktopCalendarWidget.tsx')

  assert.match(source, /calendarWidgetSurfaceClass/)
  assert.match(source, /'border-slate-200 bg-white shadow-2xl/)
  assert.match(source, /'border-white\/80 bg-white\/\[0\.60\] shadow-2xl/)
  assert.match(source, /bg-slate-50\/\[0\.60\]/)
  assert.match(source, /backdrop-blur-2xl/)
  assert.doesNotMatch(source, /bg-white\/90|bg-white\/92|bg-white\/\[0\.95\]|bg-white\/\[0\.98\]/)
  assert.doesNotMatch(source, /bg-white\/88/)
  assert.doesNotMatch(source, /bg-white\/72|bg-white\/76|bg-slate-50\/86/)
})

test('DesktopCalendarWidget exposes glass opacity and blur sliders with live backdrop styles', () => {
  const source = readSource('DesktopCalendarWidget.tsx')

  assert.match(source, /glassOpacity/)
  assert.match(source, /glassBlur/)
  assert.match(source, /backdropFilter: `blur\(\$\{glassBlur\}px\) saturate\(180%\)`/)
  assert.match(source, /aria-label="毛玻璃透明度"/)
  assert.match(source, /aria-label="毛玻璃模糊强度"/)
  assert.match(source, /min=\{20\}/)
  assert.match(source, /max=\{95\}/)
  assert.match(source, /min=\{0\}/)
  assert.match(source, /max=\{64\}/)
})
