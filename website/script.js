document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    const header = document.querySelector('.site-header');
    const heroScroll = document.querySelector('.hero-scroll');
    const revealItems = document.querySelectorAll('.reveal');
    const heroVideo = document.querySelector('.hero-video');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (heroVideo && !prefersReducedMotion) {
        heroVideo.playbackRate = 0.78;
    }

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const syncScrollState = () => {
        if (window.scrollY > 18) {
            header.classList.add('is-scrolled');
        } else {
            header.classList.remove('is-scrolled');
        }

        if (!heroScroll) {
            return;
        }

        const rect = heroScroll.getBoundingClientRect();
        const total = heroScroll.offsetHeight - window.innerHeight;
        const progress = prefersReducedMotion
            ? 0
            : clamp((-rect.top) / Math.max(total, 1), 0, 1);

        root.style.setProperty('--hero-progress', progress.toFixed(4));
    };

    syncScrollState();
    window.addEventListener('scroll', syncScrollState, { passive: true });
    window.addEventListener('resize', syncScrollState);

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        });
    }, {
        threshold: 0.14,
        rootMargin: '0px 0px -40px 0px'
    });

    revealItems.forEach((item) => revealObserver.observe(item));

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            const href = anchor.getAttribute('href');
            if (!href || href === '#') {
                return;
            }

            const target = document.querySelector(href);
            if (!target) {
                return;
            }

            event.preventDefault();
            target.scrollIntoView({
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
                block: 'start'
            });
        });
    });
});
