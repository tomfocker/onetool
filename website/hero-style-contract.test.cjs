const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')

test('scroll syncing uses requestAnimationFrame but keeps measurement out of scroll-time state publishing', () => {
  const dockTargetsBlock = script.match(/const dockTargets = \{[\s\S]*?\n  \}/)
  const scheduleSyncBlock = script.match(/const scheduleSync = \(\) => \{[\s\S]*?\n  \}/)
  const syncScrollStateBlock = script.match(/const syncScrollState = \(\) => \{[\s\S]*?\n  \}/)
  const syncFlightTargetsBlock = script.match(/const syncFlightTargets = \(\) => \{[\s\S]*?\n  \}/)

  assert.ok(dockTargetsBlock, 'expected dockTargets block in script.js')
  assert.ok(scheduleSyncBlock, 'expected scheduleSync block in script.js')
  assert.ok(syncScrollStateBlock, 'expected syncScrollState block in script.js')
  assert.ok(syncFlightTargetsBlock, 'expected syncFlightTargets block in script.js')
  assert.match(scheduleSyncBlock[0], /window\.requestAnimationFrame\(\(\) => \{/)
  assert.match(syncScrollStateBlock[0], /--flight-morph/)
  assert.match(syncScrollStateBlock[0], /--flight-dock/)
  assert.doesNotMatch(syncScrollStateBlock[0], /syncFlightTargets\(\)/)
  assert.match(dockTargetsBlock[0], /\[data-flight-dock="capture"\]/)
  assert.match(dockTargetsBlock[0], /\[data-flight-dock="organize"\]/)
  assert.match(dockTargetsBlock[0], /\[data-flight-dock="utility"\]/)
  assert.match(dockTargetsBlock[0], /\[data-flight-dock="matrix"\]/)
  assert.match(syncFlightTargetsBlock[0], /const dockTarget = dockTargets\[targetKey\]/)
  assert.match(syncFlightTargetsBlock[0], /const dockRect = dockTarget\?\.getBoundingClientRect\(\)/)
  assert.match(syncFlightTargetsBlock[0], /const dockX = dockRect \?[\s\S]*: targetX/)
  assert.match(syncFlightTargetsBlock[0], /const dockY = dockRect \?[\s\S]*: targetY/)
  assert.match(syncFlightTargetsBlock[0], /const dockScale = dockRect \? dockRect\.width \/ card\.offsetWidth : 1/)
  assert.match(syncFlightTargetsBlock[0], /card\.style\.setProperty\('--dock-x',/)
  assert.match(syncFlightTargetsBlock[0], /card\.style\.setProperty\('--dock-y',/)
  assert.match(syncFlightTargetsBlock[0], /card\.style\.setProperty\('--dock-scale',/)
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

test('hero title uses launch-page typography instead of the old stacked tower', () => {
  assert.match(style, /\.hero-title\s*{/)
  assert.match(style, /\.hero-title-line-wide\s*{/)
  assert.match(style, /max-width:\s*10ch/)
  assert.match(style, /font-size:\s*clamp\(3\.4rem,\s*6\.2vw,\s*6\.4rem\)/)
  assert.match(style, /letter-spacing:\s*-0\.07em/)
})
