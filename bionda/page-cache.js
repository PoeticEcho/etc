/**
 * 페이지(상황판 index.html / 1시간 단기예보 hourly.html) 간 빠른 전환(0ms 즉시 복원) 및
 * 머무름(3분) 백그라운드 SWR(Stale-While-Revalidate) 최신화를 위한 경량 로컬 캐시 유틸리티
 */

export const CACHE_PREFIX = 'weather-watch:cache:';
export const DEFAULT_FRESH_MS = 5 * 60000;      // 5분: 페이지 왕복 전환 시 즉시 표출 및 중복 호출 방지
export const DEFAULT_STALE_MAX_MS = 20 * 60000; // 20분: 초과 시 폐기, 5~20분 사이는 먼저 표출 후 즉시 SWR
export const DEFAULT_DWELL_MS = 3 * 60000;      // 3분: 캐시 화면에 3분 이상 머무르면 조용히 백그라운드 갱신
export const OVERVIEW_REFRESH_MS = 5 * 60000;   // 도로기상 상황판 정기 자동 갱신 주기 (5분)
export const HOURLY_REFRESH_MS = 10 * 60000;    // 1시간 단기예보 정기 자동 갱신 주기 (10분 · 정시·36분 별도)
export const RAPID_REFRESH_WINDOW_MS = 5 * 60000; // 5분 내 2회 이상 수동 새로고침 시 서버·엣지 캐시 우회 강제 갱신
export const REFRESH_CLICK_PREFIX = 'weather-watch:refresh-clicks:';
export const SHARED_ROAD_OBS_KEY = 'weather-watch:shared-road-obs:v1';

/**
 * 도로기상관측 배열 또는 명시적 tm1에서 12자리 KST 관측시각("YYYYMMDDHHMM") 추출
 */
export function extractRoadObsTm(stations = [], explicitTm = '') {
  const cleanExplicit = String(explicitTm || '').replace(/\D/g, '');
  if (cleanExplicit.length >= 12) return cleanExplicit.slice(0, 12);
  let maxTm = '';
  for (const s of (stations || [])) {
    const raw = String(s?.tm || '').replace(/\D/g, '').slice(0, 12);
    if (raw.length === 12 && raw > maxTm) maxTm = raw;
    else if (!raw && typeof s?.time === 'string') {
      const isoDigits = s.time.replace(/\D/g, '').slice(0, 12);
      if (isoDigits.length === 12 && isoDigits > maxTm) maxTm = isoDigits;
    }
  }
  return maxTm;
}

/**
 * 3대 대시보드(index.html ↔ rwis.html) 간 도로기상관측(TR1·TA) 단일 진실 공급원(SSOT) 읽기
 */
export function readSharedRoadObs({
  line = '14',
  maxAgeMs = 15 * 60000,
  nowMs = Date.now(),
  storage = getDefaultStorage()
} = {}) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SHARED_ROAD_OBS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || String(parsed.line) !== String(line) || !Array.isArray(parsed.stations) || !parsed.stations.length) {
      return null;
    }
    const age = nowMs - Number(parsed.savedAt || 0);
    if (!Number.isFinite(age) || age < -30000 || age > maxAgeMs) return null;
    const tm1 = extractRoadObsTm(parsed.stations, parsed.tm1);
    return { line: String(line), tm1, stations: parsed.stations, savedAt: Number(parsed.savedAt) };
  } catch {
    return null;
  }
}

/**
 * 단조 증가(Monotonic) 관측시각 규칙으로 최신 도로기상관측만 저장·공유
 * - 이미 더 최신 tm1이 저장되어 있으면 과거 캐시 응답이 덮어쓰지 못하도록 차단하여 페이지 간 수치 불일치 원천 방지
 */
export function writeSharedRoadObs({
  line = '14',
  tm1 = '',
  stations = [],
  nowMs = Date.now(),
  storage = getDefaultStorage()
} = {}) {
  if (!Array.isArray(stations) || !stations.length) return null;
  const incomingTm = extractRoadObsTm(stations, tm1);
  const existing = readSharedRoadObs({ line, maxAgeMs: 60 * 60000, nowMs, storage });
  if (existing?.tm1 && incomingTm && incomingTm < existing.tm1) {
    return existing;
  }
  const record = {
    v: 1,
    line: String(line),
    tm1: incomingTm || existing?.tm1 || '',
    savedAt: nowMs,
    stations
  };
  if (storage) {
    try {
      storage.setItem(SHARED_ROAD_OBS_KEY, JSON.stringify(record));
    } catch {}
  }
  return record;
}

const fallbackRefreshClicks = new Map();

/**
 * 수동 [새로고침] 클릭 이력을 기록하고 5분 내 2회 이상 클릭 여부를 판정합니다.
 * - 1회차: 일반 스마트 새로고침 (로컬 페이지 캐시 갱신 + 중량 상류 캐시 보호)
 * - 5분 내 2회차 이상(isHardForce = true): 브라우저·Edge·Worker 메모리 캐시를 모두 우회해 즉시 원천 API 재수신
 */
export function registerManualRefreshClick(
  pageScope = 'default',
  { nowMs = Date.now(), windowMs = RAPID_REFRESH_WINDOW_MS, storage = getDefaultStorage() } = {}
) {
  const scope = String(pageScope || 'default');
  const key = REFRESH_CLICK_PREFIX + scope;
  let prev = [];
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) prev = parsed;
      }
    } catch {
      prev = fallbackRefreshClicks.get(scope) || [];
    }
  } else {
    prev = fallbackRefreshClicks.get(scope) || [];
  }

  const cutoff = nowMs - windowMs;
  const recent = prev
    .map(Number)
    .filter(ts => Number.isFinite(ts) && ts > cutoff && ts <= nowMs + 5000);
  recent.push(nowMs);
  const trimmed = recent.slice(-10);

  fallbackRefreshClicks.set(scope, trimmed);
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(trimmed));
    } catch {}
  }

  return {
    count: trimmed.length,
    isHardForce: trimmed.length >= 2,
    timestamps: trimmed
  };
}

export function resetManualRefreshClicks(pageScope = 'default', storage = getDefaultStorage()) {
  const scope = String(pageScope || 'default');
  fallbackRefreshClicks.delete(scope);
  if (storage) {
    try {
      storage.removeItem(REFRESH_CLICK_PREFIX + scope);
    } catch {}
  }
}

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
