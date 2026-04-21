const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

test('hero heading uses dedicated title lines instead of raw line breaks', () => {
  assert.match(html, /class="hero-title"/)
  assert.match(html, /class="hero-title-line">一个应用，收齐/)
  assert.match(html, /class="hero-title-line hero-title-line-wide">Windows 日常高频工具/)
  assert.doesNotMatch(html, /<h1 id="hero-title">一个应用，<br \/>收齐 Windows<br \/>日常高频工具。<\/h1>/)
})

test('hero cards and landing modules expose stable dock keys', () => {
  assert.match(html, /data-flight-card="capture"/)
  assert.match(html, /data-flight-card="organize"/)
  assert.match(html, /data-flight-card="clipboard"/)
  assert.match(html, /data-flight-card="utility"/)
  assert.match(html, /data-flight-card="matrix"/)
  assert.match(html, /data-flight-dock="capture"/)
  assert.match(html, /data-flight-dock="organize"/)
  assert.match(html, /data-flight-dock="utility"/)
  assert.match(html, /data-flight-dock="matrix"/)
})
