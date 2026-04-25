const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readCalendarToolSource() {
  return fs.readFileSync(path.join(__dirname, 'CalendarTool.tsx'), 'utf8')
}

test('assistant floating shell does not intercept clicks over weekend calendar columns while collapsed', () => {
  const source = readCalendarToolSource()
  const shellClass = source.match(/<section className="([^"]*fixed bottom-10 right-10[^"]*)"/)?.[1] ?? ''
  const toggleButtonClass = source.match(/<button type="button" onClick=\{\(\) => setAiOpen\(\(current\) => !current\)\} className="([^"]*)"/)?.[1] ?? ''

  assert.match(shellClass, /pointer-events-none/)
  assert.match(
    source,
    /aiOpen \? 'pointer-events-auto translate-y-0 scale-100 opacity-100'/
  )
  assert.match(toggleButtonClass, /pointer-events-auto/)
})

test('assistant panel does not render a second decorative input above the chat history', () => {
  const source = readCalendarToolSource()

  assert.doesNotMatch(source, /typedIntro/)
  assert.doesNotMatch(source, /setTypedIntro/)
  assert.doesNotMatch(source, /我已经在 OneTool 里为你准备好本地日历/)
})

test('assistant no longer exposes the retired focus suggestion block', () => {
  const source = readCalendarToolSource()

  assert.doesNotMatch(source, /AudioContext/)
  assert.doesNotMatch(source, /createOscillator/)
  assert.doesNotMatch(source, /oscillator/)
  assert.doesNotMatch(source, /Hans Zimmer/)
  assert.doesNotMatch(source, /Focus 建议/)
  assert.doesNotMatch(source, /静音深度工作/)
  assert.doesNotMatch(source, /专注建议/)
})
