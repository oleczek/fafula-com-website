// Hero + interlude swarm with a Watch_Dogs-style glitch-TV look. Every element with
// class "swarm" gets its own instance: thousands of agents slowly RE-FORM the full name
// "Aleksander / Fafuła" (two stacked lines) each time the element enters view, then
// settle and shimmer. Light particles on a dark hero panel. The render gets an RGB
// channel split (drawn per-particle as an additive glow, so it's cheap) plus horizontal
// signal tearing — strongest while the word materialises, then occasional ctOS-style
// bursts. Decorative (canvases are aria-hidden). Static under reduced motion.

const BPM = 50;
const GLITCH_GAIN = 0.49; // overall glitch intensity (brightness + tearing); 1 = full, 0.49 ≈ −30% on −30%

function setupSwarm(cv: HTMLCanvasElement, reduce: MediaQueryList): void {
  const host = (cv.parentElement ?? cv) as HTMLElement;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  // lighter load on phones: fewer particles, lower DPR
  const mobile = window.innerWidth < 760 || window.matchMedia('(pointer: coarse)').matches;
  const bufC = document.createElement('canvas');
  const bctx = bufC.getContext('2d');
  if (!bctx) return;

  // pre-rendered round-dot sprites — drawImage of a cached circle is far cheaper than a
  // per-particle arc() (which starved the frame rate), and gives soft ROUND dots, not squares.
  function makeDot(color: string): HTMLCanvasElement {
    const S = 16, c = document.createElement('canvas');
    c.width = c.height = S;
    const cc = c.getContext('2d')!;
    cc.fillStyle = color; cc.beginPath(); cc.arc(S / 2, S / 2, S / 2 - 1, 0, 6.2832); cc.fill();
    return c;
  }
  const dotMilk = makeDot('rgb(242,238,230)');
  const dotOx = makeDot('rgb(200,82,56)');

  let W = 0, H = 0, DPR = 1, N = 0, dot = 2;
  let px!: Float32Array, py!: Float32Array, vx!: Float32Array, vy!: Float32Array,
      tx!: Float32Array, ty!: Float32Array, hue!: Float32Array, spd!: Float32Array;
  let raf = 0, running = false, t0 = 0, built = false, builtWithFont = true;
  let mx = -1e9, my = -1e9;
  let gNext = 1.6, gUntil = 0, gPeak = 0;
  const isInterlude = !!host.closest('.interlude');
  let introDone = false; // only the hero's FIRST activation plays the form-in intro
  let introRun = false;  // is the current run the one-time intro (drives the formation glitch)?

  function size(): void {
    const r = host.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = bufC.width = Math.round(W * DPR);
    cv.height = bufC.height = Math.round(H * DPR);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    bctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function build(): void {
    const off = document.createElement('canvas');
    const oc = off.getContext('2d');
    if (!oc) return;
    // integer px — fractional W/H (Windows display scaling, fractional zoom) corrupts the
    // row-stride math below, which is why the wordmark went blank at 100%/125%/150%.
    const w = Math.max(1, Math.round(W)), h = Math.max(1, Math.round(H));
    off.width = w; off.height = h;
    // full name + honorific on two stacked lines (wordmark): "Aleksander" / "Fafuła, PhD".
    // Size to the WIDEST line so it always fits, then cap by height so the block stays in stage.
    const lines = ['Aleksander', 'Fafuła, PhD'];
    // absolute px cap so the wordmark doesn't balloon on big/hi-dpi screens (e.g. 16" Mac);
    // smaller/zoomed viewports stay below the cap and are unaffected.
    let fs = Math.min(w * 0.2, h * 0.34, 148);
    oc.textAlign = 'left'; oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    oc.font = `600 ${fs}px 'Fraunces Variable', Georgia, serif`;
    const widest = Math.max(oc.measureText(lines[0]).width, oc.measureText(lines[1]).width);
    // left edge of the centred content column, so the wordmark lines up flush-left with the
    // supporting text (tagline/cue) instead of being centred.
    let leftX = Math.round(w * 0.07);
    const wrapEl = host.closest('.hero')?.querySelector('.wrap');
    if (wrapEl) {
      const wr = wrapEl.getBoundingClientRect(), hr = host.getBoundingClientRect();
      leftX = Math.max(0, Math.round(wr.left - hr.left));
    }
    const maxW = w - leftX - Math.round(w * 0.04); // keep the widest line inside the stage
    if (widest > maxW) { fs *= maxW / widest; oc.font = `600 ${fs}px 'Fraunces Variable', Georgia, serif`; }
    const lh = fs * 1.04;               // tight stacking for a single wordmark block
    // sit lower in the interlude so there's more black headroom above the wordmark (its top
    // fades IN from the light content, so it needs a bigger dark gap than the first hero).
    const cy = h * (host.closest('.interlude') ? 0.54 : 0.46);
    oc.fillText(lines[0], leftX, cy - lh / 2);
    oc.fillText(lines[1], leftX, cy + lh / 2);
    const img = oc.getImageData(0, 0, w, h).data;
    const t: Array<[number, number]> = [];
    // denser grain than the surname-only mark so each (smaller) line of the full name still
    // reads as solid dark ink on light — more particles is wanted here (it's not a perf issue).
    // density-first: denser sampling (more particles) — chosen over frame rate on purpose.
    const stride = Math.max(2, Math.round(Math.min(w, h) / 820));
    dot = 2; // small, crisp dots (19-swarm-wake)
    for (let yy = 0; yy < h; yy += stride)
      for (let xx = 0; xx < w; xx += stride)
        if (img[(yy * w + xx) * 4 + 3] > 128) t.push([xx, yy]);
    N = t.length;
    px = new Float32Array(N); py = new Float32Array(N);
    vx = new Float32Array(N); vy = new Float32Array(N);
    tx = new Float32Array(N); ty = new Float32Array(N); hue = new Float32Array(N); spd = new Float32Array(N);
    for (let i = 0; i < N; i++) { tx[i] = t[i][0]; ty[i] = t[i][1]; hue[i] = Math.random(); }
    // start already FORMED — re-entering view (scroll) and interludes must NOT "re-load"; only
    // the hero's first activation scatters (see activate()).
    for (let i = 0; i < N; i++) { px[i] = tx[i]; py[i] = ty[i]; vx[i] = 0; vy[i] = 0; }
    gNext = 1.6; gUntil = 0;
    built = true;
    builtWithFont = !document.fonts || document.fonts.check("600 10px 'Fraunces Variable'", 'Fafuła'); // incl. Ł (latin-ext)
  }

  function scatter(): void {
    for (let i = 0; i < N; i++) { px[i] = Math.random() * W; py[i] = Math.random() * H; vx[i] = 0; vy[i] = 0; }
    gNext = 1.6; gUntil = 0;
  }

  function glitchAmount(t: number): number {
    const form = introRun ? Math.max(0, 1 - t / 1.8) * 0.6 : 0; // intro formation glitch (strong level)
    if (t > gNext) {
      gNext = t + 4.5 + Math.random() * 7;
      if (Math.random() < 0.45) {                                  // STRONG: snappy & brief
        gPeak = 0.7 + Math.random() * 0.25; gUntil = t + 0.2 + Math.random() * 0.5;
      } else {                                                     // WEAK: slower, longer, fainter
        gPeak = 0.16 + Math.random() * 0.13; gUntil = t + 0.5 + Math.random() * 0.6; // ≤ 1.1s
      }
    }
    const burst = t < gUntil ? gPeak * (0.6 + 0.4 * Math.random()) : 0;
    return Math.max(form, burst);
  }

  function step(t: number): void {
    const beat = (t * BPM / 60) % 1;
    const ripple = Math.pow(1 - beat, 3);
    const jitter = 0.05 + ripple * 0.3;
    for (let i = 0; i < N; i++) {
      let ax = (tx[i] - px[i]) * 0.07, ay = (ty[i] - py[i]) * 0.07;
      ax += Math.sin(t * 1.2 + i * 1.7) * 0.05 * jitter;
      ay += Math.cos(t * 1.0 + i * 2.3) * 0.05 * jitter;
      // soft, wide cursor "wake" (19-swarm-wake): agents part gently and glide back
      const dx = px[i] - mx, dy = py[i] - my, d2 = dx * dx + dy * dy;
      if (d2 < 44100) { const d = Math.sqrt(d2) + 1e-3; const f = (1 - d / 210) * 1.7; ax += dx / d * f; ay += dy / d * f; }
      vx[i] = (vx[i] + ax) * 0.80; vy[i] = (vy[i] + ay) * 0.80;
      px[i] += vx[i]; py[i] += vy[i];
      spd[i] = Math.min(1, (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.35); // for speed-brightened dots
    }
  }

  // cheap deterministic pseudo-random keyed to an integer (so a held "step" stays constant)
  function ghash(k: number, n: number): number { const s = Math.sin(k * 12.9898 + n * 4.137) * 43758.5453; return s - Math.floor(s); }
  function paint(g: number, t: number): void {
    // fade trails toward TRANSPARENT (not an opaque dark fill) so the hero shows the page's
    // CSS background — keeps hero and content identical across displays (fixes Mac wide-gamut
    // where canvas-black differed from CSS-black).
    bctx!.globalCompositeOperation = 'destination-out';
    bctx!.fillStyle = 'rgba(0,0,0,0.5)';
    bctx!.fillRect(0, 0, W, H);
    bctx!.globalCompositeOperation = 'source-over';
    if (g <= 0.01) {
      // small, crisp ROUND dots (19-swarm-wake look). Two passes (NOT per-particle globalAlpha,
      // which tanks the frame rate): a dim base, then an overdraw of only the MOVING dots so the
      // cursor wake / forming agents brighten — life in the motion, dim and crisp at rest.
      const sz = dot, o = sz / 2;
      bctx!.globalAlpha = 0.82;
      for (let i = 0; i < N; i++) bctx!.drawImage(hue[i] < 0.10 ? dotOx : dotMilk, px[i] - o, py[i] - o, sz, sz);
      bctx!.globalAlpha = 0.55;
      for (let i = 0; i < N; i++) if (spd[i] > 0.12) bctx!.drawImage(hue[i] < 0.10 ? dotOx : dotMilk, px[i] - o, py[i] - o, sz, sz);
      bctx!.globalAlpha = 1;
    } else {
      // bold chromatic split — several colour "ghosts" spread WIDE so the layering reads even at
      // 100% on a big screen (small offsets only looked like flicker). Spreading them also keeps
      // it from washing to white: distinct colour fringes, not one overlapping blob.
      // BIG offset even on weak bursts (so the layering always reads), but LOW additive opacity so
      // overlapping channels stay COLOURFUL instead of blowing out to white when it flashes.
      const amp = 0.6 + 0.4 * g;                   // offset amplitude — sizable even when weak
      // hold each random state for holdT seconds: long when weak (slow, stepped — a lazy neon
      // flicker), short when strong (frantic). This is what makes the weak glitch read as SLOW.
      const holdT = 0.04 + 0.5 * Math.max(0, 0.42 - g);
      const k = Math.floor(t / holdT);
      const gx = (16 + 24 * ghash(k, 1)) * amp;    // horizontal split, CSS px
      const gy = (ghash(k, 2) - 0.5) * 10 * amp;   // vertical mis-registration
      const gd = dot + 0.6;
      bctx!.globalAlpha = (0.11 + 0.35 * g) * GLITCH_GAIN; // weak/strong brightness, dialled gentler
      bctx!.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const X = px[i], Y = py[i];
        bctx!.fillStyle = 'rgb(214,22,44)';  bctx!.fillRect(X + gx,        Y + gy, gd, gd); // red
        bctx!.fillStyle = 'rgb(22,176,86)';  bctx!.fillRect(X - gx,        Y - gy, gd, gd); // green
        bctx!.fillStyle = 'rgb(34,62,214)';  bctx!.fillRect(X + gx * 0.45, Y,      gd, gd); // blue
        bctx!.fillStyle = 'rgb(0,156,166)';  bctx!.fillRect(X - gx * 0.45, Y + gy, gd, gd); // cyan
        bctx!.fillStyle = 'rgb(184,0,152)';  bctx!.fillRect(X + gx * 0.75, Y - gy, gd, gd); // magenta
      }
      bctx!.globalCompositeOperation = 'source-over';
      bctx!.globalAlpha = 1;
    }
  }

  function draw(now: number): void {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    const g = glitchAmount(t);
    step(t);
    paint(g, t);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.clearRect(0, 0, cv.width, cv.height);
    ctx!.drawImage(bufC, 0, 0);
    if (g > 0.01) { // horizontal signal tearing — bigger slip & taller bands so it reads at 100%
      const holdT = 0.04 + 0.5 * Math.max(0, 0.42 - g); // same slow/fast hold as the chromatic split
      const k = Math.floor(t / holdT);
      const bands = 1 + (ghash(k, 7) * 6 * g * GLITCH_GAIN | 0);
      for (let i = 0; i < bands; i++) {
        const by = ghash(k, 11 + i) * cv.height;
        const bh = (4 + ghash(k, 31 + i) * 64) * DPR;
        const sx = (ghash(k, 51 + i) - 0.5) * 150 * g * GLITCH_GAIN * DPR;
        ctx!.drawImage(bufC, 0, by, cv.width, bh, sx, by, cv.width, bh); // from buffer, not self-blit (Intel-safe)
      }
    }
    if (running) raf = requestAnimationFrame(draw);
  }

  function renderStatic(): void {
    for (let i = 0; i < N; i++) { px[i] = tx[i]; py[i] = ty[i]; }
    bctx!.globalCompositeOperation = 'source-over';
    bctx!.clearRect(0, 0, W, H); // transparent bg so the CSS background shows through
    const sz = dot, o = sz / 2;
    bctx!.globalAlpha = 0.82; // at rest
    for (let i = 0; i < N; i++) bctx!.drawImage(hue[i] < 0.10 ? dotOx : dotMilk, px[i] - o, py[i] - o, sz, sz);
    bctx!.globalAlpha = 1;
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.clearRect(0, 0, cv.width, cv.height);
    ctx!.drawImage(bufC, 0, 0);
  }

  function start(reform: boolean): void {
    if (reduce.matches) { renderStatic(); return; }
    if (running) return;
    introRun = reform;
    if (reform) scatter();
    // reset the glitch schedule relative to the fresh clock. gUntil/gNext are absolute t-values,
    // so without this a re-entry (t0→0, e.g. scrolling back to the top) leaves a STALE gUntil far
    // in the "future" and the burst reads as active for ages — the never-ending glitch.
    gNext = 2 + Math.random() * 4; gUntil = 0;
    running = true; t0 = 0;
    raf = requestAnimationFrame(draw);
  }
  function stop(): void { running = false; cancelAnimationFrame(raf); }
  // becomes active in view: the hero forms once (intro); interludes & every re-entry resume
  // already-formed (no re-scatter, no formation glitch) — just the idle glitch.
  function activate(): void {
    const intro = !introDone && !isInterlude;
    introDone = true;
    start(intro);
  }

  host.addEventListener('pointermove', (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  }, { passive: true });
  host.addEventListener('pointerleave', () => { mx = -1e9; my = -1e9; });

  function inView(): boolean {
    const r = host.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }
  function sizeStale(): boolean {
    const r = host.getBoundingClientRect();
    return N === 0 || Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1;
  }
  function reboot(): void {
    stop(); built = false; size(); build();
    if (reduce.matches) renderStatic();
    else if (inView()) activate();
  }

  const io = new IntersectionObserver((ents) => {
    for (const en of ents) {
      if (en.isIntersecting) { sizeStale() ? reboot() : activate(); }
      else stop();
    }
  }, { threshold: 0 });
  io.observe(host);

  let rt = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(rt);
    rt = window.setTimeout(() => { if (sizeStale()) reboot(); }, 220); // ignore mobile address-bar twitches (size unchanged with svh)
  }, { passive: true });
  reduce.addEventListener?.('change', reboot);

  // Build now, then re-validate once layout has settled and the webfont has loaded.
  // A wrong measurement on the very first paint is exactly why a resize/zoom used to
  // "fix" the blank wordmark — these re-checks make it correct without any resize.
  size();
  build();
  if (reduce.matches) renderStatic();
  requestAnimationFrame(() => requestAnimationFrame(() => { if (sizeStale()) reboot(); }));
  // Force-load the EXACT glyphs we sample — incl. "Ł" (U+0141), which lives in Fraunces' latin-ext
  // subset: a SEPARATE woff2 that downloads lazily AFTER the first build, so the swarm first samples
  // a broken fallback Ł and only a resize/fullscreen fixed it. Load it explicitly, then rebuild.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("600 40px 'Fraunces Variable'", 'Aleksander Fafuła, PhD')
      .then(() => { if (!builtWithFont) reboot(); })
      .catch(() => {});
  }
}

export function initSwarm(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll<HTMLCanvasElement>('.swarm').forEach((cv) => setupSwarm(cv, reduce));
}
