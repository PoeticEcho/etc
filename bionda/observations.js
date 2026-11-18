// 기상청 도로기상관측망(광주대구선 14번 노선) 및 초단기실황 연동 모듈
import { apiUrl, isBackendAvailable } from './config.js';

let snapshotCache = null;
let snapshotPromise = null;

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
      const response = await fetch(apiUrl('/api/observation?' + params), { signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const data = await response.json();
        return { ...data, _fromSnapshot: false };
      }
    } catch {}
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
