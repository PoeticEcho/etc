// 실시간 데이터 10분 이상 미갱신 또는 API 연속 실패 시 중앙 안내 팝업 모듈
// (새벽 04~05시 사내 네트워크 단절 · 통합인증 세션 만료 · 인터넷 접속 이상 대응 · 전 페이지 공유)

export const NET_HEALTH_KEY = 'weather-watch:net-health:v1';
export const STALE_DATA_THRESHOLD_MS = 10 * 60 * 1000; // 실시간 데이터 10분 이상 미갱신 기준
export const AUTH_ALERT_THRESHOLD_MS = 10 * 60 * 1000; // API 연속 실패 누적 10분 기준
export const STREAK_GAP_RESET_MS = 20 * 60 * 1000;     // 20분 이상 공백(절전/종료 후 재실행) 시 새 카운트
export const STALE_MAX_WINDOW_MS = 12 * 3600 * 1000;   // 12시간 이상 지난 구기록은 초기 진입 오알람 방지
export const BOOT_GRACE_MS = 90 * 1000;                // 페이지 최초 진입 90초간 로딩 유예
export const AUTH_ALERT_SNOOZE_MS = 10 * 60 * 1000;    // 임시 닫기 시 10분 후 재표출

function defaultState() {
  return {
    firstFailedAtMs: null,
    lastFailedAtMs: null,
    lastSuccessAtMs: null,
    consecutiveFailures: 0,
    lastError: '',
    lastSource: '',
    snoozedUntilMs: 0
  };
}

function getSafeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readNetHealthState(storage = null) {
  const store = getSafeStorage(storage);
  if (!store) return defaultState();
  try {
    const raw = JSON.parse(store.getItem(NET_HEALTH_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return defaultState();
    return {
      firstFailedAtMs: Number.isFinite(raw.firstFailedAtMs) ? raw.firstFailedAtMs : null,
      lastFailedAtMs: Number.isFinite(raw.lastFailedAtMs) ? raw.lastFailedAtMs : null,
      lastSuccessAtMs: Number.isFinite(raw.lastSuccessAtMs) ? raw.lastSuccessAtMs : null,
      consecutiveFailures: Number.isFinite(raw.consecutiveFailures) ? raw.consecutiveFailures : 0,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : '',
      lastSource: typeof raw.lastSource === 'string' ? raw.lastSource : '',
      snoozedUntilMs: Number.isFinite(raw.snoozedUntilMs) ? raw.snoozedUntilMs : 0
    };
  } catch {
    return defaultState();
  }
}

export function writeNetHealthState(state, storage = null) {
  const store = getSafeStorage(storage);
  if (!store) return state;
  try {
    store.setItem(NET_HEALTH_KEY, JSON.stringify(state));
  } catch {}
  return state;
}

export function recordApiSuccess(source = '', nowMs = Date.now(), storage = null) {
  const prev = readNetHealthState(storage);
  const next = {
    ...prev,
    firstFailedAtMs: null,
    lastFailedAtMs: null,
    lastSuccessAtMs: nowMs,
    consecutiveFailures: 0,
    lastError: '',
    lastSource: source || prev.lastSource || '',
    snoozedUntilMs: 0
  };
  return writeNetHealthState(next, storage);
}

export function recordApiFailure(source = '', errorMsg = '', nowMs = Date.now(), storage = null, options = {}) {
  const gapResetMs = Number.isFinite(options.gapResetMs) ? options.gapResetMs : STREAK_GAP_RESET_MS;
  const prev = readNetHealthState(storage);
  const isStaleGap =
    !Number.isFinite(prev.firstFailedAtMs) ||
    !Number.isFinite(prev.lastFailedAtMs) ||
    nowMs < prev.lastFailedAtMs ||
    (nowMs - prev.lastFailedAtMs > gapResetMs);

  const next = {
    ...prev,
    firstFailedAtMs: isStaleGap ? nowMs : prev.firstFailedAtMs,
    lastFailedAtMs: nowMs,
    consecutiveFailures: isStaleGap ? 1 : prev.consecutiveFailures + 1,
    lastError: String(errorMsg || '네트워크 응답 없음').slice(0, 180),
    lastSource: source || prev.lastSource || ''
  };
  return writeNetHealthState(next, storage);
}

export function snoozeNetHealthAlert(nowMs = Date.now(), snoozeMs = AUTH_ALERT_SNOOZE_MS, storage = null) {
  const prev = readNetHealthState(storage);
  const next = { ...prev, snoozedUntilMs: nowMs + snoozeMs };
  return writeNetHealthState(next, storage);
}

export function evaluateAuthAlert(state, nowMs = Date.now(), options = {}) {
  const thresholdMs = Number.isFinite(options.thresholdMs) ? options.thresholdMs : AUTH_ALERT_THRESHOLD_MS;
  const staleThresholdMs = Number.isFinite(options.staleThresholdMs) ? options.staleThresholdMs : STALE_DATA_THRESHOLD_MS;
  const gapResetMs = Number.isFinite(options.gapResetMs) ? options.gapResetMs : STREAK_GAP_RESET_MS;
  const bootGraceMs = Number.isFinite(options.bootGraceMs) ? options.bootGraceMs : BOOT_GRACE_MS;
  const sessionStartMs = Number.isFinite(options.sessionStartMs) ? options.sessionStartMs : null;

  if (!state) {
    return { shouldAlert: false, isFailing: false, reason: null, elapsedMs: 0, elapsedMinutes: 0, snoozed: false };
  }

  const snoozed = Number.isFinite(state.snoozedUntilMs) && nowMs < state.snoozedUntilMs;

  // 1) API 호출 연속 실패 누적 판정 (절전 공백 > gapResetMs 시 오알람 방지)
  if (
    Number.isFinite(state.firstFailedAtMs) &&
    Number.isFinite(state.lastFailedAtMs) &&
    nowMs - state.lastFailedAtMs <= gapResetMs
  ) {
    const elapsedMs = Math.max(0, nowMs - state.firstFailedAtMs);
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const thresholdReached = elapsedMs >= thresholdMs && (state.consecutiveFailures || 0) >= 2;
    if (thresholdReached) {
      return {
        shouldAlert: !snoozed,
        isFailing: true,
        reason: 'api-failure',
        thresholdReached: true,
        snoozed,
        elapsedMs,
        elapsedMinutes
      };
    }
  }

  // 2) 실시간 데이터 미갱신(10분 이상) 판정 — 페이지 최초 진입 로딩 유예(90초) 후 체크
  const pastBootGrace = sessionStartMs === null || (nowMs - sessionStartMs >= bootGraceMs);
  if (pastBootGrace && Number.isFinite(state.lastSuccessAtMs)) {
    const staleMs = Math.max(0, nowMs - state.lastSuccessAtMs);
    if (staleMs >= staleThresholdMs && staleMs <= STALE_MAX_WINDOW_MS) {
      return {
        shouldAlert: !snoozed,
        isFailing: (state.consecutiveFailures || 0) > 0,
        reason: 'data-stale',
        thresholdReached: true,
        snoozed,
        elapsedMs: staleMs,
        elapsedMinutes: Math.floor(staleMs / 60000)
      };
    }
  }

  return {
    shouldAlert: false,
    isFailing: (state.consecutiveFailures || 0) > 0 && Number.isFinite(state.lastFailedAtMs) && (nowMs - state.lastFailedAtMs <= gapResetMs),
    reason: null,
    thresholdReached: false,
    snoozed,
    elapsedMs: 0,
    elapsedMinutes: 0
  };
}

function formatKstShort(ms) {
  if (!Number.isFinite(ms)) return '기록 없음';
  const d = new Date(ms + 9 * 3600000);
  const p = v => String(v).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

let mountedMonitor = null;

function ensureModalDom(onRetry) {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('netAuthAlertModal');
  if (el) return el;

  const styleId = 'netAuthAlertStyle';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .net-auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(6, 13, 24, 0.78);
        backdrop-filter: blur(6px);
        animation: netAuthFadeIn 0.35s ease-out;
      }
      @keyframes netAuthFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .net-auth-overlay[hidden] { display: none !important; }
      .net-auth-card {
        width: min(680px, 100%);
        background: #101c2d;
        color: #f4f8ff;
        border: 3px solid #f87171;
        border-radius: 20px;
        padding: 28px 30px;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.65), 0 0 0 6px rgba(248, 113, 113, 0.22);
        text-align: center;
        font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        animation: netAuthPopIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes netAuthPopIn {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .net-auth-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 68px;
        height: 68px;
        border-radius: 50%;
        background: rgba(248, 113, 113, 0.18);
        border: 2.5px solid #f87171;
        color: #fca5a5;
        font-size: 38px;
        font-weight: 900;
        margin-bottom: 14px;
      }
      .net-auth-title {
        margin: 0 0 10px;
        font-size: clamp(22px, 2.2vw, 32px);
        font-weight: 900;
        letter-spacing: -0.02em;
        color: #fff;
      }
      .net-auth-desc {
        margin: 0 auto 14px;
        font-size: clamp(14.5px, 1.25vw, 18px);
        line-height: 1.55;
        color: #d6e4f5;
        max-width: 560px;
      }
      .net-auth-meta {
        display: inline-flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px 16px;
        padding: 10px 16px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(148, 163, 184, 0.24);
        font-size: clamp(12.5px, 1.05vw, 15px);
        color: #cbd5e1;
        margin-bottom: 20px;
      }
      .net-auth-meta b { color: #fde68a; }
      .net-auth-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px;
      }
      .net-auth-btn-primary {
        padding: 12px 24px;
        border-radius: 12px;
        border: 1.5px solid #38dbf8;
        background: #38dbf8;
        color: #031525;
        font-size: clamp(14px, 1.15vw, 17px);
        font-weight: 850;
        cursor: pointer;
      }
      .net-auth-btn-primary:hover { filter: brightness(1.08); }
      .net-auth-btn-secondary {
        padding: 12px 18px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.42);
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        font-size: clamp(13.5px, 1.05vw, 16px);
        font-weight: 700;
        cursor: pointer;
      }
      .net-auth-btn-secondary:hover { background: rgba(255, 255, 255, 0.14); }
      @media (max-width: 600px) {
        .net-auth-card { padding: 22px 18px; }
        .net-auth-badge { width: 54px; height: 54px; font-size: 30px; }
      }
    `;
    document.head.appendChild(style);
  }

  el = document.createElement('div');
  el.id = 'netAuthAlertModal';
  el.className = 'net-auth-overlay';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'netAuthAlertTitle');
  el.hidden = true;
  el.innerHTML = `
    <div class="net-auth-card">
      <div class="net-auth-badge" aria-hidden="true">!</div>
      <h2 id="netAuthAlertTitle" class="net-auth-title">! 통합인증 로그인 · 인터넷 접속을 확인해 주세요</h2>
      <p id="netAuthAlertDesc" class="net-auth-desc">
        실시간 기상·도로 데이터가 <b>10분 이상</b> 업데이트되지 않았습니다.<br>
        사내 통합인증 로그인 만료 여부 또는 인터넷 접속 상태를 확인한 뒤 다시 연결해 주세요.
      </p>
      <div id="netAuthAlertMeta" class="net-auth-meta"></div>
      <div class="net-auth-actions">
        <button type="button" id="netAuthRetryBtn" class="net-auth-btn-primary">↻ 지금 다시 연결</button>
        <button type="button" id="netAuthSnoozeBtn" class="net-auth-btn-secondary">잠시 닫기 (10분 후 재알림)</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector('#netAuthRetryBtn').addEventListener('click', () => {
    if (typeof onRetry === 'function') {
      try { onRetry(); } catch {}
    } else {
      window.location.reload();
    }
  });
  el.querySelector('#netAuthSnoozeBtn').addEventListener('click', () => {
    snoozeNetHealthAlert();
    syncAuthAlertModal();
  });
  return el;
}

let monitorSessionStartMs = Date.now();

export function syncAuthAlertModal(nowMs = Date.now()) {
  if (typeof document === 'undefined') return null;
  const state = readNetHealthState();
  const verdict = evaluateAuthAlert(state, nowMs, { sessionStartMs: monitorSessionStartMs });
  const modal = document.getElementById('netAuthAlertModal');
  if (!modal) return verdict;

  if (verdict.shouldAlert) {
    const titleEl = modal.querySelector('#netAuthAlertTitle');
    const descEl = modal.querySelector('#netAuthAlertDesc');
    if (titleEl && descEl) {
      if (verdict.reason === 'api-failure') {
        titleEl.textContent = '! 통합인증 로그인 · 인터넷 접속을 확인해 주세요';
        descEl.innerHTML = '기상·도로정보 API 호출이 <b>10분 이상</b> 연속 실패하고 있습니다.<br>사내 네트워크 단절, 인터넷 접속 상태 또는 통합인증 로그인 만료 여부를 확인한 뒤 다시 연결해 주세요.';
      } else {
        titleEl.textContent = '! 실시간 데이터 10분 이상 미갱신 — 접속 확인 필요';
        descEl.innerHTML = '실시간 기상·도로 데이터가 <b>10분 이상</b> 업데이트되지 않았습니다.<br>통합인증 로그인 세션 만료 또는 인터넷 접속 상태를 확인한 뒤 다시 연결해 주세요.';
      }
    }
    const meta = modal.querySelector('#netAuthAlertMeta');
    if (meta) {
      const parts = verdict.reason === 'api-failure'
        ? [
            `<span>연속 실패 <b>${verdict.elapsedMinutes}분</b> (${state.consecutiveFailures}회)</span>`,
            `<span>마지막 정상 수신: <b>${formatKstShort(state.lastSuccessAtMs)}</b></span>`
          ]
        : [
            `<span>실시간 미갱신 <b>${verdict.elapsedMinutes}분 경과</b></span>`,
            `<span>마지막 정상 수신: <b>${formatKstShort(state.lastSuccessAtMs)}</b></span>`
          ];
      if (state.lastError) {
        const safeErr = state.lastError.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        parts.push(`<span>최근 상태: ${safeErr}</span>`);
      }
      meta.innerHTML = parts.join('');
    }
    modal.hidden = false;
  } else {
    modal.hidden = true;
  }
  return verdict;
}

export function reportApiSuccess(source = '', nowMs = Date.now()) {
  const next = recordApiSuccess(source, nowMs);
  syncAuthAlertModal(nowMs);
  return next;
}

export function reportApiFailure(source = '', errorMsg = '', nowMs = Date.now()) {
  const next = recordApiFailure(source, errorMsg, nowMs);
  syncAuthAlertModal(nowMs);
  return next;
}

export function mountNetHealthMonitor({ onRetry } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  monitorSessionStartMs = Date.now();
  ensureModalDom(onRetry);
  syncAuthAlertModal();
  if (!mountedMonitor) {
    const timer = setInterval(() => {
      if (!document.hidden) syncAuthAlertModal();
    }, 30000);
    const onStorage = (e) => {
      if (e.key === NET_HEALTH_KEY) syncAuthAlertModal();
    };
    window.addEventListener('storage', onStorage);
    mountedMonitor = { timer, onStorage };
  }
  return mountedMonitor;
}
