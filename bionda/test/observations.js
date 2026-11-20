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

const obsMemCache = new Map();
const roadStationsMemCache = new Map();
const roadRiskMemCache = new Map();

export function seedOverviewCache({ line = 14, roadNum = '012', roadStations = null, roadRisk = null, obsByCoord = null } = {}) {
  const now = Date.now();
  if (Array.isArray(roadStations) && roadStations.length) {
    roadStationsMemCache.set(String(line), { expires: now + 90000, data: roadStations });
  }
  if (roadRisk?.ok) {
    roadRiskMemCache.set(String(roadNum), { expires: now + 5 * 60000, data: roadRisk });
  }
  if (obsByCoord && typeof obsByCoord === 'object') {
    for (const [k, obs] of Object.entries(obsByCoord)) {
      if (obs && !obs._fromSnapshot) {
        obsMemCache.set(k, { expires: now + 90000, data: obs });
      }
    }
  }
}

export async function loadOverviewBundle(placesList = [], { line = 14, roadNum = '012', force = false } = {}) {
  if (!(await isBackendAvailable())) return null;
  const deduped = new Map();
  for (const p of (placesList || [])) {
    const lat = Number(p?.lat), lon = Number(p?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (!deduped.has(key)) {
      deduped.set(key, { key, lat, lon, name: String(p?.name || '').replace(/[;|]/g, ' ').trim() });
    }
    if (deduped.size >= 10) break;
  }
  const serialized = [...deduped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(p => `${p.name}|${p.key}`)
    .join(';');
  try {
    const u = apiUrl(
      '/api/overview-bundle?line=' + encodeURIComponent(line) +
      '&roadNum=' + encodeURIComponent(roadNum) +
      (serialized ? '&places=' + encodeURIComponent(serialized) : '') +
      (force ? '&force=1' : '')
    );
    const r = await fetch(u, { signal: AbortSignal.timeout(26000), ...(force ? { cache: 'no-store' } : {}) });
    if (!r.ok) return null;
    const bundle = await r.json();
    if (!bundle?.ok) return null;

    if (Array.isArray(bundle.roadStations) && bundle.roadStations.length) {
      roadStationsMemCache.set(String(line), { expires: Date.now() + 90000, data: bundle.roadStations });
    }
    if (bundle.roadRisk?.ok) {
      roadRiskMemCache.set(String(roadNum), { expires: Date.now() + 9 * 60000, data: { ...bundle.roadRisk, _fromSnapshot: false } });
    }
    if (bundle.items) {
      for (const [key, entry] of Object.entries(bundle.items)) {
        if (entry?.observation) {
          obsMemCache.set(key, { expires: Date.now() + 90000, data: { ...entry.observation, _fromSnapshot: false } });
        }
      }
    }
    return bundle;
  } catch {
    return null;
  }
}

export async function loadObservation(place) {
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  const cached = obsMemCache.get(key);
  if (cached && Date.now() < cached.expires) {
    lastObsError = '';
    return cached.data;
  }
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/observation?' + params), { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const data = await response.json();
        lastObsError = '';
        const out = { ...data, _fromSnapshot: false };
        obsMemCache.set(key, { expires: Date.now() + 90000, data: out });
        return out;
      }
      lastObsError = `관측 HTTP ${response.status}`;
    } catch (e) {
      lastObsError = e?.name === 'TimeoutError' ? '관측 API 시간초과' : '관측 API 연결 오류';
    }
  }
  const snap = await getSnapshotFallback();
  if (snap?.observations?.[key]) {
    return { ...snap.observations[key], _fromSnapshot: true, _snapshotGeneratedAt: snap.generatedAt || null };
  }
  throw Error('기상청 관측 자료 확인 대기');
}

export async function loadRoadStations(line = 14) {
  const cached = roadStationsMemCache.get(String(line));
  if (cached && Date.now() < cached.expires) return cached.data;
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/road-obs?line=' + encodeURIComponent(line)), { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.stations)) {
          roadStationsMemCache.set(String(line), { expires: Date.now() + 90000, data: data.stations });
          return data.stations;
        }
      }
    } catch {}
  }
  const snap = await getSnapshotFallback();
  if (Array.isArray(snap?.roadStations)) return snap.roadStations;
  return [];
}

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
