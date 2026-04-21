const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

test('scroll syncing uses requestAnimationFrame and publishes morph and dock variables', () => {
  assert.match(script, /requestAnimationFrame/)
  assert.match(script, /--flight-morph/)
  assert.match(script, /--flight-dock/)
  assert.match(script, /data-flight-dock/)
})

test('hero cards expose dock transforms and target modules expose takeover styling', () => {
  assert.match(style, /--dock-x/)
  assert.match(style, /--dock-y/)
  assert.match(style, /--dock-scale/)
  assert.match(style, /\.hero-flight-card\[data-flight-card=/)
  assert.match(style, /\[data-flight-dock='capture'\]/)
  assert.match(style, /var\(--flight-dock-soft\)/)
})
