import { apiUrl, getApiBase } from './config.js';
import {
  readPageCache,
  writePageCache,
  clearPageCache,
  evaluateCachePolicy,
  currentKstHourKey,
  DEFAULT_FRESH_MS,
  DEFAULT_DWELL_MS,
  OVERVIEW_REFRESH_MS
} from './page-cache.js';
import {
  mountNetHealthMonitor,
  reportApiSuccess,
  reportApiFailure
} from './net-health.js';
import {
  RWIS_MASTER,
  RWIS_ROUTE_GEO,
  LEVEL_NAME,
  PROVINCE_LABELS_FIXED,
  COUNTY_LABELS,
  ROUTE_NODES,
  CORRIDOR_MAP_STATIONS,
  enrichZonesWithBionda
} from './rwis-data.js';

const RWIS_CACHE_KEY = 'weather-watch:cache:rwis:v1';
const HOURLY_CACHE_KEY = 'weather-watch:cache:hourly:v3';
const OVERVIEW_CACHE_KEY = 'weather-watch:cache:overview:v2';
const rwisCacheScope = () => getApiBase() || '__same_origin__';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const LEVEL_COLORS = ['#38bdf8', '#facc15', '#fb923c', '#f43f5e'];
const PROV_FILL = {
  '경상남도': '#122943',
  '경상북도': '#10243a',
  '전라북도': '#142d4a',
  '대구광역시': '#1a3754',
  '전라남도': '#10253a'
};

const state = {
  metric: 'fsm',          // 'fsm' (살얼음) | 'vir' (가시거리)
  dir: 'both',            // 'both' | 'E' (대구↑) | 'S' (광주↓)
  showRoadTemps: true,
  mapBig: false,
  sideTab: 'telemetry',   // 'telemetry' | 'cctv'
  showAllStations: false,
  selectedZoneSuffix: null,
  cctvQuery: '',
  cctvFac: 'all',
  rwisStatus: null,
  roadStations: [],
  roadRisk: null,
  shortTerm13: null,
  fromCache: false,
  lastSyncedAt: 0,
  lastSyncHourKey: null,
  isRevalidating: false,
  dwellTimer: null,
  loadPromise: null,
  hls: null,
  activeCam: null
};

/* ───────────────────── 좌표 투영 & 노선 지오메트리 ───────────────────── */
const GEO = RWIS_ROUTE_GEO;
const mapX = lon => GEO.proj.x0 + (lon - GEO.proj.lonC) * GEO.proj.cosLat * GEO.proj.scale;
const mapY = lat => GEO.proj.y0 - (lat - GEO.proj.latC) * GEO.proj.scale;
const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
const n2 = v => (Math.round(v * 100) / 100).toFixed(2);

let cachedTrack = null;
function getBaseTrack() {
  if (cachedTrack) return cachedTrack;
  const raw = RWIS_MASTER.points
    .map(p => ({ km: p.km, x: mapX(p.lon), y: mapY(p.lat) }))
    .sort((a, b) => (a.km - b.km) || (a.x - b.x));
  const verts = [];
  for (const v of raw) {
    const last = verts[verts.length - 1];
    if (last && Math.abs(last.km - v.km) < 1e-6 && Math.hypot(last.x - v.x, last.y - v.y) < 2) continue;
    verts.push({ km: v.km, x: v.x, y: v.y, pinned: false });
  }
  const bounds = [];
  for (const z of RWIS_MASTER.zones) { bounds.push(z.startKm, z.endKm); }
  for (const km of [...new Set(bounds)].sort((a, b) => a - b)) {
    const hit = verts.find(v => Math.abs(v.km - km) < 1e-6);
    if (hit) { hit.pinned = true; continue; }
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i], b = verts[i + 1];
      if (a.km < km && b.km > km) {
        const t = (km - a.km) / (b.km - a.km);
        verts.splice(i + 1, 0, { km, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, pinned: true });
        break;
      }
    }
  }
  let cur = verts;
  for (let pass = 0; pass < 2; pass++) {
    const next = cur.map(v => ({ ...v }));
    for (let i = 1; i < cur.length - 1; i++) {
      if (cur[i].pinned) continue;
      next[i].x = cur[i - 1].x * 0.25 + cur[i].x * 0.5 + cur[i + 1].x * 0.25;
      next[i].y = cur[i - 1].y * 0.25 + cur[i].y * 0.5 + cur[i + 1].y * 0.25;
    }
    cur = next;
  }
  cachedTrack = cur;
  return cur;
}

function buildSceneTransform() {
  const w = 1600, h = 745, head = 66, foot = 62;
  const fit = { l: 156, r: 156, t: 94, b: 56 };
  const base = getBaseTrack();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of base) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  const rect = { x: 0, y: head, w, h: h - head - foot };
  const availW = rect.w - fit.l - fit.r;
  const availH = rect.h - fit.t - fit.b;
  const s = Math.min(availW / (x1 - x0), availH / (y1 - y0));
  const tx = rect.x + fit.l + availW / 2;
  const ty = rect.y + fit.t + availH / 2;
  const rcx = (x0 + x1) / 2;
  const rcy = (y0 + y1) / 2;
  const map = (x, y) => ({ x: tx + (x - rcx) * s, y: ty + (y - rcy) * s });
  const o = map(0, 0);
  const matrix = `matrix(${n2(s)} 0 0 ${n2(s)} ${n1(o.x)} ${n1(o.y)})`;
  return { w, h, head, foot, rect, s, map, matrix, base };
}

function pointAtKm(km, track) {
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (km >= a.km - 1e-6 && km <= b.km + 1e-6) {
      const t = Math.min(1, Math.max(0, (km - a.km) / ((b.km - a.km) || 1)));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tangent: Math.atan2(b.y - a.y, b.x - a.x)
      };
    }
  }
  const last = track[track.length - 1];
  return { x: last.x, y: last.y, tangent: 0 };
}

function zonePoints(zone, track) {
  const pts = [];
  for (const v of track) {
    if (v.km >= zone.startKm - 1e-6 && v.km <= zone.endKm + 1e-6) pts.push(v);
  }
  if (pts.length < 2) {
    pts.push(pointAtKm(zone.startKm, track), pointAtKm(zone.endKm, track));
  }
  return pts;
}

function offsetPolyline(screenPts, offsetPx) {
  if (!offsetPx || screenPts.length < 2) return screenPts;
  return screenPts.map((p, i) => {
    const prev = screenPts[Math.max(0, i - 1)];
    const next = screenPts[Math.min(screenPts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    // Left-hand normal (-dy/len, dx/len)
    return { x: p.x + (-dy / len) * offsetPx, y: p.y + (dx / len) * offsetPx };
  });
}

function polyPath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n1(p.x)} ${n1(p.y)}`).join('');
}

function formatKstHm(msOrIso) {
  if (!msOrIso) return '';
  if (typeof msOrIso === 'string' && /^\d{12}$/.test(msOrIso)) {
    return `${msOrIso.slice(4, 6)}-${msOrIso.slice(6, 8)} ${msOrIso.slice(8, 10)}:${msOrIso.slice(10, 12)}`;
  }
  const ms = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 9 * 3600000);
  const p = v => String(v).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function getZoneLevel(zone) {
  const bucket = state.metric === 'vir' ? zone.vir : zone.fsm;
  if (state.dir === 'E') return bucket.E;
  if (state.dir === 'S') return bucket.S;
  return bucket.max;
}

function getEnriched() {
  const rwisZones = state.rwisStatus?.rwis?.zones || [];
  return enrichZonesWithBionda({
    rwisZones,
    roadStations: state.roadStations,
    roadRisk: state.roadRisk,
    shortTerm13: state.shortTerm13
  });
}

/* ───────────────────── 50인치 TV SVG 노선도 렌더 ───────────────────── */
function renderCorridorMap(enriched) {
  const stage = $('rwisMapStage');
  if (!stage) return;
  const G = buildSceneTransform();
  const metricLabel = state.metric === 'vir' ? '가시거리(VIR)' : '도로살얼음(FSM)';
  const dirLabel = state.dir === 'E' ? '대구방향(상행)' : state.dir === 'S' ? '광주방향(하행)' : '양방향';

  const counts = [0, 0, 0, 0];
  let maxLv = 0;
  for (const z of enriched.zones) {
    const lv = getZoneLevel(z);
    counts[lv] = (counts[lv] || 0) + 1;
    if (lv > maxLv) maxLv = lv;
  }

  const rwisTmObj = state.rwisStatus?.rwis?.tm;
  const rwisTmRaw = typeof rwisTmObj === 'string'
    ? rwisTmObj
    : (state.metric === 'vir' ? (rwisTmObj?.VR || rwisTmObj?.FR) : (rwisTmObj?.FR || rwisTmObj?.VR));
  const obsStamp = rwisTmRaw
    ? formatKstHm(rwisTmRaw)
    : (state.roadRisk?.tmKst ? formatKstHm(state.roadRisk.tmKst) : formatKstHm(state.lastSyncedAt));
  const srcName = state.rwisStatus?.rwis?.ok
    ? '기상청 RWIS 실시간'
    : (state.roadRisk?.ok ? '기상청 012 도로위험 연동' : '기상청 도로기상');

  const out = [];
  out.push(`<svg id="rwisCorridorSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.w} ${G.h}" role="img" aria-label="광주대구선 ${metricLabel} 노선 지도">`);
  out.push(`<defs>
    <linearGradient id="rwPaper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1829"/><stop offset="100%" stop-color="#081322"/>
    </linearGradient>
    <linearGradient id="rwSea" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1626"/><stop offset="100%" stop-color="#0e1e33"/>
    </linearGradient>
    <clipPath id="rwClip"><rect x="0" y="${G.rect.y}" width="${G.rect.w}" height="${G.rect.h}"/></clipPath>
    <filter id="rwGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="rwShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#020813" flood-opacity="0.85"/>
    </filter>
  </defs>`);

  // Canvas paper
  out.push(`<rect x="0" y="0" width="${G.w}" height="${G.h}" fill="url(#rwPaper)"/>`);

  // Header strip inside SVG (TV crisp + PNG report ready)
  out.push(`<rect x="0" y="0" width="${G.w}" height="${G.head}" fill="#0a1626"/>`);
  out.push(`<line x1="0" y1="${G.head}" x2="${G.w}" y2="${G.head}" stroke="#1d3552" stroke-width="1.5"/>`);
  out.push(`<circle cx="30" cy="24" r="5.5" fill="${LEVEL_COLORS[maxLv]}"/>`);
  out.push(`<text x="46" y="30" fill="#e8f3ff" font-size="19.5" font-weight="800" letter-spacing="-0.3">${esc(srcName)} · ${esc(metricLabel)}</text>`);
  out.push(`<text x="46" y="53" fill="#8fb2d4" font-size="15" font-weight="600">기준 ${esc(obsStamp || '수신 중')} · 함양IC 95.0 → 옥포JC 176.0km · 8개 구간 · ${esc(dirLabel)}</text>`);

  // Right-side TV level count pills inside SVG header
  const chipSpecs = [
    { lv: 3, label: '위험', count: counts[3] },
    { lv: 2, label: '주의', count: counts[2] },
    { lv: 1, label: '관심', count: counts[1] },
    { lv: 0, label: '안전', count: counts[0] }
  ];
  let cx = G.w - 28;
  for (let i = chipSpecs.length - 1; i >= 0; i--) {
    const cs = chipSpecs[i];
    const cw = 124;
    cx -= cw;
    const col = LEVEL_COLORS[cs.lv];
    const active = cs.count > 0;
    out.push(`<rect x="${cx}" y="12" width="${cw}" height="42" rx="10" fill="${active ? col : '#0f2035'}" fill-opacity="${active ? '0.2' : '0.85'}" stroke="${active ? col : '#263f5d'}" stroke-width="${active ? '2' : '1.2'}"/>`);
    out.push(`<circle cx="${cx + 20}" cy="33" r="5" fill="${col}"/>`);
    out.push(`<text x="${cx + 32}" y="39" fill="#d9e8f8" font-size="16" font-weight="800">${cs.label}</text>`);
    out.push(`<text x="${cx + cw - 14}" y="40" text-anchor="end" fill="${active ? col : '#7896b6'}" font-size="20" font-weight="900">${cs.count}</text>`);
    cx -= 9;
  }

  // Clipped Map Area
  out.push(`<g clip-path="url(#rwClip)">`);
  out.push(`<rect x="0" y="${G.rect.y}" width="${G.rect.w}" height="${G.rect.h}" fill="url(#rwSea)"/>`);

  // 1. KOSTAT Province & County Polygons
  out.push(`<g transform="${G.matrix}">`);
  out.push('<g class="provinces">');
  for (const prov of GEO.provinces || []) {
    out.push(`<path d="${prov.d}" fill="${PROV_FILL[prov.name] || '#122840'}" stroke="#4877a8" stroke-width="2.6" stroke-opacity="0.62"/>`);
  }
  out.push('</g>');
  out.push('<g class="counties">');
  for (const county of GEO.counties || []) {
    out.push(`<path d="${county.d}" fill="none" stroke="#3c628a" stroke-width="1.25" stroke-opacity="0.58" stroke-dasharray="4 3"/>`);
  }
  out.push('</g>');
  out.push('</g>');

  // 2. Verified 4 Province Labels (전북 · 경남 · 경북 · 대구 — 100% Point-in-Polygon!)
  out.push('<g class="province-labels" aria-hidden="true">');
  for (const [name, pos] of Object.entries(PROVINCE_LABELS_FIXED)) {
    const q = G.map(pos.x, pos.y);
    const px = Math.max(58, Math.min(G.w - 58, q.x));
    const py = Math.max(G.rect.y + 42, Math.min(G.rect.y + G.rect.h - 22, q.y));
    out.push(`<text x="${n1(px)}" y="${n1(py)}" text-anchor="middle" fill="#6390bc" fill-opacity="0.52" font-size="34" font-weight="900" letter-spacing="10">${esc(name)}</text>`);
  }
  out.push('</g>');

  // 3. Verified 5 Core County Labels (함양군 · 거창군 · 합천군 · 고령군 · 달성군 — 100% Point-in-Polygon!)
  out.push('<g class="county-labels" aria-hidden="true">');
  for (const c of COUNTY_LABELS) {
    const q = G.map(c.x, c.y);
    const px = Math.max(54, Math.min(G.w - 54, q.x));
    const py = Math.max(G.rect.y + 28, Math.min(G.rect.y + G.rect.h - 18, q.y));
    const w = c.name.length * 16 + 22;
    out.push(`<rect x="${n1(px - w / 2)}" y="${n1(py - 20)}" width="${w}" height="28" rx="8" fill="#081525" fill-opacity="0.62" stroke="#3c628a" stroke-opacity="0.55" stroke-width="1"/>`);
    out.push(`<text x="${n1(px)}" y="${n1(py)}" text-anchor="middle" fill="#9bc2e6" font-size="16.5" font-weight="800" letter-spacing="1">${esc(c.name)}</text>`);
  }
  out.push('</g>');

  // 4. Intersecting Expressway Branches (통영대전선 · 중부내륙선 · 중부내륙선지선)
  out.push('<g class="branches">');
  for (const node of ROUTE_NODES) {
    if (!node.branch) continue;
    const pb = pointAtKm(node.km, G.base);
    const [a1, a2] = node.branch.a;
    const len = 84;
    const q1 = G.map(pb.x + Math.cos((a1 * Math.PI) / 180) * len, pb.y + Math.sin((a1 * Math.PI) / 180) * len);
    const q2 = G.map(pb.x + Math.cos((a2 * Math.PI) / 180) * len, pb.y + Math.sin((a2 * Math.PI) / 180) * len);
    out.push(`<path d="M${n1(q1.x)} ${n1(q1.y)}L${n1(q2.x)} ${n1(q2.y)}" fill="none" stroke="#081322" stroke-width="13" stroke-linecap="round" opacity="0.9"/>`);
    out.push(`<path d="M${n1(q1.x)} ${n1(q1.y)}L${n1(q2.x)} ${n1(q2.y)}" fill="none" stroke="#2d8a68" stroke-width="7.5" stroke-linecap="round"/>`);
  }
  out.push('</g>');

  // 5. Highway Corridor Zones (Bidirectional or Single-Direction)
  out.push('<g class="corridor-zones">');
  for (const zone of enriched.zones) {
    const rawPts = zonePoints(zone, G.base).map(p => G.map(p.x, p.y));
    const bucket = state.metric === 'vir' ? zone.vir : zone.fsm;
    const selected = state.selectedZoneSuffix === zone.suffix;
    const centerPath = polyPath(rawPts);

    // Outer casing
    out.push(`<path d="${centerPath}" fill="none" stroke="${selected ? '#ffffff' : '#050d18'}" stroke-width="${selected ? 34 : 29}" stroke-linecap="round" stroke-linejoin="round" opacity="${selected ? '0.95' : '0.92'}"/>`);

    if (state.dir === 'both') {
      const topPts = offsetPolyline(rawPts, -6.5);  // 위: 대구방향 상행 (E)
      const botPts = offsetPolyline(rawPts, 6.5);   // 아래: 광주방향 하행 (S)
      const colE = LEVEL_COLORS[bucket.E] || LEVEL_COLORS[0];
      const colS = LEVEL_COLORS[bucket.S] || LEVEL_COLORS[0];
      if (bucket.E >= 2) {
        out.push(`<path d="${polyPath(topPts)}" fill="none" stroke="${colE}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" opacity="0.34" filter="url(#rwGlow)"/>`);
      }
      if (bucket.S >= 2) {
        out.push(`<path d="${polyPath(botPts)}" fill="none" stroke="${colS}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" opacity="0.34" filter="url(#rwGlow)"/>`);
      }
      out.push(`<path d="${polyPath(topPts)}" fill="none" stroke="${colE}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      out.push(`<path d="${polyPath(botPts)}" fill="none" stroke="${colS}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      const lv = state.dir === 'E' ? bucket.E : bucket.S;
      const col = LEVEL_COLORS[lv] || LEVEL_COLORS[0];
      if (lv >= 2) {
        out.push(`<path d="${centerPath}" fill="none" stroke="${col}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" opacity="0.36" filter="url(#rwGlow)"/>`);
      }
      out.push(`<path d="${centerPath}" fill="none" stroke="${col}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    // Invisible wide hit target for clicking a zone
    out.push(`<path class="zone-hit" data-zone="${esc(zone.suffix)}" d="${centerPath}" fill="none" stroke="transparent" stroke-width="40" stroke-linecap="round"><title>${esc(zone.name)} (${zone.startKm}–${zone.endKm}km)</title></path>`);
  }
  out.push('</g>');

  // 6. Corridor Milepost Ticks (100, 110, 130, 140, 150, 160, 170)
  out.push('<g class="mileposts" aria-hidden="true">');
  for (const km of [100, 110, 130, 140, 150, 160, 170]) {
    const p = pointAtKm(km, G.base);
    const q = G.map(p.x, p.y);
    out.push(`<text x="${n1(q.x)}" y="${n1(q.y - 20)}" text-anchor="middle" fill="#6d92b8" font-size="13.5" font-weight="700">${km}k</text>`);
  }
  out.push('</g>');

  // 7. Live Road Surface Temperature (TR1) Badges along the Corridor (Non-overlapping clean offsets)
  if (state.showRoadTemps && state.roadStations.length) {
    const stnMap = new Map(state.roadStations.map(s => [String(s.stnId), s]));
    const STN_OFFSETS = {
      '14206': { dx: -76, dy: 42 },  // 함양(도) - below-left of 함양IC
      '14409': { dx: -56, dy: -32 }, // 죽산천교 - above-left of straightaway
      '14207': { dx: 72, dy: 28 },   // 남상졸음 - south-east of diagonal
      '14208': { dx: 18, dy: -78 },  // 거창휴 - high above 가조IC/TN
      '14209': { dx: 52, dy: 38 },   // 양전교 - south-east of 고령IC~동고령IC
      '14103': { dx: -16, dy: -54 }, // 논공휴 - above 고령JC~옥포JC
      '14410': { dx: 98, dy: 104 }   // 논공교 - cleanly below 고령JC box, clear of 대구 & 달성군
    };
    out.push('<g class="road-temp-pins">');
    for (const stn of CORRIDOR_MAP_STATIONS) {
      const obs = stnMap.get(stn.stnId);
      if (!obs || !Number.isFinite(obs.roadTemp)) continue;
      const q = G.map(mapX(stn.lon), mapY(stn.lat));
      const tr = obs.roadTemp;
      const pillCol = tr <= 0.5 ? '#f43f5e' : tr <= 2.5 ? '#fb923c' : '#38bdf8';
      const off = STN_OFFSETS[stn.stnId] || { dx: 0, dy: -44 };
      const px = Math.max(78, Math.min(G.w - 78, q.x + off.dx));
      const py = Math.max(G.rect.y + 22, Math.min(G.rect.y + G.rect.h - 20, q.y + off.dy));
      const txt = `${stn.label} ${tr.toFixed(1)}°`;
      const bw = txt.length * 10 + 20;
      out.push(`<line x1="${n1(q.x)}" y1="${n1(q.y)}" x2="${n1(px)}" y2="${n1(py)}" stroke="${pillCol}" stroke-width="1.4" stroke-dasharray="3 2" opacity="0.78"/>`);
      out.push(`<circle cx="${n1(q.x)}" cy="${n1(q.y)}" r="4" fill="${pillCol}" stroke="#061222" stroke-width="1.5"/>`);
      out.push(`<rect x="${n1(px - bw / 2)}" y="${n1(py - 13)}" width="${n1(bw)}" height="25" rx="12.5" fill="#071526" stroke="${pillCol}" stroke-width="1.7" filter="url(#rwShadow)"/>`);
      out.push(`<text x="${n1(px)}" y="${n1(py + 4)}" text-anchor="middle" fill="${pillCol}" font-size="14" font-weight="850">${esc(txt)}</text>`);
    }
    out.push('</g>');
  }

  // 8. IC / JC / TN Nodes & High-Contrast TV Labels
  const LABEL_OFFSET = {
    '함양IC': { dx: -76, dy: -42 },
    '함양JC': { dx: 74, dy: 44 },
    '거창IC': { dx: -74, dy: -20 },
    '살피재TN': { dx: -26, dy: -46 },
    '가조IC': { dx: 8, dy: -42 },
    '가조TN': { dx: 12, dy: 48 },
    '가야1TN': { dx: 12, dy: -46 },
    '가야3TN': { dx: 58, dy: -44 },
    '해인사IC': { dx: -16, dy: 52 },
    '고령IC': { dx: 24, dy: 54 },
    '동고령IC': { dx: -76, dy: -40 },
    '고령JC': { dx: 92, dy: 30 },
    '옥포JC': { dx: 78, dy: -34 }
  };

  out.push('<g class="route-nodes">');
  for (const node of ROUTE_NODES) {
    const pb = pointAtKm(node.km, G.base);
    const q = G.map(pb.x, pb.y);
    const off = LABEL_OFFSET[node.name] || { dx: 0, dy: node.side > 0 ? -42 : 44 };
    const lx = Math.max(76, Math.min(G.w - 76, q.x + off.dx));
    const ly = Math.max(G.rect.y + 30, Math.min(G.rect.y + G.rect.h - 26, q.y + off.dy));
    const isTn = node.kind === 'tn';
    const isJc = node.kind === 'jc';
    const fontSize = isTn ? 17 : 22;
    const pillW = Math.max(84, node.name.length * (isTn ? 14.5 : 19) + 26);
    const pillH = node.sub ? 48 : (isTn ? 28 : 34);

    out.push(`<g class="node-hit" data-point="${esc(node.point || '')}" data-nodename="${esc(node.name)}">`);
    out.push(`<line x1="${n1(q.x)}" y1="${n1(q.y)}" x2="${n1(lx)}" y2="${n1(ly)}" stroke="#6e98c2" stroke-width="1.5" opacity="0.72"/>`);
    if (isTn) {
      out.push(`<rect x="${n1(q.x - 10)}" y="${n1(q.y - 7)}" width="20" height="14" rx="5" fill="#0b1a2d" stroke="#cbd5e1" stroke-width="2.2"/>`);
    } else if (isJc) {
      out.push(`<polygon points="${n1(q.x)},${n1(q.y - 12)} ${n1(q.x + 12)},${n1(q.y)} ${n1(q.x)},${n1(q.y + 12)} ${n1(q.x - 12)},${n1(q.y)}" fill="#34d399" stroke="#061423" stroke-width="3"/>`);
    } else {
      out.push(`<circle cx="${n1(q.x)}" cy="${n1(q.y)}" r="9.5" fill="#f8fbff" stroke="#091525" stroke-width="3.2"/>`);
    }

    out.push(`<rect x="${n1(lx - pillW / 2)}" y="${n1(ly - pillH / 2)}" width="${n1(pillW)}" height="${pillH}" rx="8" fill="#0b192c" fill-opacity="0.94" stroke="${isJc ? '#34d399' : isTn ? '#47688a' : '#7ba6d1'}" stroke-width="${isTn ? '1.3' : '1.9'}" filter="url(#rwShadow)"/>`);
    if (node.sub) {
      out.push(`<text x="${n1(lx)}" y="${n1(ly - 3)}" text-anchor="middle" fill="#f8fbff" font-size="${fontSize}" font-weight="850">${esc(node.name)}</text>`);
      out.push(`<text x="${n1(lx)}" y="${n1(ly + 16)}" text-anchor="middle" fill="#8fb5d9" font-size="13.5" font-weight="700">${esc(node.sub)}</text>`);
    } else {
      out.push(`<text x="${n1(lx)}" y="${n1(ly + (isTn ? 6 : 8))}" text-anchor="middle" fill="${isTn ? '#cfe2f5' : '#f8fbff'}" font-size="${fontSize}" font-weight="850">${esc(node.name)}</text>`);
    }
    out.push('</g>');
  }
  out.push('</g>');
  out.push('</g>'); // end clip

  // Footer Legend inside SVG
  const footY = G.h - G.foot;
  out.push(`<rect x="0" y="${footY}" width="${G.w}" height="${G.foot}" fill="#0a1626"/>`);
  out.push(`<line x1="0" y1="${footY}" x2="${G.w}" y2="${footY}" stroke="#1d3552" stroke-width="1.5"/>`);

  const legItems = [
    { lv: 0, text: '0단계 안전' },
    { lv: 1, text: '1단계 관심' },
    { lv: 2, text: '2단계 주의' },
    { lv: 3, text: '3단계 위험' }
  ];
  let lx = 28;
  for (const li of legItems) {
    out.push(`<rect x="${lx}" y="${footY + 13}" width="30" height="9" rx="4.5" fill="${LEVEL_COLORS[li.lv]}"/>`);
    out.push(`<text x="${lx + 38}" y="${footY + 23}" fill="#e2eefb" font-size="16" font-weight="800">${li.text}</text>`);
    lx += 148;
  }
  out.push(`<text x="28" y="${footY + 48}" fill="#8fb2d4" font-size="14" font-weight="650">방향 · 양방향(위: 대구방향 상행 / 아래: 광주방향 하행) · 이정 95.0–176.0km · 지명: 전북·경남·경북·대구 (함양·거창·합천·고령·달성군)</text>`);
  out.push(`<text x="${G.w - 28}" y="${footY + 24}" text-anchor="end" fill="#9bb8d6" font-size="14.5" font-weight="700">출처 · 기상청 RWIS · 도로기상관측(14) · 단기예보(13개소) · CCTV 62지점</text>`);
  out.push(`<text x="${G.w - 28}" y="${footY + 48}" text-anchor="end" fill="#6f91b4" font-size="13.5" font-weight="600">구간 클릭: 필터 · IC/터널 클릭: 인근 실시간 CCTV 재생</text>`);

  out.push('</svg>');
  stage.innerHTML = out.join('');

  // Wire map interactive clicks
  stage.querySelectorAll('.zone-hit').forEach(el => {
    el.addEventListener('click', () => {
      const z = el.dataset.zone;
      state.selectedZoneSuffix = state.selectedZoneSuffix === z ? null : z;
      renderAll();
    });
  });
  stage.querySelectorAll('.node-hit').forEach(el => {
    el.addEventListener('click', () => {
      const ptName = el.dataset.point;
      if (ptName) openPointCctvByName(ptName);
    });
  });
}

/* ───────────────────── 8개 구간 통합 카드 렌더 ───────────────────── */
function renderZoneCards(enriched) {
  const grid = $('rwisZonesGrid');
  if (!grid) return;
  grid.innerHTML = enriched.zones.map(z => {
    const bucket = state.metric === 'vir' ? z.vir : z.fsm;
    const lv = getZoneLevel(z);
    const badgeText = state.dir === 'both'
      ? (bucket.E === bucket.S
          ? `양방향 ${LEVEL_NAME[lv]}`
          : `대구 ${LEVEL_NAME[bucket.E]} · 광주 ${LEVEL_NAME[bucket.S]}`)
      : `${state.dir === 'E' ? '대구' : '광주'} ${LEVEL_NAME[lv]}`;

    // Road Obs line
    const ro = z.roadObs;
    const hasRoadTemp = Number.isFinite(ro.minRoadTemp);
    const tempCls = hasRoadTemp
      ? (ro.minRoadTemp <= 0.5 ? 'is-freeze' : ro.minRoadTemp <= 2.5 ? 'is-cold' : '')
      : '';
    const roadTempText = hasRoadTemp ? `노면 ${ro.minRoadTemp.toFixed(1)}°C` : '노면 확인 중';
    const airParts = [];
    if (Number.isFinite(ro.minAirTemp)) airParts.push(`기온 ${ro.minAirTemp.toFixed(1)}°C`);
    if (ro.surfaceState) airParts.push(ro.surfaceState);

    // Short-term 13 forecast line
    const sf = z.shortForecast;
    let fcstText = '13개소 예보 확인 중';
    let fcstCls = '';
    if (sf.regions.length) {
      const bits = [];
      if (sf.hasOverlap) {
        bits.push('⚠️ 강수+영하 겹침');
        fcstCls = 'is-overlap';
      } else if (sf.firstWet) {
        bits.push(`🌧️ ${sf.firstWet.hour}시 ${sf.firstWet.type}`);
        fcstCls = 'is-warn';
      } else {
        bits.push('☀️ 12h 무강수');
      }
      if (sf.firstFreeze) {
        bits.push(`❄️ ${sf.firstFreeze.hour}시 영하`);
        if (!fcstCls) fcstCls = 'is-warn';
      } else if (sf.minTemp !== null) {
        bits.push(`최저 ${sf.minTemp.toFixed(0)}°C`);
      }
      fcstText = bits.join(' · ');
    }

    const selCls = state.selectedZoneSuffix === z.suffix ? ' is-selected' : '';
    return `
      <div class="rwis-zone-card lv-${lv}${selCls}" data-zone="${esc(z.suffix)}" role="button" tabindex="0">
        <div class="rzc-top">
          <div>
            <div class="rzc-name">${esc(z.name.replace('–', ' ↔ '))}</div>
            <div class="rzc-county">${esc(z.county)}</div>
          </div>
          <span class="rzc-badge lv-${lv}">● ${esc(badgeText)}</span>
        </div>
        <div class="rzc-telemetry">
          <span class="rzc-road-temp ${tempCls}">${esc(roadTempText)}</span>
          <span class="rzc-air-state">${esc(airParts.join(' · ') || (ro.stationName || '도로관측 대기'))}</span>
        </div>
        <div class="rzc-fcst ${fcstCls}">
          <span>${esc(fcstText)}</span>
          <span style="opacity:.78;font-size:11px;">${esc(sf.regionNames.slice(0, 2).join('·'))}</span>
        </div>
        <div class="rzc-foot">
          <span>${z.startKm.toFixed(1)}–${z.endKm.toFixed(1)} km</span>
          <button type="button" class="rzc-cctv-btn" data-zone-cctv="${esc(z.suffix)}">📹 인근 CCTV</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.rwis-zone-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const cctvBtn = e.target.closest('.rzc-cctv-btn');
      const suffix = card.dataset.zone;
      if (cctvBtn) {
        e.stopPropagation();
        state.selectedZoneSuffix = suffix;
        setSideTab('cctv');
        renderAll();
        return;
      }
      state.selectedZoneSuffix = state.selectedZoneSuffix === suffix ? null : suffix;
      renderAll();
    });
  });
}

/* ───────────────────── 우측 KPI + 도로관측 + 13개소 단기예보 + CCTV ───────────────────── */
function renderSidePanel(enriched) {
  // 1. 3 TV KPIs
  const counts = [0, 0, 0, 0];
  let maxLv = 0;
  for (const z of enriched.zones) {
    const lv = getZoneLevel(z);
    counts[lv]++;
    if (lv > maxLv) maxLv = lv;
  }
  const kpiMax = $('kpiMaxRisk');
  kpiMax.className = `rwis-kpi lv-${maxLv}`;
  $('kpiMaxRiskVal').className = `rk-val c-${maxLv}`;
  $('kpiMaxRiskVal').textContent = `${LEVEL_NAME[maxLv]} (${maxLv}단계)`;
  $('kpiMaxRiskSub').textContent = `위험 ${counts[3]} · 주의 ${counts[2]} · 관심 ${counts[1]} · 안전 ${counts[0]}`;

  const coldest = enriched.coldestRoadStation;
  const kpiMin = $('kpiMinRoad');
  if (coldest && Number.isFinite(coldest.roadTemp)) {
    const rt = coldest.roadTemp;
    const lv = rt <= 0.5 ? 3 : rt <= 2.5 ? 2 : rt <= 4.0 ? 1 : 0;
    kpiMin.className = `rwis-kpi lv-${lv}`;
    $('kpiMinRoadVal').className = `rk-val c-${lv}`;
    $('kpiMinRoadVal').textContent = `${rt.toFixed(1)}°C`;
    const st = coldest.surfaceState && coldest.surfaceState !== '관측중' ? ` · ${coldest.surfaceState}` : '';
    $('kpiMinRoadSub').textContent = `${coldest.name}${st}`;
  } else {
    kpiMin.className = 'rwis-kpi';
    $('kpiMinRoadVal').className = 'rk-val';
    $('kpiMinRoadVal').textContent = '—';
    $('kpiMinRoadSub').textContent = '도로기상관측 수신 중';
  }

  const s13 = enriched.short13Summary;
  const kpiS13 = $('kpiShort13');
  const s13Lv = s13.overlapCount > 0 ? 3 : (s13.freezeCount > 0 || s13.wetCount > 0) ? 2 : 0;
  kpiS13.className = `rwis-kpi lv-${s13Lv}`;
  $('kpiShort13Val').className = `rk-val c-${s13Lv}`;
  $('kpiShort13Val').textContent = s13.total
    ? (s13.overlapCount > 0 ? `겹침 ${s13.overlapCount}곳` : `강수 ${s13.wetCount} · 영하 ${s13.freezeCount}`)
    : '—';
  $('kpiShort13Sub').textContent = s13.total
    ? `13개 읍면동 중 강수 ${s13.wetCount} · 영하 ${s13.freezeCount} · 겹침 ${s13.overlapCount}`
    : '13개소 단기예보 수신 중';

  // 2. Road Weather Observation Table
  const tbody = $('roadObsTbody');
  if (tbody) {
    const stnRisks = state.roadRisk?.stationRisks || {};
    const list = (state.roadStations || [])
      .filter(s => s && s.stnId)
      .filter(s => state.showAllStations || (Number(s.milepostKm) || 0) >= 94)
      .sort((a, b) => (Number(a.milepostKm) || 0) - (Number(b.milepostKm) || 0));

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#7c9dbe;padding:14px;">실측 도로기상관측 대기 중…</td></tr>';
    } else {
      tbody.innerHTML = list.map(s => {
        const tr = Number.isFinite(s.roadTemp) ? s.roadTemp : null;
        const ta = Number.isFinite(s.temp) ? s.temp : null;
        const trCls = tr === null ? '' : tr <= 0.5 ? 'td-freeze' : tr <= 2.5 ? 'td-cold' : '';
        const kmTxt = Number.isFinite(s.milepostKm) ? `${s.milepostKm.toFixed(1)}k` : '';
        const typeBadge = s.stationType?.includes('결빙')
          ? '<span class="rwis-stn-type">결빙</span>'
          : s.stationType === '거점'
            ? '<span class="rwis-stn-type hub">거점</span>'
            : '';
        const risk = stnRisks[String(s.stnId)];
        const iceLv = Number.isFinite(risk?.iceLevel) ? risk.iceLevel : null;
        const iceBadge = iceLv !== null
          ? `<span class="rzc-badge lv-${iceLv}" style="padding:1px 6px;font-size:11px;">${LEVEL_NAME[iceLv]}</span>`
          : '<span style="color:#6d8dad;">—</span>';
        const stateTxt = s.surfaceState && s.surfaceState !== '관측중' ? s.surfaceState : '—';
        return `
          <tr>
            <td>${esc(s.name)} <span style="color:#7da0c4;font-size:11.5px;">${kmTxt}</span>${typeBadge}</td>
            <td class="td-num ${trCls}">${tr !== null ? `${tr.toFixed(1)}°C` : '—'}</td>
            <td class="td-num">${ta !== null ? `${ta.toFixed(1)}°C` : '—'}</td>
            <td>${esc(stateTxt)}</td>
            <td class="td-num">${iceBadge}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 3. 13-Region Short-Term Forecast Compact Grid
  const s13Grid = $('short13Grid');
  if (s13Grid) {
    if (!enriched.short13List.length) {
      s13Grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#7c9dbe;padding:14px;">13개소 단기예보 수신 중…</div>';
    } else {
      s13Grid.innerHTML = enriched.short13List.map(r => {
        const cls = r.firstOverlap ? 'is-overlap' : r.firstFreeze ? 'is-freeze' : r.firstWet ? 'is-wet' : '';
        const tempCls = r.minTemp !== null && r.minTemp <= 0 ? 'is-subzero' : '';
        const tempStr = r.curTemp !== null && r.minTemp !== null
          ? `${r.curTemp.toFixed(0)}° / 최저 ${r.minTemp.toFixed(0)}°`
          : (r.minTemp !== null ? `최저 ${r.minTemp.toFixed(0)}°` : '—');
        let meta = '☀️ 12h 맑음·무강수';
        let metaCls = '';
        if (r.firstOverlap) {
          meta = `⚠️ ${r.firstOverlap.hour}시 ${r.firstOverlap.type}·${r.firstOverlap.temp.toFixed(0)}°C`;
          metaCls = 'is-overlap';
        } else if (r.firstWet && r.firstFreeze) {
          meta = `🌧️ ${r.firstWet.hour}시 ${r.firstWet.type} · ❄️ ${r.firstFreeze.hour}시 영하`;
          metaCls = 'is-wet';
        } else if (r.firstWet) {
          meta = `🌧️ ${r.firstWet.hour}시 ${r.firstWet.type} (${r.maxPop}%)`;
          metaCls = 'is-wet';
        } else if (r.firstFreeze) {
          meta = `❄️ ${r.firstFreeze.hour}시 영하 진입`;
        }
        return `
          <div class="rwis-s13-card ${cls}">
            <div class="s13-top">
              <span><span class="s13-name">${esc(r.name)}</span> <span class="s13-grp">${esc(r.group)}</span></span>
              <span class="s13-temps ${tempCls}">${esc(tempStr)}</span>
            </div>
            <div class="s13-meta ${metaCls}">${esc(meta)}</div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. 62-Point CCTV Directory (Tab 2)
  renderCctvList();
}

function getMergedCctvPoints() {
  const livePoints = state.rwisStatus?.cctv?.points;
  if (Array.isArray(livePoints) && livePoints.length) return livePoints;
  return RWIS_MASTER.points;
}

function renderCctvList() {
  const listEl = $('cctvPointList');
  if (!listEl) return;
  const clearBtn = $('clearZoneFilterBtn');
  if (clearBtn) {
    clearBtn.hidden = !state.selectedZoneSuffix;
    if (state.selectedZoneSuffix) {
      const z = RWIS_MASTER.zones.find(x => x.suffix === state.selectedZoneSuffix);
      clearBtn.textContent = `✕ ${z ? z.name : state.selectedZoneSuffix} 해제`;
    }
  }

  const q = state.cctvQuery.trim().toLowerCase();
  const points = getMergedCctvPoints().filter(pt => {
    if (state.selectedZoneSuffix && pt.zone !== state.selectedZoneSuffix && !(pt.nearZones || []).includes(state.selectedZoneSuffix)) {
      return false;
    }
    if (state.cctvFac === 'icjc' && !['IC', 'JC'].includes(pt.facility)) return false;
    if (state.cctvFac === 'rest' && !String(pt.facility || '').includes('휴게')) return false;
    if (state.cctvFac === 'struct' && !['터널', '교량'].includes(pt.facility)) return false;
    if (q) {
      const hay = `${pt.name} ${pt.address || ''} ${pt.facility || ''} ${pt.km}k ${pt.cctvId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!points.length) {
    listEl.innerHTML = '<div style="text-align:center;color:#7c9dbe;padding:24px;">일치하는 CCTV 지점이 없습니다.</div>';
    return;
  }

  listEl.innerHTML = points.map(pt => {
    const cams = Array.isArray(pt.cams) && pt.cams.length ? pt.cams : [{ dir: 'D', cctvId: pt.cctvId }];
    const btns = cams.map(c => {
      const dirTxt = c.dir === 'G' ? '광주 ▶' : '대구 ▶';
      return `<button type="button" class="rcr-play" data-pt-id="${esc(pt.id)}" data-cctv-id="${esc(c.cctvId || pt.cctvId || '')}" data-dir="${esc(c.dir || 'D')}">${dirTxt}</button>`;
    }).join('');
    return `
      <div class="rwis-cctv-row">
        <div class="rcr-info">
          <div class="rcr-title">
            <span class="rcr-km">${Number(pt.km).toFixed(1)}k</span>
            <span>${esc(pt.name)}</span>
            <span style="font-size:11px;color:#7da0c4;font-weight:700;">${esc(pt.facility || '')}</span>
          </div>
          <div class="rcr-addr">${esc(pt.address || '')}</div>
        </div>
        <div class="rcr-btns">${btns}</div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.rcr-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const pt = getMergedCctvPoints().find(p => p.id === btn.dataset.ptId);
      if (pt) openCctvModal(pt, btn.dataset.cctvId, btn.dataset.dir);
    });
  });
}

/* ───────────────────── HLS 실시간 CCTV 모달 ───────────────────── */
function clearModalVideo() {
  if (state.hls) {
    try { state.hls.destroy(); } catch {}
    state.hls = null;
  }
  const v = $('rwisVideo');
  if (v) {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  }
}

function setModalOverlay(visible, title = '', text = '') {
  const ov = $('rwisModalOverlay');
  if (!ov) return;
  ov.hidden = !visible;
  if (visible) {
    $('rwisModalOverlayTitle').textContent = title;
    $('rwisModalOverlayText').textContent = text;
  }
}

function upgradeStreamUrl(u) {
  const raw = String(u || '').trim();
  if (window.location.protocol === 'https:') {
    return raw.replace(/^http:\/\/(cctvsec\.ktict\.co\.kr\/)/i, 'https://$1');
  }
  return raw;
}

function playHlsUrl(url, { poster = '', onFatalFallback = null } = {}) {
  clearModalVideo();
  const video = $('rwisVideo');
  const safeUrl = upgradeStreamUrl(url);
  if (video) video.poster = poster || '';
  $('rwisModalOpenUrl').href = safeUrl;
  $('rwisModalMeta').textContent = safeUrl;
  setModalOverlay(false);

  const isHls = /\.m3u8(\?|$)/i.test(safeUrl) || /playlist|ktict\.co\.kr|hscdn\.com/i.test(safeUrl);
  if (isHls && window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({ lowLatencyMode: true, maxBufferLength: 12, manifestLoadingTimeOut: 10000 });
    state.hls = hls;
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (!data?.fatal) return;
      if (typeof onFatalFallback === 'function') {
        const fb = onFatalFallback;
        onFatalFallback = null;
        fb();
        return;
      }
      setModalOverlay(true, '영상을 불러오지 못했습니다', '스트림 서버 일시 지연 또는 주소 만료 — [다시 연결]을 눌러 보세요.');
    });
    hls.loadSource(safeUrl);
    hls.attachMedia(video);
  } else {
    video.src = safeUrl;
    video.play().catch(() => {});
  }
}

async function fetchRoadplusStreamAndPlay(cctvId) {
  if (!cctvId) {
    setModalOverlay(true, '연결된 CCTV ID가 없습니다', '다른 인접 지점을 선택해 주세요.');
    return;
  }
  setModalOverlay(true, '실시간 CCTV 스트림 연결 중…', '한국도로공사(Roadplus) 스트리밍 주소를 조회하고 있습니다.');
  try {
    const res = await fetch(apiUrl(`/api/rwis/api/stream?cctvId=${encodeURIComponent(cctvId)}`), {
      signal: AbortSignal.timeout(22000)
    });
    const data = await res.json();
    const streamUrl = data?.streamUrl || data?.stream?.hls || data?.hls || data?.url || '';
    if (!res.ok || !streamUrl) throw new Error(data?.message || `HTTP ${res.status}`);
    playHlsUrl(streamUrl, { poster: data?.snapshotUrl || '' });
  } catch (err) {
    setModalOverlay(true, 'CCTV 스트림 연결 실패', String(err?.message || err));
  }
}

async function openCctvModal(pt, cctvId, dir = 'D') {
  const id = cctvId || pt.cctvId;
  state.activeCam = { pt, cctvId: id, dir };
  $('rwisModalTitle').textContent = `📹 ${pt.name} (${dir === 'G' ? '광주방향' : '대구방향'})`;
  $('rwisModalSub').textContent = `${Number(pt.km).toFixed(1)}km · ${pt.address || '광주대구선'}`;
  $('rwisCctvModal').hidden = false;
  setModalOverlay(true, '실시간 CCTV 스트림 연결 중…', '한국도로공사 · ITS 스트리밍 주소를 확인하고 있습니다.');

  // 1. Check if ITS live stream URL is already attached (pt.its is an array of matched ITS cams)
  const itsList = Array.isArray(pt.its) ? pt.its : (pt.its ? [pt.its] : []);
  const bestIts = itsList.find(x => x?.mode === 'exact' && x?.url) || itsList.find(x => x?.url) || null;
  const matchedUrl = bestIts?.url || pt.url || (Array.isArray(pt.itsItems) && pt.itsItems[0]?.url) || '';
  if (matchedUrl) {
    playHlsUrl(matchedUrl, {
      onFatalFallback: id ? () => fetchRoadplusStreamAndPlay(id) : null
    });
    return;
  }

  // 2. Otherwise query /api/rwis/api/stream?cctvId=... (Roadplus live HLS + snapshotUrl)
  await fetchRoadplusStreamAndPlay(id);
}

function openPointCctvByName(name) {
  const norm = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  const target = norm(name);
  const pts = getMergedCctvPoints();
  const pt = pts.find(p => norm(p.name) === target) || pts.find(p => norm(p.name).includes(target));
  if (pt) {
    openCctvModal(pt, pt.cctvId, 'D');
  }
}

function closeCctvModal() {
  clearModalVideo();
  $('rwisCctvModal').hidden = true;
  state.activeCam = null;
}

/* ───────────────────── PNG 리포트 저장 ───────────────────── */
function exportMapPng() {
  const svg = $('rwisCorridorSvg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1026;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(pngBlob => {
      if (!pngBlob) return;
      const dlUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `gwangju-daegu-rwis-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 3000);
    }, 'image/png');
  };
  img.src = url;
}

/* ───────────────────── 데이터 로딩 & 5분 탭 캐싱 ───────────────────── */
function updateStampUI(isError = false) {
  const pill = $('rwisStampPill');
  const txt = $('rwisStampText');
  if (!pill || !txt) return;
  pill.classList.toggle('is-cached', state.fromCache && !isError);
  pill.classList.toggle('is-error', isError);
  const hm = formatKstHm(state.lastSyncedAt) || '대기';
  if (isError) {
    txt.textContent = `연결 지연 · 마지막 ${hm}`;
  } else if (state.fromCache) {
    txt.textContent = `캐시 즉시표출 · ${hm}`;
  } else {
    txt.textContent = `실시간 ${hm}`;
  }
}

function renderAll() {
  const enriched = getEnriched();
  renderCorridorMap(enriched);
  renderZoneCards(enriched);
  renderSidePanel(enriched);
  updateStampUI(false);
}

function seedSharedCrossTabCaches(scope) {
  let seeded = false;
  if (!state.shortTerm13) {
    const hourlyHit = readPageCache(HOURLY_CACHE_KEY, { expectedScope: scope });
    if (hourlyHit?.entry?.data?.regions) {
      state.shortTerm13 = hourlyHit.entry.data;
      seeded = true;
    }
  }
  if (!state.roadStations.length || !state.roadRisk) {
    // overview 캐시는 scope가 `${apiBase}|coords...` 형식이므로 prefix 일치 시 안전하게 재사용
    const ovHit = readPageCache(OVERVIEW_CACHE_KEY, { expectedScope: null });
    const ovScope = String(ovHit?.entry?.scope || '');
    const ovData = ovHit?.entry?.data;
    if (ovData && (ovScope === scope || ovScope.startsWith(`${scope}|`))) {
      if (!state.roadStations.length && Array.isArray(ovData.roadStations) && ovData.roadStations.length) {
        state.roadStations = ovData.roadStations;
        seeded = true;
      }
      if (!state.roadRisk && ovData.roadRiskData?.ok) {
        state.roadRisk = ovData.roadRiskData;
        seeded = true;
      }
    }
  }
  return seeded;
}

function hydrateFromCache() {
  const scope = rwisCacheScope();
  const rwisHit = readPageCache(RWIS_CACHE_KEY, { expectedScope: scope });
  if (rwisHit?.entry?.data) {
    const d = rwisHit.entry.data;
    state.rwisStatus = d.rwisStatus || null;
    state.roadStations = Array.isArray(d.roadStations) ? d.roadStations : [];
    state.roadRisk = d.roadRisk || null;
    state.shortTerm13 = d.shortTerm13 || null;
    seedSharedCrossTabCaches(scope);
    state.fromCache = true;
    state.lastSyncedAt = rwisHit.entry.savedAt || 0;
    state.lastSyncHourKey = rwisHit.entry.hourKey || null;
    renderAll();
    const policy = evaluateCachePolicy({ cacheHit: rwisHit, freshMs: DEFAULT_FRESH_MS, dwellMs: DEFAULT_DWELL_MS });
    // 도로관측 또는 13개소 예보 중 누락된 소스가 있으면 백그라운드 즉시 보완
    if (!state.roadStations.length || !state.shortTerm13?.regions?.length) {
      return { ...policy, shouldFetchNow: true };
    }
    return policy;
  }

  // Fallback: seed 13-region forecast & road-obs instantly from hourly/overview shared 5-min caches!
  if (seedSharedCrossTabCaches(scope)) {
    renderAll();
  }
  return { shouldFetchNow: true, backgroundDwellDelayMs: null };
}

function persistCache() {
  writePageCache(RWIS_CACHE_KEY, {
    scope: rwisCacheScope(),
    data: {
      rwisStatus: state.rwisStatus,
      roadStations: state.roadStations,
      roadRisk: state.roadRisk,
      shortTerm13: state.shortTerm13
    }
  });
}

async function fetchJsonSafe(path, timeoutMs = 11000, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(apiUrl(path), { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      if (r.ok) return r.json();
      lastErr = new Error(`HTTP ${r.status}`);
      // 502/503/504 일시적 상류 오류는 1회 재시도
      if (attempt < retries && (r.status === 502 || r.status === 503 || r.status === 504)) {
        await new Promise(res => setTimeout(res, 1200));
        continue;
      }
      throw lastErr;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, 1200));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('API fetch failed');
}

async function loadAllData({ force = false, silent = false } = {}) {
  if (state.loadPromise) return state.loadPromise;
  clearTimeout(state.dwellTimer);
  state.dwellTimer = null;

  const btn = $('rwisReloadBtn');
  if (btn && !silent) btn.classList.add('loading');

  state.loadPromise = (async () => {
    const refreshParam = force ? '?refresh=1' : '';
    let okCount = 0;
    const errors = [];

    const markLive = () => {
      okCount++;
      state.fromCache = false;
      state.lastSyncedAt = Date.now();
      state.lastSyncHourKey = currentKstHourKey();
      persistCache();
      reportApiSuccess('rwis');
      renderAll();
    };

    const tasks = [
      fetchJsonSafe(`/api/rwis/api/status${refreshParam}`, 14000)
        .then(v => { if (v?.ok) { state.rwisStatus = v; markLive(); } })
        .catch(e => { errors.push(`RWIS(${e?.message || 'err'})`); }),
      fetchJsonSafe('/api/road-obs?line=14', 12000)
        .then(v => {
          const list = Array.isArray(v) ? v : (Array.isArray(v?.stations) ? v.stations : []);
          if (list.length) { state.roadStations = list; markLive(); }
        })
        .catch(e => { errors.push(`도로관측(${e?.message || 'err'})`); }),
      fetchJsonSafe('/api/road-risk?roadNum=012', 12000)
        .then(v => { if (v?.ok) { state.roadRisk = v; markLive(); } })
        .catch(e => { errors.push(`도로위험(${e?.message || 'err'})`); }),
      fetchJsonSafe(`/api/short-term-12?roster=13${force ? '&force=1' : ''}`, 30000)
        .then(v => {
          if (v?.ok && Array.isArray(v.regions)) {
            state.shortTerm13 = v;
            // hourly.html과 5분 탭 캐시 양방향 공유 (13개소 완전본일 때만)
            if (v.regions.some(r => r.id === 'gaya')) {
              writePageCache(HOURLY_CACHE_KEY, { scope: rwisCacheScope(), data: v });
            }
            markLive();
          }
        })
        .catch(async e => {
          errors.push(`13개소예보(${e?.message || 'err'})`);
          // 정적 스냅샷 보조 폴백 (단, reportApiSuccess는 호출하지 않아 실제 단절 감지를 방해하지 않음)
          if (!state.shortTerm13) {
            try {
              const snapRes = await fetch('./api/short-term-12.json?roster=13', { signal: AbortSignal.timeout(5000) });
              if (snapRes.ok) {
                const snap = await snapRes.json();
                if (snap?.ok && Array.isArray(snap.regions)) {
                  state.shortTerm13 = snap;
                  renderAll();
                }
              }
            } catch {}
          }
        })
    ];

    await Promise.allSettled(tasks);

    if (okCount === 0) {
      reportApiFailure('rwis', errors.join(', ') || 'API 연결 실패');
      updateStampUI(true);
    }
  })().finally(() => {
    if (btn) btn.classList.remove('loading');
    state.loadPromise = null;
  });

  return state.loadPromise;
}

/* ───────────────────── UI 이벤트 바인딩 ───────────────────── */
function setSideTab(tabName) {
  state.sideTab = tabName;
  document.querySelectorAll('.rwis-side-tab').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.sideTab === tabName ? 'true' : 'false');
  });
  $('sidePanelTelemetry').hidden = tabName !== 'telemetry';
  $('sidePanelCctv').hidden = tabName !== 'cctv';
}

document.querySelectorAll('[data-metric]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.metric = btn.dataset.metric;
    document.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    renderAll();
  });
});

document.querySelectorAll('[data-dir]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.dir = btn.dataset.dir;
    document.querySelectorAll('[data-dir]').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    renderAll();
  });
});

$('toggleRoadTempOverlay')?.addEventListener('click', () => {
  state.showRoadTemps = !state.showRoadTemps;
  $('toggleRoadTempOverlay').setAttribute('aria-pressed', String(state.showRoadTemps));
  renderAll();
});

$('toggleMapBigBtn')?.addEventListener('click', () => {
  state.mapBig = !state.mapBig;
  document.body.classList.toggle('rwis-map-big', state.mapBig);
  $('toggleMapBigBtn').setAttribute('aria-pressed', String(state.mapBig));
  $('toggleMapBigBtn').textContent = state.mapBig ? '⤡ 기본 보기' : '⛶ 지도 크게';
});

document.querySelectorAll('.rwis-side-tab').forEach(btn => {
  btn.addEventListener('click', () => setSideTab(btn.dataset.sideTab));
});

$('toggleAllStationsBtn')?.addEventListener('click', () => {
  state.showAllStations = !state.showAllStations;
  $('toggleAllStationsBtn').setAttribute('aria-pressed', String(state.showAllStations));
  renderAll();
});

$('cctvSearchInput')?.addEventListener('input', e => {
  state.cctvQuery = e.target.value;
  renderCctvList();
});

document.querySelectorAll('[data-cctv-fac]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.cctvFac = btn.dataset.cctvFac;
    document.querySelectorAll('[data-cctv-fac]').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    renderCctvList();
  });
});

$('clearZoneFilterBtn')?.addEventListener('click', () => {
  state.selectedZoneSuffix = null;
  renderAll();
});

$('rwisReloadBtn')?.addEventListener('click', () => {
  clearPageCache(RWIS_CACHE_KEY);
  loadAllData({ force: true, silent: false });
});

$('rwisPngBtn')?.addEventListener('click', exportMapPng);

$('rwisTvBtn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => {
  const lbl = $('rwisTvLabel');
  if (lbl) lbl.textContent = document.fullscreenElement ? '전체화면 종료' : 'TV 전체화면';
});

$('rwisModalClose')?.addEventListener('click', closeCctvModal);
$('rwisCctvModal')?.addEventListener('click', e => {
  if (e.target === $('rwisCctvModal')) closeCctvModal();
});
$('rwisModalRetry')?.addEventListener('click', () => {
  if (state.activeCam) openCctvModal(state.activeCam.pt, state.activeCam.cctvId, state.activeCam.dir);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('rwisCctvModal').hidden) closeCctvModal();
});

/* ───────────────────── 초기화 ───────────────────── */
mountNetHealthMonitor({
  onRetry: () => loadAllData({ force: true, silent: false })
});

const policy = hydrateFromCache();
if (!state.rwisStatus && !state.roadStations.length) {
  renderAll();
}
if (policy.shouldFetchNow) {
  loadAllData({ force: false, silent: state.fromCache });
} else if (policy.backgroundDwellDelayMs != null) {
  state.dwellTimer = setTimeout(() => {
    if (!document.hidden) loadAllData({ force: false, silent: true });
  }, policy.backgroundDwellDelayMs);
}

// 50인치 TV 24시간 무인 표출용 5분 주기 자동 갱신 + 정시 롤오버 감지
setInterval(() => {
  if (!document.hidden) loadAllData({ force: false, silent: true });
}, OVERVIEW_REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const now = Date.now();
    const stale = !state.lastSyncedAt || (now - state.lastSyncedAt >= DEFAULT_FRESH_MS) || (state.lastSyncHourKey !== currentKstHourKey(now));
    if (stale) loadAllData({ force: false, silent: state.lastSyncedAt > 0 });
  }
});
