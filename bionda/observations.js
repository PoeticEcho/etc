// 기상청 도로기상관측망(광주대구선 14번 노선) 및 초단기실황 연동 모듈
let snapshotCache = null;

async function getSnapshotFallback() {
  if (snapshotCache) return snapshotCache;
  try {
    const r = await fetch('./api/snapshot.json', { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      snapshotCache = await r.json();
      return snapshotCache;
    }
  } catch {}
  return null;
}

export async function loadObservation(place) {
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  try {
    const response = await fetch('/api/observation?' + params, { signal: AbortSignal.timeout(12000) });
    if (response.ok) return await response.json();
  } catch {}
  const snap = await getSnapshotFallback();
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  if (snap?.observations?.[key]) return snap.observations[key];
  throw Error('기상청 관측 자료 확인 대기');
}

export async function loadRoadStations(line = 14) {
  try {
    const response = await fetch('/api/road-obs?line=' + encodeURIComponent(line), { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.stations)) return data.stations;
    }
  } catch {}
  const snap = await getSnapshotFallback();
  if (Array.isArray(snap?.roadStations)) return snap.roadStations;
  return [];
}
