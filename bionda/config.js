// 공개 백엔드 API 서버 설정 및 실시간/정적 모드 판별 (API 키 등 비밀정보는 절대 여기에 저장하지 않음)

/**
 * Node 백엔드(server.js) 공개 HTTPS 주소
 * - 같은 서버(Node server.js · Render · Railway · localhost)에서 접속할 때는 ''(빈 문자열)이면 동일 도메인 '/api/*'를 사용합니다.
 * - GitHub Pages 등 정적 호스팅에서 별도 Node 백엔드(예: Render)의 실시간 기상청 관측을 연동하려면
 *   아래 DEFAULT_API_BASE에 'https://your-service.onrender.com' 형태를 지정하거나 설정 메뉴에서 입력할 수 있습니다.
 */
export const DEFAULT_API_BASE = '';

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

export function getApiBase() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = sanitizeApiBase(localStorage.getItem(API_BASE_STORAGE_KEY) || '');
      if (saved) return saved;
    }
  } catch {}
  return sanitizeApiBase(DEFAULT_API_BASE);
}

export function setApiBase(raw) {
  const clean = sanitizeApiBase(raw);
  try {
    if (typeof localStorage !== 'undefined') {
      if (clean) localStorage.setItem(API_BASE_STORAGE_KEY, clean);
      else localStorage.removeItem(API_BASE_STORAGE_KEY);
    }
  } catch {}
  backendState = null;
  backendPromise = null;
  return clean;
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
  if (!force && backendState && backendState.base === base && now - backendState.checkedAt < 180000) {
    return backendState;
  }
  if (!force && backendPromise) return backendPromise;

  backendPromise = (async () => {
    const timeoutMs = base ? 9000 : 2500;
    try {
      const res = await fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const health = await res.json();
        if (health?.status === 'ok') {
          backendState = {
            available: true,
            base,
            health,
            checkedAt: Date.now()
          };
          return backendState;
        }
      }
    } catch {}
    backendState = {
      available: false,
      base,
      health: null,
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
