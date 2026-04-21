document.addEventListener('DOMContentLoaded', () => {
  const motionApi = window.OneToolHeroMotion
  const root = document.documentElement
  const header = document.querySelector('.site-header')
  const heroScroll = document.querySelector('.hero-scroll')
  const heroFlight = document.querySelector('.hero-flight')
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
    utility: document.querySelector('[data-flight-target="utility"]'),
    matrix: document.querySelector('[data-flight-target="matrix"]')
  }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const clamp = motionApi?.clamp ?? ((value, min, max) => Math.min(Math.max(value, min), max))
  const getHeroMotionState =
    motionApi?.getHeroMotionState ??
    ((progress) => ({
      progress,
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
    }))

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

  const syncFlightTargets = () => {
    if (!heroFlight) {
      return
    }

    const flightRect = heroFlight.getBoundingClientRect()
    const targetMap = {
      capture: 'capture',
      organize: 'organize',
      clipboard: 'organize',
      utility: 'utility',
      matrix: 'matrix'
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

      card.style.setProperty('--target-x', `${targetX - startX + bias.x}px`)
      card.style.setProperty('--target-y', `${targetY - startY + bias.y}px`)
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
    const state = getHeroMotionState(progress, prefersReducedMotion)

    root.style.setProperty('--hero-progress', state.progress.toFixed(4))
    root.style.setProperty('--flight-breakout', state.breakout.toFixed(4))
    root.style.setProperty('--flight-breakout-soft', state.breakoutSoft.toFixed(4))
    root.style.setProperty('--flight-travel', state.travel.toFixed(4))
    root.style.setProperty('--flight-travel-soft', state.travelSoft.toFixed(4))
    root.style.setProperty('--flight-settle', state.settle.toFixed(4))
    root.style.setProperty('--flight-settle-soft', state.settleSoft.toFixed(4))
    root.style.setProperty('--capture-highlight', state.highlight.capture.toFixed(4))
    root.style.setProperty('--organize-highlight', state.highlight.organize.toFixed(4))
    root.style.setProperty('--utility-highlight', state.highlight.utility.toFixed(4))
    root.style.setProperty('--matrix-highlight', state.highlight.matrix.toFixed(4))
  }

  syncFlightTargets()
  syncScrollState()
  window.addEventListener('scroll', syncScrollState, { passive: true })
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
