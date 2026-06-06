const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'SpaceCleanupTool.tsx'), 'utf8')

test('SpaceCleanupTool opens distribution directories from the right-click action', () => {
  assert.match(source, /handleOpenDistributionPath/)
  assert.match(source, /window\.electron\.spaceCleanup\.openPath\(path\)/)
  assert.match(source, /onContextMenu=\{canOpenDistributionDirectory/)
})
