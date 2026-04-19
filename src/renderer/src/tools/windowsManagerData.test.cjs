const test = require('node:test')
const assert = require('node:assert/strict')

const {
  categoryOrder,
  defaultPinnedToolIds,
  getPinnedToolIds,
  getPinnedSystemTools,
  groupSystemToolsByCategory,
  systemTools
} = require('./windowsManagerData.ts')

test('default pinned tools use the preset common Windows entrypoints', () => {
  assert.deepEqual(defaultPinnedToolIds, [
    'control',
    'taskmgr',
    'powershell',
    'services',
    'devmgmt',
    'diskmgmt',
    'appwiz',
    'sysdm'
  ])
})

test('getPinnedToolIds falls back to the preset list and filters invalid ids', () => {
  assert.deepEqual(
    getPinnedToolIds(undefined),
    defaultPinnedToolIds
  )

  assert.deepEqual(
    getPinnedToolIds(['powershell', 'missing-tool', 'control']),
    ['powershell', 'control']
  )
})

test('pinned tools preserve the configured order for the top section', () => {
  assert.deepEqual(
    getPinnedSystemTools(['powershell', 'control']).map((tool) => tool.id),
    ['powershell', 'control']
  )
})

test('system tools include the expanded set of control and management commands', () => {
  const commands = systemTools.map((tool) => tool.command)

  assert.ok(commands.includes('winver'))
  assert.ok(commands.includes('optionalfeatures'))
  assert.ok(commands.includes('firewall.cpl'))
  assert.ok(commands.includes('inetcpl.cpl'))
  assert.ok(commands.includes('mmsys.cpl'))
  assert.ok(commands.includes('main.cpl'))
  assert.ok(commands.includes('cleanmgr'))
  assert.ok(commands.includes('certmgr.msc'))
  assert.ok(commands.includes('lusrmgr.msc'))
  assert.ok(commands.includes('secpol.msc'))
  assert.ok(commands.includes('netplwiz'))
})

test('groupSystemToolsByCategory returns every configured category in display order', () => {
  const groups = groupSystemToolsByCategory()

  assert.deepEqual(
    Object.keys(groups),
    categoryOrder
  )

  assert.ok(groups.System.length > 0)
  assert.ok(groups.Network.length > 0)
  assert.ok(groups.Hardware.length > 0)
  assert.ok(groups.Advanced.length > 0)
  assert.ok(groups.System.some((tool) => tool.id === 'control'))
  assert.ok(groups.Advanced.some((tool) => tool.id === 'powershell'))
})
