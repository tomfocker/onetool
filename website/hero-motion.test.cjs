const test = require('node:test')
const assert = require('node:assert/strict')

const { getHeroMotionState } = require('./hero-motion.js')

test('hero motion starts at rest before scroll begins', () => {
  const state = getHeroMotionState(0)

  assert.equal(state.progress, 0)
  assert.equal(state.breakout, 0)
  assert.equal(state.cluster, 0)
  assert.equal(state.clusterSoft, 0)
  assert.equal(state.travel, 0)
  assert.equal(state.settle, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.text, 0)
  assert.equal(state.highlight.web, 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})

test('hero cards light the three receiving groups before dock begins', () => {
  const state = getHeroMotionState({
    progress: 0.62,
    breakoutProgress: 1,
    clusterProgress: 0.73,
    travelProgress: 0.38,
    highlight: {
      capture: 0.41,
      clipboard: 0.36,
      organize: 0.39,
      utility: 0.31,
      matrix: 0.29
    }
  })

  assert.equal(state.breakout, 1)
  assert.equal(state.cluster, 0.73)
  assert.equal(state.travel, 0.38)
  assert.ok(state.morph < 0.5)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0.41)
  assert.equal(state.highlight.text, 0.36)
  assert.equal(state.highlight.web, 0.39)
  assert.equal(state.highlight.utility, 0.31)
  assert.equal(state.highlight.matrix, 0.29)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})

test('cluster progress can be overridden independently of the derived scroll phase', () => {
  const state = getHeroMotionState({
    progress: 0.28,
    clusterProgress: 0.64,
    highlight: {
      capture: 0,
      clipboard: 0,
      organize: 0,
      utility: 0,
      matrix: 0
    }
  })

  assert.equal(state.progress, 0.28)
  assert.equal(state.cluster, 0.64)
  assert.ok(state.clusterSoft > 0)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})

test('tool handoff reaches dock state at the end of the sticky range', () => {
  const state = getHeroMotionState({
    progress: 0.985,
    breakoutProgress: 1,
    travelProgress: 0.94,
    highlight: {
      capture: 0.99,
      clipboard: 0.94,
      organize: 0.97,
      utility: 0.95,
      matrix: 0.98
    }
  })

  assert.equal(state.travel, 0.94)
  assert.ok(state.morph > 0.9)
  assert.ok(state.dock > 0)
  assert.ok(state.settle > 0.5)
  assert.equal(state.highlight.capture, 0.99)
  assert.equal(state.highlight.text, 0.94)
  assert.equal(state.highlight.web, 0.97)
  assert.equal(state.highlight.utility, 0.95)
  assert.equal(state.highlight.matrix, 0.98)
})

test('reduced motion disables staged hero travel', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.breakout, 0)
  assert.equal(state.cluster, 0)
  assert.equal(state.travel, 0)
  assert.equal(state.settle, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.text, 0)
  assert.equal(state.highlight.web, 0)
  assert.equal(state.highlight.utility, 0)
  assert.equal(state.highlight.matrix, 0)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})

test('hero motion enters morph before final dock takeover', () => {
  const state = getHeroMotionState(0.86)

  assert.ok(state.travelSoft > 0.9)
  assert.ok(state.cluster > 0)
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

  assert.equal(state.cluster, 0)
  assert.equal(state.clusterSoft, 0)
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
  assert.ok(state.cluster > 0)
  assert.equal(state.travel, 0.08)
  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.matrix, 0)
})

test('motion keeps dock at zero through the early travel band', () => {
  const state = getHeroMotionState({
    progress: 0.62,
    travelProgress: 0.38,
    highlight: {
      capture: 0.41,
      clipboard: 0.36,
      organize: 0.39,
      utility: 0.31,
      matrix: 0.29
    }
  })

  assert.equal(state.travel, 0.38)
  assert.ok(state.cluster > 0)
  assert.equal(state.dock, 0)
  assert.ok(state.morph < 0.5)
  assert.equal(state.highlight.capture, 0.41)
  assert.equal(state.highlight.matrix, 0.29)
})

test('motion enters dock only near the end of the tool-section handoff', () => {
  const state = getHeroMotionState({
    progress: 0.92,
    clusterProgress: 0.88,
    travelProgress: 0.83,
    highlight: {
      capture: 0.93,
      clipboard: 0.88,
      organize: 0.91,
      utility: 0.9,
      matrix: 0.95
    }
  })

  assert.ok(state.morph > 0.7)
  assert.equal(state.cluster, 0.88)
  assert.ok(state.dock > 0)
  assert.equal(state.highlight.capture, 0.93)
  assert.equal(state.highlight.text, 0.88)
  assert.equal(state.highlight.web, 0.91)
  assert.equal(state.highlight.utility, 0.9)
  assert.equal(state.highlight.matrix, 0.95)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})

test('reduced motion still zeros travel-adjacent takeover phases', () => {
  const state = getHeroMotionState(0.92, true)

  assert.equal(state.cluster, 0)
  assert.equal(state.morph, 0)
  assert.equal(state.dock, 0)
  assert.equal(state.highlight.capture, 0)
  assert.equal(state.highlight.text, 0)
  assert.equal(state.highlight.web, 0)
  assert.equal(Object.hasOwn(state.highlight, 'clipboard'), false)
  assert.equal(Object.hasOwn(state.highlight, 'organize'), false)
})
