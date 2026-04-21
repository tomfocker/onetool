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
  assert.match(html, /<section\b[^>]*id="tools"[^>]*aria-labelledby="tools-title"/)
  assert.match(html, /<h2 id="tools-title">常用工具已经整理好，滚动到这里就能直接接住。<\/h2>/)
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
  assert.match(
    html,
    /<article class="tool-group tool-group-primary" data-flight-target="capture" data-flight-dock="capture">\s*<span>捕获与处理<\/span>/
  )
  assert.match(
    html,
    /<article class="tool-group" data-flight-target="organize" data-flight-dock="organize">\s*<span>文件与文本<\/span>/
  )
  assert.match(
    html,
    /<article class="tool-group" data-flight-target="utility" data-flight-dock="utility">\s*<span>更多小工具<\/span>/
  )
  assert.doesNotMatch(html, /data-flight-target="matrix"/)
  assert.doesNotMatch(html, /data-flight-target="clipboard"/)
})
