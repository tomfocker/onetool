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
  const getSafeProgress = (value, fallback = 0) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return clamp(fallback, 0, 1)
    }

    return clamp(value, 0, 1)
  }

  const getPhase = (value, start, end) => {
    if (end <= start) {
      return 0
    }

    return clamp((value - start) / (end - start), 0, 1)
  }

  const getHeroMotionState = (progress, prefersReducedMotion = false) => {
    const context =
      typeof progress === 'number'
        ? { progress }
        : progress && typeof progress === 'object'
          ? progress
          : {}
    const safeProgress = getSafeProgress(context.progress)

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
          clipboard: 0,
          organize: 0,
          utility: 0,
          matrix: 0
        }
      }
    }

    const breakout = getSafeProgress(context.breakoutProgress, getPhase(safeProgress, 0.12, 0.34))
    const travel = getSafeProgress(context.travelProgress, getPhase(safeProgress, 0.34, 0.84))
    const morph = getSafeProgress(context.morphProgress, getPhase(safeProgress, 0.7, 0.94))
    const settle = getSafeProgress(context.settleProgress, getPhase(safeProgress, 0.7, 1))
    const dock = getSafeProgress(context.dockProgress, getPhase(safeProgress, 0.88, 1))
    const highlight = context.highlight ?? {}
    const captureHighlight = getSafeProgress(
      highlight.capture,
      easeOutCubic(getPhase(safeProgress, 0.68, 0.94))
    )
    const organizeHighlight = getSafeProgress(
      highlight.organize,
      easeOutCubic(getPhase(safeProgress, 0.72, 0.95))
    )
    const utilityHighlight = getSafeProgress(
      highlight.utility,
      easeOutCubic(getPhase(safeProgress, 0.76, 0.97))
    )

    return {
      progress: safeProgress,
      breakout,
      breakoutSoft: easeOutCubic(breakout),
      travel,
      travelSoft: easeInOutSine(travel),
      morph,
      morphSoft: easeInOutSine(morph),
      settle,
      settleSoft: easeOutCubic(settle),
      dock,
      dockSoft: easeOutCubic(dock),
      highlight: {
        capture: captureHighlight,
        organize: organizeHighlight,
        utility: utilityHighlight,
        clipboard: getSafeProgress(highlight.clipboard, organizeHighlight),
        matrix: getSafeProgress(highlight.matrix, captureHighlight)
      }
    }
  }

  return {
    clamp,
    easeOutCubic,
    easeInOutSine,
    getSafeProgress,
    getPhase,
    getHeroMotionState
  }
})
