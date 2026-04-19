/**
 * MOOD — Emotional Particle Engine
 * Canvas-based fluid particle system that reacts to emotional state.
 * Energy, Valence, Intensity → color, motion, density, spread.
 */

class ParticleEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.opts   = {
      count:       opts.count       ?? 120,
      maxRadius:   opts.maxRadius   ?? 3.2,
      minRadius:   opts.minRadius   ?? 0.8,
      speed:       opts.speed       ?? 1,
      attraction:  opts.attraction  ?? 0.012,
      repulsion:   opts.repulsion   ?? 0.008,
      friction:    opts.friction    ?? 0.92,
      ...opts,
    };

    // Emotional state (0–1)
    this.energy    = 0.5;
    this.valence   = 0.5;
    this.intensity = 0.3;

    this.particles   = [];
    this.center      = { x: 0, y: 0 };
    this.mouse       = { x: null, y: null, active: false };
    this._raf        = null;
    this._resizeObs  = null;
    this._palette    = this._buildPalette();
    this._time       = 0;

    this._init();
  }

  /* ── palette derived from emotional state ── */
  _buildPalette() {
    const e = this.energy;
    const v = this.valence;
    const i = this.intensity;

    // Calm/blue  ← energy low
    // Yellow     ← energy high
    // Green      ← balanced valence
    // Red        ← low valence + high intensity
    // Purple     ← introspection (low valence, low intensity)

    // Base hue: energy maps blue→yellow (210→55)
    const hueE = 210 - e * 155;   // 210→55
    // Valence shifts hue warm/cool
    const hue  = hueE + (v - 0.5) * 80;

    const sat  = 55 + i * 35;
    const lit  = 55 + v * 20;

    // Accent color for highlights
    const hueAcc = hue + 30;

    return {
      core:   `hsl(${hue},${sat}%,${lit}%)`,
      accent: `hsl(${hueAcc},${sat + 10}%,${lit + 10}%)`,
      dim:    `hsl(${hue - 20},${sat - 15}%,${lit - 15}%)`,
      raw:    { hue, sat, lit }
    };
  }

  _init() {
    this._resize();
    this._spawnParticles();
    this._bindEvents();
    this._loop();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.center.x = rect.width  / 2;
    this.center.y = rect.height / 2;
    this._logicalW = rect.width;
    this._logicalH = rect.height;

    // Reposition existing particles on resize
    this.particles.forEach(p => {
      p.cx = this.center.x;
      p.cy = this.center.y;
    });
  }

  _spawnParticles() {
    this.particles = [];
    const n = this._targetCount();
    for (let i = 0; i < n; i++) {
      this.particles.push(this._createParticle(i));
    }
  }

  _targetCount() {
    const densityMap = { low: 60, medium: 120, high: 200 };
    const base = densityMap[window.__moodDensity ?? 'medium'];
    return Math.round(base * (0.6 + this.intensity * 0.8));
  }

  _createParticle(idx) {
    const angle  = Math.random() * Math.PI * 2;
    const spread = this._spread();
    const r      = Math.random() * spread;

    return {
      x:    this.center.x + Math.cos(angle) * r,
      y:    this.center.y + Math.sin(angle) * r,
      vx:   (Math.random() - 0.5) * 0.5,
      vy:   (Math.random() - 0.5) * 0.5,
      cx:   this.center.x,
      cy:   this.center.y,
      size: this.opts.minRadius + Math.random() * (this.opts.maxRadius - this.opts.minRadius),
      life: Math.random(),           // phase offset for oscillation
      idx,
      hueOffset: (Math.random() - 0.5) * 40,
      alpha: 0.4 + Math.random() * 0.5,
    };
  }

  /* ── spread radius based on energy/intensity ── */
  _spread() {
    const base = Math.min(this._logicalW, this._logicalH) * 0.38;
    // High energy → particles fly out; low energy → collapse
    const energyFactor  = 0.4 + this.energy * 1.0;
    const intensityBump = 1  + this.intensity * 0.5;
    return base * energyFactor * intensityBump;
  }

  /* ── update emotional state ── */
  setState(energy, valence, intensity) {
    this.energy    = Math.max(0, Math.min(1, energy));
    this.valence   = Math.max(0, Math.min(1, valence));
    this.intensity = Math.max(0, Math.min(1, intensity));
    this._palette  = this._buildPalette();

    // Adjust count smoothly
    this._reconcileCount();

    // Expose CSS vars
    this._updateCSSVars();
  }

  _reconcileCount() {
    const target = this._targetCount();
    while (this.particles.length < target) {
      this.particles.push(this._createParticle(this.particles.length));
    }
    while (this.particles.length > target) {
      this.particles.pop();
    }
  }

  _updateCSSVars() {
    const p = this._palette;
    const root = document.documentElement;
    root.style.setProperty('--emo-a', p.core);
    root.style.setProperty('--emo-b', p.accent);
    root.style.setProperty('--emo-c', p.dim);
  }

  /* ── main animation loop ── */
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this._time += 0.008;
    this._update();
    this._draw();
  }

  _update() {
    const cx      = this.center.x;
    const cy      = this.center.y;
    const spread  = this._spread();
    const agit    = 0.5 + this.intensity * 2.5;   // agitation multiplier
    const attract = this.opts.attraction * (0.6 + this.energy * 0.8);
    const speed   = this.opts.speed * agit;

    this.particles.forEach((p, i) => {
      p.life += 0.004 + this.intensity * 0.009;

      // Brownian agitation — more turbulent on high intensity
      const ang = Math.sin(p.life * 3.1 + i) * Math.PI * 2;
      p.vx += Math.cos(ang) * 0.04 * agit;
      p.vy += Math.sin(ang) * 0.04 * agit;

      // Breathing oscillation — creates the "living" feel
      const breathR = spread * (0.7 + 0.3 * Math.sin(this._time * 0.6 + i * 0.07));
      const dx = p.cx - p.x;
      const dy = p.cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist > breathR) {
        // Pull toward orbit
        p.vx += (dx / dist) * attract * 2;
        p.vy += (dy / dist) * attract * 2;
      } else {
        // Gentle orbital drift
        p.vx += (dx / dist) * attract * 0.4;
        p.vy += (dy / dist) * attract * 0.4;
      }

      // Valence: positive → expansion, negative → collapse
      if (this.valence > 0.5) {
        const repForce = (this.valence - 0.5) * this.opts.repulsion * 2;
        p.vx -= (dx / dist) * repForce;
        p.vy -= (dy / dist) * repForce;
      }

      // Mouse repulsion (interactive)
      if (this.mouse.active && this.mouse.x !== null) {
        const mdx  = p.x - this.mouse.x;
        const mdy  = p.y - this.mouse.y;
        const md   = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < 70 && md > 0) {
          const f = (70 - md) / 70 * 1.5;
          p.vx += (mdx / md) * f;
          p.vy += (mdy / md) * f;
        }
      }

      // Friction
      p.vx *= this.opts.friction;
      p.vy *= this.opts.friction;

      // Clamp velocity
      const maxV = speed;
      const spd  = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > maxV) { p.vx = p.vx / spd * maxV; p.vy = p.vy / spd * maxV; }

      p.x += p.vx;
      p.y += p.vy;

      // Soft boundary — bounce back gently
      const margin = 20;
      if (p.x < margin)           { p.vx += 0.5; }
      if (p.x > this._logicalW - margin) { p.vx -= 0.5; }
      if (p.y < margin)           { p.vy += 0.5; }
      if (p.y > this._logicalH - margin) { p.vy -= 0.5; }
    });
  }

  _draw() {
    const ctx  = this.ctx;
    const W    = this._logicalW;
    const H    = this._logicalH;
    const pal  = this._palette;
    const { hue, sat, lit } = pal.raw;

    ctx.clearRect(0, 0, W * window.devicePixelRatio, H * window.devicePixelRatio);

    // Subtle radial gradient bg inside canvas
    const grad = ctx.createRadialGradient(this.center.x, this.center.y, 0, this.center.x, this.center.y, Math.min(W, H) * 0.48);
    grad.addColorStop(0, `hsla(${hue},${sat}%,${lit - 10}%,0.08)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Draw connections (gossamer threads)
    this._drawConnections(ctx, hue, sat, lit);

    // Draw particles
    this.particles.forEach((p, i) => {
      const pulse  = 0.7 + 0.3 * Math.sin(p.life * 2.5);
      const radius = p.size * pulse;
      const alpha  = p.alpha * (0.6 + 0.4 * pulse);
      const hOff   = p.hueOffset * (1 - this.intensity * 0.3);

      const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.2);
      pg.addColorStop(0, `hsla(${hue + hOff},${sat + 10}%,${lit + 15}%,${alpha})`);
      pg.addColorStop(0.5, `hsla(${hue + hOff},${sat}%,${lit}%,${alpha * 0.6})`);
      pg.addColorStop(1, `hsla(${hue + hOff},${sat - 10}%,${lit - 10}%,0)`);

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();
    });

    // Central nexus glow
    this._drawNexus(ctx, hue, sat, lit);
  }

  _drawConnections(ctx, hue, sat, lit) {
    const threshold = 55 + this.intensity * 25;
    const maxAlpha  = 0.08 + this.intensity * 0.07;

    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b   = this.particles[j];
        const dx  = a.x - b.x;
        const dy  = a.y - b.y;
        const d   = Math.sqrt(dx * dx + dy * dy);
        if (d < threshold) {
          const t = 1 - d / threshold;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `hsla(${hue},${sat}%,${lit}%,${maxAlpha * t})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  _drawNexus(ctx, hue, sat, lit) {
    const cx   = this.center.x;
    const cy   = this.center.y;
    const r    = 4 + this.intensity * 8;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 5);
    glow.addColorStop(0, `hsla(${hue},${sat + 20}%,${lit + 20}%,0.55)`);
    glow.addColorStop(0.3, `hsla(${hue},${sat}%,${lit}%,0.15)`);
    glow.addColorStop(1, `hsla(${hue},${sat}%,${lit}%,0)`);

    ctx.beginPath();
    ctx.arc(cx, cy, r * 5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue + 20},${sat + 30}%,${lit + 30}%,0.8)`;
    ctx.fill();
  }

  /* ── snapshot for history mini-card ── */
  snapshot(targetCanvas, w = 280, h = 280) {
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext('2d');

    // Scale particles to fit
    const scaleX = w / (this._logicalW || w);
    const scaleY = h / (this._logicalH || h);
    const pal    = this._palette;
    const { hue, sat, lit } = pal.raw;

    tmpCtx.fillStyle = '#0a0a14';
    tmpCtx.fillRect(0, 0, w, h);

    const cxT = w / 2;
    const cyT = h / 2;

    this.particles.forEach(p => {
      const px = cxT + (p.x - this.center.x) * Math.min(scaleX, scaleY) * 0.9;
      const py = cyT + (p.y - this.center.y) * Math.min(scaleX, scaleY) * 0.9;
      const r  = p.size * (0.8 + 0.4 * Math.sin(p.life));

      const g = tmpCtx.createRadialGradient(px, py, 0, px, py, r * 2.5);
      g.addColorStop(0, `hsla(${hue + p.hueOffset},${sat + 10}%,${lit + 15}%,${p.alpha})`);
      g.addColorStop(1, `hsla(${hue + p.hueOffset},${sat}%,${lit}%,0)`);

      tmpCtx.beginPath();
      tmpCtx.arc(px, py, r * 2.5, 0, Math.PI * 2);
      tmpCtx.fillStyle = g;
      tmpCtx.fill();
    });

    // Nexus
    const ng = tmpCtx.createRadialGradient(cxT, cyT, 0, cxT, cyT, 20);
    ng.addColorStop(0, `hsla(${hue},${sat + 20}%,${lit + 20}%,0.5)`);
    ng.addColorStop(1, `hsla(${hue},${sat}%,${lit}%,0)`);
    tmpCtx.beginPath();
    tmpCtx.arc(cxT, cyT, 20, 0, Math.PI * 2);
    tmpCtx.fillStyle = ng;
    tmpCtx.fill();

    // Copy to target
    const tCtx = targetCanvas.getContext('2d');
    tCtx.clearRect(0, 0, w, h);
    tCtx.drawImage(tmpCanvas, 0, 0, w, h);
  }

  /* ── bind canvas resize + mouse/touch ── */
  _bindEvents() {
    this._resizeObs = new ResizeObserver(() => {
      this._resize();
    });
    this._resizeObs.observe(this.canvas);

    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.active = true;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.mouse.active = false;
    });
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.touches[0].clientX - r.left;
      this.mouse.y = e.touches[0].clientY - r.top;
      this.mouse.active = true;
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {
      this.mouse.active = false;
    });
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._resizeObs) this._resizeObs.disconnect();
  }
}

window.ParticleEngine = ParticleEngine;
