const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('renderer bootstrap mounts the desktop calendar widget entry and syncs stored events on app startup', () => {
  const source = fs.readFileSync(path.join(__dirname, 'main.tsx'), 'utf8')

  assert.match(source, /syncStoredCalendarEventsToNativeBridge/)
  assert.match(source, /bootstrapRoute === 'calendar-widget'/)
  assert.match(source, /import\('\.\/components\/DesktopCalendarWidget'\)/)
  assert.match(source, /<DesktopCalendarWidget \/>/)
})
