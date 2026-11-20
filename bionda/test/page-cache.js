/**
 * 페이지(상황판 index.html / 1시간 단기예보 hourly.html) 간 빠른 전환(0ms 즉시 복원) 및
 * 머무름(3분) 백그라운드 SWR(Stale-While-Revalidate) 최신화를 위한 경량 로컬 캐시 유틸리티
 */

export const CACHE_PREFIX = 'bionda-review:cache:';
export const DEFAULT_FRESH_MS = 5 * 60000;      // 5분: 페이지 왕복 전환 시 즉시 표출 및 중복 호출 방지
export const DEFAULT_STALE_MAX_MS = 20 * 60000; // 20분: 초과 시 폐기, 5~20분 사이는 먼저 표출 후 즉시 SWR
export const DEFAULT_DWELL_MS = 3 * 60000;      // 3분: 캐시 화면에 3분 이상 머무르면 조용히 백그라운드 갱신
export const OVERVIEW_REFRESH_MS = 5 * 60000;   // 도로기상 상황판 정기 자동 갱신 주기 (5분)
export const HOURLY_REFRESH_MS = 10 * 60000;    // 1시간 단기예보 정기 자동 갱신 주기 (10분 · 정시·36분 별도)

export function currentKstHourKey(nowMs = Date.now()) {
  return new Date(nowMs + 9 * 3600000).toISOString().slice(0, 13);
}

function getDefaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function clearPageCache(key, storage = getDefaultStorage()) {
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {}
}

export function prunePageCaches(excludeKey = null, storage = getDefaultStorage()) {
  if (!storage) return;
  try {
    const toRemove = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && k !== excludeKey) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      storage.removeItem(k);
    }
  } catch {}
}

export function readPageCache(
  key,
  { expectedScope = null, maxStaleMs = DEFAULT_STALE_MAX_MS, nowMs = Date.now(), storage = getDefaultStorage() } = {}
) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || parsed.data === undefined || !Number.isFinite(Number(parsed.savedAt))) {
      return null;
    }
    if (expectedScope !== null && parsed.scope !== expectedScope) {
      return null;
    }
    const rawAgeMs = nowMs - Number(parsed.savedAt);
    if (!Number.isFinite(rawAgeMs) || rawAgeMs < -30000 || rawAgeMs > maxStaleMs) {
      return null;
    }
    const ageMs = Math.max(0, rawAgeMs);
    return {
      entry: parsed,
      ageMs,
      sameHour: parsed.hourKey === currentKstHourKey(nowMs)
    };
  } catch {
    return null;
  }
}

export function writePageCache(
  key,
  { scope = '', data, nowMs = Date.now(), storage = getDefaultStorage() } = {}
) {
  if (!storage || !key || data === undefined) return false;
  const payload = JSON.stringify({
    v: 1,
    scope: String(scope || ''),
    savedAt: nowMs,
    hourKey: currentKstHourKey(nowMs),
    data
  });
  try {
    storage.setItem(key, payload);
    return true;
  } catch {
    try {
      prunePageCaches(key, storage);
      storage.setItem(key, payload);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 캐시 적중 상태·시간 경계·도메인 강제 조건에 따라 즉시 표출 및 백그라운드 갱신 시점 결정
 */
export function evaluateCachePolicy({
  cacheHit = null,
  freshMs = DEFAULT_FRESH_MS,
  dwellMs = DEFAULT_DWELL_MS,
  forceImmediate = false
} = {}) {
  if (!cacheHit || !cacheHit.entry) {
    return {
      hasUsableCache: false,
      cacheIsFresh: false,
      shouldFetchNow: true,
      backgroundDwellDelayMs: null
    };
  }

  const ageMs = Math.max(0, Number(cacheHit.ageMs) || 0);
  const isFreshWindow = Boolean(cacheHit.sameHour) && ageMs < freshMs && !forceImmediate;

  if (isFreshWindow) {
    const untilFreshEnd = Math.max(15000, freshMs - ageMs);
    return {
      hasUsableCache: true,
      cacheIsFresh: true,
      shouldFetchNow: false,
      backgroundDwellDelayMs: Math.min(dwellMs, untilFreshEnd)
    };
  }

  return {
    hasUsableCache: true,
    cacheIsFresh: false,
    shouldFetchNow: true,
    backgroundDwellDelayMs: null
  };
}
