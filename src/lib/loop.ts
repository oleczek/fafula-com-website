// Seamless infinite scroll. The CV content (one ".loop-unit") is cloned once at
// runtime; when the reader scrolls one unit past the hero, we jump back by exactly
// one unit. The clone is pixel-identical there, so the loop is invisible and the
// page never ends.
//
// Enhancement only: the static HTML holds the content ONCE (crawlable), and with
// no JS or prefers-reduced-motion the page is a normal, finite scroll with a footer.

export function initLoop(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const loop = document.getElementById('loop');
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!loop || !hero) return;
  const unit = loop.querySelector<HTMLElement>('.loop-unit');
  if (!unit) return;

  let clone: HTMLElement | null = null;
  let unitH = 0, heroH = 0, active = false;

  function buildClone(): void {
    if (clone) return;
    clone = unit!.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('loop-clone');
    // avoid duplicate ids and re-running the reveal animation on the repeat
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    clone.querySelectorAll('[data-reveal]').forEach((el) => el.removeAttribute('data-reveal'));
    clone.querySelectorAll('canvas').forEach((el) => el.remove()); // clone's interlude is never viewed; keep one live swarm
    loop!.appendChild(clone);
  }
  function removeClone(): void { if (clone) { clone.remove(); clone = null; } }

  function enable(): void {
    removeClone();
    active = false;
    if (reduce.matches) return;
    if (unit!.offsetHeight < window.innerHeight) return; // too short to loop usefully
    buildClone();
    heroH = hero!.offsetHeight;
    unitH = clone!.offsetTop - unit!.offsetTop; // exact period (handles any margins)
    if (unitH > 0) active = true;
  }

  function tick(): void {
    if (active) {
      const y = window.scrollY;
      if (y >= heroH + unitH) window.scrollTo(0, y - unitH);
    }
    requestAnimationFrame(tick);
  }

  // the jump must be instant, so opt this document out of CSS smooth scrolling
  document.documentElement.style.scrollBehavior = 'auto';

  (async () => {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    enable();
    requestAnimationFrame(tick);
  })();

  let rt = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(rt);
    rt = window.setTimeout(enable, 200);
  }, { passive: true });
  reduce.addEventListener?.('change', enable);
}
