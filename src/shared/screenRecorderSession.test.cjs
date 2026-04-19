const test = require('node:test')
const assert = require('node:assert/strict')

const {
  beginRecorderSelectionSession,
  cancelRecorderSelectionSession,
  clampRecorderBounds,
  nudgeRecorderBounds,
  isRecorderSelectionValid,
  ensureRecorderOutputPath,
  toRecorderSessionUpdate,
  resolveRecorderStartSession
} = require('./screenRecorderSession.ts')

test('clampRecorderBounds respects the configurable minimum size', () => {
  assert.deepEqual(
    clampRecorderBounds(
      { x: -10, y: 5, width: 20, height: 20 },
      { x: 0, y: 0, width: 100, height: 80 },
      80
    ),
    { x: 0, y: 0, width: 80, height: 80 }
  )
})

test('nudgeRecorderBounds clamps safely when bounds start outside the display', () => {
  assert.deepEqual(
    nudgeRecorderBounds(
      { x: 190, y: 140, width: 40, height: 30 },
      'width',
      -20,
      { x: 0, y: 0, width: 200, height: 150 }
    ),
    { x: 136, y: 86, width: 64, height: 64 }
  )
})

test('isRecorderSelectionValid respects the minimum size override', () => {
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 79, height: 80 }, 80), false)
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 80, height: 80 }, 80), true)
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 64, height: 64 }), true)
})

test('ensureRecorderOutputPath rewrites mismatched extensions and preserves matching ones', () => {
  assert.equal(ensureRecorderOutputPath('C:/tmp/capture.mov', 'gif'), 'C:/tmp/capture.gif')
  assert.equal(ensureRecorderOutputPath('C:/tmp/capture.mp4', 'mp4'), 'C:/tmp/capture.mp4')
})

test('toRecorderSessionUpdate returns the full authoritative snapshot', () => {
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

test('toRecorderSessionUpdate creates the agreed selection-preview session snapshot', () => {
  const selectionBounds = { x: 25, y: 40, width: 320, height: 180 }
  const update = toRecorderSessionUpdate({
    status: 'ready-to-record',
    mode: 'area',
    outputPath: 'C:/tmp/capture.mp4',
    recordingTime: '00:00:00',
    selectionBounds,
    selectionPreviewDataUrl: 'data:image/png;base64,preview',
    selectedDisplayId: '7'
  })

  selectionBounds.x = 999

  assert.deepEqual(update, {
    status: 'ready-to-record',
    mode: 'area',
    outputPath: 'C:/tmp/capture.mp4',
    recordingTime: '00:00:00',
    selectionBounds: { x: 25, y: 40, width: 320, height: 180 },
    selectionPreviewDataUrl: 'data:image/png;base64,preview',
    selectedDisplayId: '7'
  })
})

test('toRecorderSessionUpdate fills empty snapshot fields explicitly', () => {
  assert.deepEqual(
    toRecorderSessionUpdate({
      status: 'idle',
      mode: 'full'
    }),
    {
      status: 'idle',
      mode: 'full',
      outputPath: '',
      recordingTime: '00:00:00',
      selectionBounds: null,
      selectionPreviewDataUrl: null,
      selectedDisplayId: null
    }
  )
})

test('resolveRecorderStartSession uses the prepared area draft instead of caller bounds', () => {
  const preparedSelectionBounds = { x: 10, y: 20, width: 300, height: 200 }
  const resolved = resolveRecorderStartSession(
    toRecorderSessionUpdate({
      status: 'ready-to-record',
      mode: 'area',
      outputPath: 'C:/tmp/previous.mp4',
      recordingTime: '00:00:00',
      selectionBounds: preparedSelectionBounds,
      selectionPreviewDataUrl: 'data:image/png;base64,preview',
      selectedDisplayId: 'display-1'
    }),
    {
      outputPath: 'C:/tmp/new-output.mp4',
      displayId: 'display-2',
      usePreparedSelection: true,
      bounds: { x: 999, y: 999, width: 111, height: 111 }
    }
  )

  preparedSelectionBounds.x = 500

  assert.deepEqual(resolved, {
    status: 'recording',
    mode: 'area',
    outputPath: 'C:/tmp/new-output.mp4',
    recordingTime: '00:00:00',
    selectionBounds: { x: 10, y: 20, width: 300, height: 200 },
    selectionPreviewDataUrl: 'data:image/png;base64,preview',
    selectedDisplayId: 'display-1'
  })
})

test('beginRecorderSelectionSession clears stale area drafts and ignores active recording states', () => {
  assert.deepEqual(
    beginRecorderSelectionSession(
      toRecorderSessionUpdate({
        status: 'ready-to-record',
        mode: 'area',
        outputPath: 'C:/tmp/capture.mp4',
        recordingTime: '00:00:00',
        selectionBounds: { x: 1, y: 2, width: 300, height: 200 },
        selectionPreviewDataUrl: 'data:image/png;base64,preview',
        selectedDisplayId: 'display-1'
      })
    ),
    {
      status: 'selecting-area',
      mode: 'area',
      outputPath: 'C:/tmp/capture.mp4',
      recordingTime: '00:00:00',
      selectionBounds: null,
      selectionPreviewDataUrl: null,
      selectedDisplayId: null
    }
  )

  assert.equal(
    beginRecorderSelectionSession(
      toRecorderSessionUpdate({
        status: 'recording',
        mode: 'full',
        outputPath: 'C:/tmp/capture.mp4',
        recordingTime: '00:00:10',
        selectionBounds: null,
        selectionPreviewDataUrl: null,
        selectedDisplayId: 'display-1'
      })
    ),
    null
  )
})

test('cancelRecorderSelectionSession clears stale area drafts after a canceled reselection', () => {
  assert.deepEqual(
    cancelRecorderSelectionSession(
      toRecorderSessionUpdate({
        status: 'selecting-area',
        mode: 'area',
        outputPath: 'C:/tmp/capture.mp4',
        recordingTime: '00:00:00',
        selectionBounds: { x: 3, y: 4, width: 320, height: 180 },
        selectionPreviewDataUrl: 'data:image/png;base64,preview',
        selectedDisplayId: 'display-2'
      })
    ),
    {
      status: 'idle',
      mode: 'full',
      outputPath: 'C:/tmp/capture.mp4',
      recordingTime: '00:00:00',
      selectionBounds: null,
      selectionPreviewDataUrl: null,
      selectedDisplayId: null
    }
  )
})
