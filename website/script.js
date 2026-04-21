document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement
  const header = document.querySelector('.site-header')
  const heroScroll = document.querySelector('.hero-scroll')
  const revealItems = document.querySelectorAll('.reveal')
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)
  const easeInOutSine = (value) => -(Math.cos(Math.PI * value) - 1) / 2
  const getPhase = (value, start, end) => {
    if (end <= start) {
      return 0
    }

    return clamp((value - start) / (end - start), 0, 1)
  }

  const getHeroProgress = () => {
    if (!heroScroll || prefersReducedMotion) {
      return 0
    }

    const rect = heroScroll.getBoundingClientRect()
    const total = Math.max(heroScroll.offsetHeight - window.innerHeight, 1)
    const distance = clamp(-rect.top, 0, total)

    return clamp(distance / total, 0, 1)
  }

  const getBreakoutProgress = (progress) => {
    const stagedProgress =
      progress < 0.22
        ? (progress / 0.22) * 0.42
        : progress < 0.7
          ? 0.42 + ((progress - 0.22) / 0.48) * 0.43
          : 0.85 + ((progress - 0.7) / 0.3) * 0.15

    return clamp(stagedProgress, 0, 1)
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
    const breakoutProgress = prefersReducedMotion ? 0 : getBreakoutProgress(progress)
    const breakoutSoft = prefersReducedMotion ? 0 : easeOutCubic(breakoutProgress)
    const breakoutDrift = prefersReducedMotion ? 0 : easeInOutSine(progress)
    const handoffProgress = prefersReducedMotion ? 0 : getPhase(progress, 0.48, 0.82)
    const handoffSoft = prefersReducedMotion ? 0 : easeInOutSine(handoffProgress)
    const sectionLinkProgress = prefersReducedMotion ? 0 : getPhase(progress, 0.66, 1)
    const sectionLinkSoft = prefersReducedMotion ? 0 : easeOutCubic(sectionLinkProgress)

    root.style.setProperty('--hero-progress', progress.toFixed(4))
    root.style.setProperty('--breakout-progress', breakoutProgress.toFixed(4))
    root.style.setProperty('--breakout-soft', breakoutSoft.toFixed(4))
    root.style.setProperty('--breakout-drift', breakoutDrift.toFixed(4))
    root.style.setProperty('--handoff-progress', handoffProgress.toFixed(4))
    root.style.setProperty('--handoff-soft', handoffSoft.toFixed(4))
    root.style.setProperty('--section-link-progress', sectionLinkProgress.toFixed(4))
    root.style.setProperty('--section-link-soft', sectionLinkSoft.toFixed(4))
  }

  syncScrollState()
  window.addEventListener('scroll', syncScrollState, { passive: true })
  window.addEventListener('resize', syncScrollState)

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
