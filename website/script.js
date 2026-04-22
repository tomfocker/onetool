document.addEventListener('DOMContentLoaded', () => {
  const motionApi = window.OneToolHeroMotion
  const root = document.documentElement
  const header = document.querySelector('.site-header')
  const heroScroll = document.querySelector('.hero-scroll')
  const heroFlight = document.querySelector('.hero-flight')
  const toolsSection = document.querySelector('#tools')
  const revealItems = document.querySelectorAll('.reveal')
  const flightCards = {
    captureStack: document.querySelector('.hero-flight-card-capture-stack'),
    captureRecord: document.querySelector('.hero-flight-card-capture-record'),
    textRename: document.querySelector('.hero-flight-card-text-rename'),
    textClipboard: document.querySelector('.hero-flight-card-text-clipboard'),
    webActivate: document.querySelector('.hero-flight-card-web-activate'),
    webQr: document.querySelector('.hero-flight-card-web-qr'),
    utilityFloat: document.querySelector('.hero-flight-card-utility-float'),
    utilityClicker: document.querySelector('.hero-flight-card-utility-clicker'),
    matrix: document.querySelector('.hero-flight-card-main')
  }
  const flightTargets = {
    capture: document.querySelector('[data-flight-target="capture"]'),
    text: document.querySelector('[data-flight-target="text"]'),
    web: document.querySelector('[data-flight-target="web"]'),
    utility: document.querySelector('[data-flight-target="utility"]')
  }
  const dockTargets = {
    capture: document.querySelector('[data-flight-dock="capture"]'),
    text: document.querySelector('[data-flight-dock="text"]'),
    web: document.querySelector('[data-flight-dock="web"]'),
    utility: document.querySelector('[data-flight-dock="utility"]')
  }
  const receiverSlots = {
    captureStack: {
      target: { x: 0.28, y: 0.2 },
      dock: { x: 0.24, y: 0.3 }
    },
    captureRecord: {
      target: { x: 0.74, y: 0.2 },
      dock: { x: 0.78, y: 0.28 }
    },
    textRename: {
      target: { x: 0.28, y: 0.22 },
      dock: { x: 0.26, y: 0.32 }
    },
    textClipboard: {
      target: { x: 0.74, y: 0.22 },
      dock: { x: 0.78, y: 0.34 }
    },
    webActivate: {
      target: { x: 0.28, y: 0.22 },
      dock: { x: 0.24, y: 0.32 }
    },
    webQr: {
      target: { x: 0.74, y: 0.22 },
      dock: { x: 0.78, y: 0.34 }
    },
    utilityFloat: {
      target: { x: 0.28, y: 0.22 },
      dock: { x: 0.24, y: 0.32 }
    },
    utilityClicker: {
      target: { x: 0.74, y: 0.22 },
      dock: { x: 0.78, y: 0.34 }
    }
  }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let syncFrameRequested = false
  let motionFrameActive = false

  const clamp = motionApi?.clamp ?? ((value, min, max) => Math.min(Math.max(value, min), max))
  const easeOutCubic = motionApi?.easeOutCubic ?? ((value) => 1 - Math.pow(1 - value, 3))
  const receiverKeys = motionApi?.receiverKeys ?? ['capture', 'text', 'web', 'utility']
  const getHeroMotionState =
    motionApi?.getHeroMotionState ??
    ((progressInput) => {
      const context =
        typeof progressInput === 'number'
          ? { progress: progressInput }
          : progressInput && typeof progressInput === 'object'
            ? progressInput
            : {}
      const highlight = context.highlight ?? {}

      return {
        progress: context.progress ?? 0,
        breakout: context.breakoutProgress ?? 0,
        breakoutSoft: context.breakoutSoft ?? 0,
        cluster: context.clusterProgress ?? 0,
        clusterSoft: context.clusterSoft ?? 0,
        morph: context.morphProgress ?? 0,
        morphSoft: context.morphSoft ?? 0,
        travel: context.travelProgress ?? 0,
        travelSoft: context.travelSoft ?? 0,
        dock: context.dockProgress ?? 0,
        dockSoft: context.dockSoft ?? 0,
        settle: context.settleProgress ?? 0,
        settleSoft: context.settleSoft ?? 0,
        boardTravel: 0,
        boardDock: 0,
        receiverProgress: receiverKeys.reduce((state, key) => {
          state[key] = context.receiverProgress?.[key] ?? 0
          return state
        }, {}),
        receiverPulse: receiverKeys.reduce((state, key) => {
          state[key] = context.receiverPulse?.[key] ?? 0
          return state
        }, {}),
        highlight: {
          capture: highlight.capture ?? 0,
          text: highlight.text ?? highlight.clipboard ?? 0,
          web: highlight.web ?? highlight.organize ?? 0,
          utility: highlight.utility ?? 0,
          matrix: highlight.matrix ?? 0
        }
      }
  })
  const motionAnchors = new Map()
  const motionKeys = [
    'progress',
    'breakout',
    'breakoutSoft',
    'cluster',
    'clusterSoft',
    'morph',
    'morphSoft',
    'travel',
    'travelSoft',
    'dock',
    'dockSoft',
    'settle',
    'settleSoft',
    'boardTravel',
    'boardDock'
  ]

  const createZeroMotionState = () => ({
    progress: 0,
    breakout: 0,
    breakoutSoft: 0,
    cluster: 0,
    clusterSoft: 0,
    morph: 0,
    morphSoft: 0,
    travel: 0,
    travelSoft: 0,
    dock: 0,
    dockSoft: 0,
    settle: 0,
    settleSoft: 0,
    boardTravel: 0,
    boardDock: 0,
    receiverProgress: receiverKeys.reduce((state, key) => {
      state[key] = 0
      return state
    }, {}),
    receiverPulse: receiverKeys.reduce((state, key) => {
      state[key] = 0
      return state
    }, {}),
    highlight: {
      capture: 0,
      text: 0,
      web: 0,
      utility: 0,
      matrix: 0
    }
  })
  const smoothValue = (current, target, factor) => current + (target - current) * factor
  let targetMotionState = createZeroMotionState()
  let renderedMotionState = createZeroMotionState()

  const getHeroProgress = () => {
    if (!heroScroll || prefersReducedMotion) {
      return 0
    }

    const rect = heroScroll.getBoundingClientRect()
    const total = Math.max(heroScroll.offsetHeight - window.innerHeight, 1)
    const distance = clamp(-rect.top, 0, total)

    return clamp(distance / total, 0, 1)
  }

  const flightBiases = {
    captureStack: { x: -10, y: -30 },
    captureRecord: { x: 14, y: -14 },
    textRename: { x: -14, y: -18 },
    textClipboard: { x: 18, y: 8 },
    webActivate: { x: -16, y: -12 },
    webQr: { x: 16, y: 10 },
    utilityFloat: { x: -12, y: -16 },
    utilityClicker: { x: 14, y: 12 },
    matrix: { x: -42, y: -14 }
  }
  const targetMap = {
    captureStack: 'capture',
    captureRecord: 'capture',
    textRename: 'text',
    textClipboard: 'text',
    webActivate: 'web',
    webQr: 'web',
    utilityFloat: 'utility',
    utilityClicker: 'utility'
  }

  const syncMotionAnchors = () => {
    motionAnchors.clear()

    ;[toolsSection, ...Object.values(flightTargets)].forEach((element) => {
      if (!element) {
        return
      }

      motionAnchors.set(element, window.scrollY + element.getBoundingClientRect().top)
    })

    Object.values(dockTargets).forEach((element) => {
      if (!element) {
        return
      }

      motionAnchors.set(element, window.scrollY + element.getBoundingClientRect().top)
    })
  }

  const getViewportProgress = (element, startRatio, endRatio) => {
    if (!element || prefersReducedMotion) {
      return 0
    }

    const elementTop = motionAnchors.get(element)

    if (!Number.isFinite(elementTop)) {
      return 0
    }

    const startScroll = elementTop - window.innerHeight * startRatio
    const endScroll = elementTop - window.innerHeight * endRatio
    const distance = Math.max(endScroll - startScroll, 1)

    return clamp((window.scrollY - startScroll) / distance, 0, 1)
  }

  const syncFlightTargets = () => {
    if (!heroFlight) {
      return
    }

    syncMotionAnchors()
    const flightRect = heroFlight.getBoundingClientRect()
    const flightLeft = window.scrollX + flightRect.left
    const flightTop = window.scrollY + flightRect.top

    Object.entries(flightCards).forEach(([key, card]) => {
      if (!card) {
        return
      }

      if (key === 'matrix') {
        card.style.setProperty('--target-x', '0px')
        card.style.setProperty('--target-y', '0px')
        card.style.removeProperty('--dock-x-base')
        card.style.removeProperty('--dock-y-base')
        card.style.removeProperty('--dock-scale')
        return
      }

      const targetKey = targetMap[key]
      const target = flightTargets[targetKey]

      if (!target) {
        card.style.setProperty('--target-x', '0px')
        card.style.setProperty('--target-y', '0px')
        return
      }

      const targetRect = target.getBoundingClientRect()
      const dockTarget = dockTargets[targetKey] ?? target
      const dockRect = dockTarget.getBoundingClientRect()
      const startX = card.offsetLeft + card.offsetWidth / 2
      const startY = card.offsetTop + card.offsetHeight / 2
      const slot = receiverSlots[key] ?? {
        target: { x: 0.5, y: 0.24 },
        dock: { x: 0.5, y: 0.32 }
      }
      const targetCenterX = window.scrollX + targetRect.left + targetRect.width * slot.target.x
      const targetCenterY = window.scrollY + targetRect.top + targetRect.height * slot.target.y
      const dockCenterX = window.scrollX + dockRect.left + dockRect.width * slot.dock.x
      const dockCenterY = window.scrollY + dockRect.top + dockRect.height * slot.dock.y
      const bias = flightBiases[key] ?? { x: 0, y: 0 }
      const targetX = targetCenterX - flightLeft - startX + bias.x
      const targetY = targetCenterY - flightTop - startY + bias.y
      const dockBaseX = dockCenterX - flightLeft - startX + bias.x
      const dockBaseY = dockCenterY - flightTop - startY + bias.y

      card.style.setProperty('--target-x', `${targetX}px`)
      card.style.setProperty('--target-y', `${targetY}px`)
      card.style.setProperty('--dock-x-base', `${dockBaseX}px`)
      card.style.setProperty('--dock-y-base', `${dockBaseY}px`)
      card.style.removeProperty('--dock-scale')
    })
  }

  const renderMotionState = (state) => {
    root.style.setProperty('--hero-progress', state.progress.toFixed(4))
    root.style.setProperty('--flight-breakout', state.breakout.toFixed(4))
    root.style.setProperty('--flight-breakout-soft', state.breakoutSoft.toFixed(4))
    root.style.setProperty('--flight-cluster', state.cluster.toFixed(4))
    root.style.setProperty('--flight-cluster-soft', state.clusterSoft.toFixed(4))
    root.style.setProperty('--flight-morph', state.morph.toFixed(4))
    root.style.setProperty('--flight-morph-soft', state.morphSoft.toFixed(4))
    root.style.setProperty('--flight-travel', state.travel.toFixed(4))
    root.style.setProperty('--flight-travel-soft', state.travelSoft.toFixed(4))
    root.style.setProperty('--flight-dock', state.dock.toFixed(4))
    root.style.setProperty('--flight-dock-soft', state.dockSoft.toFixed(4))
    root.style.setProperty('--flight-settle', state.settle.toFixed(4))
    root.style.setProperty('--flight-settle-soft', state.settleSoft.toFixed(4))
    root.style.setProperty('--capture-highlight', state.highlight.capture.toFixed(4))
    root.style.setProperty('--text-highlight', state.highlight.text.toFixed(4))
    root.style.setProperty('--web-highlight', state.highlight.web.toFixed(4))
    root.style.setProperty('--utility-highlight', state.highlight.utility.toFixed(4))
    root.style.setProperty('--matrix-highlight', state.highlight.matrix.toFixed(4))
    root.style.setProperty('--board-travel', state.boardTravel.toFixed(4))
    root.style.setProperty('--board-dock', state.boardDock.toFixed(4))

    receiverKeys.forEach((key) => {
      const receiverProgress = state.receiverProgress[key].toFixed(4)
      const receiverPulse = state.receiverPulse[key].toFixed(4)
      root.style.setProperty(`--receiver-progress-${key}`, receiverProgress)
      root.style.setProperty(`--receiver-pulse-${key}`, receiverPulse)

      const dockTarget = dockTargets[key]
      if (!dockTarget) {
        return
      }

      dockTarget.style.setProperty('--receiver-halo', receiverProgress)
      dockTarget.style.setProperty('--receiver-pulse', receiverPulse)
      dockTarget.style.setProperty(
        '--flight-highlight',
        Math.max(state.highlight[key], state.receiverProgress[key]).toFixed(4)
      )
    })
  }

  const smoothMotionState = (current, target, factor) => {
    const next = {
      ...current,
      highlight: {
        ...current.highlight
      }
    }

    motionKeys.forEach((key) => {
      next[key] = smoothValue(current[key], target[key], factor)
    })

    Object.keys(next.highlight).forEach((key) => {
      next.highlight[key] = smoothValue(current.highlight[key], target.highlight[key], factor)
    })

    receiverKeys.forEach((key) => {
      next.receiverProgress[key] = smoothValue(
        current.receiverProgress[key],
        target.receiverProgress[key],
        factor
      )
      next.receiverPulse[key] = smoothValue(
        current.receiverPulse[key],
        target.receiverPulse[key],
        factor
      )
    })

    return next
  }

  const isMotionSettled = (current, target, epsilon = 0.0012) => {
    for (const key of motionKeys) {
      if (Math.abs(current[key] - target[key]) > epsilon) {
        return false
      }
    }

    for (const key of Object.keys(current.highlight)) {
      if (Math.abs(current.highlight[key] - target.highlight[key]) > epsilon) {
        return false
      }
    }

    for (const key of receiverKeys) {
      if (Math.abs(current.receiverProgress[key] - target.receiverProgress[key]) > epsilon) {
        return false
      }

      if (Math.abs(current.receiverPulse[key] - target.receiverPulse[key]) > epsilon) {
        return false
      }
    }

    return true
  }

  const runMotionFrame = () => {
    renderedMotionState = smoothMotionState(renderedMotionState, targetMotionState, 0.16)
    renderMotionState(renderedMotionState)

    if (isMotionSettled(renderedMotionState, targetMotionState)) {
      renderedMotionState = {
        ...targetMotionState,
        receiverProgress: {
          ...targetMotionState.receiverProgress
        },
        receiverPulse: {
          ...targetMotionState.receiverPulse
        },
        highlight: {
          ...targetMotionState.highlight
        }
      }
      renderMotionState(renderedMotionState)
      motionFrameActive = false
      return
    }

    window.requestAnimationFrame(runMotionFrame)
  }

  const ensureMotionFrame = () => {
    if (motionFrameActive) {
      return
    }

    motionFrameActive = true
    window.requestAnimationFrame(runMotionFrame)
  }

  const scheduleSync = () => {
    if (syncFrameRequested) {
      return
    }

    syncFrameRequested = true
    window.requestAnimationFrame(() => {
      syncFrameRequested = false
      syncScrollState()
    })
  }

  const syncScrollState = () => {
    if (header && window.scrollY > 18) {
      header.classList.add('is-scrolled')
    } else if (header) {
      header.classList.remove('is-scrolled')
    }

    if (!heroScroll) {
      return
    }

    const progress = getHeroProgress()
    const heroTargets = {
      capture: flightTargets.capture,
      text: flightTargets.text,
      web: flightTargets.web,
      utility: flightTargets.utility,
      matrix: toolsSection
    }
    const receiverProgress = {
      capture: easeOutCubic(getViewportProgress(dockTargets.capture, 1.02, 0.38)),
      text: easeOutCubic(getViewportProgress(dockTargets.text, 1, 0.36)),
      web: easeOutCubic(getViewportProgress(dockTargets.web, 0.98, 0.34)),
      utility: easeOutCubic(getViewportProgress(dockTargets.utility, 0.96, 0.32))
    }
    const receiverPulse = {
      capture: easeOutCubic(getViewportProgress(dockTargets.capture, 0.48, 0.14)),
      text: easeOutCubic(getViewportProgress(dockTargets.text, 0.46, 0.12)),
      web: easeOutCubic(getViewportProgress(dockTargets.web, 0.44, 0.1)),
      utility: easeOutCubic(getViewportProgress(dockTargets.utility, 0.42, 0.08))
    }
    const state = getHeroMotionState(
      {
        progress,
        breakoutProgress: clamp(progress / 0.3, 0, 1),
        clusterProgress: getViewportProgress(toolsSection, 1.04, 0.36),
        travelProgress: getViewportProgress(toolsSection, 0.96, 0.32),
        morphProgress: getViewportProgress(toolsSection, 0.82, 0.24),
        // Keep the dock window late so the shorter tools page stays readable before takeover.
        dockProgress: getViewportProgress(toolsSection, 0.42, 0.1),
        settleProgress: getViewportProgress(toolsSection, 0.9, 0.16),
        boardTravel: 0,
        boardDock: 0,
        receiverProgress,
        receiverPulse,
        highlight: {
          capture: easeOutCubic(getViewportProgress(heroTargets.capture, 0.96, 0.46)),
          text: easeOutCubic(getViewportProgress(heroTargets.text, 0.9, 0.3)),
          web: easeOutCubic(getViewportProgress(heroTargets.web, 0.94, 0.4)),
          utility: easeOutCubic(getViewportProgress(heroTargets.utility, 0.92, 0.34)),
          matrix: easeOutCubic(getViewportProgress(heroTargets.matrix, 0.84, 0.26))
        }
      },
      prefersReducedMotion
    )

    targetMotionState = state

    if (prefersReducedMotion) {
      renderedMotionState = {
        ...state,
        receiverProgress: {
          ...state.receiverProgress
        },
        receiverPulse: {
          ...state.receiverPulse
        },
        highlight: {
          ...state.highlight
        }
      }
      renderMotionState(renderedMotionState)
      return
    }

    ensureMotionFrame()
  }

  syncFlightTargets()
  syncScrollState()
  window.addEventListener('scroll', scheduleSync, { passive: true })
  window.addEventListener('resize', () => {
    syncFlightTargets()
    syncScrollState()
  })

  window.addEventListener('load', () => {
    syncFlightTargets()
    syncScrollState()
  })

  window.addEventListener('pageshow', () => {
    syncFlightTargets()
    syncScrollState()
  })

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      syncFlightTargets()
      syncScrollState()
    })
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return
        }

        entry.target.classList.add('is-visible')
        revealObserver.unobserve(entry.target)
      })
    },
    {
      threshold: 0.14,
      rootMargin: '0px 0px -40px 0px'
    }
  )

  revealItems.forEach((item) => revealObserver.observe(item))

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href')
      if (!href || href === '#') {
        return
      }

      const target = document.querySelector(href)
      if (!target) {
        return
      }

      event.preventDefault()
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      })
    })
  })
})
