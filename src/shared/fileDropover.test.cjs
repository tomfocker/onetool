const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildStoredFiles,
  getInitialFloatBallVisibility,
  resolveFloatBallVisibilityState
} = require('./fileDropover.ts')

test('buildStoredFiles prefers Electron path resolution over file.name fallbacks', () => {
  const files = [
    { name: 'report.pdf' }
  ]

  const result = buildStoredFiles(files, () => 'C:\\Users\\Admin\\Desktop\\report.pdf', 123)

  assert.deepEqual(result, [
    {
      id: '123-0',
      path: 'C:\\Users\\Admin\\Desktop\\report.pdf',
      name: 'report.pdf',
      isDirectory: false
    }
  ])
})

test('buildStoredFiles drops entries that still have no usable path', () => {
  const files = [
    { name: 'ghost.txt', path: '' },
    { name: 'draft.txt', path: 'D:\\tmp\\draft.txt' }
  ]

  const result = buildStoredFiles(files, undefined, 456)

  assert.deepEqual(result, [
    {
      id: '456-1',
      path: 'D:\\tmp\\draft.txt',
      name: 'draft.txt',
      isDirectory: false
    }
  ])
})

test('getInitialFloatBallVisibility defaults to visible unless explicitly disabled', () => {
  assert.equal(getInitialFloatBallVisibility(null), true)
  assert.equal(getInitialFloatBallVisibility(undefined), true)
  assert.equal(getInitialFloatBallVisibility('true'), true)
  assert.equal(getInitialFloatBallVisibility('false'), false)
})

test('resolveFloatBallVisibilityState prefers the real window visibility over saved local state', () => {
  assert.equal(resolveFloatBallVisibilityState(true, 'false'), true)
  assert.equal(resolveFloatBallVisibilityState(false, 'true'), false)
  assert.equal(resolveFloatBallVisibilityState(undefined, 'false'), false)
  assert.equal(resolveFloatBallVisibilityState(undefined, null), true)
})
