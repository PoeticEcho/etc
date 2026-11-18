// 기상청 도로기상관측망(광주대구선 14번 노선) 및 초단기실황 연동 모듈
import { apiUrl, isBackendAvailable } from './config.js';

let snapshotCache = null;
let snapshotPromise = null;
let lastObsError = '';

export function getLastObsError() {
  return lastObsError;
}

export async function getSnapshotFallback() {
  if (snapshotCache) return snapshotCache;
  if (snapshotPromise) return snapshotPromise;
  snapshotPromise = (async () => {
    try {
      const r = await fetch('./api/snapshot.json', { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        snapshotCache = await r.json();
        return snapshotCache;
      }
    } catch {}
    return null;
  })();
  try {
    return await snapshotPromise;
  } finally {
    snapshotPromise = null;
  }
}

export async function loadObservation(place) {
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/observation?' + params), { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const data = await response.json();
        lastObsError = '';
        return { ...data, _fromSnapshot: false };
      }
      lastObsError = `관측 HTTP ${response.status}`;
    } catch (e) {
      lastObsError = e?.name === 'TimeoutError' ? '관측 API 시간초과' : '관측 API 연결 오류';
    }
  }
  const snap = await getSnapshotFallback();
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  if (snap?.observations?.[key]) {
    return { ...snap.observations[key], _fromSnapshot: true, _snapshotGeneratedAt: snap.generatedAt || null };
  }
  throw Error('기상청 관측 자료 확인 대기');
}

export async function loadRoadStations(line = 14) {
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/road-obs?line=' + encodeURIComponent(line)), { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.stations)) return data.stations;
      }
    } catch {}
  }
  const snap = await getSnapshotFallback();
  if (Array.isArray(snap?.roadStations)) return snap.roadStations;
  return [];
}

const roadRiskMemCache = new Map();

export async function loadRoadRisk(roadNum = '012', force = false) {
  const key = String(roadNum || '012');
  const cached = roadRiskMemCache.get(key);
  if (!force && cached && Date.now() < cached.expires) {
    return cached.data;
  }
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/road-risk?roadNum=' + encodeURIComponent(roadNum)), {
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.ok) {
          const out = { ...data, _fromSnapshot: false };
          roadRiskMemCache.set(key, { expires: Date.now() + 9 * 60000, data: out });
          return out;
        }
      }
    } catch {}
  }
  const snap = await getSnapshotFallback();
  if (snap?.roadRisk?.ok) return { ...snap.roadRisk, _fromSnapshot: true };
  return null;
}
