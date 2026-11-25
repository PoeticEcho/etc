// 50인치 TV 장시간 표출용 잔상(번인) 방지 모듈 (기본 3종 세트 · 전 페이지 설정 공유)
// 1) 미세 픽셀 이동: 3분마다 단 1px씩 부드럽게 이동(±4px 궤도) → 어지러움 0%, 텍스트·경계선 잔상 분산
// 2) 주기적 리프레시 스캔: 45분마다 2.8초간 어두운 반투명 그라데이션 띠 1회 통과 → 단색 블록·액정 고착 완화
// 3) 평시 미세 휘도 완화: 안전(0~1단계)·무특보 시 92% 유지, 주의·위험·특보 발생 시 즉시 100% 복귀

export const TV_GUARD_KEY = 'weather-watch:tv-burnin:v1';
export const SHIFT_INTERVAL_MS = 3 * 60 * 1000;   // 3분마다 1px 이동
export const SWEEP_INTERVAL_MS = 45 * 60 * 1000;  // 45분마다 2.8초 부드러운 리프레시 스캔
export const IDLE_GRACE_MS = 20 * 1000;           // 마우스/키보드 조작 직후 20초간 이동 보류
export const CALM_BRIGHTNESS = 0.92;              // 평시 휘도 92% (경보 시 100%)
export const TV_MIN_WIDTH = 1024;                 // 데스크톱/50인치 TV 폭에서만 작동 (모바일 자동 비활성)

/**
 * 인접 스텝 간 거리가 정확히 1px인 36-스텝 폐곡선 궤도 (범위: x ∈ [-4, 4], y ∈ [-4, 4])
 * 한 번에 1px만 2.4초에 걸쳐 움직이므로 시각적 어지러움이 전혀 없음.
 */
export const PIXEL_ORBIT_STEPS = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [4, 1], [4, 2], [4, 3], [4, 4],
  [3, 4], [2, 4], [1, 4], [0, 4], [-1, 4], [-2, 4], [-3, 4], [-4, 4],
  [-4, 3], [-4, 2], [-4, 1], [-4, 0], [-4, -1], [-4, -2], [-4, -3], [-4, -4],
  [-3, -4], [-2, -4], [-1, -4], [0, -4], [1, -4], [2, -4], [3, -4], [4, -4],
  [4, -3], [4, -2], [4, -1],
  [3, -1], [2, -1], [1, -1], [0, -1]
];

function getSafeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readTvGuardEnabled(storage = null) {
  const store = getSafeStorage(storage);
  if (!store) return true;
  try {
    const raw = store.getItem(TV_GUARD_KEY);
    if (raw === null) return true; // 기본 ON
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed.enabled === 'boolean') return parsed.enabled;
    return true;
  } catch {
    return true;
  }
}

export function writeTvGuardEnabled(enabled, storage = null) {
  const store = getSafeStorage(storage);
  const val = Boolean(enabled);
  if (store) {
    try {
      store.setItem(TV_GUARD_KEY, JSON.stringify({ enabled: val, updatedAt: Date.now() }));
    } catch {}
  }
  return val;
}

export function getOrbitOffset(stepIndex) {
  const len = PIXEL_ORBIT_STEPS.length;
  const idx = ((Number(stepIndex) || 0) % len + len) % len;
  const [dx, dy] = PIXEL_ORBIT_STEPS[idx];
  return { dx, dy, step: idx };
}

export function computeTargetBrightness({ enabled = true, isAlert = false, isDesktop = true, isLightMode = false } = {}) {
  if (!enabled || !isDesktop) return 1;
  if (isAlert || isLightMode) return 1;
  return CALM_BRIGHTNESS;
}

function ensureGuardStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('tvGuardStyle')) return;
  const style = document.createElement('style');
  style.id = 'tvGuardStyle';
  style.textContent = `
    body.tv-guard-on {
      overflow-x: hidden;
    }
    .tv-guard-shift-main {
      transition: transform 2.4s ease-in-out, filter 1.2s ease;
      will-change: transform;
    }
    .tv-guard-shift-bar {
      transition: transform 2.4s ease-in-out;
      will-change: transform;
    }
    .tv-guard-dim-header {
      transition: filter 1.2s ease;
    }
    .tv-guard-sweep {
      position: fixed;
      left: 0;
      right: 0;
      top: -20vh;
      height: 18vh;
      z-index: 900;
      pointer-events: none;
      opacity: 0;
      background: linear-gradient(
        180deg,
        rgba(7, 17, 30, 0) 0%,
        rgba(7, 17, 30, 0.30) 42%,
        rgba(56, 189, 248, 0.07) 56%,
        rgba(7, 17, 30, 0) 100%
      );
      transform: translate3d(0, 0, 0);
    }
    .tv-guard-sweep.is-running {
      opacity: 1;
      animation: tvGuardSweepAnim 2.8s cubic-bezier(0.35, 0, 0.65, 1) forwards;
    }
    @keyframes tvGuardSweepAnim {
      0% { transform: translate3d(0, 0, 0); opacity: 0.9; }
      85% { opacity: 0.9; }
      100% { transform: translate3d(0, 128vh, 0); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tv-guard-shift-main,
      .tv-guard-shift-bar {
        transition: none !important;
        transform: none !important;
      }
      .tv-guard-sweep {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureSweepDom() {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('tvGuardSweepBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tvGuardSweepBar';
    el.className = 'tv-guard-sweep';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * TV 잔상방지 3종 세트 마운트
 * @param {object} options
 * @param {string} [options.mainSelector='main']
 * @param {string} [options.headerSelector='header.top-header']
 * @param {string} [options.headerInnerSelector='header.top-header > .bar']
 * @param {function} [options.onStateChange]
 */
export function mountTvGuard({
  mainSelector = 'main',
  headerSelector = 'header.top-header',
  headerInnerSelector = 'header.top-header > .bar',
  onStateChange = null
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      isEnabled: () => false,
      setEnabled: () => false,
      toggle: () => false,
      setAlertActive: () => {},
      triggerSweep: () => {},
      getStatus: () => ({ enabled: false, active: false, dx: 0, dy: 0, brightness: 1 })
    };
  }

  ensureGuardStyle();
  const sweepEl = ensureSweepDom();

  let enabled = readTvGuardEnabled();
  let isAlert = false;
  let stepIndex = 0;
  let lastInteractionAt = 0;
  let sweepTimer = null;

  const isReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  const isDesktop = () => window.innerWidth >= TV_MIN_WIDTH;
  const isLightMode = () => !document.body.classList.contains('dark-mode') && !document.body.classList.contains('rwis-page');
  let lastLightMode = isLightMode();

  const getMain = () => document.querySelector(mainSelector);
  const getHeader = () => document.querySelector(headerSelector);
  const getHeaderInner = () => document.querySelector(headerInnerSelector);

  function applyVisuals() {
    const desktop = isDesktop();
    const light = isLightMode();
    lastLightMode = light;
    const active = enabled && desktop;
    const reduced = isReducedMotion();
    const brightness = computeTargetBrightness({ enabled, isAlert, isDesktop: desktop, isLightMode: light });
    const { dx, dy } = (active && !reduced) ? getOrbitOffset(stepIndex) : { dx: 0, dy: 0 };

    document.body.classList.toggle('tv-guard-on', active);

    const mainEl = getMain();
    if (mainEl) {
      mainEl.classList.add('tv-guard-shift-main');
      mainEl.style.transform = (dx || dy) ? `translate3d(${dx}px, ${dy}px, 0)` : '';
      mainEl.style.filter = brightness < 1 ? `brightness(${brightness})` : '';
    }

    const hdrEl = getHeader();
    if (hdrEl) {
      hdrEl.classList.add('tv-guard-dim-header');
      hdrEl.style.filter = brightness < 1 ? `brightness(${brightness})` : '';
    }

    const barEl = getHeaderInner();
    if (barEl) {
      barEl.classList.add('tv-guard-shift-bar');
      // 상단 바는 좌우(±4px)만 미세 이동해 헤더 상단 틈새 없이 로고·탭 잔상 분산
      barEl.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : '';
    }

    if (typeof onStateChange === 'function') {
      onStateChange({ enabled, active, isAlert, dx, dy, brightness, step: stepIndex });
    }
  }

  function triggerSweep() {
    if (!sweepEl || !enabled || !isDesktop() || isReducedMotion() || document.hidden) return;
    sweepEl.classList.remove('is-running');
    // Force reflow to restart animation cleanly
    void sweepEl.offsetWidth;
    sweepEl.classList.add('is-running');
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      sweepEl.classList.remove('is-running');
    }, 3100);
  }

  // 3분 주기 1px 미세 픽셀 이동 (사용자 조작 직후 20초 이내면 잠시 보류)
  setInterval(() => {
    if (!enabled || !isDesktop() || document.hidden || isReducedMotion()) return;
    if (Date.now() - lastInteractionAt < IDLE_GRACE_MS) return;
    stepIndex = (stepIndex + 1) % PIXEL_ORBIT_STEPS.length;
    applyVisuals();
  }, SHIFT_INTERVAL_MS);

  // 45분 주기 2.8초 부드러운 리프레시 스캔
  setInterval(() => {
    triggerSweep();
  }, SWEEP_INTERVAL_MS);

  // 사용자 마우스/터치/키보드 조작 감지
  const markInteraction = () => { lastInteractionAt = Date.now(); };
  window.addEventListener('pointerdown', markInteraction, { passive: true });
  window.addEventListener('keydown', markInteraction, { passive: true });

  // 창 크기 변경 (PC/TV ↔ 모바일 전환), 라이트/다크 전환 및 탭 간 ON/OFF 실시간 동기화
  window.addEventListener('resize', applyVisuals, { passive: true });
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      const curLight = isLightMode();
      if (curLight !== lastLightMode) applyVisuals();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === TV_GUARD_KEY) {
      enabled = readTvGuardEnabled();
      if (!enabled) stepIndex = 0;
      applyVisuals();
    }
  });

  applyVisuals();

  return {
    isEnabled: () => enabled,
    setEnabled(next) {
      enabled = writeTvGuardEnabled(Boolean(next));
      if (!enabled) stepIndex = 0;
      applyVisuals();
      return enabled;
    },
    toggle() {
      return this.setEnabled(!enabled);
    },
    setAlertActive(alertOn) {
      const next = Boolean(alertOn);
      if (isAlert !== next) {
        isAlert = next;
        applyVisuals();
      }
    },
    triggerSweep,
    getStatus() {
      const desktop = isDesktop();
      const active = enabled && desktop;
      const { dx, dy } = active ? getOrbitOffset(stepIndex) : { dx: 0, dy: 0 };
      return {
        enabled,
        active,
        isAlert,
        dx,
        dy,
        brightness: computeTargetBrightness({ enabled, isAlert, isDesktop: desktop, isLightMode: isLightMode() }),
        step: stepIndex
      };
    }
  };
}
