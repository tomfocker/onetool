(function (globalScope, factory) {
  const api = factory()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }

  if (globalScope) {
    globalScope.OneToolHeroMotion = api
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)
  const easeInOutSine = (value) => -(Math.cos(Math.PI * value) - 1) / 2
  const easeInQuart = (value) => Math.pow(value, 4)

  const getPhase = (value, start, end) => {
    if (end <= start) {
      return 0
    }

    return clamp((value - start) / (end - start), 0, 1)
  }

  const getHeroMotionState = (progress, prefersReducedMotion = false) => {
    const safeProgress = clamp(progress, 0, 1)

    if (prefersReducedMotion) {
      return {
        progress: 0,
        breakout: 0,
        breakoutSoft: 0,
        travel: 0,
        travelSoft: 0,
        settle: 0,
        settleSoft: 0,
        highlight: {
          capture: 0,
          organize: 0,
          utility: 0,
          matrix: 0
        }
      }
    }

    const breakout = getPhase(safeProgress, 0.08, 0.34)
    const travel = getPhase(safeProgress, 0.42, 0.9)
    const settle = getPhase(safeProgress, 0.7, 1)

    return {
      progress: safeProgress,
      breakout,
      breakoutSoft: easeOutCubic(breakout),
      travel,
      travelSoft: easeInQuart(easeInOutSine(travel)),
      settle,
      settleSoft: easeOutCubic(settle),
      highlight: {
        capture: easeOutCubic(getPhase(safeProgress, 0.58, 0.82)),
        organize: easeOutCubic(getPhase(safeProgress, 0.63, 0.86)),
        utility: easeOutCubic(getPhase(safeProgress, 0.67, 0.9)),
        matrix: easeOutCubic(getPhase(safeProgress, 0.84, 1))
      }
    }
  }

  return {
    clamp,
    easeOutCubic,
    easeInOutSine,
    getPhase,
    getHeroMotionState
  }
})
