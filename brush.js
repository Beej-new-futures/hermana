/* Hermana — painterly cursor / finger brush
   Shared by contact.html and manifesto.html.
   Requires a <canvas id="brush"> on the page. */
(() => {
  const canvas = document.getElementById('brush');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Gentle dissolve (matches body tone). LOWER = paint lingers longer.
  //   0      → paint never fades (a permanent canvas)
  //   0.004  → strokes stay visible ~10s, then softly clear  (default)
  //   0.045  → quick dissolve
  const FADE_ALPHA = 0.004;
  const FADE = 'rgba(237, 233, 227, ' + FADE_ALPHA + ')';

  // Paint colours sampled from the Hermana plaster palette
  const palette = ['#6f7d61', '#b58a6a', '#a99884', '#7c6a54', '#322d26'];
  let colorIndex = Math.floor(Math.random() * palette.length);
  let current = palette[colorIndex];

  // ── brush feel ──────────────────────────────────────────────
  const SIZE_MAX = 78;    // brush diameter on slow movement
  const SIZE_MIN = 26;    // diameter on fast movement
  const FLOW     = 0.17;  // opacity per stamp — overlaps build density
  const GAP      = 180;   // ms of stillness before a new gesture/colour

  function resize() {
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── grainy, bristly brush-tip stamps (grayscale masters) ──
  function makeStamp(px) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const r = px / 2;

    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0,    'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1,    'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();

    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI;
      g.globalAlpha = 0.12 + Math.random() * 0.28;
      g.lineWidth = 0.5 + Math.random() * 1.4;
      g.beginPath();
      g.moveTo(r + Math.cos(a) * r, r + Math.sin(a) * r);
      g.lineTo(r - Math.cos(a) * r, r - Math.sin(a) * r);
      g.stroke();
    }
    for (let i = 0; i < px * 5; i++) {
      g.globalAlpha = Math.random() * 0.5;
      g.clearRect(Math.random() * px, Math.random() * px, 1, 1);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    return c;
  }

  const MASTERS = [makeStamp(110), makeStamp(110), makeStamp(110)];

  function tintSet(color) {
    return MASTERS.map(m => {
      const c = document.createElement('canvas');
      c.width = m.width; c.height = m.height;
      const g = c.getContext('2d');
      g.drawImage(m, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }
  const tintCache = {};
  palette.forEach(c => { tintCache[c] = tintSet(c); });

  function stamp(x, y, size, alpha, rot, set) {
    const img = set[(Math.random() * set.length) | 0];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // splatter: flecks placed ONCE (no animation → no comet trails)
  function splatter(x, y, ang, speed, set) {
    const n = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.5;
      const d = 10 + Math.random() * speed * 0.7;
      const s = 2 + Math.random() * 8;
      stamp(x + Math.cos(a) * d, y + Math.sin(a) * d,
            s, 0.55 + Math.random() * 0.3, Math.random() * 6.28, set);
    }
  }

  // ── continuous fade ─────────────────────────────────────────
  function frame() {
    if (FADE_ALPHA > 0) {
      ctx.fillStyle = FADE;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── stamp along the pointer / finger path ───────────────────
  let lastX = null, lastY = null, lastT = 0, lastSize = SIZE_MAX;

  function endStroke() { lastX = null; }

  window.addEventListener('pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    const now = performance.now();

    if (lastX === null || now - lastT > GAP) {
      colorIndex = (colorIndex + 1) % palette.length;
      current = palette[colorIndex];
      lastX = x; lastY = y; lastT = now; lastSize = SIZE_MAX;
      return;
    }

    const dx = x - lastX, dy = y - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) { lastT = now; return; }

    const ang = Math.atan2(dy, dx);
    const set = tintCache[current];

    const targetSize = Math.max(SIZE_MIN, Math.min(SIZE_MAX, SIZE_MAX - dist * 0.85));
    const size = lastSize + (targetSize - lastSize) * 0.4;

    const spacing = Math.max(1.5, size * 0.18);
    const steps = Math.max(1, Math.round(dist / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const jx = (Math.random() - 0.5) * size * 0.12;
      const jy = (Math.random() - 0.5) * size * 0.12;
      const ss = size * (0.85 + Math.random() * 0.3);
      stamp(lastX + dx * t + jx, lastY + dy * t + jy,
            ss, FLOW * (0.8 + Math.random() * 0.4),
            ang + (Math.random() - 0.5) * 0.5, set);
    }

    if (dist > 16 && Math.random() < 0.08) {
      splatter(x, y, ang, dist, set);
    }

    lastX = x; lastY = y; lastT = now; lastSize = size;
  }, { passive: true });

  // Lifting the finger / leaving the window ends the stroke,
  // so the next touch starts fresh (and in a new colour)
  window.addEventListener('pointerup', endStroke);
  window.addEventListener('pointercancel', endStroke);
  window.addEventListener('pointerout', endStroke);
})();
