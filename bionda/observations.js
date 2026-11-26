// 기상청 도로기상관측망(광주대구선 14번 노선) 및 초단기실황 연동 모듈
import { apiUrl, isBackendAvailable } from './config.js';
import { extractRoadObsTm, readSharedRoadObs, writeSharedRoadObs } from './page-cache.js';

export function refreshObservationWithStations(obs, stations) {
  if (!obs || obs._fromSnapshot || !Array.isArray(stations) || !stations.length) return obs;
  const primary = stations.find(s =>
    (obs.stnId != null && String(s.stnId) === String(obs.stnId)) ||
    (obs.name && s.name === obs.name)
  );
  const nearestRoad = (obs.roadStationName && stations.find(s => s.name === obs.roadStationName)) || primary || null;
  const nearestBridge = obs.bridgeStationName ? stations.find(s => s.name === obs.bridgeStationName) : null;
  if (!primary && !nearestRoad) return obs;

  const incomingTm = extractRoadObsTm([primary, nearestRoad].filter(Boolean));
  const curTm = extractRoadObsTm([obs]);
  if (curTm && incomingTm && incomingTm < curTm) return obs;

  return {
    ...obs,
    time: primary?.time || nearestRoad?.time || obs.time,
    temp: primary?.temp ?? obs.temp,
    humidity: primary?.humidity ?? obs.humidity,
    dayPrecip: primary?.dayPrecip ?? obs.dayPrecip,
    snowDepth: primary?.snowDepth ?? obs.snowDepth,
    windSpeed: primary?.windSpeed ?? obs.windSpeed,
    gustSpeed: primary?.gustSpeed ?? obs.gustSpeed,
    visibility: primary?.visibility ?? obs.visibility,
    roadTemp: nearestRoad ? nearestRoad.roadTemp : obs.roadTemp,
    surfaceCode: nearestRoad ? nearestRoad.surfaceCode : obs.surfaceCode,
    surfaceState: nearestRoad ? nearestRoad.surfaceState : obs.surfaceState,
    bridgeRoadTemp: nearestBridge ? nearestBridge.roadTemp : obs.bridgeRoadTemp,
    bridgeSurfaceState: nearestBridge ? nearestBridge.surfaceState : obs.bridgeSurfaceState
  };
}

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

export function clearObservationsMemCache() {
  obsMemCache.clear();
  roadStationsMemCache.clear();
  roadRiskMemCache.clear();
}

export function seedOverviewCache({ line = 14, roadNum = '012', roadStations = null, roadRisk = null, obsByCoord = null } = {}) {
  const now = Date.now();
  if (Array.isArray(roadStations) && roadStations.length) {
    const synced = writeSharedRoadObs({ line: String(line), stations: roadStations, nowMs: now });
    roadStationsMemCache.set(String(line), { expires: now + 45000, data: synced?.stations || roadStations });
  }
  if (roadRisk?.ok) {
    roadRiskMemCache.set(String(roadNum), { expires: now + 5 * 60000, data: roadRisk });
  }
  if (obsByCoord && typeof obsByCoord === 'object') {
    for (const [k, obs] of Object.entries(obsByCoord)) {
      if (obs && !obs._fromSnapshot) {
        obsMemCache.set(k, { expires: now + 45000, data: obs });
      }
    }
  }
}

export async function loadOverviewBundle(placesList = [], { line = 14, roadNum = '012', force = false, hard = false } = {}) {
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
  const bypass = Boolean(force || hard);
  try {
    const u = apiUrl(
      '/api/overview-bundle?line=' + encodeURIComponent(line) +
      '&roadNum=' + encodeURIComponent(roadNum) +
      (serialized ? '&places=' + encodeURIComponent(serialized) : '') +
      (bypass ? '&force=1' : '') +
      (hard ? '&hard=1' : '')
    );
    const r = await fetch(u, { signal: AbortSignal.timeout(26000), ...(bypass ? { cache: 'no-store' } : {}) });
    if (!r.ok) return null;
    const bundle = await r.json();
    if (!bundle?.ok) return null;

    if (Array.isArray(bundle.roadStations) && bundle.roadStations.length) {
      const synced = writeSharedRoadObs({
        line: String(line),
        tm1: bundle.roadObsTm || '',
        stations: bundle.roadStations
      });
      if (synced?.stations?.length) {
        bundle.roadStations = synced.stations;
        bundle.roadObsTm = synced.tm1 || bundle.roadObsTm || null;
      }
      roadStationsMemCache.set(String(line), { expires: Date.now() + 45000, data: bundle.roadStations });
    }
    if (bundle.roadRisk?.ok) {
      roadRiskMemCache.set(String(roadNum), { expires: Date.now() + 9 * 60000, data: { ...bundle.roadRisk, _fromSnapshot: false } });
    }
    if (bundle.items) {
      for (const [key, entry] of Object.entries(bundle.items)) {
        if (entry?.observation) {
          const freshObs = bundle.roadStations?.length
            ? refreshObservationWithStations({ ...entry.observation, _fromSnapshot: false }, bundle.roadStations)
            : { ...entry.observation, _fromSnapshot: false };
          entry.observation = freshObs;
          obsMemCache.set(key, { expires: Date.now() + 45000, data: freshObs });
        }
      }
    }
    return bundle;
  } catch {
    return null;
  }
}

export async function loadObservation(place, { force = false, hard = false } = {}) {
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  const bypass = Boolean(force || hard);
  const cached = !bypass ? obsMemCache.get(key) : null;
  if (cached && Date.now() < cached.expires) {
    lastObsError = '';
    return cached.data;
  }
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  if (bypass) params.set('force', '1');
  if (hard) params.set('hard', '1');
  if (await isBackendAvailable()) {
    try {
      const response = await fetch(apiUrl('/api/observation?' + params), {
        signal: AbortSignal.timeout(15000),
        ...(bypass ? { cache: 'no-store' } : {})
      });
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

export async function loadRoadStations(line = 14, { force = false, hard = false } = {}) {
  const bypass = Boolean(force || hard);
  const cached = !bypass ? roadStationsMemCache.get(String(line)) : null;
  if (cached && Date.now() < cached.expires) {
    const shared = readSharedRoadObs({ line: String(line) });
    if (shared?.stations?.length && shared.tm1 > extractRoadObsTm(cached.data)) {
      roadStationsMemCache.set(String(line), { expires: Date.now() + 45000, data: shared.stations });
      return shared.stations;
    }
    return cached.data;
  }
  if (await isBackendAvailable()) {
    try {
      const qs = `?line=${encodeURIComponent(line)}${bypass ? '&force=1' : ''}${hard ? '&hard=1' : ''}`;
      const response = await fetch(apiUrl('/api/road-obs' + qs), {
        signal: AbortSignal.timeout(10000),
        ...(bypass ? { cache: 'no-store' } : {})
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.stations) && data.stations.length) {
          const synced = writeSharedRoadObs({ line: String(line), tm1: data.tm1 || '', stations: data.stations });
          const finalStations = synced?.stations || data.stations;
          roadStationsMemCache.set(String(line), { expires: Date.now() + 45000, data: finalStations });
          return finalStations;
        }
      }
    } catch {}
  }
  const sharedFallback = readSharedRoadObs({ line: String(line) });
  if (sharedFallback?.stations?.length) return sharedFallback.stations;
  const snap = await getSnapshotFallback();
  if (Array.isArray(snap?.roadStations)) return snap.roadStations;
  return [];
}

export async function loadRoadRisk(roadNum = '012', force = false, hard = false) {
  const key = String(roadNum || '012');
  const bypass = Boolean(force || hard);
  const cached = roadRiskMemCache.get(key);
  if (!bypass && cached && Date.now() < cached.expires) {
    return cached.data;
  }
  if (await isBackendAvailable()) {
    try {
      const qs = `?roadNum=${encodeURIComponent(roadNum)}${bypass ? '&force=1' : ''}${hard ? '&hard=1' : ''}`;
      const response = await fetch(apiUrl('/api/road-risk' + qs), {
        signal: AbortSignal.timeout(12000),
        ...(bypass ? { cache: 'no-store' } : {})
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
