const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function readScreenRecorderToolSource() {
  return fs.readFileSync(path.join(__dirname, 'ScreenRecorderTool.tsx'), 'utf8')
}

test('ScreenRecorderTool exposes a completed recording tasks panel', () => {
  const source = readScreenRecorderToolSource()

  assert.match(source, /录制任务/)
  assert.match(source, /taskPanelOpen/)
  assert.match(source, /getCompletedTasks|completedTasks/)
  assert.match(source, /openCompletedTask/)
})

test('ScreenRecorderTool keeps the recorder UI concise', () => {
  const source = readScreenRecorderToolSource()

  assert.doesNotMatch(source, /bg-gradient-to-r|blur-3xl/)
  assert.doesNotMatch(source, /录制建议/)
  assert.doesNotMatch(source, /录制屏幕内容并导出为 MP4 或 GIF/)
  assert.doesNotMatch(source, /先确定录制范围/)
  assert.doesNotMatch(source, /确认输出和区域细节/)
  assert.doesNotMatch(source, /点击“框选区域”/)
  assert.doesNotMatch(source, /虚线框会保留/)
  assert.match(source, /录制设置/)
  assert.match(source, /操作台/)
})

test('ScreenRecorderTool uses a compact control layout', () => {
  const source = readScreenRecorderToolSource()

  assert.match(source, /recorder-layout-grid/)
  assert.match(source, /recorder-segmented-control/)
  assert.match(source, /recorder-action-panel/)
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_320px\]/)
  assert.doesNotMatch(source, /grid-cols-1 xl:grid-cols-\[1\.3fr_0\.9fr\]/)
  assert.doesNotMatch(source, /rounded-2xl border border-white\/15 dark:border-white\/10 shadow-soft p-6 space-y-5/)
})
