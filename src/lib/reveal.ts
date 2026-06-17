// Gentle on-scroll reveal for content blocks. Enhancement only — without JS (or
// under prefers-reduced-motion) everything is visible immediately.

export function initReveal(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]');

  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  els.forEach((el) => io.observe(el));
}
