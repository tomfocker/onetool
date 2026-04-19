const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createIdleUpdateState,
  createAvailableUpdateState,
  createDownloadingUpdateState
} = require('./appUpdate.ts')

test('createIdleUpdateState returns the idle shared update contract', () => {
  assert.deepEqual(createIdleUpdateState('1.0.0'), {
    status: 'idle',
    currentVersion: '1.0.0',
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  })
})

test('createAvailableUpdateState returns the available shared update contract', () => {
  assert.deepEqual(
    createAvailableUpdateState({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: 'Bug fixes'
    }),
    {
      status: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: 'Bug fixes',
      progressPercent: null,
      errorMessage: null
    }
  )
})

test('createDownloadingUpdateState rounds download progress percent', () => {
  assert.deepEqual(
    createDownloadingUpdateState({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      progressPercent: 48.6
    }),
    {
      status: 'downloading',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: null,
      progressPercent: 49,
      errorMessage: null
    }
  )
})
