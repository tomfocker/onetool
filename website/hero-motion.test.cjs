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
  assert.equal(state.highlight.clipboard, 0)
  assert.equal(state.highlight.organize, 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('hero cards light the three receiving groups before dock begins', () => {
  const state = getHeroMotionState(0.86)

  assert.ok(state.breakoutSoft > 0.9)
  assert.ok(state.travelSoft > 0.7)
  assert.ok(state.morph > 0)
  assert.equal(state.dock, 0)
  assert.ok(state.highlight.capture > 0)
  assert.ok(state.highlight.organize > 0)
  assert.ok(state.highlight.utility > 0)
  assert.ok(state.highlight.clipboard > 0)
  assert.ok(state.highlight.matrix > 0)
})

test('tool handoff reaches dock state at the end of the sticky range', () => {
  const state = getHeroMotionState(0.985)

  assert.ok(state.highlight.capture > 0.95)
  assert.ok(state.highlight.organize > 0.9)
  assert.ok(state.highlight.utility > 0.9)
  assert.ok(state.highlight.matrix > 0.95)
  assert.ok(state.settleSoft > 0.5)
  assert.ok(state.dock > 0)
})

test('reduced motion disables staged hero travel', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.breakout, 0)
  assert.equal(state.travel, 0)
  assert.equal(state.settle, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.clipboard, 0)
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

test('motion state can hold travel and dock back until section milestones arrive', () => {
  const state = getHeroMotionState({
    progress: 0.72,
    breakoutProgress: 1,
    travelProgress: 0.08,
    morphProgress: 0,
    dockProgress: 0,
    settleProgress: 0.12,
    highlight: {
      capture: 0,
      clipboard: 0,
      organize: 0,
      utility: 0,
      matrix: 0
    }
  })

  assert.equal(state.progress, 0.72)
  assert.equal(state.breakout, 1)
  assert.equal(state.travel, 0.08)
  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('motion keeps dock at zero through the early travel band', () => {
  const state = getHeroMotionState(0.62)

  assert.ok(state.travel > 0)
  assert.equal(state.dock, 0)
  assert.ok(state.morph < 0.5)
})

test('motion enters dock only near the end of the tool-section handoff', () => {
  const state = getHeroMotionState(0.92)

  assert.ok(state.morph > 0.7)
  assert.ok(state.dock > 0)
})

test('reduced motion still zeros travel-adjacent takeover phases', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0)
})
