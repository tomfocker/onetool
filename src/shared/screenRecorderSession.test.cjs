const test = require('node:test')
const assert = require('node:assert/strict')

const {
  clampRecorderBounds,
  nudgeRecorderBounds,
  isRecorderSelectionValid,
  ensureRecorderOutputPath,
  toRecorderSessionUpdate
} = require('./screenRecorderSession.ts')

test('clampRecorderBounds keeps bounds within the available area and enforces the minimum size', () => {
  assert.deepEqual(
    clampRecorderBounds(
      { x: -10, y: 5, width: 20, height: 20 },
      { x: 0, y: 0, width: 100, height: 80 }
    ),
    { x: 0, y: 5, width: 64, height: 64 }
  )
})

test('nudgeRecorderBounds nudges a single field and respects the display and minimum size', () => {
  assert.deepEqual(
    nudgeRecorderBounds(
      { x: 10, y: 12, width: 80, height: 90 },
      'width',
      -30,
      { x: 0, y: 0, width: 200, height: 150 }
    ),
    { x: 10, y: 12, width: 64, height: 90 }
  )
})

test('isRecorderSelectionValid rejects bounds smaller than the minimum size', () => {
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 63, height: 64 }), false)
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 64, height: 64 }), true)
})

test('ensureRecorderOutputPath rewrites mismatched extensions and preserves matching ones', () => {
  assert.equal(ensureRecorderOutputPath('C:/tmp/capture.mov', 'gif'), 'C:/tmp/capture.gif')
  assert.equal(ensureRecorderOutputPath('C:/tmp/capture.mp4', 'mp4'), 'C:/tmp/capture.mp4')
})

test('toRecorderSessionUpdate returns only the required session fields', () => {
  assert.deepEqual(
    toRecorderSessionUpdate({
      status: 'selecting-area',
      mode: 'area',
      outputPath: 'C:/tmp/capture.mov',
      recordingTime: '00:01:23',
      selectionBounds: { x: 20, y: 30, width: 128, height: 96 },
      selectionPreviewDataUrl: 'data:image/png;base64,preview',
      selectedDisplayId: '12'
    }),
    {
      status: 'selecting-area',
      mode: 'area',
      outputPath: 'C:/tmp/capture.mov',
      recordingTime: '00:01:23',
      selectionBounds: { x: 20, y: 30, width: 128, height: 96 },
      selectionPreviewDataUrl: 'data:image/png;base64,preview',
      selectedDisplayId: '12'
    }
  )
})
