const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildCaptureThumbnailSize,
  mapCaptureSourcesToDisplays,
  toAbsoluteScreenPosition
} = require('./colorPicker.ts')

test('buildCaptureThumbnailSize uses the largest scaled display dimensions', () => {
  const displays = [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1
    },
    {
      id: 2,
      bounds: { x: -2560, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1.5
    }
  ]

  assert.deepEqual(buildCaptureThumbnailSize(displays), {
    width: 3840,
    height: 2160
  })
})

test('mapCaptureSourcesToDisplays prefers exact display id matches', () => {
  const displays = [
    {
      id: 10,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1
    }
  ]
  const sources = [
    {
      display_id: '10',
      width: 1920,
      height: 1080,
      dataUrl: 'data:image/png;base64,exact'
    },
    {
      display_id: '',
      width: 1920,
      height: 1080,
      dataUrl: 'data:image/png;base64,fallback'
    }
  ]

  const result = mapCaptureSourcesToDisplays(displays, sources)

  assert.equal(result.screenshots.get(10), 'data:image/png;base64,exact')
  assert.deepEqual(result.missingDisplayIds, [])
})

test('mapCaptureSourcesToDisplays reports missing displays instead of falling back to another screen', () => {
  const displays = [
    {
      id: 20,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1
    },
    {
      id: 21,
      bounds: { x: 1920, y: 0, width: 1600, height: 900 },
      scaleFactor: 1
    }
  ]
  const sources = [
    {
      display_id: '20',
      width: 1920,
      height: 1080,
      dataUrl: 'data:image/png;base64,primary'
    }
  ]

  const result = mapCaptureSourcesToDisplays(displays, sources)

  assert.equal(result.screenshots.get(20), 'data:image/png;base64,primary')
  assert.equal(result.screenshots.has(21), false)
  assert.deepEqual(result.missingDisplayIds, [21])
})

test('toAbsoluteScreenPosition preserves negative monitor offsets', () => {
  assert.deepEqual(
    toAbsoluteScreenPosition(
      { x: 120, y: 80 },
      { x: -1920, y: -200, width: 1920, height: 1080 }
    ),
    { x: -1800, y: -120 }
  )
})
