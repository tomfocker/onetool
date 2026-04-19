document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    const revealItems = document.querySelectorAll('.reveal');
    const counters = document.querySelectorAll('.count-up');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add('is-visible');

            if (entry.target.classList.contains('stat-belt')) {
                counters.forEach((counter) => {
                    if (counter.dataset.done === 'true') {
                        return;
                    }

                    const target = Number(counter.dataset.target || '0');
                    const duration = 1200;
                    const startTime = performance.now();

                    const tick = (time) => {
                        const progress = Math.min((time - startTime) / duration, 1);
                        counter.textContent = String(Math.round(target * progress));
                        if (progress < 1) {
                            requestAnimationFrame(tick);
                        } else {
                            counter.dataset.done = 'true';
                            counter.textContent = String(target);
                        }
                    };

                    requestAnimationFrame(tick);
                });
            }

            revealObserver.unobserve(entry.target);
        });
    }, {
        threshold: 0.18,
        rootMargin: '0px 0px -40px 0px'
    });

    revealItems.forEach((item) => revealObserver.observe(item));

    const syncHeader = () => {
        if (window.scrollY > 16) {
            header.classList.add('is-scrolled');
        } else {
            header.classList.remove('is-scrolled');
        }
    };

    syncHeader();
    window.addEventListener('scroll', syncHeader);

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            const targetId = anchor.getAttribute('href');
            if (!targetId || targetId === '#') {
                return;
            }

            const target = document.querySelector(targetId);
            if (!target) {
                return;
            }

            event.preventDefault();
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });
});
