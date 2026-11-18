// 공개 백엔드 API 서버 설정 및 실시간/정적 모드 판별 (API 키 등 비밀정보는 절대 여기에 저장하지 않음)

/**
 * GitHub Pages 등 정적 호스팅에서 기본으로 자동 연결할 Cloudflare Pages Functions 백엔드 HTTPS 주소
 * - Cloudflare Pages(*.bionda.pages.dev / bionda.pages.dev) 및 로컬 Node에서는 동일 도메인 '/api/*'를 자동 사용합니다.
 * - GitHub Pages(*.github.io) / file:에서 접속 시 별도 입력 없이 자동으로 아래 백엔드(bionda.pages.dev)를 사용합니다.
 */
export const DEFAULT_API_BASE = 'https://bionda.pages.dev';

const API_BASE_STORAGE_KEY = 'weather-watch:api-base';

export function sanitizeApiBase(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && isLocal)) {
      return u.origin + u.pathname.replace(/\/+$/, '');
    }
  } catch {}
  return '';
}

function isSelfPagesHost() {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const h = String(window.location.hostname || '').toLowerCase();
    return h === 'bionda.pages.dev' || h.endsWith('.bionda.pages.dev');
  } catch {
    return false;
  }
}

function shouldUseDefaultExternalBase() {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    if (isSelfPagesHost()) return false;
    const h = String(window.location.hostname || '').toLowerCase();
    return h.endsWith('.github.io') || h.endsWith('.pages.dev') || window.location.protocol === 'file:';
  } catch {
    return false;
  }
}

export function getApiBase() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(API_BASE_STORAGE_KEY);
      if (saved !== null) {
        const clean = sanitizeApiBase(saved);
        if (clean === 'https://bionda-api.herego.workers.dev' || clean === 'https://bionda.herego.workers.dev') {
          return isSelfPagesHost() ? '' : sanitizeApiBase(DEFAULT_API_BASE);
        }
        return clean;
      }
    }
  } catch {}
  return shouldUseDefaultExternalBase() ? sanitizeApiBase(DEFAULT_API_BASE) : '';
}

export function setApiBase(raw) {
  const trimmed = String(raw || '').trim();
  const clean = sanitizeApiBase(trimmed);
  try {
    if (typeof localStorage !== 'undefined') {
      if (trimmed) localStorage.setItem(API_BASE_STORAGE_KEY, clean);
      else localStorage.removeItem(API_BASE_STORAGE_KEY);
    }
  } catch {}
  backendState = null;
  backendPromise = null;
  return getApiBase();
}

export function apiUrl(path) {
  const cleanPath = String(path || '').startsWith('/') ? path : '/' + String(path || '');
  const base = getApiBase();
  return base ? `${base}${cleanPath}` : cleanPath;
}

let backendState = null;
let backendPromise = null;

export async function probeBackend(force = false) {
  const base = getApiBase();
  const now = Date.now();
  const ttl = backendState?.available ? 180000 : 45000;
  if (!force && backendState && backendState.base === base && now - backendState.checkedAt < ttl) {
    return backendState;
  }
  if (!force && backendPromise) return backendPromise;

  backendPromise = (async () => {
    const timeoutMs = base ? 9000 : 2500;
    let errorMsg = '';
    try {
      const res = await fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const health = await res.json();
        if (health?.status === 'ok') {
          backendState = {
            available: true,
            base,
            health,
            error: '',
            checkedAt: Date.now()
          };
          return backendState;
        }
        errorMsg = '응답 형식 오류';
      } else {
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (e) {
      errorMsg = e?.name === 'TimeoutError' ? '응답 시간초과' : '연결 차단(TLS/네트워크) 또는 오프라인';
    }
    backendState = {
      available: false,
      base,
      health: null,
      error: errorMsg,
      checkedAt: Date.now()
    };
    return backendState;
  })();

  try {
    return await backendPromise;
  } finally {
    backendPromise = null;
  }
}

export async function isBackendAvailable(force = false) {
  const st = await probeBackend(force);
  return !!st.available;
}

export function getBackendStatusSnapshot() {
  return backendState;
}
