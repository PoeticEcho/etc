import { corridorCatalog } from './cctv-catalog.js';
import { ROUTE12_POLYLINE_KM, ROUTE12_PLACE_KM } from './route12.js';

export function cameraId(camera) {
  return String(camera.id ?? [camera.name, camera.y, camera.x].join('|'));
}

// Use the minimap's kilometre markers for ordering, only within its surveyed range.
function projectedKm(camera) {
  if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) return null;
  const lonScale = 111 * Math.cos(camera.y * Math.PI / 180);
  let bestDistance = Infinity;
  let km = null;
  for (let i = 1; i < ROUTE12_POLYLINE_KM.length; i++) {
    const [start, lat, lon] = ROUTE12_POLYLINE_KM[i - 1];
    const [end, nextLat, nextLon] = ROUTE12_POLYLINE_KM[i];
    const dx = (nextLon - lon) * lonScale, dy = (nextLat - lat) * 111;
    const x = (camera.x - lon) * lonScale, y = (camera.y - lat) * 111;
    const fraction = (x * dx + y * dy) / (dx * dx + dy * dy);
    const t = Math.max(0, Math.min(1, fraction));
    const distance = Math.hypot(x - t * dx, y - t * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      const outside = (i === 1 && fraction < 0) || (i === ROUTE12_POLYLINE_KM.length - 1 && fraction > 1);
      km = outside ? null : start + t * (end - start);
    }
  }
  return bestDistance <= 2 ? km : null;
}

function cameraName(name) {
  return name.replace(/\s+/g, '').replace(/\((?:광주|대구|상행|하행)(?:방향)?\)$/, '');
}

function catalogPosition(record) {
  return (record.basis === '산출' ? '산출 약 ' : '시설 ') + record.km.toFixed(2) + 'k';
}

export function cameraDirectory(payload) {
  const references = new Map();
  const labels = new Set();
  for (const site of payload.sites || []) {
    const siteKm = site.group === 'observatory' && /^\d+(\.\d+)?k$/i.test(site.sub)
      ? parseFloat(site.sub) : ROUTE12_PLACE_KM[site.name];
    for (const entry of [site.nearest, ...(site.aux || [])]) {
      if (!entry) continue;
      labels.add(cameraName(entry.label));
      if (!Number.isFinite(siteKm)) continue;
      for (const camera of entry.items || []) {
        const id = cameraId(camera);
        const distance = entry === site.nearest && Number.isFinite(entry.km) ? entry.km : Infinity;
        if (!references.has(id) || references.get(id).distance > distance) {
          references.set(id, { km: siteKm, distance, label: site.name + ' 기준 ' + siteKm + 'k' });
        }
      }
    }
  }

  const byId = new Map(corridorCatalog.map(row => [row.id, row]));
  const byName = new Map(corridorCatalog.map(row => [cameraName(row.name), row]));
  // The survey cross-reference identifies the dashboard's short name for this portal.
  byName.set('가조터널', byName.get('가조터널(외부대구)'));
  const seen = new Set();
  const entries = (payload.cctvs || []).map(camera => {
    const name = camera.name.trim();
    const routeTag = name.match(/^\[([^\]]+)\]/);
    const bare = name.replace(/^\[[^\]]+\]\s*/, '');
    const taggedCorridor = routeTag ? /^(광주대구(?:선|고속도로)?|무안광주대구선)$/.test(routeTag[1].replace(/\s/g, '')) : labels.has(cameraName(bare));
    const record = (!routeTag || taggedCorridor) && (byId.get(cameraId(camera)) || byName.get(cameraName(bare)));
    if (record) seen.add(record.id);
    const corridor = Boolean(record || taggedCorridor);
    let km = null, position = '이정 미확인';
    if (record) {
      km = record.km;
      position = catalogPosition(record);
    } else if (corridor) {
      km = projectedKm(camera);
      if (km !== null) position = '좌표 추정 약 ' + Math.round(km) + 'k';
      else {
        const ref = references.get(cameraId(camera));
        if (ref) {
          km = ref.km;
          position = ref.label;
        }
      }
    }
    return { camera, corridor, km, position, record };
  });
  for (const record of corridorCatalog) {
    if (!seen.has(record.id)) entries.push({
      camera: { id: record.id, name: record.name }, corridor: true, km: record.km,
      position: catalogPosition(record), record
    });
  }
  return entries.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.camera.name.localeCompare(b.camera.name, 'ko', { numeric: true }));
}
