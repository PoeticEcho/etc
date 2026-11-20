/**
 * 기상청 도로기상 상황판 히어로 배너용 경량 Canvas 2D 동적 입자 엔진
 * - 비(원근감 다중 빗줄기 + 노면 물보라 스플래시)
 * - 눈(블러 보케 눈송이 + 회전 6각 결정 + 유기적 바람 흔들림)
 * - 폭설(고밀도 돌풍 눈보라 + 하단 눈안개 띠)
 * - 태풍·강풍(Windy / fluid streamline 곡선 바람 궤적 + 급경사 폭우)
 * - 한파(부유 빙정 다이아몬드 더스트)
 * - ResizeObserver + IntersectionObserver 기반 오프스크린 일시정지 & 1프레임 즉시 웜업
 */

const activeEngines = new WeakMap();

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

class WeatherParticleController {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = {
      weather: 'clear',
      coldWave: false,
      dayPhase: 'day',
      densityScale: 1.0,
      ...config
    };
    this.w = 600;
    this.h = 180;
    this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.particles = [];
    this.windTracers = [];
    this.splashes = [];
    this.crystals = [];
    this.rafId = null;
    this.isVisible = true;
    this.lastTs = 0;
    this.elapsed = 0;
    this.rng = seededRand(135792468);
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resizeObserver = null;
    this.interObserver = null;
    this.bindObservers();
    this.resize();
    this.resetParticles();
    this.warmUp();
    this.draw();
    if (!this.reducedMotion) this.start();
  }

  bindObservers() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const prevW = this.w;
        const prevH = this.h;
        this.resize();
        if (Math.abs(prevW - this.w) > 8 || Math.abs(prevH - this.h) > 8) {
          this.resetParticles();
          this.warmUp();
          this.draw();
        }
      });
      this.resizeObserver.observe(this.canvas);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.interObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        this.isVisible = entry ? entry.isIntersecting : true;
        if (this.isVisible && !this.reducedMotion && !this.rafId) {
          this.lastTs = performance.now();
          this.start();
        }
      }, { threshold: 0.02 });
      this.interObserver.observe(this.canvas);
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(240, Math.round(rect.width || this.canvas.clientWidth || 640));
    this.h = Math.max(120, Math.round(rect.height || this.canvas.clientHeight || 180));
    this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  updateConfig(nextConfig = {}) {
    this.config = { ...this.config, ...nextConfig };
    this.resetParticles();
    this.warmUp();
    this.draw();
  }

  hasAnyFx() {
    const { weather, coldWave } = this.config;
    return ['rain', 'thunder', 'typhoon', 'snow', 'heavy_snow', 'fog'].includes(weather) || coldWave;
  }

  resetParticles() {
    const { weather, coldWave, densityScale } = this.config;
    const areaFactor = clampDensity((this.w / 960) * (densityScale || 1), 0.45, 1.5);
    this.particles = [];
    this.windTracers = [];
    this.splashes = [];
    this.crystals = [];

    if (weather === 'rain' || weather === 'thunder' || weather === 'typhoon') {
      const isTyphoon = weather === 'typhoon';
      const isThunder = weather === 'thunder';
      const count = Math.round((isTyphoon ? 165 : isThunder ? 130 : 105) * areaFactor);
      for (let i = 0; i < count; i++) {
        const depth = 0.35 + this.rng() * 0.65;
        this.particles.push({
          kind: 'rain',
          x: this.rng() * (this.w + 180) - 60,
          y: this.rng() * this.h,
          depth,
          len: (isTyphoon ? 20 : 15) + depth * 15,
          vy: (isTyphoon ? 640 : 480) * (0.65 + depth * 0.65),
          vx: (isTyphoon ? -390 : isThunder ? -150 : -110) * (0.7 + depth * 0.5),
          alpha: (isTyphoon ? 0.34 : 0.30) + depth * 0.52
        });
      }
    }

    if (weather === 'snow' || weather === 'heavy_snow') {
      const isHeavy = weather === 'heavy_snow';
      const count = Math.round((isHeavy ? 210 : 115) * areaFactor);
      for (let i = 0; i < count; i++) {
        const depth = 0.32 + this.rng() * 0.68;
        this.particles.push({
          kind: 'snow',
          isCrystal: !isHeavy ? (i % 4 === 0) : (i % 6 === 0),
          x: this.rng() * (this.w + 120) - 40,
          y: this.rng() * this.h,
          depth,
          r: (isHeavy ? 1.8 : 1.7) + depth * (isHeavy ? 3.8 : 3.3),
          vy: (isHeavy ? 105 : 42) * (0.55 + depth * 0.75),
          vx: isHeavy ? (-105 - depth * 78) : (-14 - this.rng() * 14),
          phase: this.rng() * Math.PI * 2,
          freq: 1.5 + this.rng() * 2.2,
          amp: isHeavy ? (18 + this.rng() * 22) : (12 + this.rng() * 16),
          rot: this.rng() * Math.PI,
          rotSpd: (this.rng() - 0.5) * 1.6,
          alpha: (isHeavy ? 0.58 : 0.52) + depth * 0.44
        });
      }
    }

    // Windy / nullschool 스타일 흐르는 유체 바람 궤적 (태풍·폭설 중심)
    if (weather === 'typhoon' || weather === 'heavy_snow') {
      const isTyphoon = weather === 'typhoon';
      const tracerCount = Math.round((isTyphoon ? 46 : 26) * areaFactor);
      for (let i = 0; i < tracerCount; i++) {
        const x = this.w * (0.14 + this.rng() * 0.86);
        const y = this.h * (0.08 + this.rng() * 0.84);
        this.windTracers.push({
          x,
          y,
          trail: [{ x, y }],
          maxLen: isTyphoon ? 14 : 10,
          life: this.rng() * 1.6,
          maxLife: 1.3 + this.rng() * 1.2,
          speedScale: isTyphoon ? (1.1 + this.rng() * 0.9) : (0.75 + this.rng() * 0.5),
          width: isTyphoon ? (1.15 + this.rng() * 1.2) : 1.15,
          alpha: isTyphoon ? (0.38 + this.rng() * 0.4) : (0.24 + this.rng() * 0.22)
        });
      }
    }

    // 한파 시 은은히 반짝이는 빙정 다이아몬드 더스트
    if (coldWave) {
      const glints = Math.round(22 * areaFactor);
      for (let i = 0; i < glints; i++) {
        this.crystals.push({
          x: this.w * (0.28 + this.rng() * 0.7),
          y: this.h * (0.08 + this.rng() * 0.84),
          r: 1.0 + this.rng() * 1.8,
          phase: this.rng() * Math.PI * 2,
          spd: 1.5 + this.rng() * 2.2
        });
      }
    }
  }

  sampleWindField(x, y, t) {
    const nx = x / this.w;
    const ny = y / this.h;
    if (this.config.weather === 'typhoon') {
      // 우측 상단 태풍 중심(0.80, 0.42) 주변 반시계 소용돌이 + 서향 편서강풍 합성
      const cx = this.w * 0.80;
      const cy = this.h * 0.42;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.max(26, Math.hypot(dx, dy));
      const swirlBoost = Math.exp(-dist / (this.h * 0.95));
      // 북반구 태풍 반시계 회전 벡터 (dy, -dx) + 외곽 유입
      const swirlVx = (dy / dist) * 290 * swirlBoost - (dx / dist) * 42 * swirlBoost;
      const swirlVy = (-dx / dist) * 240 * swirlBoost - (dy / dist) * 42 * swirlBoost;
      const galeVx = -245 - Math.sin(ny * 4 + t * 2) * 35;
      const galeVy = Math.cos(nx * 5 + t * 2.4) * 24;
      return { vx: galeVx * (1 - swirlBoost * 0.55) + swirlVx, vy: galeVy + swirlVy };
    }
    // 폭설/눈바람 유선
    return {
      vx: -135 - Math.sin(ny * 3 + t * 1.3) * 28,
      vy: 26 + Math.cos(nx * 4 + t * 1.6) * 16
    };
  }

  step(dt) {
    this.elapsed += dt;
    const w = this.w;
    const h = this.h;
    const floorY = h * 0.88;

    for (const p of this.particles) {
      if (p.kind === 'rain') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y >= floorY + p.depth * 14) {
          if (this.splashes.length < 28 && p.depth > 0.55 && p.x > w * 0.25 && this.rng() < 0.34) {
            this.splashes.push({ x: p.x, y: Math.min(h - 3, p.y), age: 0, maxAge: 0.28, r: 3 + p.depth * 4 });
          }
          p.x = this.rng() * (w + 180) - 20;
          p.y = -18 - this.rng() * 24;
        } else if (p.x < -60) {
          p.x = w + 30;
        }
      } else {
        p.phase += p.freq * dt;
        p.rot += p.rotSpd * dt;
        p.x += (p.vx + Math.sin(p.phase) * p.amp) * dt;
        p.y += p.vy * dt;
        if (p.y > h + 10) {
          p.y = -10;
          p.x = this.rng() * (w + 100) - 20;
        }
        if (p.x < -30) p.x = w + 20;
        if (p.x > w + 40) p.x = -20;
      }
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].age += dt;
      if (this.splashes[i].age >= this.splashes[i].maxAge) {
        this.splashes.splice(i, 1);
      }
    }

    for (const tr of this.windTracers) {
      tr.life += dt;
      const vec = this.sampleWindField(tr.x, tr.y, this.elapsed);
      tr.x += vec.vx * tr.speedScale * dt;
      tr.y += vec.vy * tr.speedScale * dt;
      tr.trail.push({ x: tr.x, y: tr.y });
      if (tr.trail.length > tr.maxLen) tr.trail.shift();

      if (tr.life >= tr.maxLife || tr.x < w * 0.08 || tr.x > w + 30 || tr.y < -20 || tr.y > h + 20) {
        tr.x = w * (0.28 + this.rng() * 0.72);
        tr.y = h * (0.06 + this.rng() * 0.88);
        tr.trail = [{ x: tr.x, y: tr.y }];
        tr.life = 0;
      }
    }
  }

  warmUp() {
    for (let i = 0; i < 24; i++) {
      this.step(0.032);
    }
  }

  drawSnowCrystal(ctx, x, y, r, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = `rgba(240, 249, 255, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1.0;
    ctx.lineCap = 'round';
    for (let a = 0; a < 3; a++) {
      const ang = (a * Math.PI) / 3;
      const dx = Math.cos(ang) * r;
      const dy = Math.sin(ang) * r;
      ctx.beginPath();
      ctx.moveTo(-dx, -dy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    if (!this.hasAnyFx()) {
      ctx.restore();
      return;
    }

    // 1. 왼쪽 텍스트 가독성을 보호하기 위한 우측 집중 페이드 마스크(alpha scale)
    const leftGuard = (x) => clampDensity((x - this.w * 0.14) / (this.w * 0.22), 0.12, 1.0);

    // 2. 바람 궤적(Windy / Nullschool 스타일 유체 리본)
    for (const tr of this.windTracers) {
      if (tr.trail.length < 2) continue;
      const fadeInOut = Math.sin(Math.min(1, tr.life / tr.maxLife) * Math.PI);
      const baseAlpha = tr.alpha * fadeInOut * leftGuard(tr.x);
      if (baseAlpha <= 0.02) continue;
      for (let i = 1; i < tr.trail.length; i++) {
        const a = tr.trail[i - 1];
        const b = tr.trail[i];
        const segRatio = i / (tr.trail.length - 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = this.config.weather === 'typhoon'
          ? `rgba(186, 230, 253, ${(baseAlpha * segRatio).toFixed(2)})`
          : `rgba(241, 245, 249, ${(baseAlpha * segRatio).toFixed(2)})`;
        ctx.lineWidth = tr.width * (0.4 + segRatio * 0.8);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // 3. 비·눈 입자 렌더링
    for (const p of this.particles) {
      const g = leftGuard(p.x);
      if (p.kind === 'rain') {
        const a = p.alpha * g;
        if (a <= 0.02) continue;
        const dx = (p.vx / p.vy) * p.len;
        const grad = ctx.createLinearGradient(p.x - dx, p.y - p.len, p.x, p.y);
        grad.addColorStop(0, `rgba(147, 197, 253, 0)`);
        grad.addColorStop(0.5, `rgba(186, 230, 253, ${(a * 0.65).toFixed(2)})`);
        grad.addColorStop(1, `rgba(224, 242, 254, ${a.toFixed(2)})`);
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - p.len);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.8 + p.depth * 1.0;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        const a = p.alpha * g;
        if (a <= 0.02) continue;
        if (p.isCrystal) {
          this.drawSnowCrystal(ctx, p.x, p.y, p.r * 1.45, p.rot, a);
        } else {
          const rad = p.r;
          const sg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
          sg.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(2)})`);
          sg.addColorStop(0.55, `rgba(224, 242, 254, ${(a * 0.68).toFixed(2)})`);
          sg.addColorStop(1, `rgba(224, 242, 254, 0)`);
          ctx.beginPath();
          ctx.fillStyle = sg;
          ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. 빗방울 노면 착지 물보라 리플
    for (const sp of this.splashes) {
      const progress = sp.age / sp.maxAge;
      const a = (1 - progress) * 0.45 * leftGuard(sp.x);
      const rx = sp.r * (0.4 + progress * 1.2);
      const ry = rx * 0.36;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(186, 230, 253, ${a.toFixed(2)})`;
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    // 5. 한파 다이아몬드 더스트 빙정 반짝임
    if (this.crystals.length) {
      for (const c of this.crystals) {
        const pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(this.elapsed * c.spd + c.phase), 2);
        const a = 0.65 * pulse * leftGuard(c.x);
        this.drawSnowCrystal(ctx, c.x, c.y, c.r * 2.1, this.elapsed * 0.25 + c.phase, a);
      }
    }

    ctx.restore();
  }

  start() {
    if (this.rafId || this.reducedMotion) return;
    this.lastTs = performance.now();
    const tick = (now) => {
      if (!this.isVisible || !this.canvas.isConnected) {
        this.rafId = null;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.004, (now - this.lastTs) / 1000));
      this.lastTs = now;
      this.step(dt);
      this.draw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    this.interObserver?.disconnect();
  }
}

function clampDensity(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function attachWeatherParticles(containerEl, config = {}) {
  if (!containerEl || typeof document === 'undefined') return null;
  let canvas = containerEl.querySelector('canvas.hs-particle-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'hs-layer hs-particle-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    containerEl.appendChild(canvas);
  }
  const existing = activeEngines.get(canvas);
  if (existing) {
    existing.updateConfig(config);
    return existing;
  }
  const ctrl = new WeatherParticleController(canvas, config);
  activeEngines.set(canvas, ctrl);
  return ctrl;
}

export function detachWeatherParticles(containerEl) {
  const canvas = containerEl?.querySelector('canvas.hs-particle-canvas');
  if (!canvas) return;
  const existing = activeEngines.get(canvas);
  if (existing) {
    existing.destroy();
    activeEngines.delete(canvas);
  }
  canvas.remove();
}
