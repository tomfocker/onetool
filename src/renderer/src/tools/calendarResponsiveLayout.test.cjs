const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readCalendarToolSource() {
  return fs.readFileSync(path.join(__dirname, 'CalendarTool.tsx'), 'utf8')
}

test('calendar switches to the two-column app layout at the default toolbox width', () => {
  const source = readCalendarToolSource()

  assert.match(source, /lg:grid-cols-\[236px_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(source, /(?:^|\s)xl:grid-cols-\[264px_minmax\(0,1fr\)\]/)
})

test('calendar keeps dense week and day grids from forcing the entire toolbox wider', () => {
  const source = readCalendarToolSource()

  assert.match(source, /min-w-\[860px\]/)
  assert.match(source, /grid-cols-\[72px_repeat\(7,minmax\(104px,1fr\)\)\]/)
  assert.match(source, /min-w-\[620px\]/)
  assert.match(source, /grid-cols-\[72px_minmax\(480px,1fr\)\]/)
})
