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
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frameRequested = false

  const clamp = motionApi?.clamp ?? ((value, min, max) => Math.min(Math.max(value, min), max))
  const easeOutCubic = motionApi?.easeOutCubic ?? ((value) => 1 - Math.pow(1 - value, 3))
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
        morph: context.morphProgress ?? 0,
        morphSoft: context.morphSoft ?? 0,
        travel: context.travelProgress ?? 0,
        travelSoft: context.travelSoft ?? 0,
        dock: context.dockProgress ?? 0,
        dockSoft: context.dockSoft ?? 0,
        settle: context.settleProgress ?? 0,
        settleSoft: context.settleSoft ?? 0,
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
  const flightGeometry = new Map()

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
  const dockBiases = {
    capture: {
      captureStack: { x: -18, y: -18 },
      captureRecord: { x: 18, y: 8 },
      matrix: { x: 0, y: 24 }
    },
    text: {
      textRename: { x: -16, y: -10 },
      textClipboard: { x: 16, y: 10 }
    },
    web: {
      webActivate: { x: -16, y: -10 },
      webQr: { x: 16, y: 10 }
    },
    utility: {
      utilityFloat: { x: -16, y: -10 },
      utilityClicker: { x: 16, y: 10 }
    }
  }
  const targetMap = {
    captureStack: 'capture',
    captureRecord: 'capture',
    textRename: 'text',
    textClipboard: 'text',
    webActivate: 'web',
    webQr: 'web',
    utilityFloat: 'utility',
    utilityClicker: 'utility',
    utility: 'utility',
    matrix: 'capture'
  }

  const syncMotionAnchors = () => {
    motionAnchors.clear()

    ;[toolsSection, ...Object.values(flightTargets)].forEach((element) => {
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
    flightGeometry.clear()

    Object.entries(flightCards).forEach(([key, card]) => {
      if (!card) {
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
      const dockTarget = dockTargets[targetKey]
      const dockRect = dockTarget?.getBoundingClientRect()
      const startX = card.offsetLeft + card.offsetWidth / 2
      const startY = card.offsetTop + card.offsetHeight / 2
      flightGeometry.set(targetKey, {
        startX,
        startY,
        targetCenterX: window.scrollX + targetRect.left + targetRect.width / 2,
        targetCenterY: window.scrollY + targetRect.top + targetRect.height / 2,
        dockCenterX: window.scrollX + (dockRect ? dockRect.left + dockRect.width / 2 : targetRect.left + targetRect.width / 2),
        dockCenterY: window.scrollY + (dockRect ? dockRect.top + dockRect.height / 2 : targetRect.top + targetRect.height / 2),
        dockScale: dockRect ? dockRect.width / card.offsetWidth : 1
      })
    })
  }

  const getDockVisualOffset = (targetKey, state) => {
    const highlight = state?.highlight?.[targetKey] ?? 0

    return {
      x: 0,
      y: -22 * highlight
    }
  }

  const applyFlightGeometry = (state) => {
    if (!heroFlight) {
      return
    }

    const flightRect = heroFlight.getBoundingClientRect()
    const flightLeft = window.scrollX + flightRect.left
    const flightTop = window.scrollY + flightRect.top

    Object.entries(flightCards).forEach(([key, card]) => {
      if (!card) {
        return
      }

      const targetKey = targetMap[key]
      const geometry = flightGeometry.get(targetKey)

      if (!geometry) {
        card.style.setProperty('--target-x', '0px')
        card.style.setProperty('--target-y', '0px')
        return
      }

      const bias = flightBiases[key] ?? { x: 0, y: 0 }
      const dockOffset = getDockVisualOffset(targetKey, state)
      const groupedDockBias = dockBiases[targetKey]?.[key] ?? { x: 0, y: 0 }
      const targetX = geometry.targetCenterX - flightLeft - geometry.startX + bias.x
      const targetY = geometry.targetCenterY - flightTop - geometry.startY + bias.y
      const dockX = geometry.dockCenterX + dockOffset.x + groupedDockBias.x - flightLeft - geometry.startX + bias.x
      const dockY = geometry.dockCenterY + dockOffset.y + groupedDockBias.y - flightTop - geometry.startY + bias.y

      card.style.setProperty('--target-x', `${targetX}px`)
      card.style.setProperty('--target-y', `${targetY}px`)
      card.style.setProperty('--dock-x', `${dockX}px`)
      card.style.setProperty('--dock-y', `${dockY}px`)
      card.style.setProperty('--dock-scale', geometry.dockScale.toFixed(4))
    })
  }

  const scheduleSync = () => {
    if (frameRequested) {
      return
    }

    frameRequested = true
    window.requestAnimationFrame(() => {
      frameRequested = false
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
      matrix: flightTargets.capture
    }
    const state = getHeroMotionState(
      {
        progress,
        breakoutProgress: clamp(progress / 0.3, 0, 1),
        travelProgress: getViewportProgress(toolsSection, 1.1, 0.34),
        morphProgress: getViewportProgress(toolsSection, 0.74, 0.2),
        // Keep the dock window late so the shorter tools page stays readable before takeover.
        dockProgress: getViewportProgress(toolsSection, 0.46, 0.08),
        settleProgress: getViewportProgress(toolsSection, 0.92, 0.14),
        highlight: {
          capture: easeOutCubic(getViewportProgress(heroTargets.capture, 0.94, 0.48)),
          text: easeOutCubic(getViewportProgress(heroTargets.text, 0.82, 0.22)),
          web: easeOutCubic(getViewportProgress(heroTargets.web, 0.88, 0.4)),
          utility: easeOutCubic(getViewportProgress(heroTargets.utility, 0.84, 0.3)),
          matrix: easeOutCubic(getViewportProgress(heroTargets.matrix, 0.72, 0.18))
        }
      },
      prefersReducedMotion
    )

    applyFlightGeometry(state)

    root.style.setProperty('--hero-progress', state.progress.toFixed(4))
    root.style.setProperty('--flight-breakout', state.breakout.toFixed(4))
    root.style.setProperty('--flight-breakout-soft', state.breakoutSoft.toFixed(4))
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
