const test = require('node:test')
const assert = require('node:assert/strict')

const {
  areAllPingResultsPending,
  getWslOverviewPhase,
  hasMeaningfulSystemConfig
} = require('./toolState.ts')

test('hasMeaningfulSystemConfig rejects placeholder-only hardware snapshots', () => {
  assert.equal(
    hasMeaningfulSystemConfig({
      cpu: 'Unknown Processor',
      deviceModel: 'Unknown hardware',
      motherboard: 'Unknown Motherboard',
      memory: '',
      gpu: 'Unknown GPU',
      monitor: '|Display 0|4097x1716',
      disk: 'Unknown Storage'
    }),
    false
  )
})

test('hasMeaningfulSystemConfig accepts snapshots with real hardware identity', () => {
  assert.equal(
    hasMeaningfulSystemConfig({
      cpu: 'Intel Core Ultra 7 155H',
      deviceModel: 'Dell XPS 13 9340',
      motherboard: 'Dell 0ABC12',
      gpu: 'Intel Arc Graphics',
      disk: 'Samsung SSD'
    }),
    true
  )
})

test('getWslOverviewPhase treats the initial null state as loading', () => {
  assert.equal(getWslOverviewPhase(null, false), 'loading')
})

test('getWslOverviewPhase reports ready and missing only after a load attempt', () => {
  assert.equal(getWslOverviewPhase({ available: true }, true), 'ready')
  assert.equal(getWslOverviewPhase({ available: false }, true), 'missing')
  assert.equal(getWslOverviewPhase(null, true), 'missing')
})

test('areAllPingResultsPending only returns true when every probe is still pending', () => {
  assert.equal(
    areAllPingResultsPending([
      { status: 'pending' },
      { status: 'pending' }
    ]),
    true
  )

  assert.equal(
    areAllPingResultsPending([
      { status: 'pending' },
      { status: 'success' }
    ]),
    false
  )
})
