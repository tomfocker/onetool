const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'MemoryDiaryTool.tsx'), 'utf8')

test('MemoryDiaryTool keeps worklog and blog outputs visible but disabled', () => {
  assert.match(source, /disabled: true/)
  assert.match(source, /暂未开放/)
  assert.match(source, /onClick=\{\(\) => selectDiaryStyle\(option\.value\)\}/)
  assert.match(source, /disabled=\{option\.disabled\}/)
})

test('MemoryDiaryTool limits brief tone choices to daily diary and professional analysis', () => {
  assert.match(source, /日常日记/)
  assert.match(source, /专业分析/)
  assert.doesNotMatch(source, /科研风/)
})

test('MemoryDiaryTool exposes an automatic daily summary time setting', () => {
  assert.match(source, /autoDailySummaryEnabled/)
  assert.match(source, /autoDailySummaryTime/)
  assert.match(source, /自动总结/)
  assert.match(source, /type="time"/)
  assert.match(source, /saveSummarySettings/)
})
