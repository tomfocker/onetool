const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDefaultModelDownloadState,
  trimModelDownloadLogs
} = require('./modelDownload.ts')

test('createDefaultModelDownloadState seeds an idle state with a provided default save path', () => {
  const state = createDefaultModelDownloadState('D:\\Downloads')

  assert.equal(state.status, 'idle')
  assert.equal(state.defaultSavePath, 'D:\\Downloads')
  assert.equal(state.logs.length, 0)
  assert.equal(state.runtime.ready, false)
})

test('trimModelDownloadLogs keeps the newest log entries within the requested limit', () => {
  const logs = [
    { id: '1', level: 'info', message: 'first', timestamp: '2026-04-21T10:00:00.000Z' },
    { id: '2', level: 'info', message: 'second', timestamp: '2026-04-21T10:00:01.000Z' },
    { id: '3', level: 'error', message: 'third', timestamp: '2026-04-21T10:00:02.000Z' }
  ]

  const trimmed = trimModelDownloadLogs(logs, 2)

  assert.deepEqual(trimmed.map((item) => item.id), ['2', '3'])
})
