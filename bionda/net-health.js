// 30분 이상 API 호출 연속 실패 시 중앙 "! 통합인증 로그인을 확인해 주세요" 안내 모듈
// (새벽 04~05시 사내 네트워크 단절 / 통합인증 세션 만료 대응 · 전 페이지 공유)

export const NET_HEALTH_KEY = 'weather-watch:net-health:v1';
export const AUTH_ALERT_THRESHOLD_MS = 30 * 60 * 1000; // 30분 누적 실패 기준
export const STREAK_GAP_RESET_MS = 20 * 60 * 1000;     // 20분 이상 공백(절전/종료 후 재실행) 시 새 카운트
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
  const gapResetMs = Number.isFinite(options.gapResetMs) ? options.gapResetMs : STREAK_GAP_RESET_MS;
  if (!state || !Number.isFinite(state.firstFailedAtMs) || !Number.isFinite(state.lastFailedAtMs)) {
    return { shouldAlert: false, isFailing: false, elapsedMs: 0, elapsedMinutes: 0, snoozed: false };
  }
  // 마지막 실패 후 장시간 경과(절전 복귀 등)했다면 과거 실패 기록으로 오알람 방지
  if (nowMs - state.lastFailedAtMs > gapResetMs) {
    return { shouldAlert: false, isFailing: false, elapsedMs: 0, elapsedMinutes: 0, snoozed: false };
  }
  const elapsedMs = Math.max(0, nowMs - state.firstFailedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const thresholdReached = elapsedMs >= thresholdMs && (state.consecutiveFailures || 0) >= 2;
  const snoozed = Number.isFinite(state.snoozedUntilMs) && nowMs < state.snoozedUntilMs;
  return {
    shouldAlert: thresholdReached && !snoozed,
    isFailing: (state.consecutiveFailures || 0) > 0,
    thresholdReached,
    snoozed,
    elapsedMs,
    elapsedMinutes
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
        border: 1.5px solid #38bdf8;
        background: #0ea5e9;
        color: #031525;
        font-size: clamp(14px, 1.15vw, 17px);
        font-weight: 800;
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
      <h2 id="netAuthAlertTitle" class="net-auth-title">! 통합인증 로그인을 확인해 주세요</h2>
      <p class="net-auth-desc">
        기상·도로정보 API 호출이 <b>30분 이상</b> 연속 실패하고 있습니다.<br>
        새벽(04~05시) 사내 네트워크 단절 또는 통합인증 세션 만료 여부를 확인한 뒤 다시 연결해 주세요.
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

export function syncAuthAlertModal(nowMs = Date.now()) {
  if (typeof document === 'undefined') return null;
  const state = readNetHealthState();
  const verdict = evaluateAuthAlert(state, nowMs);
  const modal = document.getElementById('netAuthAlertModal');
  if (!modal) return verdict;

  if (verdict.shouldAlert) {
    const meta = modal.querySelector('#netAuthAlertMeta');
    if (meta) {
      const parts = [
        `<span>연속 실패 <b>${verdict.elapsedMinutes}분</b> (${state.consecutiveFailures}회)</span>`,
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
