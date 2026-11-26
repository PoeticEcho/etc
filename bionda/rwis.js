import { apiUrl, getApiBase } from './config.js';
import { getKmaIconInfo, renderKmaIconSvg } from './kma-icons.js';
import { fetchCctvDirectory } from './cctv-request.js';
import { cameraDirectory, cameraId } from './cctv-order.js';
import {
  readPageCache,
  writePageCache,
  clearPageCache,
  evaluateCachePolicy,
  currentKstHourKey,
  registerManualRefreshClick,
  extractRoadObsTm,
  readSharedRoadObs,
  writeSharedRoadObs,
  SHARED_ROAD_OBS_KEY,
  DEFAULT_FRESH_MS,
  DEFAULT_DWELL_MS,
  OVERVIEW_REFRESH_MS
} from './page-cache.js';
import {
  mountNetHealthMonitor,
  reportApiSuccess,
  reportApiFailure
} from './net-health.js';
import { mountTvGuard } from './tv-guard.js';
import { mountIceAlertModal } from './ice-alert-modal.js';
import {
  RWIS_MASTER,
  RWIS_ROUTE_GEO,
  LEVEL_NAME,
  PROVINCE_LABELS_FIXED,
  COUNTY_LABELS,
  ROUTE_NODES,
  CORRIDOR_MAP_STATIONS,
  SHORT13_MAP_LOCATIONS,
  WATCH_WARNING_REGIONS,
  ZONE_INTEGRATION_MAP,
  indexStationRisks,
  normalizeZoneGrade,
  enrichZonesWithBionda,
  updateWarningHistory,
  alignShortTerm6hMatrix,
  buildSpecialBulletinCards,
  buildZoneTempTrendSeries,
  renderMicroSparklineSvg,
  formatStationBasisLabel,
  formatRwisCalloutLines
} from './rwis-data.js';

const RWIS_CACHE_KEY = 'weather-watch:cache:rwis:v1';
const RWIS_UI_KEY = 'weather-watch:rwis-ui:v1';
const HOURLY_CACHE_KEY = 'weather-watch:cache:hourly:v3';
const OVERVIEW_CACHE_KEY = 'weather-watch:cache:overview:v2';
const WARN_HISTORY_KEY = 'weather-watch:rwis-warn-history:v1';
const CCTV_CLIENT_TTL_MS = 15 * 60 * 1000; // 서버 /api/cctv 15분 캐시와 정렬 (5분 루프 중복 호출 절감)
const ROAD_TREND_CLIENT_TTL_MS = 10 * 60 * 1000; // 서버 /api/road-obs-trend 10분 Edge 캐시와 정렬
const rwisCacheScope = () => getApiBase() || '__same_origin__';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const LEVEL_COLORS = ['#38dbf8', '#facc15', '#fb923c', '#f43f5e'];
const PROV_FILL = {
  '경상남도': '#122943',
  '경상북도': '#10243a',
  '전라북도': '#142d4a',
  '대구광역시': '#1a3754',
  '전라남도': '#10253a'
};

function readWarnHistory() {
  try {
    return JSON.parse(localStorage.getItem(WARN_HISTORY_KEY) || 'null') || { activeByRegion: {}, lifted: [] };
  } catch {
    return { activeByRegion: {}, lifted: [] };
  }
}

function saveWarnHistory(hist) {
  try {
    localStorage.setItem(WARN_HISTORY_KEY, JSON.stringify(hist));
  } catch {}
}

function readRwisUiPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(RWIS_UI_KEY) || '{}') || {};
    return {
      showRoadTemps: typeof raw.showRoadTemps === 'boolean' ? raw.showRoadTemps : true,
      showShort13Map: typeof raw.showShort13Map === 'boolean' ? raw.showShort13Map : true
    };
  } catch {
    return { showRoadTemps: true, showShort13Map: true };
  }
}

function saveRwisUiPrefs() {
  try {
    localStorage.setItem(RWIS_UI_KEY, JSON.stringify({
      showRoadTemps: state.showRoadTemps,
      showShort13Map: state.showShort13Map
    }));
  } catch {}
}

const initialUi = readRwisUiPrefs();

const state = {
  metric: 'fsm',          // 'fsm' (살얼음) | 'vir' (가시거리)
  dir: 'both',            // 'both' | 'E' (대구↑) | 'S' (광주↓)
  showRoadTemps: initialUi.showRoadTemps,
  showShort13Map: initialUi.showShort13Map,
  mapBig: false,
  sideTab: 'short6',      // 'short6' (기본 TV 메인) | 'telemetry' | 'cctv'
  showAllStations: false,
  selectedZoneSuffix: null,
  cctvQuery: '',
  cctvFac: 'all',
  rwisStatus: null,
  roadStations: [],
  roadObsTm: '',
  lastRoadObsSyncAt: 0,
  roadTrend: null,
  roadTrendFetchedAt: 0,
  roadRisk: null,
  shortTerm13: null,
  warningsPayload: null,
  warningHistory: readWarnHistory(),
  cctvPayload: null,
  cctvFetchedAt: 0,
  fromCache: false,
  lastSyncedAt: 0,
  lastSyncHourKey: null,
  isRevalidating: false,
  dwellTimer: null,
  loadPromise: null,
  hls: null,
  activeCamIndex: -1,
  activeCamId: ''
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

function parseTm12ToMs(tmStr) {
  const clean = String(tmStr || '').replace(/\D/g, '').slice(0, 12);
  if (clean.length !== 12) return NaN;
  return Date.parse(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(8, 10)}:${clean.slice(10, 12)}:00+09:00`);
}

function getRoadObsAgeMs(nowMs = Date.now()) {
  const tm = state.roadObsTm || extractRoadObsTm(state.roadStations);
  const ms = parseTm12ToMs(tm);
  return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : Infinity;
}

function applyIncomingRoadObs(list, explicitTm = '', { isLive = true } = {}) {
  if (!Array.isArray(list) || !list.length) return false;
  const synced = writeSharedRoadObs({ line: '14', tm1: explicitTm, stations: list });
  const bestStations = synced?.stations?.length ? synced.stations : list;
  const bestTm = synced?.tm1 || extractRoadObsTm(bestStations, explicitTm);
  const curTm = state.roadObsTm || extractRoadObsTm(state.roadStations);
  if (curTm && bestTm && bestTm < curTm) return false;
  const changed = !state.roadStations.length || bestTm !== curTm || bestStations !== state.roadStations;
  state.roadStations = bestStations;
  if (bestTm) state.roadObsTm = bestTm;
  if (isLive) state.lastRoadObsSyncAt = Date.now();
  return changed;
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

function getZoneRawLevel(zone) {
  const bucket = state.metric === 'vir' ? zone.vir : zone.fsm;
  if (!bucket || bucket.missing) return null;
  if (state.dir === 'E') return bucket.rawE ?? bucket.E;
  if (state.dir === 'S') return bucket.rawS ?? bucket.S;
  return bucket.rawMax ?? bucket.max;
}

function getRwisCore() {
  if (!state.rwisStatus) return null;
  if (state.rwisStatus.rwis) return state.rwisStatus.rwis;
  if (state.rwisStatus.kind === 'rwis' || Array.isArray(state.rwisStatus.zones)) return state.rwisStatus;
  return null;
}

function getEnriched() {
  const core = getRwisCore();
  const rwisZones = core?.zones || [];
  return enrichZonesWithBionda({
    rwisZones,
    roadStations: state.roadStations,
    roadRisk: state.roadRisk,
    shortTerm13: state.shortTerm13,
    rwisTm: core?.tm || null
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
  let missingZones = 0;
  let maxLv = 0;
  for (const z of enriched.zones) {
    const rawLv = getZoneRawLevel(z);
    if (rawLv === null) {
      missingZones++;
      continue;
    }
    counts[rawLv] = (counts[rawLv] || 0) + 1;
    if (rawLv > maxLv) maxLv = rawLv;
  }

  const rwisCore = getRwisCore();
  const rwisTmObj = rwisCore?.tm;
  const frRaw = typeof rwisTmObj === 'string'
    ? rwisTmObj
    : (rwisTmObj?.FR || state.roadRisk?.sources?.frgTmKst || state.roadRisk?.tmKst || '');
  const vrRaw = typeof rwisTmObj === 'string'
    ? ''
    : (rwisTmObj?.VR || state.roadRisk?.sources?.fogTmKst || '');
  const rwisTmRaw = state.metric === 'vir' ? (vrRaw || frRaw) : (frRaw || vrRaw);
  const effectiveRoadTm = state.roadObsTm || extractRoadObsTm(state.roadStations);
  const syncStamp = formatKstHm(state.lastSyncedAt) || formatKstHm(effectiveRoadTm) || formatKstHm(rwisTmRaw);
  const roadHm = effectiveRoadTm ? formatKstHm(effectiveRoadTm).slice(6) : '';
  const frHm = frRaw ? formatKstHm(frRaw).slice(6) : '';
  const vrHm = vrRaw ? formatKstHm(vrRaw).slice(6) : '';
  const roadAgeMin = Math.floor(getRoadObsAgeMs() / 60000);
  const baseBits = [];
  if (roadHm) baseBits.push(roadAgeMin >= 10 && Number.isFinite(roadAgeMin) ? `노면실측 ${roadHm} ⚠${roadAgeMin}분전` : `노면실측 ${roadHm}`);
  if (state.metric === 'vir') {
    if (vrHm) baseBits.push(`가시거리 ${vrHm}`);
    if (frHm && vrHm && frHm !== vrHm) baseBits.push(`살얼음 ${frHm}`);
  } else {
    if (frHm) baseBits.push(`RWIS ${frHm}`);
    if (vrHm && frHm && vrHm !== frHm) baseBits.push(`안개 ${vrHm}`);
  }
  const stampHeadline = syncStamp
    ? `갱신 ${syncStamp}${baseBits.length ? ` (${baseBits.join(' · ')})` : ''}`
    : '수신 중';
  const srcName = rwisCore?.ok
    ? '기상청 RWIS 실시간'
    : (state.roadRisk?.ok ? '기상청 012 도로위험 연동' : '기상청 도로기상');

  const out = [];
  out.push(`<svg id="rwisCorridorSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G.w} ${G.h}" role="img" aria-label="광주대구선 ${metricLabel} 노선 지도">`);
  out.push(`<defs>
    <linearGradient id="rwPaper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1829"/><stop offset="100%" stop-color="#081322"/>
    </linearGradient>
    <linearGradient id="rwSea" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#081424"/><stop offset="55%" stop-color="#0c1d33"/><stop offset="100%" stop-color="#091628"/>
    </linearGradient>
    <radialGradient id="rwAmbient" cx="52%" cy="46%" r="58%">
      <stop offset="0%" stop-color="#1d446e" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#081424" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rwCalloutBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f333d" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="#071b24" stop-opacity="0.99"/>
    </linearGradient>
    <linearGradient id="rwWeatherPillBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f2540" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#081628" stop-opacity="0.98"/>
    </linearGradient>
    <clipPath id="rwClip"><rect x="0" y="${G.rect.y}" width="${G.rect.w}" height="${G.rect.h}"/></clipPath>
    <filter id="rwGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="rwShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#020813" flood-opacity="0.88"/>
    </filter>
  </defs>`);

  // Canvas paper
  out.push(`<rect x="0" y="0" width="${G.w}" height="${G.h}" fill="url(#rwPaper)"/>`);

  // Header strip inside SVG (TV crisp + PNG report ready · 상단 실시간 스탬프와 분 단위 완전 일치)
  const headerDotCol = missingZones === enriched.zones.length ? '#64748b' : LEVEL_COLORS[maxLv];
  out.push(`<rect x="0" y="0" width="${G.w}" height="${G.head}" fill="#0a1626"/>`);
  out.push(`<line x1="0" y1="${G.head}" x2="${G.w}" y2="${G.head}" stroke="#1d3552" stroke-width="1.5"/>`);
  out.push(`<circle cx="30" cy="24" r="5.5" fill="${headerDotCol}"/>`);
  out.push(`<text x="46" y="30" fill="#e8f3ff" font-size="19.5" font-weight="800" letter-spacing="-0.3">${esc(srcName)} · ${esc(metricLabel)}</text>`);
  out.push(`<text x="46" y="53" fill="#8fb2d4" font-size="14.5" font-weight="650">${esc(stampHeadline)} · 함양IC 95.0 → 옥포JC 176.0km · 8개 구간 · ${esc(dirLabel)}</text>`);

  // Right-side TV level count pills inside SVG header
  const allMissing = missingZones === enriched.zones.length;
  const chipSpecs = [
    { lv: 3, label: '위험', count: counts[3] },
    { lv: 2, label: '주의', count: counts[2] },
    { lv: 1, label: '관심', count: counts[1] },
    { lv: 0, label: allMissing ? '미수신' : '안전', count: allMissing ? missingZones : counts[0], muted: allMissing }
  ];
  let cx = G.w - 28;
  for (let i = chipSpecs.length - 1; i >= 0; i--) {
    const cs = chipSpecs[i];
    const cw = 124;
    cx -= cw;
    const col = cs.muted ? '#64748b' : LEVEL_COLORS[cs.lv];
    const active = cs.count > 0 && !cs.muted;
    const blinkCls = active && cs.lv >= 3 ? ' class="rwis-zone-blink-danger"' : active && cs.lv === 2 ? ' class="rwis-zone-blink-caution"' : '';
    out.push(`<g${blinkCls}>`);
    out.push(`<rect x="${cx}" y="12" width="${cw}" height="42" rx="10" fill="${active ? col : '#0f2035'}" fill-opacity="${active ? '0.2' : '0.85'}" stroke="${active ? col : '#263f5d'}" stroke-width="${active ? '2' : '1.2'}"/>`);
    out.push(`<circle cx="${cx + 20}" cy="33" r="5" fill="${col}"/>`);
    out.push(`<text x="${cx + 32}" y="39" fill="#d9e8f8" font-size="16" font-weight="800">${cs.label}</text>`);
    out.push(`<text x="${cx + cw - 14}" y="40" text-anchor="end" fill="${active ? col : '#7896b6'}" font-size="20" font-weight="900">${cs.count}</text>`);
    out.push(`</g>`);
    cx -= 9;
  }

  // ── Precompute Overlay Items (지시선 하위 레이어 분리 렌더링을 위한 좌표 선계산) ──
  const LABEL_OFFSET = {
    '함양IC':   { dx: -82, dy: -48 },
    '함양JC':   { dx: 82,  dy: 28 },
    '거창IC':   { dx: -76, dy: -16 },
    '살피재TN': { dx: 10,  dy: 46 },
    '가조IC':   { dx: -24, dy: -46 },
    '가조TN':   { dx: 6,   dy: 48 },
    '가야1TN':  { dx: -12, dy: -50 },
    '가야3TN':  { dx: 44,  dy: -44 },
    '해인사IC': { dx: -16, dy: 52 },
    '고령IC':   { dx: 26,  dy: 54 },
    '동고령IC': { dx: -52, dy: -46 },
    '고령JC':   { dx: 92,  dy: 30 },
    '옥포JC':   { dx: 82,  dy: -34 }
  };

  const nodeRenderList = ROUTE_NODES.map(node => {
    const pb = pointAtKm(node.km, G.base);
    const q = G.map(pb.x, pb.y);
    const off = LABEL_OFFSET[node.name] || { dx: 0, dy: node.side > 0 ? -42 : 44 };
    const lx = Math.max(76, Math.min(G.w - 76, q.x + off.dx));
    const ly = Math.max(G.rect.y + 30, Math.min(G.rect.y + G.rect.h - 32, q.y + off.dy));
    const isTn = node.kind === 'tn';
    const isJc = node.kind === 'jc';
    const fontSize = isTn ? 17 : 22;
    const pillW = Math.max(84, node.name.length * (isTn ? 14.5 : 19) + 26);
    const pillH = node.sub ? 48 : (isTn ? 28 : 34);
    return { node, q, lx, ly, isTn, isJc, fontSize, pillW, pillH };
  });

  const short13RenderList = [];
  if (state.showShort13Map && Array.isArray(state.shortTerm13?.regions) && state.shortTerm13.regions.length) {
    const regMap = new Map(state.shortTerm13.regions.map(r => [String(r.id), r]));
    const curHourMs = Math.floor(Date.now() / 3600000) * 3600000;
    const pickCurHour = (hours = []) => {
      if (!hours.length) return null;
      let best = hours[0];
      let bestDiff = Infinity;
      for (const h of hours) {
        const ms = Date.parse(h?.time || '');
        if (Number.isFinite(ms)) {
          const diff = Math.abs(ms - curHourMs);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = h;
          }
        }
      }
      return best;
    };

    for (const loc of SHORT13_MAP_LOCATIONS) {
      const reg = regMap.get(loc.id);
      const curH = reg ? pickCurHour(reg.hours) : null;
      if (!curH || curH.temp === null || curH.temp === undefined || curH.temp === '' || !Number.isFinite(Number(curH.temp))) continue;

      const tVal = Math.round(Number(curH.temp));
      const iconInfo = getKmaIconInfo(curH);
      const q = G.map(mapX(loc.lon), mapY(loc.lat));
      const px = Math.max(54, Math.min(G.w - 54, q.x + (loc.dx || 0)));
      const py = Math.max(G.rect.y + 24, Math.min(G.rect.y + G.rect.h - 24, q.y + (loc.dy || 0)));

      const isWet = Boolean(curH.wet || Number(curH.rainMm) > 0 || Number(curH.snowCm) > 0);
      const isSnow = Number(curH.snowCm) > 0 || String(curH.pty) === '3' || String(curH.pty) === '2';
      const strokeCol = isSnow ? '#818cf8' : isWet ? '#38dbf8' : tVal < 0 ? '#fb7185' : tVal === 0 ? '#60a5fa' : '#4674a3';
      const tempCol = tVal < 0 ? '#fda4af' : tVal === 0 ? '#93c5fd' : isWet ? '#7ee8ff' : '#ffffff';
      const tempTxt = `${tVal}°`;
      const pillW = tempTxt.length >= 4 ? 92 : 86;
      const pillH = 38;
      const popVal = Number(curH.chance ?? curH.pop ?? 0);

      short13RenderList.push({ loc, q, px, py, tVal, iconInfo, strokeCol, tempCol, tempTxt, pillW, pillH, popVal });
    }
  }

  const CARD_W = 224;
  const CARD_H = 58;
  const rwisRenderList = [];
  if (state.showRoadTemps && state.roadStations.length) {
    const stnMap = new Map(state.roadStations.map(s => [String(s.stnId), s]));
    const stnRisks = indexStationRisks(state.roadRisk);
    for (const stn of CORRIDOR_MAP_STATIONS) {
      const obs = stnMap.get(stn.stnId);
      if (!obs || (!Number.isFinite(obs.roadTemp) && !Number.isFinite(obs.temp))) continue;

      const q = G.map(mapX(stn.lon), mapY(stn.lat));
      const dock = stn.dock || { cx: q.x, cy: q.y - 60, row: 'top' };
      const dcx = dock.cx;
      const dcy = dock.cy;
      const anchorY = dock.row === 'top' ? dcy + CARD_H / 2 : dcy - CARD_H / 2;

      const tr = obs.roadTemp;
      const iceLv = normalizeZoneGrade(stnRisks.get(stn.stnId)?.iceLevel) ?? 0;
      const surfCode = Number(obs.surfaceCode) || 0;
      let barCol = '#38dbf8';
      let subCol = '#a7e8dc';
      let strokeCol = 'rgba(56, 219, 248, 0.42)';
      if (iceLv >= 3 || surfCode >= 4 || (tr !== null && tr <= 0.5)) {
        barCol = '#f43f5e';
        subCol = '#fecaca';
        strokeCol = '#f43f5e';
      } else if (iceLv === 2 || surfCode === 3 || (tr !== null && tr <= 2.5)) {
        barCol = '#fb923c';
        subCol = '#fed7aa';
        strokeCol = '#fb923c';
      } else if (iceLv === 1 || surfCode === 2 || (tr !== null && tr <= 4.0)) {
        barCol = '#facc15';
        subCol = '#fde68a';
        strokeCol = 'rgba(250, 204, 21, 0.58)';
      }

      const lines = formatRwisCalloutLines(stn, obs);
      rwisRenderList.push({ stn, q, dcx, dcy, anchorY, barCol, subCol, strokeCol, lines, iceLv });
    }
  }

  // Clipped Map Area
  out.push(`<g clip-path="url(#rwClip)">`);
  out.push(`<rect x="0" y="${G.rect.y}" width="${G.rect.w}" height="${G.rect.h}" fill="url(#rwSea)"/>`);
  out.push(`<rect x="0" y="${G.rect.y}" width="${G.rect.w}" height="${G.rect.h}" fill="url(#rwAmbient)"/>`);

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

  // 2. Verified 4 Province Watermarks (전북 · 경남 · 경북 · 대구 — 100% Point-in-Polygon!)
  out.push('<g class="province-labels" aria-hidden="true">');
  for (const [name, pos] of Object.entries(PROVINCE_LABELS_FIXED)) {
    const q = G.map(pos.x, pos.y);
    const px = Math.max(58, Math.min(G.w - 58, q.x));
    const py = Math.max(G.rect.y + 42, Math.min(G.rect.y + G.rect.h - 22, q.y));
    out.push(`<text x="${n1(px)}" y="${n1(py)}" text-anchor="middle" fill="#6390bc" fill-opacity="0.48" font-size="34" font-weight="900" letter-spacing="10">${esc(name)}</text>`);
  }
  out.push('</g>');

  // 3. Background Leader-Line Underlay (모든 지시선을 고속도로·이정·시군·13개지역·IC·RWIS 카드 아래 최하위 레이어로 배치!)
  out.push('<g class="map-leader-underlay" aria-hidden="true">');
  for (const item of rwisRenderList) {
    out.push(`<line x1="${n1(item.q.x)}" y1="${n1(item.q.y)}" x2="${n1(item.dcx)}" y2="${n1(item.anchorY)}" stroke="${item.barCol}" stroke-width="1.35" opacity="0.44"/>`);
  }
  for (const s13 of short13RenderList) {
    out.push(`<line x1="${n1(s13.q.x)}" y1="${n1(s13.q.y)}" x2="${n1(s13.px)}" y2="${n1(s13.py)}" stroke="${s13.strokeCol}" stroke-width="1.15" stroke-dasharray="2.5 3" opacity="0.42"/>`);
  }
  for (const nd of nodeRenderList) {
    out.push(`<line x1="${n1(nd.q.x)}" y1="${n1(nd.q.y)}" x2="${n1(nd.lx)}" y2="${n1(nd.ly)}" stroke="#6e98c2" stroke-width="1.4" opacity="0.56"/>`);
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

  // 5. Highway Corridor Zones (Bidirectional or Single-Direction · 상향 주의·위험 구간 점멸 및 결측 회색 분리)
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
      const rawE = bucket.missing ? null : (bucket.rawE ?? bucket.E);
      const rawS = bucket.missing ? null : (bucket.rawS ?? bucket.S);
      const colE = rawE === null ? '#475569' : (LEVEL_COLORS[rawE] || LEVEL_COLORS[0]);
      const colS = rawS === null ? '#475569' : (LEVEL_COLORS[rawS] || LEVEL_COLORS[0]);
      const blinkE = rawE >= 3 ? ' class="rwis-zone-blink-danger"' : rawE === 2 ? ' class="rwis-zone-blink-caution"' : '';
      const blinkS = rawS >= 3 ? ' class="rwis-zone-blink-danger"' : rawS === 2 ? ' class="rwis-zone-blink-caution"' : '';
      if (rawE !== null && rawE >= 2) {
        out.push(`<path${blinkE} d="${polyPath(topPts)}" fill="none" stroke="${colE}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" opacity="0.34" filter="url(#rwGlow)"/>`);
      }
      if (rawS !== null && rawS >= 2) {
        out.push(`<path${blinkS} d="${polyPath(botPts)}" fill="none" stroke="${colS}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" opacity="0.34" filter="url(#rwGlow)"/>`);
      }
      out.push(`<path${blinkE} d="${polyPath(topPts)}" fill="none" stroke="${colE}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>`);
      out.push(`<path${blinkS} d="${polyPath(botPts)}" fill="none" stroke="${colS}" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      const rawLv = bucket.missing ? null : (state.dir === 'E' ? (bucket.rawE ?? bucket.E) : (bucket.rawS ?? bucket.S));
      const col = rawLv === null ? '#475569' : (LEVEL_COLORS[rawLv] || LEVEL_COLORS[0]);
      const blinkCls = rawLv >= 3 ? ' class="rwis-zone-blink-danger"' : rawLv === 2 ? ' class="rwis-zone-blink-caution"' : '';
      if (rawLv !== null && rawLv >= 2) {
        out.push(`<path${blinkCls} d="${centerPath}" fill="none" stroke="${col}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" opacity="0.36" filter="url(#rwGlow)"/>`);
      }
      out.push(`<path${blinkCls} d="${centerPath}" fill="none" stroke="${col}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    // Invisible wide hit target for clicking a zone
    out.push(`<path class="zone-hit" data-zone="${esc(zone.suffix)}" d="${centerPath}" fill="none" stroke="transparent" stroke-width="40" stroke-linecap="round"><title>${esc(zone.name)} (${zone.startKm}–${zone.endKm}km)</title></path>`);
  }
  out.push('</g>');

  // 6. Corridor Milepost Ticks (100, 110, 140, 150, 160, 170 — 가조IC 131.1k 인접 130k 생략 및 노선 법선 방향 이격)
  out.push('<g class="mileposts" aria-hidden="true">');
  for (const km of [100, 110, 140, 150, 160, 170]) {
    const p = pointAtKm(km, G.base);
    const q = G.map(p.x, p.y);
    const nx = -Math.sin(p.tangent || 0);
    const ny = Math.cos(p.tangent || 0);
    out.push(`<text x="${n1(q.x - nx * 24)}" y="${n1(q.y - ny * 24 + 4)}" text-anchor="middle" fill="#7da3c8" font-size="13.5" font-weight="750">${km}k</text>`);
  }
  out.push('</g>');

  // 7. On-Map Origin Anchors (13개 읍·면·동 원점 도트 & 7개 RWIS 관측소 노선 위 센서 비콘)
  out.push('<g class="corridor-anchors" aria-hidden="true">');
  for (const s13 of short13RenderList) {
    out.push(`<circle cx="${n1(s13.q.x)}" cy="${n1(s13.q.y)}" r="3.2" fill="${s13.strokeCol}" stroke="#071322" stroke-width="1.3"/>`);
  }
  for (const item of rwisRenderList) {
    out.push(`<circle cx="${n1(item.q.x)}" cy="${n1(item.q.y)}" r="9.5" fill="${item.barCol}" fill-opacity="0.22"/>`);
    out.push(`<circle cx="${n1(item.q.x)}" cy="${n1(item.q.y)}" r="5" fill="${item.barCol}" stroke="#f8fafc" stroke-width="1.7"/>`);
  }
  out.push('</g>');

  // 8. Verified 5 Core County Labels (함양군 · 거창군 · 합천군 · 고령군 · 달성군 — 지시선 위 불투명 마스킹)
  out.push('<g class="county-labels" aria-hidden="true">');
  for (const c of COUNTY_LABELS) {
    const q = G.map(c.x, c.y);
    const px = Math.max(54, Math.min(G.w - 54, q.x));
    const py = Math.max(G.rect.y + 28, Math.min(G.rect.y + G.rect.h - 18, q.y));
    const w = c.name.length * 16 + 22;
    out.push(`<rect x="${n1(px - w / 2)}" y="${n1(py - 20)}" width="${w}" height="28" rx="8" fill="#091729" fill-opacity="0.90" stroke="#3c628a" stroke-opacity="0.62" stroke-width="1.1"/>`);
    out.push(`<text x="${n1(px)}" y="${n1(py)}" text-anchor="middle" fill="#a5cbf0" font-size="16.5" font-weight="800" letter-spacing="1">${esc(c.name)}</text>`);
  }
  out.push('</g>');

  // 9. 13개 단기예보 TV 고시인성 '날씨 아이콘 + 기온' 대형 캡슐 ([🌤️ 13개지역] 토글)
  if (short13RenderList.length) {
    out.push('<g class="short13-map-pins">');
    for (const s13 of short13RenderList) {
      const { loc, px, py, tVal, iconInfo, strokeCol, tempCol, tempTxt, pillW, pillH, popVal } = s13;
      out.push(`<g class="short13-hit" data-region="${esc(loc.id)}" style="cursor:pointer">`);
      out.push(`<title>[${esc(loc.county)} ${esc(loc.name)} 현재 단기예보] ${esc(iconInfo.label)} · 기온 ${tVal}°C · 강수확률 ${popVal}% (클릭 시 우측 6H 단기예보 탭)</title>`);
      out.push(`<rect x="${n1(px - pillW / 2)}" y="${n1(py - pillH / 2)}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="url(#rwWeatherPillBg)" stroke="${strokeCol}" stroke-width="1.5" filter="url(#rwShadow)"/>`);
      out.push(`<g transform="translate(${n1(px - pillW / 2 + 10)}, ${n1(py - 13)})">${renderKmaIconSvg(iconInfo, 26)}</g>`);
      out.push(`<text x="${n1(px + pillW / 2 - 12)}" y="${n1(py + 7)}" text-anchor="end" fill="${tempCol}" font-size="20" font-weight="900" letter-spacing="-0.4">${esc(tempTxt)}</text>`);
      out.push('</g>');
    }
    out.push('</g>');
  }

  // 10. IC / JC / TN Nodes & High-Contrast TV Labels (지시선 위 상위 레이어)
  out.push('<g class="route-nodes">');
  for (const nd of nodeRenderList) {
    const { node, q, lx, ly, isTn, isJc, fontSize, pillW, pillH } = nd;
    out.push(`<g class="node-hit" data-point="${esc(node.point || '')}" data-nodename="${esc(node.name)}" data-km="${node.km}">`);
    if (isTn) {
      out.push(`<rect x="${n1(q.x - 10)}" y="${n1(q.y - 7)}" width="20" height="14" rx="5" fill="#0b1a2d" stroke="#cbd5e1" stroke-width="2.2"/>`);
    } else if (isJc) {
      out.push(`<polygon points="${n1(q.x)},${n1(q.y - 12)} ${n1(q.x + 12)},${n1(q.y)} ${n1(q.x)},${n1(q.y + 12)} ${n1(q.x - 12)},${n1(q.y)}" fill="#34d399" stroke="#061423" stroke-width="3"/>`);
    } else {
      out.push(`<circle cx="${n1(q.x)}" cy="${n1(q.y)}" r="9.5" fill="#f8fbff" stroke="#091525" stroke-width="3.2"/>`);
    }

    out.push(`<rect x="${n1(lx - pillW / 2)}" y="${n1(ly - pillH / 2)}" width="${n1(pillW)}" height="${pillH}" rx="8" fill="#0b192c" fill-opacity="0.96" stroke="${isJc ? '#34d399' : isTn ? '#47688a' : '#7ba6d1'}" stroke-width="${isTn ? '1.35' : '1.9'}" filter="url(#rwShadow)"/>`);
    if (node.sub) {
      out.push(`<text x="${n1(lx)}" y="${n1(ly - 3)}" text-anchor="middle" fill="#f8fbff" font-size="${fontSize}" font-weight="850">${esc(node.name)}</text>`);
      out.push(`<text x="${n1(lx)}" y="${n1(ly + 16)}" text-anchor="middle" fill="#8fb5d9" font-size="13.5" font-weight="700">${esc(node.sub)}</text>`);
    } else {
      out.push(`<text x="${n1(lx)}" y="${n1(ly + (isTn ? 6 : 8))}" text-anchor="middle" fill="${isTn ? '#cfe2f5' : '#f8fbff'}" font-size="${fontSize}" font-weight="850">${esc(node.name)}</text>`);
    }
    out.push('</g>');
  }
  out.push('</g>');

  // 11. 최상위 레이어: 7개 도로기상관측소(RWIS) 플래그십 콜아웃 카드 (상단좌측 2 · 하단중앙 2 · 상단 1 · 하단우측 2)
  if (rwisRenderList.length) {
    out.push('<g class="road-temp-pins">');
    for (const item of rwisRenderList) {
      const { stn, dcx, dcy, anchorY, barCol, subCol, strokeCol, lines, iceLv } = item;
      const stnBlinkCls = iceLv >= 3 ? ' rwis-zone-blink-danger' : iceLv === 2 ? ' rwis-zone-blink-caution' : '';
      out.push(`<g class="rwis-stn-hit${stnBlinkCls}" data-km="${stn.km}" data-name="${esc(stn.shortName || stn.label)}" style="cursor:pointer">`);
      out.push(`<title>[도로기상관측 ${stn.km.toFixed(1)}km · ${esc(stn.label)}] ${esc(lines.titleLeft)} ${esc(lines.titleRight)} · ${esc(lines.subLine)} (클릭 시 인근 실시간 CCTV 재생)</title>`);
      out.push(`<circle cx="${n1(dcx)}" cy="${n1(anchorY)}" r="2.6" fill="${barCol}" opacity="0.88"/>`);
      out.push(`<g transform="translate(${n1(dcx)}, ${n1(dcy)})" filter="url(#rwShadow)">`);
      out.push(`<rect x="${-CARD_W / 2}" y="${-CARD_H / 2}" width="${CARD_W}" height="${CARD_H}" rx="11" fill="url(#rwCalloutBg)" stroke="${strokeCol}" stroke-width="1.45"/>`);
      out.push(`<line x1="${-CARD_W / 2 + 12}" y1="${-CARD_H / 2 + 1}" x2="${CARD_W / 2 - 12}" y2="${-CARD_H / 2 + 1}" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1"/>`);
      out.push(`<rect x="${-CARD_W / 2 + 7}" y="${-CARD_H / 2 + 8}" width="4.5" height="${CARD_H - 16}" rx="2.25" fill="${barCol}"/>`);
      out.push(`<text x="${-CARD_W / 2 + 18}" y="-4.5" fill="#eefcf9" font-size="15.5" font-weight="850" letter-spacing="-0.3">${esc(lines.titleLeft)}</text>`);
      if (lines.hasAir) {
        out.push(`<text x="${CARD_W / 2 - 12}" y="-3" text-anchor="end" fill="#ffffff" font-size="18.5" font-weight="900">${esc(lines.titleRight)}</text>`);
      } else {
        out.push(`<text x="${CARD_W / 2 - 12}" y="-5" text-anchor="end" fill="#8db4d9" font-size="12.5" font-weight="750">${esc(lines.titleRight)}</text>`);
      }
      out.push(`<text x="${-CARD_W / 2 + 18}" y="17.5" fill="${subCol}" font-size="13.5" font-weight="750" letter-spacing="-0.2">${esc(lines.subLine)}</text>`);
      out.push('</g>');
      out.push('</g>');
    }
    out.push('</g>');
  }
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
      const ptName = el.dataset.point || el.dataset.nodename || '';
      const km = Number(el.dataset.km);
      if (ptName || Number.isFinite(km)) openPointCctvByName(ptName, km);
    });
  });
  stage.querySelectorAll('.rwis-stn-hit').forEach(el => {
    el.addEventListener('click', () => {
      const km = Number(el.dataset.km);
      const name = el.dataset.name || '';
      if (Number.isFinite(km)) openPointCctvByName(name, km);
    });
  });
  stage.querySelectorAll('.short13-hit').forEach(el => {
    el.addEventListener('click', () => {
      setSideTab('short6');
    });
  });
}

/* ───────────────────── 8개 구간 통합 카드 렌더 ───────────────────── */
function renderZoneCards(enriched) {
  const grid = $('rwisZonesGrid');
  if (!grid) return;
  grid.innerHTML = enriched.zones.map(z => {
    const bucket = state.metric === 'vir' ? z.vir : z.fsm;
    const rawLv = getZoneRawLevel(z);
    const lv = rawLv ?? 0;
    const isMissing = rawLv === null;
    const fmtDirLv = v => (v === null || v === undefined ? '정보 없음' : LEVEL_NAME[v]);
    const badgeText = isMissing
      ? '정보 없음'
      : state.dir === 'both'
        ? ((bucket.rawE ?? bucket.E) === (bucket.rawS ?? bucket.S)
            ? `양방향 ${LEVEL_NAME[lv]}`
            : `대구 ${fmtDirLv(bucket.rawE ?? bucket.E)} · 광주 ${fmtDirLv(bucket.rawS ?? bucket.S)}`)
        : `${state.dir === 'E' ? '대구' : '광주'} ${LEVEL_NAME[lv]}`;

    // Road Obs + 6h 실측 · 2h 예측 초소형 인라인 스파크라인 (P2.5)
    const ro = z.roadObs;
    const hasRoadTemp = Number.isFinite(ro.minRoadTemp);
    const hasAirTemp = Number.isFinite(ro.minAirTemp);
    const tempCls = hasRoadTemp
      ? (ro.minRoadTemp <= 0.5 ? 'is-freeze' : ro.minRoadTemp <= 2.5 ? 'is-cold' : '')
      : '';
    const airCls = hasAirTemp
      ? (ro.minAirTemp < 0 ? 'is-freeze' : ro.minAirTemp <= 0.5 ? 'is-cold' : '')
      : '';
    const roadTempVal = hasRoadTemp ? `${ro.minRoadTemp.toFixed(1)}°` : '—';
    const airTempVal = hasAirTemp ? `${ro.minAirTemp.toFixed(1)}°` : '—';

    const surfLabel = ro.surfaceState || '';
    const surfCode = Number(ro.surfaceCode);
    const surfChip = surfLabel
      ? `<span class="rzc-surf-chip${(surfCode >= 2 || /습윤|젖음|결빙|적설/.test(surfLabel)) ? ' is-wet' : ''}">${esc(surfLabel)}</span>`
      : '';
    const basisTxt = formatStationBasisLabel(ro.stationName);
    const basisHtml = basisTxt ? `<span class="rzc-stn-basis">${esc(basisTxt)}</span>` : '';

    const trend = buildZoneTempTrendSeries({
      zone: z,
      roadTrend: state.roadTrend,
      shortTerm13: state.shortTerm13,
      nowMs: Date.now()
    });

    const formatPredChip = (s, isRoad) => {
      if (!s || s.pred2h === null || s.curVal === null) return '';
      const diff = s.pred2h - s.curVal;
      const arrow = diff <= -0.7 ? '↘' : diff >= 0.7 ? '↗' : '→';
      const cls = isRoad
        ? (s.pred2h <= 0.5 ? 'is-freeze' : s.pred2h <= 2.5 ? 'is-cold' : diff <= -1.2 ? 'is-drop' : '')
        : (s.pred2h < 0 ? 'is-freeze' : s.pred2h <= 0.5 ? 'is-cold' : diff <= -1.2 ? 'is-drop' : '');
      return `<span class="rzc-pred-chip ${cls}">${arrow}${s.pred2h.toFixed(1)}°</span>`;
    };

    const formatTrendTitle = (label, s, extra) => {
      const segs = [`[${label} · 6h 실측 + 2h 예측]`];
      if (s.startVal !== null && s.curVal !== null) {
        const sign = s.delta6h > 0 ? '+' : '';
        segs.push(`6h전 ${s.startVal.toFixed(1)}°C → 현재 ${s.curVal.toFixed(1)}°C (${sign}${s.delta6h.toFixed(1)}°C)`);
      } else if (s.curVal !== null) {
        segs.push(`현재 ${s.curVal.toFixed(1)}°C`);
      } else {
        segs.push('실측 수신 대기');
      }
      if (s.pred2h !== null) {
        segs.push(`+2h 예상 ${s.pred2h.toFixed(1)}°C`);
      }
      if (extra) segs.push(extra);
      return segs.join(' · ');
    };

    const roadSparkSvg = renderMicroSparklineSvg(trend.tr, { kind: 'road', uid: `z${z.suffix}-tr` });
    const airSparkSvg = renderMicroSparklineSvg(trend.ta, { kind: 'air', uid: `z${z.suffix}-ta` });
    const roadTitle = formatTrendTitle('노면 TR1', trend.tr, trend.stationName ? `관측소: ${trend.stationName}` : '');
    const airTitle = formatTrendTitle('기온 TA', trend.ta, surfLabel ? `노면상태: ${surfLabel}` : '13개소 단기예보 연동');

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
      } else if (sf.firstZeroOrBelow) {
        bits.push(`🧊 ${sf.firstZeroOrBelow.hour}시 0°C 주의`);
        if (!fcstCls) fcstCls = 'is-warn';
      } else if (sf.minTemp !== null) {
        bits.push(`최저 ${sf.minTemp.toFixed(0)}°C`);
      }
      fcstText = bits.join(' · ');
    }

    const selCls = state.selectedZoneSuffix === z.suffix ? ' is-selected' : '';
    const iceAlertCls = (z.fsm?.rawMax ?? -1) >= 3
      ? ' is-ice-alert-danger'
      : (z.fsm?.rawMax ?? -1) === 2
        ? ' is-ice-alert-caution'
        : '';
    const badgeStyle = isMissing ? ' style="background:rgba(71,85,105,0.28);color:#cbd5e1;border-color:rgba(148,163,184,0.35);"' : '';
    return `
      <div class="rwis-zone-card lv-${lv}${selCls}${iceAlertCls}" data-zone="${esc(z.suffix)}" role="button" tabindex="0">
        <div class="rzc-top">
          <div>
            <div class="rzc-name">${esc(z.name.replace('–', ' ↔ '))}</div>
            <div class="rzc-county">${esc(z.county)}${surfChip}${basisHtml}</div>
          </div>
          <span class="rzc-badge lv-${lv}"${badgeStyle}>● ${esc(badgeText)}</span>
        </div>
        <div class="rzc-telemetry rzc-telemetry-dual">
          <div class="rzc-tcol rzc-tcol-road" title="${esc(roadTitle)}">
            <div class="rzc-tcol-head">
              <span class="rzc-tlabel">노면</span>
              <strong class="rzc-road-temp ${tempCls}">${esc(roadTempVal)}</strong>
              ${formatPredChip(trend.tr, true)}
            </div>
            ${roadSparkSvg}
          </div>
          <div class="rzc-tcol rzc-tcol-air" title="${esc(airTitle)}">
            <div class="rzc-tcol-head">
              <span class="rzc-tlabel">기온</span>
              <strong class="rzc-air-val ${airCls}">${esc(airTempVal)}</strong>
              ${formatPredChip(trend.ta, false)}
            </div>
            ${airSparkSvg}
          </div>
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
  let missingZones = 0;
  let maxLv = 0;
  for (const z of enriched.zones) {
    const rawLv = getZoneRawLevel(z);
    if (rawLv === null) {
      missingZones++;
      continue;
    }
    counts[rawLv]++;
    if (rawLv > maxLv) maxLv = rawLv;
  }
  const kpiMax = $('kpiMaxRisk');
  if (missingZones === enriched.zones.length) {
    kpiMax.className = 'rwis-kpi';
    $('kpiMaxRiskVal').className = 'rk-val';
    $('kpiMaxRiskVal').textContent = '정보 없음';
    $('kpiMaxRiskSub').textContent = '위험등급 자료 수신 중';
  } else {
    kpiMax.className = `rwis-kpi lv-${maxLv}`;
    $('kpiMaxRiskVal').className = `rk-val c-${maxLv}`;
    $('kpiMaxRiskVal').textContent = `${LEVEL_NAME[maxLv]} (${maxLv}단계)`;
    const missNote = missingZones > 0 ? ` · 미수신 ${missingZones}` : '';
    $('kpiMaxRiskSub').textContent = `위험 ${counts[3]} · 주의 ${counts[2]} · 관심 ${counts[1]} · 안전 ${counts[0]}${missNote}`;
  }

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
    const stnRisks = indexStationRisks(state.roadRisk);
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
        const risk = stnRisks.get(String(s.stnId));
        const iceLv = normalizeZoneGrade(risk?.iceLevel);
        const iceBadge = iceLv !== null
          ? `<span class="rzc-badge lv-${iceLv}" style="padding:1px 6px;font-size:11px;">${LEVEL_NAME[iceLv]}</span>`
          : '<span style="color:#6d8dad;font-size:11px;">정보 없음</span>';
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
        } else if (r.firstZeroOrBelow) {
          meta = `🧊 ${r.firstZeroOrBelow.hour}시 0°C 결빙주의`;
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

  // 4. Tab 1 (Default TV Main): 특이사항 속보 + 6H 13개소 단기예보 표
  renderShort6Tab(enriched);

  // 5. Tab 3: Mainpage-Aligned (/api/cctv) Highway CCTV Directory
  renderCctvList();
}

/* ───────────────────── Tab 1: 특이사항 속보 + 6H 13개소 단기예보 표 ───────────────────── */
function renderShort6Tab(enriched = null) {
  // 1. 상단 특이사항 속보 (24h 예보 + 5개 지역 특보 묶음 규칙 + 고령지사 주의·위험 격상 최우선)
  const cardsEl = $('bulletinCards');
  const metaEl = $('bulletinScopeMeta');
  if (cardsEl) {
    const cards = buildSpecialBulletinCards({
      shortTerm13: state.shortTerm13,
      warningsPayload: state.warningsPayload,
      warningHistory: state.warningHistory,
      roadStations: state.roadStations,
      roadRisk: state.roadRisk,
      enrichedZones: enriched?.zones || [],
      nowMs: Date.now()
    });
    const warnOk = Boolean(state.warningsPayload?.ok);
    const hasFcst = Boolean(state.shortTerm13?.regions?.length);
    if (metaEl) {
      if (!hasFcst && !warnOk) {
        metaEl.textContent = '24h 예보 · 5개 지역 특보 수신 중…';
      } else if (cards.length) {
        metaEl.textContent = `특이사항 ${cards.length}건 · 5개 지역 특보 감시`;
      } else {
        metaEl.textContent = '특이사항 0건 · 5개 지역 특보 감시 중';
      }
    }

    if (!hasFcst && !warnOk) {
      cardsEl.innerHTML = '<div class="rwis-bulletin-empty">특보·24시간 예보 특이사항을 불러오는 중입니다…</div>';
    } else if (!cards.length) {
      cardsEl.innerHTML = '<div class="rwis-bulletin-empty">✅ 향후 24시간 특이사항 없음 · 5개 지역(함양·거창·합천·고령·달성) 특보 없음 · 무강수 · 전구간 영상</div>';
    } else {
      cardsEl.innerHTML = cards.map(c => `
        <div class="rwis-bcard tone-${esc(c.tone)}">
          <div class="rwis-bcard-top">
            <span class="rwis-bcard-title">${esc(c.icon)} ${esc(c.title)}</span>
            <span class="rwis-bcard-badge">${esc(c.badge)}</span>
          </div>
          <div class="rwis-bcard-detail">${esc(c.detail)}</div>
        </div>
      `).join('');
    }
  }

  // 2. 하단 13개소 6시간 단기예보 표
  const matEl = $('short6Matrix');
  if (!matEl) return;
  const { headerHours, rows } = alignShortTerm6hMatrix(state.shortTerm13);
  if (!rows.length || !headerHours.length) {
    matEl.innerHTML = '<div class="rwis-s6-loading">13개소 6시간 단기예보 수신 중…</div>';
    return;
  }

  const nowKstH = new Date(Date.now() + 9 * 3600000).getUTCHours();
  const fmtHm = iso => (iso ? String(iso).slice(11, 16) : '');

  let html = '<div class="rwis-s6-head">';
  html += '<div class="rwis-s6-th">대상 지역 (서→동)</div>';
  html += '<div class="rwis-s6-th">요약 (24h)</div>';
  for (let i = 0; i < headerHours.length; i++) {
    const h = headerHours[i];
    const subTag = (i === 0 && h.hourKst === nowKstH)
      ? '현재'
      : (i === 0 ? '시작' : (h.isTomorrow ? '내일' : '오늘'));
    html += `<div class="rwis-s6-th ${i === 0 ? 'is-now' : ''}"><span>${String(h.hourKst).padStart(2, '0')}시</span><small>${esc(subTag)}</small></div>`;
  }
  html += '</div>';

  for (const row of rows) {
    const { region: r, routeIndex, cells6, sum24 } = row;
    const wetTxt = sum24.firstWetTime ? `강수 ${fmtHm(sum24.firstWetTime)}` : '무강수';
    const frzTxt = sum24.firstFreezingTime ? `영하 ${fmtHm(sum24.firstFreezingTime)}↓` : '영상';
    const rangeTxt = sum24.minTemp !== null ? `${sum24.minTemp}~${sum24.maxTemp}°` : '—';
    const botRight = sum24.overlapHours > 0
      ? `<span class="s6-tag-ovl">겹침 ${sum24.overlapHours}h</span>`
      : `<span class="s6-tag-dry">최대 ${sum24.maxPop}%</span>`;

    html += `<a class="rwis-s6-row" href="./hourly.html" title="${esc(r.county)} ${esc(r.name)} 1시간 상세 시간표 보기">`;
    html += `<div class="s6-name"><span class="s6-cbar" style="background:${esc(r.color || '#38dbf8')}"></span><div class="s6-geo"><div class="s6-geo-main">${esc(r.county)} ${esc(r.name)}</div><div class="s6-geo-sub">${esc(r.admin)} · ${routeIndex}/${rows.length}</div></div></div>`;
    html += `<div class="s6-sum"><div class="s6-sum-line"><span class="${sum24.wetHours > 0 ? 's6-tag-wet' : 's6-tag-dry'}">${esc(wetTxt)}</span><span class="${sum24.freezingHours > 0 ? 's6-tag-frz' : 's6-tag-dry'}">${esc(frzTxt)}</span></div><div class="s6-sum-line"><span style="color:#dbeafe;">${esc(rangeTxt)}</span>${botRight}</div></div>`;

    for (let j = 0; j < headerHours.length; j++) {
      const h = cells6[j];
      if (!h) {
        html += '<div class="s6-cell"><div class="s6-c1"><span class="s6-temp">—</span></div><div class="s6-c2 is-quiet">·</div></div>';
        continue;
      }
      const iconInfo = getKmaIconInfo({ sky: h.sky, pty: h.pty, isNight: h.isNight, lightning: h.lightning });
      const isSnow = h.wet && (h.snowCm > 0 || ['2', '3', '6', '7'].includes(String(h.pty)));
      const isSubzero = h.temp != null && h.temp < 0;
      const isOverlap = h.wet && isSubzero;
      const popVal = Number(h.pop ?? 0);
      const isHighPop = !h.wet && popVal >= 40;
      const cellCls = [
        's6-cell',
        h.isNight ? 'is-night' : '',
        isSnow ? 'is-snow' : (h.wet ? 'is-wet' : ''),
        isHighPop ? 'is-highpop' : '',
        isSubzero ? 'is-subzero' : '',
        isOverlap ? 'is-overlap' : ''
      ].filter(Boolean).join(' ');

      const tempTxt = h.temp != null ? `${Math.round(h.temp)}°` : '—';
      let subTxt = '·';
      let subCls = 'is-quiet';
      if (h.snowCm > 0) {
        subTxt = `${h.snowCm}cm`;
        subCls = 'has-amt';
      } else if (h.rainMm > 0) {
        subTxt = `${h.rainMm.toFixed(1)}mm`;
        subCls = 'has-amt';
      } else if (h.wet) {
        subTxt = `${popVal || 60}%`;
        subCls = 'has-amt';
      } else if (popVal >= 40) {
        subTxt = `${popVal}%`;
        subCls = 'is-highpop';
      } else if (popVal > 0) {
        subTxt = `${popVal}%`;
        subCls = 'is-quiet';
      }

      html += `<div class="${cellCls}"><div class="s6-c1">${renderKmaIconSvg(iconInfo, 20)}<span class="s6-temp">${esc(tempTxt)}</span></div><div class="s6-c2 ${subCls}">${esc(subTxt)}</div></div>`;
    }
    html += '</a>';
  }

  matEl.innerHTML = html;
}

/* ───────────────────── Tab 3: 메인페이지 기준(/api/cctv) CCTV 목록 & 모달 ───────────────────── */
function getMainCctvEntries() {
  if (state.cctvPayload?.cctvs?.length) {
    return cameraDirectory(state.cctvPayload);
  }
  // /api/cctv 수신 전 임시 보조: RWIS status의 ITS 매칭 카메라만 사용
  const rwisPts = state.rwisStatus?.cctv?.points;
  if (Array.isArray(rwisPts) && rwisPts.length) {
    const fallback = [];
    for (const pt of rwisPts) {
      const its = Array.isArray(pt.its) ? pt.its.find(x => x?.url) : null;
      if (!its?.url) continue;
      fallback.push({
        camera: {
          id: pt.cctvId || pt.id,
          name: its.name || pt.name,
          url: its.url,
          format: its.format || 'HLS',
          x: pt.lon,
          y: pt.lat
        },
        displayName: pt.name,
        km: Number(pt.km),
        position: `${Number(pt.km).toFixed(2)}k`,
        record: { id: pt.cctvId || pt.id, name: pt.name, km: Number(pt.km), basis: pt.kmSource || '공식', directions: '대구·광주' }
      });
    }
    return fallback.sort((a, b) => a.km - b.km);
  }
  return [];
}

function classifyEntryFacility(entry) {
  const name = String(entry?.displayName || '');
  if (/(분기점|JC|IC$|함양$|거창$|가조$|해인사$|고령$)/i.test(name)) return 'icjc';
  if (/휴게소/.test(name)) return 'rest';
  if (/(터널|교\d*$|대교|육교)/.test(name)) return 'struct';
  return 'other';
}

function renderCctvList() {
  const listEl = $('cctvPointList');
  if (!listEl) return;
  const allEntries = getMainCctvEntries();
  const cntEl = $('cctvTabCount');
  if (cntEl) cntEl.textContent = allEntries.length ? `(${allEntries.length})` : '';

  const clearBtn = $('clearZoneFilterBtn');
  let selectedZone = null;
  if (state.selectedZoneSuffix) {
    selectedZone = RWIS_MASTER.zones.find(x => x.suffix === state.selectedZoneSuffix) || null;
  }
  if (clearBtn) {
    clearBtn.hidden = !selectedZone;
    if (selectedZone) {
      clearBtn.textContent = `✕ ${selectedZone.name} 해제`;
    }
  }

  const q = state.cctvQuery.trim().toLowerCase();
  const filtered = allEntries.filter(entry => {
    if (selectedZone) {
      if (entry.km < selectedZone.startKm - 1.5 || entry.km > selectedZone.endKm + 1.5) return false;
    }
    if (state.cctvFac !== 'all' && classifyEntryFacility(entry) !== state.cctvFac) return false;
    if (q) {
      const hay = `${entry.displayName} ${entry.position} ${entry.camera?.name || ''} ${entry.record?.id || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!allEntries.length) {
    listEl.innerHTML = '<div style="text-align:center;color:#7c9dbe;padding:24px;">메인페이지 CCTV 목록(/api/cctv)을 불러오는 중입니다…</div>';
    return;
  }
  if (!filtered.length) {
    listEl.innerHTML = '<div style="text-align:center;color:#7c9dbe;padding:24px;">조건에 일치하는 CCTV 지점이 없습니다.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(entry => {
    const cid = cameraId(entry.camera);
    const metaSub = entry.record ? `${entry.record.basis} · ${entry.record.directions}` : '광주대구선 실시간 ITS';
    return `
      <div class="rwis-cctv-row">
        <div class="rcr-info">
          <div class="rcr-title">
            <span class="rcr-km">${esc(entry.position)}</span>
            <span>${esc(entry.displayName)}</span>
          </div>
          <div class="rcr-addr">${esc(metaSub)}</div>
        </div>
        <div class="rcr-btns">
          <button type="button" class="rcr-play" data-cam-id="${esc(cid)}">▶ 실시간 보기</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.rcr-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const entries = getMainCctvEntries();
      const idx = entries.findIndex(e => cameraId(e.camera) === btn.dataset.camId);
      if (idx >= 0) openMainCctvByIndex(idx);
    });
  });
}

/* ───────────────────── HLS 실시간 CCTV 모달 (메인페이지 cctv-player.js 기준) ───────────────────── */
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

function playMainCameraEntry(entry) {
  clearModalVideo();
  const video = $('rwisVideo');
  const cam = entry.camera;
  const safeUrl = upgradeStreamUrl(cam.url);
  const cid = cameraId(cam);

  $('rwisModalTitle').textContent = `📹 ${entry.displayName} · 노면 살얼음 CCTV`;
  $('rwisModalSub').textContent = `${entry.position} · 광주대구선 (${entry.record?.directions || '양방향'})`;
  const standaloneUrl = new URL('cctv.html', location.href);
  standaloneUrl.searchParams.set('id', cid);
  $('rwisModalOpenUrl').href = standaloneUrl.href;
  $('rwisModalMeta').textContent = '로드플러스·ITS 실시간 CCTV (새로고침 시 최신 스트림 토큰 갱신)';
  setModalOverlay(false);

  const isHls = /hls|m3u8/i.test(`${cam.format || ''} ${safeUrl}`) || /ktict\.co\.kr|hscdn\.com/i.test(safeUrl);
  if (isHls && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
    const hls = new window.Hls();
    state.hls = hls;
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data?.fatal) {
        setModalOverlay(true, '영상 연결에 실패했습니다', '스트림 토큰 만료 또는 일시 지연 — 아래 [↻ 새로고침]을 눌러 주세요.');
      }
    });
    hls.loadSource(safeUrl);
    hls.attachMedia(video);
  } else {
    video.src = safeUrl;
    video.play().catch(() => {});
  }
}

function openMainCctvByIndex(index) {
  const entries = getMainCctvEntries();
  if (!entries.length) return;
  const safeIdx = Math.max(0, Math.min(entries.length - 1, index));
  const entry = entries[safeIdx];
  state.activeCamIndex = safeIdx;
  state.activeCamId = cameraId(entry.camera);
  $('rwisCctvModal').hidden = false;
  playMainCameraEntry(entry);
}

async function refreshActiveModalCctv() {
  setModalOverlay(true, 'CCTV 스트림 주소 갱신 중…', '메인페이지(/api/cctv)에서 최신 스트림 주소를 받아오고 있습니다.');
  try {
    const res = await fetchCctvDirectory(apiUrl('/api/cctv?refresh=1'), {
      cache: 'no-store',
      onRetry: () => setModalOverlay(true, 'CCTV 재연결 중…', '응답이 지연되어 자동으로 다시 연결하고 있습니다.')
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.cctvs?.length) {
      state.cctvPayload = payload;
      state.cctvFetchedAt = Date.now();
      persistCache();
      renderCctvList();
    }
    const entries = getMainCctvEntries();
    let idx = entries.findIndex(e => cameraId(e.camera) === state.activeCamId);
    if (idx < 0) idx = Math.max(0, Math.min(entries.length - 1, state.activeCamIndex));
    if (idx >= 0 && entries[idx]) {
      openMainCctvByIndex(idx);
    } else {
      throw new Error('연결된 CCTV를 찾을 수 없습니다.');
    }
  } catch (err) {
    setModalOverlay(true, 'CCTV 새로고침 실패', String(err?.message || err));
  }
}

function openPointCctvByName(name, km = NaN) {
  const entries = getMainCctvEntries();
  if (!entries.length) {
    setSideTab('cctv');
    return;
  }
  const norm = s => String(s || '').replace(/\s+/g, '').replace(/(IC|JC|TN)$/i, '').toLowerCase();
  const target = norm(name);
  let idx = target
    ? entries.findIndex(e => norm(e.displayName) === target || norm(e.displayName).includes(target) || target.includes(norm(e.displayName)))
    : -1;
  if (idx < 0 && Number.isFinite(km)) {
    let bestD = Infinity;
    entries.forEach((e, i) => {
      const d = Math.abs(e.km - km);
      if (d < bestD) { bestD = d; idx = i; }
    });
  }
  if (idx < 0) idx = 0;
  openMainCctvByIndex(idx);
}

function closeCctvModal() {
  clearModalVideo();
  $('rwisCctvModal').hidden = true;
  state.activeCamIndex = -1;
  state.activeCamId = '';
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
let tvGuard = null;
let iceAlertModal = null;

function syncBranchIceAlertModal(enriched) {
  if (!iceAlertModal || state.fromCache) return;
  const rwisCore = getRwisCore();
  if (!rwisCore?.ok && !state.roadRisk?.ok) return;
  const rwisTmObj = rwisCore?.tm;
  const tmKst = typeof rwisTmObj === 'string'
    ? rwisTmObj
    : (rwisTmObj?.FR || state.roadRisk?.sources?.frgTmKst || state.roadRisk?.tmKst || '');
  const items = (enriched?.zones || []).map(z => ({
    id: `zone:${z.suffix}`,
    label: String(z.name || '').replace('–', ' ↔ '),
    kmLabel: `${z.startKm.toFixed(1)}~${z.endKm.toFixed(1)}k`,
    inBranch: true,
    iceLevel: z.fsm?.rawMax ?? null,
    stnIds: ZONE_INTEGRATION_MAP[z.suffix]?.stnIds || []
  }));
  iceAlertModal.update({
    items,
    roadStations: state.roadStations,
    tmKst
  });
}

function updateBurnInBtnUI(status) {
  const btn = $('rwisBurnInBtn');
  const lbl = $('rwisBurnInLabel');
  if (!btn || !status) return;
  btn.setAttribute('aria-pressed', String(Boolean(status.enabled)));
  if (lbl) lbl.textContent = status.enabled ? '잔상방지 ON' : '잔상방지 OFF';
  btn.title = status.enabled
    ? `TV 잔상방지 ON (3분마다 1px 미세이동 · 45분 스캔 · 현재 휘도 ${Math.round((status.brightness || 1) * 100)}%)`
    : 'TV 잔상방지 OFF (클릭 시 3종 보호 켜기)';
}

function updateStampUI(isError = false) {
  const pill = $('rwisReloadBtn');
  const txt = $('rwisStampText');
  if (!pill || !txt) return;
  const showHard = !isError && Boolean(state.hardRefreshActive || (state.hardBannerUntil && Date.now() < state.hardBannerUntil));
  pill.classList.toggle('is-cached', state.fromCache && !isError && !showHard);
  pill.classList.toggle('is-error', isError);
  pill.classList.toggle('is-hard-refresh', showHard);
  const hm = formatKstHm(state.lastSyncedAt) || '대기';
  if (state.hardRefreshActive) {
    txt.textContent = '⚡ 강제 실시간 수신 중…';
  } else if (isError) {
    txt.textContent = `연결 지연 · 마지막 ${hm}`;
  } else if (state.hardBannerUntil && Date.now() < state.hardBannerUntil) {
    txt.textContent = `⚡ 강제갱신 ${hm}`;
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
  syncBranchIceAlertModal(enriched);

  // 주의(2)·위험(3) 또는 기상특보·6h 결빙겹침 시 잔상방지 휘도를 즉시 100%로 복귀
  if (tvGuard) {
    const maxLv = enriched.zones.reduce((m, z) => Math.max(m, getZoneLevel(z)), 0);
    const cards = buildSpecialBulletinCards({
      shortTerm13: state.shortTerm13,
      warningsPayload: state.warningsPayload,
      warningHistory: state.warningHistory,
      roadStations: state.roadStations,
      roadRisk: state.roadRisk,
      enrichedZones: enriched.zones,
      nowMs: Date.now()
    });
    const hasUrgent = maxLv >= 2 || cards.some(c => c.tone === 'crit' || c.category === 'kec-ice-escalation' || c.category === 'warning-issued' || c.category === 'measured-presalt');
    tvGuard.setAlertActive(hasUrgent);
  }
}

function seedSharedCrossTabCaches(scope) {
  let seeded = false;
  if (!state.shortTerm13 || (state.shortTerm13.regions || []).filter(r => Array.isArray(r.hours) && r.hours.length > 0).length < 13) {
    const hourlyHit = readPageCache(HOURLY_CACHE_KEY, { expectedScope: scope });
    const hourlyRegions = hourlyHit?.entry?.data?.regions;
    if (Array.isArray(hourlyRegions) && hourlyRegions.filter(r => Array.isArray(r.hours) && r.hours.length > 0).length >= 13) {
      state.shortTerm13 = hourlyHit.entry.data;
      seeded = true;
    } else if (!state.shortTerm13 && Array.isArray(hourlyRegions) && hourlyRegions.length) {
      state.shortTerm13 = hourlyHit.entry.data;
      seeded = true;
    }
  }

  // 1) 단일 진실 공급원(SHARED_ROAD_OBS_KEY): 기존 배열이 있더라도 tm1이 더 최신이면 무조건 채택해 페이지 간 수치 불일치 원천 제거
  const sharedRoad = readSharedRoadObs({ line: '14' });
  if (sharedRoad?.stations?.length) {
    const curTm = state.roadObsTm || extractRoadObsTm(state.roadStations);
    if (!state.roadStations.length || (sharedRoad.tm1 && sharedRoad.tm1 > curTm)) {
      state.roadStations = sharedRoad.stations;
      state.roadObsTm = sharedRoad.tm1 || curTm;
      seeded = true;
    }
  }

  // 2) overview 캐시 보완: roadStations(더 최신 tm1일 때) 및 roadRisk 시딩
  const ovHit = readPageCache(OVERVIEW_CACHE_KEY, { expectedScope: null });
  const ovScope = String(ovHit?.entry?.scope || '');
  const ovData = ovHit?.entry?.data;
  if (ovData && (ovScope === scope || ovScope.startsWith(`${scope}|`))) {
    if (Array.isArray(ovData.roadStations) && ovData.roadStations.length) {
      const ovTm = extractRoadObsTm(ovData.roadStations);
      const curTm = state.roadObsTm || extractRoadObsTm(state.roadStations);
      if (!state.roadStations.length || (ovTm && ovTm > curTm)) {
        applyIncomingRoadObs(ovData.roadStations, ovTm, { isLive: false });
        seeded = true;
      }
    }
    if (!state.roadRisk && ovData.roadRiskData?.ok) {
      state.roadRisk = ovData.roadRiskData;
      seeded = true;
    }
  }
  return seeded;
}

function countCompleteShort13Regions(payload = state.shortTerm13) {
  return (payload?.regions || []).filter(r => Array.isArray(r.hours) && r.hours.length > 0).length;
}

function hydrateFromCache() {
  const scope = rwisCacheScope();
  const rwisHit = readPageCache(RWIS_CACHE_KEY, { expectedScope: scope });
  if (rwisHit?.entry?.data) {
    const d = rwisHit.entry.data;
    state.rwisStatus = d.rwisStatus || null;
    state.roadStations = Array.isArray(d.roadStations) ? d.roadStations : [];
    state.roadObsTm = d.roadObsTm || extractRoadObsTm(state.roadStations);
    state.roadTrend = d.roadTrend || null;
    state.roadTrendFetchedAt = Number.isFinite(d.roadTrendFetchedAt) ? d.roadTrendFetchedAt : (d.roadTrend ? (rwisHit.entry.savedAt || 0) : 0);
    state.roadRisk = d.roadRisk || null;
    state.shortTerm13 = d.shortTerm13 || null;
    state.warningsPayload = d.warningsPayload || null;
    state.cctvPayload = d.cctvPayload || null;
    state.cctvFetchedAt = Number.isFinite(d.cctvFetchedAt) ? d.cctvFetchedAt : (d.cctvPayload ? (rwisHit.entry.savedAt || 0) : 0);
    seedSharedCrossTabCaches(scope);
    state.fromCache = true;
    state.lastSyncedAt = rwisHit.entry.savedAt || 0;
    state.lastSyncHourKey = rwisHit.entry.hourKey || null;
    renderAll();
    const policy = evaluateCachePolicy({ cacheHit: rwisHit, freshMs: DEFAULT_FRESH_MS, dwellMs: DEFAULT_DWELL_MS });
    // 핵심 소스 누락, 13개소 불완전, 또는 도로관측(tm1)이 3분 이상 경과한 경우 즉시 백그라운드 재수신!
    if (
      !state.roadStations.length ||
      getRoadObsAgeMs() >= 3 * 60000 ||
      countCompleteShort13Regions() < 13 ||
      !state.warningsPayload?.ok ||
      !state.cctvPayload?.cctvs?.length
    ) {
      return { ...policy, shouldFetchNow: true };
    }
    return policy;
  }

  // Fallback: seed 13-region forecast & road-obs instantly from shared caches!
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
      roadObsTm: state.roadObsTm,
      roadTrend: state.roadTrend,
      roadTrendFetchedAt: state.roadTrendFetchedAt,
      roadRisk: state.roadRisk,
      shortTerm13: state.shortTerm13,
      warningsPayload: state.warningsPayload,
      cctvPayload: state.cctvPayload,
      cctvFetchedAt: state.cctvFetchedAt
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

function buildFiveCountyWarningsQuery() {
  return WATCH_WARNING_REGIONS
    .map(r => `${r.name}|${r.lat.toFixed(4)},${r.lon.toFixed(4)}`)
    .join(';');
}

let rwisLoadGen = 0;
let roadObsRealtimeInFlight = null;
let roadObsRetryTimer = null;
let short13RetryTimer = null;

async function pollRoadObsRealtime({ force = false } = {}) {
  if (roadObsRealtimeInFlight) return roadObsRealtimeInFlight;
  clearTimeout(roadObsRetryTimer);
  roadObsRetryTimer = null;
  roadObsRealtimeInFlight = (async () => {
    try {
      const qs = force ? '&force=1' : '';
      const v = await fetchJsonSafe(`/api/road-obs?line=14${qs}`, 10000, 1);
      const list = Array.isArray(v) ? v : (Array.isArray(v?.stations) ? v.stations : []);
      if (list.length) {
        const changed = applyIncomingRoadObs(list, v?.tm1 || '', { isLive: true });
        if (changed || !v?.stale) {
          state.fromCache = false;
          if (!v?.stale && getRoadObsAgeMs() < 10 * 60000) {
            state.lastSyncedAt = Date.now();
            state.lastSyncHourKey = currentKstHourKey();
            reportApiSuccess('rwis');
          }
          persistCache();
          renderAll();
        }
        return true;
      }
    } catch {}
    return false;
  })().finally(() => {
    roadObsRealtimeInFlight = null;
  });
  return roadObsRealtimeInFlight;
}

async function loadAllData({ force = false, hard = false, silent = false } = {}) {
  const bypass = Boolean(force || hard);
  if (state.loadPromise && !hard) return state.loadPromise;
  const gen = ++rwisLoadGen;
  clearTimeout(state.dwellTimer);
  state.dwellTimer = null;
  clearTimeout(roadObsRetryTimer);
  roadObsRetryTimer = null;
  clearTimeout(short13RetryTimer);
  short13RetryTimer = null;

  const btn = $('rwisReloadBtn');
  if (btn && (!silent || hard)) btn.classList.add('loading');
  if (hard) {
    state.hardRefreshActive = true;
    updateStampUI(false);
  }

  const run = (async () => {
    const refreshParam = bypass ? '?refresh=1' : '';
    const forceQs = `${bypass ? '&force=1' : ''}${hard ? '&hard=1' : ''}`;
    let okCount = 0;
    let roadObsSucceeded = false;
    const errors = [];

    // 핵심 노면·도로관측 수신 성공 시에만 스탬프 및 캐시 시각을 전진시켜 과거 데이터 위장(Stale Masking) 방지
    const markCoreLive = ({ fromRoadObs = false, isStale = false } = {}) => {
      if (gen !== rwisLoadGen) return;
      okCount++;
      state.fromCache = false;
      const roadFreshEnough = getRoadObsAgeMs() < 10 * 60000;
      if ((fromRoadObs && !isStale) || roadFreshEnough) {
        state.lastSyncedAt = Date.now();
        state.lastSyncHourKey = currentKstHourKey();
        persistCache();
        reportApiSuccess('rwis');
      }
      renderAll();
    };

    const markAuxLive = () => {
      if (gen !== rwisLoadGen) return;
      okCount++;
      if (getRoadObsAgeMs() < 10 * 60000) {
        persistCache();
      }
      renderAll();
    };

    const warnQuery = encodeURIComponent(buildFiveCountyWarningsQuery());
    const needCctv = hard || force || !state.cctvPayload?.cctvs?.length || (Date.now() - state.cctvFetchedAt >= CCTV_CLIENT_TTL_MS);
    const needTrend = hard || force || !state.roadTrend?.times?.length || (Date.now() - state.roadTrendFetchedAt >= ROAD_TREND_CLIENT_TTL_MS);

    const roadObsTask = fetchJsonSafe(`/api/road-obs?line=14${forceQs}`, 12000, 1)
      .then(v => {
        if (gen !== rwisLoadGen) return;
        const list = Array.isArray(v) ? v : (Array.isArray(v?.stations) ? v.stations : []);
        if (list.length) {
          roadObsSucceeded = !v?.stale;
          applyIncomingRoadObs(list, v?.tm1 || '', { isLive: !v?.stale });
          markCoreLive({ fromRoadObs: true, isStale: Boolean(v?.stale) });
        }
      })
      .catch(e => { errors.push(`도로관측(${e?.message || 'err'})`); });

    const tasks = [
      // P0-1 경량화: 188KB /api/status 대신 13KB /api/rwis 단독 호출 (중복 ITS CCTV 수신 및 파싱 제거)
      fetchJsonSafe(`/api/rwis/api/rwis${refreshParam}`, 14000)
        .then(async v => {
          if (gen !== rwisLoadGen) return;
          if (v?.ok) {
            state.rwisStatus = v.kind === 'rwis' ? { ok: true, rwis: v } : v;
            markCoreLive({ fromRoadObs: false });
            // RWIS 관측 슬롯이 현재 시각보다 12분 이상 뒤처진 캐시본이면 백그라운드로 1회 즉시 최신화 시도
            if (!bypass) {
              const core = getRwisCore();
              const tmStr = core?.tm?.FR || core?.tm?.VR || (typeof core?.tm === 'string' ? core.tm : '');
              if (/^\d{12}$/.test(tmStr)) {
                const slotMs = parseTm12ToMs(tmStr);
                if (Number.isFinite(slotMs) && (Date.now() - slotMs) >= 12 * 60000) {
                  try {
                    const fresh = await fetchJsonSafe('/api/rwis/api/rwis?refresh=1', 14000, 0);
                    if (gen === rwisLoadGen && fresh?.ok) {
                      state.rwisStatus = fresh.kind === 'rwis' ? { ok: true, rwis: fresh } : fresh;
                      if (getRoadObsAgeMs() < 10 * 60000) persistCache();
                      renderAll();
                    }
                  } catch {}
                }
              }
            }
          }
        })
        .catch(e => { errors.push(`RWIS(${e?.message || 'err'})`); }),
      roadObsTask,
      ...(needTrend ? [
        // P2.5: 6시간 노면·기온 추세 스파크라인 — 실시간 road-obs 완료 직후 출발하여 KMA 연결 경합 방지 및 최신 슬롯 캐시 재사용!
        roadObsTask.finally(() => {
          if (gen !== rwisLoadGen) return null;
          return fetchJsonSafe(`/api/road-obs-trend?line=14&hours=6${forceQs}`, 14000, 0)
            .then(v => {
              if (gen !== rwisLoadGen) return;
              if (v?.ok && Array.isArray(v.times) && v.times.length) {
                state.roadTrend = v;
                state.roadTrendFetchedAt = Date.now();
                if (getRoadObsAgeMs() < 10 * 60000) persistCache();
                renderAll();
              }
            })
            .catch(() => {});
        })
      ] : []),
      fetchJsonSafe(`/api/road-risk?roadNum=012${forceQs}`, 12000)
        .then(v => { if (gen === rwisLoadGen && v?.ok) { state.roadRisk = v; markAuxLive(); } })
        .catch(e => { errors.push(`도로위험(${e?.message || 'err'})`); }),
      fetchJsonSafe(`/api/warnings?places=${warnQuery}${forceQs}`, 12000)
        .then(v => {
          if (gen !== rwisLoadGen) return;
          if (v?.ok && v?.items) {
            state.warningsPayload = v;
            state.warningHistory = updateWarningHistory(state.warningHistory, v, Date.now());
            saveWarnHistory(state.warningHistory);
            markAuxLive();
          }
        })
        .catch(e => { errors.push(`기상특보(${e?.message || 'err'})`); }),
      ...(needCctv ? [
        fetchCctvDirectory(apiUrl(`/api/cctv${refreshParam}`), {
          cache: bypass ? 'no-store' : 'default',
          onRetry: () => {}
        })
          .then(async res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const v = await res.json();
            if (gen !== rwisLoadGen) return;
            if (Array.isArray(v?.cctvs) && v.cctvs.length) {
              state.cctvPayload = v;
              state.cctvFetchedAt = Date.now();
              markAuxLive();
            }
          })
          .catch(e => { errors.push(`CCTV(${e?.message || 'err'})`); })
      ] : []),
      fetchJsonSafe(`/api/short-term-12?roster=13${forceQs}${hard ? '&refreshShort=1&refreshUltra=1' : ''}`, 30000)
        .then(v => {
          if (gen !== rwisLoadGen) return;
          if (v?.ok && Array.isArray(v.regions)) {
            const curShortMs = Date.parse(state.shortTerm13?.sources?.shortBase || '');
            const inShortMs = Date.parse(v?.sources?.shortBase || '');
            if (!hard && Number.isFinite(curShortMs) && Number.isFinite(inShortMs) && inShortMs < curShortMs && countCompleteShort13Regions() >= 13) {
              return;
            }
            state.shortTerm13 = v;
            // hourly.html과 5분 탭 캐시 양방향 공유 (13개소 완전본 + 단일 세대일 때만)
            if (countCompleteShort13Regions(v) >= 13 && v.regions.some(r => r.id === 'gaya') && !v?.sources?.mixedGeneration) {
              writePageCache(HOURLY_CACHE_KEY, { scope: rwisCacheScope(), data: v });
            }
            markAuxLive();
          }
        })
        .catch(async e => {
          errors.push(`13개소예보(${e?.message || 'err'})`);
          // 정적 스냅샷 보조 폴백 (단, reportApiSuccess는 호출하지 않아 실제 단절 감지를 방해하지 않음)
          if (gen === rwisLoadGen && !state.shortTerm13) {
            try {
              const snapRes = await fetch('./api/short-term-12.json?roster=13', { signal: AbortSignal.timeout(5000) });
              if (snapRes.ok) {
                const snap = await snapRes.json();
                if (gen === rwisLoadGen && snap?.ok && Array.isArray(snap.regions)) {
                  state.shortTerm13 = snap;
                  renderAll();
                }
              }
            } catch {}
          }
        })
    ];

    await Promise.allSettled(tasks);
    if (gen !== rwisLoadGen) return;

    // 도로관측이 실패했거나 관측시각(tm1)이 6분 이상 지연된 경우 12초 후 단독 강제 재수신으로 즉시 정합성 회복
    if (!roadObsSucceeded || getRoadObsAgeMs() >= 6 * 60000) {
      roadObsRetryTimer = setTimeout(() => {
        if (!document.hidden) pollRoadObsRealtime({ force: true });
      }, 12000);
    }

    // 13개 지역 단기예보 중 일부 격자가 일시 결측된 경우 10초 후 1회 보완 조회
    if (countCompleteShort13Regions() < 13) {
      short13RetryTimer = setTimeout(async () => {
        if (document.hidden) return;
        try {
          const retryV = await fetchJsonSafe('/api/short-term-12?roster=13&force=1&refreshUltra=1', 28000, 0);
          if (retryV?.ok && countCompleteShort13Regions(retryV) > countCompleteShort13Regions()) {
            state.shortTerm13 = retryV;
            if (countCompleteShort13Regions(retryV) >= 13 && retryV.regions.some(r => r.id === 'gaya')) {
              writePageCache(HOURLY_CACHE_KEY, { scope: rwisCacheScope(), data: retryV });
            }
            if (getRoadObsAgeMs() < 10 * 60000) persistCache();
            renderAll();
          }
        } catch {}
      }, 10000);
    }

    if (hard) {
      state.hardRefreshActive = false;
      if (okCount > 0) {
        state.hardBannerUntil = Date.now() + 4500;
        setTimeout(() => updateStampUI(false), 4600);
      }
      updateStampUI(okCount === 0);
    }

    if (okCount === 0) {
      reportApiFailure('rwis', errors.join(', ') || 'API 연결 실패');
      updateStampUI(true);
    }
  })().finally(() => {
    if (state.loadPromise === run) {
      state.loadPromise = null;
      if (hard) state.hardRefreshActive = false;
      if (btn) btn.classList.remove('loading');
      updateStampUI(false);
    }
  });

  state.loadPromise = run;
  return run;
}

/* ───────────────────── UI 이벤트 바인딩 ───────────────────── */
function setSideTab(tabName) {
  state.sideTab = tabName;
  document.querySelectorAll('.rwis-side-tab').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.sideTab === tabName ? 'true' : 'false');
  });
  $('sidePanelShort6').hidden = tabName !== 'short6';
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

if ($('toggleRoadTempOverlay')) {
  $('toggleRoadTempOverlay').setAttribute('aria-pressed', String(state.showRoadTemps));
}
if ($('toggleShort13Overlay')) {
  $('toggleShort13Overlay').setAttribute('aria-pressed', String(state.showShort13Map));
}

$('toggleRoadTempOverlay')?.addEventListener('click', () => {
  state.showRoadTemps = !state.showRoadTemps;
  $('toggleRoadTempOverlay').setAttribute('aria-pressed', String(state.showRoadTemps));
  saveRwisUiPrefs();
  renderAll();
});

$('toggleShort13Overlay')?.addEventListener('click', () => {
  state.showShort13Map = !state.showShort13Map;
  $('toggleShort13Overlay').setAttribute('aria-pressed', String(state.showShort13Map));
  saveRwisUiPrefs();
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
  const { isHardForce } = registerManualRefreshClick('rwis');
  clearPageCache(RWIS_CACHE_KEY);
  if (isHardForce) {
    clearPageCache(HOURLY_CACHE_KEY);
    if ($('rwisCctvModal') && !$('rwisCctvModal').hidden) {
      refreshActiveModalCctv();
    }
  }
  loadAllData({ force: true, hard: isHardForce, silent: false });
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
$('rwisModalPrev')?.addEventListener('click', () => {
  if (state.activeCamIndex > 0) openMainCctvByIndex(state.activeCamIndex - 1);
});
$('rwisModalNext')?.addEventListener('click', () => {
  const entries = getMainCctvEntries();
  if (state.activeCamIndex >= 0 && state.activeCamIndex < entries.length - 1) {
    openMainCctvByIndex(state.activeCamIndex + 1);
  }
});
$('rwisModalRetry')?.addEventListener('click', () => {
  refreshActiveModalCctv();
});
document.addEventListener('keydown', e => {
  if ($('rwisCctvModal').hidden) return;
  if (e.key === 'Escape') closeCctvModal();
  else if (e.key === 'ArrowLeft' && state.activeCamIndex > 0) openMainCctvByIndex(state.activeCamIndex - 1);
  else if (e.key === 'ArrowRight') {
    const entries = getMainCctvEntries();
    if (state.activeCamIndex >= 0 && state.activeCamIndex < entries.length - 1) {
      openMainCctvByIndex(state.activeCamIndex + 1);
    }
  }
});

/* ───────────────────── 초기화 ───────────────────── */
mountNetHealthMonitor({
  onRetry: () => loadAllData({ force: true, silent: false })
});

iceAlertModal = mountIceAlertModal({
  onAcknowledge: () => renderAll()
});
if (typeof window !== 'undefined') {
  window.__biondaIceAlertModal = iceAlertModal;
}

tvGuard = mountTvGuard({
  onStateChange: updateBurnInBtnUI
});
$('rwisBurnInBtn')?.addEventListener('click', () => {
  tvGuard?.toggle();
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

// 타 탭(도로기상 상황판 index.html)에서 더 최신 분(tm1) 도로관측 수신 시 0ms 실시간 미러링
window.addEventListener('storage', e => {
  if (e.key === SHARED_ROAD_OBS_KEY) {
    const shared = readSharedRoadObs({ line: '14' });
    const curTm = state.roadObsTm || extractRoadObsTm(state.roadStations);
    if (shared?.stations?.length && (!state.roadStations.length || (shared.tm1 && shared.tm1 > curTm))) {
      state.roadStations = shared.stations;
      state.roadObsTm = shared.tm1 || curTm;
      persistCache();
      renderAll();
    }
  } else if (e.key === HOURLY_CACHE_KEY && countCompleteShort13Regions() < 13) {
    const hourlyHit = readPageCache(HOURLY_CACHE_KEY, { expectedScope: rwisCacheScope() });
    if (hourlyHit?.entry?.data?.regions && countCompleteShort13Regions(hourlyHit.entry.data) > countCompleteShort13Regions()) {
      state.shortTerm13 = hourlyHit.entry.data;
      renderAll();
    }
  }
});

// KMA 1분 단위 도로기상관측(노면온도·기온) 실시간 하트비트 (2분 주기 — rwis.kma.go.kr 및 도로기상 상황판과 상시 정합성 유지)
setInterval(() => {
  if (!document.hidden && !state.loadPromise) {
    pollRoadObsRealtime({ force: false });
  }
}, 2 * 60000);

// 50인치 TV 24시간 무인 표출용 정각 5분 슬롯(:01, :06, :11...) 동기화 갱신 + 백업 인터벌
function scheduleAlignedFiveMinRefresh() {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  // 매 5분 슬롯 직후 +65초(:01:05, :06:05...)에 맞춰 기상청 5분 자료 생성 직후 동기화
  const targetOffset = 65 * 1000;
  let nextMs = Math.floor((now - targetOffset) / fiveMin + 1) * fiveMin + targetOffset;
  const waitMs = Math.max(15000, nextMs - now);
  setTimeout(() => {
    if (!document.hidden) loadAllData({ force: false, silent: true });
    scheduleAlignedFiveMinRefresh();
  }, waitMs);
}
scheduleAlignedFiveMinRefresh();

setInterval(() => {
  if (!document.hidden && (!state.lastSyncedAt || Date.now() - state.lastSyncedAt >= OVERVIEW_REFRESH_MS + 30000 || getRoadObsAgeMs() >= 5 * 60000)) {
    loadAllData({ force: false, silent: true });
  }
}, OVERVIEW_REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const now = Date.now();
    // 백그라운드에 있는 동안 타 탭에서 갱신된 도로관측이 있으면 즉시 반영
    if (seedSharedCrossTabCaches(rwisCacheScope())) {
      renderAll();
    }
    const fullStale = !state.lastSyncedAt || (now - state.lastSyncedAt >= DEFAULT_FRESH_MS) || (state.lastSyncHourKey !== currentKstHourKey(now));
    const roadStale = getRoadObsAgeMs(now) >= 3 * 60000;
    if (fullStale) {
      loadAllData({ force: false, silent: state.lastSyncedAt > 0 });
    } else if (roadStale) {
      pollRoadObsRealtime({ force: true });
    }
  }
});
