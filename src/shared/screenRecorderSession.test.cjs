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

test('nudgeRecorderBounds moves bounds by the requested delta without changing size', () => {
  assert.deepEqual(
    nudgeRecorderBounds(
      { x: 10, y: 12, width: 80, height: 90 },
      { x: -5, y: 8 }
    ),
    { x: 5, y: 20, width: 80, height: 90 }
  )
})

test('isRecorderSelectionValid rejects bounds smaller than the minimum size', () => {
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 63, height: 64 }), false)
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 64, height: 64 }), true)
})

test('ensureRecorderOutputPath adds the default extension when missing', () => {
  assert.equal(
    ensureRecorderOutputPath('C:/tmp/capture', 'gif'),
    'C:/tmp/capture.gif'
  )
})

test('toRecorderSessionUpdate maps mode, bounds, output path, and status together', () => {
  assert.deepEqual(
    toRecorderSessionUpdate({
      status: 'selecting-area',
      mode: 'area',
      bounds: { x: 20, y: 30, width: 128, height: 96 },
      outputPath: 'C:/tmp/capture'
    }),
    {
      status: 'selecting-area',
      mode: 'area',
      bounds: { x: 20, y: 30, width: 128, height: 96 },
      outputPath: 'C:/tmp/capture.mp4'
    }
  )
})
