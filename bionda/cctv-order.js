import { corridorCatalog } from './cctv-catalog.js';
import { ROUTE12_POLYLINE_KM } from './route12.js';

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

const byId = new Map(corridorCatalog.map(row => [row.id, row]));
const byName = new Map(corridorCatalog.map(row => [cameraName(row.name), row]));
byName.set('가조터널', byName.get('가조터널(외부대구)'));

export function cameraDirectory(payload) {
  const labels = new Set();
  for (const site of payload.sites || []) {
    for (const entry of [site.nearest, ...(site.aux || [])]) {
      if (entry?.label) labels.add(cameraName(entry.label));
    }
  }

  const entries = [];
  for (const camera of payload.cctvs || []) {
    if (!/^https?:\/\/[^/\s]+/i.test(camera.url || '')) continue;
    const name = camera.name.trim();
    const routeTag = name.match(/^\[([^\]]+)\]/);
    if (routeTag && !/^(광주대구(?:선|고속도로)?|무안광주대구선)$/.test(routeTag[1].replace(/\s/g, ''))) continue;
    const bare = name.replace(/^\[[^\]]+\]\s*/, '');
    const key = cameraName(bare);
    const record = byId.get(cameraId(camera)) || byName.get(key);
    if (!record && !routeTag && !labels.has(key)) continue;

    const km = record?.km ?? projectedKm(camera);
    if (!Number.isFinite(km)) continue;
    const approx = !record || record.basis === '산출';
    const position = (approx ? '약 ' : '') + (record ? km.toFixed(2) : Math.round(km)) + 'k';
    const displayName = bare.replace(/_광주대구(?:선)?$/, '') || record?.name;
    entries.push({ camera, displayName, km, position, record });
  }
  return entries.sort((a, b) => a.km - b.km || a.displayName.localeCompare(b.displayName, 'ko', { numeric: true }));
}
