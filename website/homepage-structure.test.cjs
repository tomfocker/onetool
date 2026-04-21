const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

function countMatches(source, pattern) {
  const matches = source.match(pattern)
  return matches ? matches.length : 0
}

test('homepage keeps only hero, tools, and download sections', () => {
  assert.equal(countMatches(html, /<section\b/gi), 3)
  assert.match(html, /<section\b[^>]*id="hero"/)
  assert.match(html, /<section\b[^>]*id="tools"/)
  assert.match(html, /<section\b[^>]*id="download"/)
  assert.doesNotMatch(html, /id="scenarios"/)
  assert.doesNotMatch(html, /id="system"/)
  assert.doesNotMatch(html, /value-strip/)
})

test('top navigation exposes only three in-page anchors', () => {
  assert.match(html, /<a href="#hero">首页<\/a>/)
  assert.match(html, /<a href="#tools">工具展示<\/a>/)
  assert.match(html, /<a href="#download">下载<\/a>/)
  assert.doesNotMatch(html, /href="#scenarios"/)
  assert.doesNotMatch(html, /href="#system"/)
})

test('tool section includes a short intro and three dock groups', () => {
  assert.match(html, /class="tool-matrix-intro"/)
  assert.match(html, /data-flight-target="capture"/)
  assert.match(html, /data-flight-target="organize"/)
  assert.match(html, /data-flight-target="utility"/)
  assert.doesNotMatch(html, /data-flight-target="matrix"/)
  assert.doesNotMatch(html, /data-flight-target="clipboard"/)
})
