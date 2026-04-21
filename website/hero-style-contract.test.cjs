const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

test('scroll syncing uses requestAnimationFrame but keeps measurement out of scroll-time state publishing', () => {
  const scheduleSyncBlock = script.match(/const scheduleSync = \(\) => \{[\s\S]*?\n  \}/)
  const syncScrollStateBlock = script.match(/const syncScrollState = \(\) => \{[\s\S]*?\n  \}/)

  assert.ok(scheduleSyncBlock, 'expected scheduleSync block in script.js')
  assert.ok(syncScrollStateBlock, 'expected syncScrollState block in script.js')
  assert.match(scheduleSyncBlock[0], /window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(syncScrollStateBlock[0], /--flight-morph/)
  assert.match(syncScrollStateBlock[0], /--flight-dock/)
  assert.doesNotMatch(syncScrollStateBlock[0], /syncFlightTargets\(\)/)
})

test('hero cards expose dock transforms and final target-module rule includes dock takeover styling', () => {
  const targetModuleRule = style.match(
    /\.scenario-card\[data-flight-target\],\s*\.tool-group\[data-flight-target\]\s*\{[\s\S]*?\n\}/
  )

  assert.ok(targetModuleRule, 'expected final target-module rule in style.css')
  assert.match(style, /--dock-x/)
  assert.match(style, /--dock-y/)
  assert.match(style, /--dock-scale/)
  assert.match(style, /\.hero-flight-card\[data-flight-card=/)
  assert.match(targetModuleRule[0], /var\(--flight-dock-soft\)/)
  assert.doesNotMatch(
    style,
    /\[data-flight-dock='capture'\],\s*\[data-flight-dock='organize'\],\s*\[data-flight-dock='utility'\],\s*\[data-flight-dock='matrix'\]\s*\{/
  )
})
