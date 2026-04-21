document.addEventListener('DOMContentLoaded', () => {
  const motionApi = window.OneToolHeroMotion
  const root = document.documentElement
  const header = document.querySelector('.site-header')
  const heroScroll = document.querySelector('.hero-scroll')
  const heroFlight = document.querySelector('.hero-flight')
  const toolsSection = document.querySelector('#tools')
  const revealItems = document.querySelectorAll('.reveal')
  const flightCards = {
    capture: document.querySelector('.hero-flight-card-capture'),
    organize: document.querySelector('.hero-flight-card-organize'),
    clipboard: document.querySelector('.hero-flight-card-clipboard'),
    utility: document.querySelector('.hero-flight-card-utility'),
    matrix: document.querySelector('.hero-flight-card-main')
  }
  const flightTargets = {
    capture: document.querySelector('[data-flight-target="capture"]'),
    organize: document.querySelector('[data-flight-target="organize"]'),
    utility: document.querySelector('[data-flight-target="utility"]')
  }
  const dockTargets = {
    capture: document.querySelector('[data-flight-dock="capture"]'),
    organize: document.querySelector('[data-flight-dock="organize"]'),
    utility: document.querySelector('[data-flight-dock="utility"]')
  }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frameRequested = false

  const clamp = motionApi?.clamp ?? ((value, min, max) => Math.min(Math.max(value, min), max))
  const easeOutCubic = motionApi?.easeOutCubic ?? ((value) => 1 - Math.pow(1 - value, 3))
  const getHeroMotionState =
    motionApi?.getHeroMotionState ??
    ((progress) => ({
      progress,
      breakout: 0,
      breakoutSoft: 0,
      morph: 0,
      morphSoft: 0,
      travel: 0,
      travelSoft: 0,
      dock: 0,
      dockSoft: 0,
      settle: 0,
      settleSoft: 0,
      highlight: {
        capture: 0,
        clipboard: 0,
        organize: 0,
        utility: 0,
        matrix: 0
      }
    }))
  const motionAnchors = new Map()

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
    capture: { x: 0, y: -30 },
    organize: { x: -18, y: -18 },
    clipboard: { x: 28, y: 10 },
    utility: { x: 8, y: 18 },
    matrix: { x: -42, y: -14 }
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
    const flightRect = heroFlight.getBoundingClientRect()
    const targetMap = {
      capture: 'capture',
      organize: 'organize',
      clipboard: 'organize',
      utility: 'utility',
      matrix: 'capture'
    }

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
      const startX = card.offsetLeft + card.offsetWidth / 2
      const startY = card.offsetTop + card.offsetHeight / 2
      const targetX = targetRect.left - flightRect.left + targetRect.width / 2
      const targetY = targetRect.top - flightRect.top + targetRect.height / 2
      const bias = flightBiases[key] ?? { x: 0, y: 0 }
      const dockTarget = dockTargets[targetKey]
      const dockRect = dockTarget?.getBoundingClientRect()
      const dockX = dockRect ? dockRect.left - flightRect.left + dockRect.width / 2 : targetX
      const dockY = dockRect ? dockRect.top - flightRect.top + dockRect.height / 2 : targetY
      const dockScale = dockRect ? dockRect.width / card.offsetWidth : 1

      card.style.setProperty('--target-x', `${targetX - startX + bias.x}px`)
      card.style.setProperty('--target-y', `${targetY - startY + bias.y}px`)
      card.style.setProperty('--dock-x', `${dockX - startX + bias.x}px`)
      card.style.setProperty('--dock-y', `${dockY - startY + bias.y}px`)
      card.style.setProperty('--dock-scale', dockScale.toFixed(4))
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
      clipboard: flightTargets.organize,
      organize: flightTargets.organize,
      utility: flightTargets.utility,
      matrix: flightTargets.capture
    }
    const state = getHeroMotionState(
      {
        progress,
        breakoutProgress: clamp(progress / 0.3, 0, 1),
        travelProgress: getViewportProgress(toolsSection, 1.1, 0.34),
        morphProgress: getViewportProgress(toolsSection, 0.74, 0.2),
        dockProgress: getViewportProgress(toolsSection, 0.46, 0.08),
        settleProgress: getViewportProgress(toolsSection, 0.92, 0.14),
        highlight: {
          capture: easeOutCubic(getViewportProgress(heroTargets.capture, 0.94, 0.48)),
          clipboard: easeOutCubic(getViewportProgress(heroTargets.clipboard, 0.82, 0.22)),
          organize: easeOutCubic(getViewportProgress(heroTargets.organize, 0.88, 0.4)),
          utility: easeOutCubic(getViewportProgress(heroTargets.utility, 0.84, 0.3)),
          matrix: easeOutCubic(getViewportProgress(heroTargets.matrix, 0.72, 0.18))
        }
      },
      prefersReducedMotion
    )

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
    root.style.setProperty('--clipboard-highlight', state.highlight.clipboard.toFixed(4))
    root.style.setProperty('--organize-highlight', state.highlight.organize.toFixed(4))
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
