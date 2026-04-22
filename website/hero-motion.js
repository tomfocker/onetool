(function (globalScope, factory) {
  const api = factory()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }

  if (globalScope) {
    globalScope.OneToolHeroMotion = api
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const receiverKeys = ['capture', 'text', 'web', 'utility']
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

  const getReceiverStateMap = (source, fallbackFactory) => {
    const safeSource = source && typeof source === 'object' ? source : {}

    return receiverKeys.reduce((state, key) => {
      state[key] = getSafeProgress(safeSource[key], fallbackFactory(key))
      return state
    }, {})
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
        cluster: 0,
        clusterSoft: 0,
        travel: 0,
        travelSoft: 0,
        morph: 0,
        morphSoft: 0,
        settle: 0,
        settleSoft: 0,
        dock: 0,
        dockSoft: 0,
        boardTravel: 0,
        boardDock: 0,
        receiverProgress: getReceiverStateMap(null, () => 0),
        receiverPulse: getReceiverStateMap(null, () => 0),
        highlight: {
          capture: 0,
          text: 0,
          web: 0,
          utility: 0,
          matrix: 0
        }
      }
    }

    const breakout = getSafeProgress(context.breakoutProgress, getPhase(safeProgress, 0.12, 0.34))
    const cluster = getSafeProgress(context.clusterProgress, getPhase(safeProgress, 0.44, 0.82))
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
    const highlightState = {
      capture: captureHighlight,
      text: getSafeProgress(highlight.text, getSafeProgress(highlight.clipboard, organizeHighlight)),
      web: getSafeProgress(highlight.web, getSafeProgress(highlight.organize, organizeHighlight)),
      utility: utilityHighlight,
      matrix: getSafeProgress(highlight.matrix, captureHighlight)
    }
    const receiverProgress = getReceiverStateMap(context.receiverProgress, (key) =>
      clamp(
        (highlightState[key] * 0.68) +
          (easeInOutSine(travel) * 0.18) +
          (easeOutCubic(dock) * 0.14),
        0,
        1
      )
    )
    const receiverPulse = getReceiverStateMap(context.receiverPulse, (key) =>
      clamp(
        easeOutCubic(getPhase(receiverProgress[key], 0.72, 1)) *
          (0.38 + (easeOutCubic(dock) * 0.62)),
        0,
        1
      )
    )

    return {
      progress: safeProgress,
      breakout,
      breakoutSoft: easeOutCubic(breakout),
      cluster,
      clusterSoft: easeOutCubic(cluster),
      travel,
      travelSoft: easeInOutSine(travel),
      morph,
      morphSoft: easeInOutSine(morph),
      settle,
      settleSoft: easeOutCubic(settle),
      dock,
      dockSoft: easeOutCubic(dock),
      boardTravel: 0,
      boardDock: 0,
      receiverProgress,
      receiverPulse,
      highlight: highlightState
    }
  }

  return {
    receiverKeys,
    clamp,
    easeOutCubic,
    easeInOutSine,
    getSafeProgress,
    getPhase,
    getReceiverStateMap,
    getHeroMotionState
  }
})
