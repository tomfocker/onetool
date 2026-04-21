const test = require('node:test')
const assert = require('node:assert/strict')

const { getHeroMotionState } = require('./hero-motion.js')

test('hero motion starts at rest before scroll begins', () => {
  const state = getHeroMotionState(0)

  assert.equal(state.progress, 0)
  assert.equal(state.breakout, 0)
  assert.equal(state.travel, 0)
  assert.equal(state.settle, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.organize, 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('hero cards begin flying toward lower modules in the middle of the scroll', () => {
  const state = getHeroMotionState(0.66)

  assert.ok(state.breakoutSoft > 0.9)
  assert.ok(state.travelSoft > 0.05)
  assert.ok(state.highlight.capture > 0)
  assert.ok(state.highlight.organize > 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('tool matrix handoff happens after the scenario cards have already lit up', () => {
  const state = getHeroMotionState(0.9)

  assert.ok(state.highlight.capture > 0.9)
  assert.ok(state.highlight.organize > 0.8)
  assert.ok(state.highlight.utility > 0.9)
  assert.ok(state.highlight.matrix > 0)
  assert.ok(state.settleSoft > 0.5)
})

test('reduced motion disables staged hero travel', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.breakout, 0)
  assert.equal(state.travel, 0)
  assert.equal(state.settle, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.organize, 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('hero motion enters morph before final dock takeover', () => {
  const state = getHeroMotionState(0.86)

  assert.ok(state.travelSoft > 0.9)
  assert.ok(state.morph > 0)
  assert.ok(state.dock === 0)
  assert.ok(state.highlight.capture > 0.95)
  assert.ok(state.highlight.matrix > 0)
})

test('hero motion reaches dock state at the end of the sticky range', () => {
  const state = getHeroMotionState(0.985)

  assert.ok(state.morph > 0.9)
  assert.ok(state.dock > 0)
  assert.ok(state.dockSoft > 0)
  assert.equal(state.breakout <= 1, true)
})

test('reduced motion zeros morph and dock stages too', () => {
  const state = getHeroMotionState(0.95, true)

  assert.equal(state.morph, 0)
  assert.equal(state.morphSoft, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.dockSoft, 0)
})
