const test = require('node:test')
const assert = require('node:assert/strict')

const {
  DEV_ENVIRONMENT_IDS,
  DEV_ENVIRONMENT_WINGET_TARGETS,
  DEFAULT_PINNED_TOOL_IDS,
  getDevEnvironmentSummary,
  normalizePinnedToolIds,
  sanitizeDevEnvironmentPath
} = require('./devEnvironment.ts')

test('supported dev environment ids stay in the expected first-version order', () => {
  assert.deepEqual(DEV_ENVIRONMENT_IDS, [
    'nodejs',
    'npm',
    'git',
    'python',
    'pip',
    'go',
    'java',
    'wsl'
  ])
})

test('java uses the fixed Microsoft OpenJDK 17 winget target', () => {
  assert.equal(DEV_ENVIRONMENT_WINGET_TARGETS.java, 'Microsoft.OpenJDK.17')
})

test('default pinned tool ids prefer the core daily actions', () => {
  assert.deepEqual(DEFAULT_PINNED_TOOL_IDS, [
    'quick-installer',
    'screen-recorder',
    'screenshot-tool',
    'clipboard-manager'
  ])
})

test('normalizePinnedToolIds removes duplicates, invalid ids, and respects the max size', () => {
  assert.deepEqual(
    normalizePinnedToolIds(
      ['screen-recorder', 'screen-recorder', 'bad-tool', 'clipboard-manager', 'quick-installer', 'wsl-manager'],
      ['screen-recorder', 'clipboard-manager', 'quick-installer', 'wsl-manager'],
      3
    ),
    ['screen-recorder', 'clipboard-manager', 'quick-installer']
  )
})

test('getDevEnvironmentSummary treats linked, external, and updatable tools as already present', () => {
  assert.deepEqual(
    getDevEnvironmentSummary([
      { status: 'installed' },
      { status: 'missing' },
      { status: 'broken' },
      { status: 'available-update' },
      { status: 'linked' },
      { status: 'external' }
    ]),
    {
      installedCount: 4,
      missingCount: 1,
      brokenCount: 1,
      updateCount: 1,
      linkedCount: 1,
      externalCount: 1
    }
  )
})

test('sanitizeDevEnvironmentPath hides unreadable paths and preserves valid ones', () => {
  assert.equal(sanitizeDevEnvironmentPath('C:\\Program Files\\Go\\bin\\go.exe'), 'C:\\Program Files\\Go\\bin\\go.exe')
  assert.equal(sanitizeDevEnvironmentPath('��U: ����s���g�\u0000��'), null)
  assert.equal(sanitizeDevEnvironmentPath('   '), null)
})
