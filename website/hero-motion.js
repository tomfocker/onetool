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
        morph: 0,
        morphSoft: 0,
        settle: 0,
        settleSoft: 0,
        dock: 0,
        dockSoft: 0,
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
    const morph = getPhase(safeProgress, 0.78, 0.94)
    const settle = getPhase(safeProgress, 0.7, 1)
    const dock = getPhase(safeProgress, 0.94, 1)

    return {
      progress: safeProgress,
      breakout,
      breakoutSoft: easeOutCubic(breakout),
      travel,
      travelSoft: easeInQuart(easeInOutSine(travel)),
      morph,
      morphSoft: easeInOutSine(morph),
      settle,
      settleSoft: easeOutCubic(settle),
      dock,
      dockSoft: easeOutCubic(dock),
      highlight: {
        capture: easeOutCubic(getPhase(safeProgress, 0.56, 0.8)),
        organize: easeOutCubic(getPhase(safeProgress, 0.61, 0.84)),
        utility: easeOutCubic(getPhase(safeProgress, 0.66, 0.88)),
        matrix: easeOutCubic(getPhase(safeProgress, 0.82, 0.96))
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
