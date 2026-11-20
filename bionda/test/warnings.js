// 기상청 CAP 특보 전종 파싱 · 도로관리 위험도 우선순위 정렬 · 발효/해제예정 시각 추출 (요구사항 3)
import { apiUrl, isBackendAvailable } from './config.js';
import { getSnapshotFallback } from './observations.js';

const origin = 'https://www.weather.go.kr';
const feed = origin + '/w/rss/cap/warning.do';
const official = origin + '/w/wnuri-fct2021/weather/warning.do';
const bulletinPath = /^\/w\/repositary\/xml\/wrn\/xml\/(KR\.W\d+_\d{12}_[A-Z]{2,6}_\d+_(?:EN|KR)\.xml)$/;

const xmlCache = new Map();
const text = (node, name) => node?.querySelector(name)?.textContent?.trim() || '';

const EVENT_KO_MAP = [
  [/typhoon|태풍/i, '태풍'],
  [/heavy\s*snow|snowfall|대설/i, '대설'],
  [/heavy\s*rain|downpour|호우/i, '호우'],
  [/storm\s*surge|폭풍해일/i, '폭풍해일'],
  [/tsunami|지진해일/i, '지진해일'],
  [/cold\s*wave|한파/i, '한파'],
  [/strong\s*wind|gale|강풍/i, '강풍'],
  [/fog|안개/i, '안개'],
  [/wind\s*(and\s*)?wave|high\s*seas|풍랑/i, '풍랑'],
  [/heat\s*wave|폭염/i, '폭염'],
  [/dry|건조/i, '건조'],
  [/yellow\s*dust|asian\s*dust|황사/i, '황사'],
  [/tropical\s*night|열대야/i, '열대야']
];

export const TYPE_PRIORITY = {
  '태풍': 1,
  '대설': 2,
  '호우': 3,
  '폭풍해일': 4,
  '지진해일': 5,
  '한파': 6,
  '강풍': 7,
  '안개': 8,
  '풍랑': 9,
  '폭염': 10,
  '건조': 11,
  '황사': 12,
  '열대야': 13
};

export const LEVEL_PRIORITY = {
  '경보': 1,
  '주의보': 2,
  '예비특보': 3,
  '특보': 4
};

export function mapEventToKorean(eventStr) {
  const s = String(eventStr || '').trim();
  let kind = '기상';
  for (const [re, ko] of EVENT_KO_MAP) {
    if (re.test(s)) { kind = ko; break; }
  }
  let level = '주의보';
  if (/warning|경보/i.test(s)) level = '경보';
  else if (/preliminary|예비/i.test(s)) level = '예비특보';
  else if (/watch|advisory|주의/i.test(s)) level = '주의보';
  const cancel = /clear|cancel|lift|해제/i.test(s);
  return { kind, level, cancel, title: level === '예비특보' ? `${kind} 예비특보` : `${kind}${level}` };
}

export function calcPriorityScore(kind, level) {
  const lRank = LEVEL_PRIORITY[level] || 4;
  const tRank = TYPE_PRIORITY[kind] || 20;
  return lRank * 100 + tRank;
}

export function formatIsoToShortKst(isoStr, isExpires = false) {
  if (!isoStr) return isExpires ? '해제시각 추후 발표' : '시각 확인 중';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(isoStr)) return String(isoStr);
  const ms = Date.parse(isoStr);
  if (!Number.isFinite(ms)) return String(isoStr);
  const kstDate = new Date(ms + 9 * 3600000);
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getUTCDate()).padStart(2, '0');
  const hh = String(kstDate.getUTCHours()).padStart(2, '0');
  const mi = String(kstDate.getUTCMinutes()).padStart(2, '0');
  return isExpires ? `${Number(dd)}일 ${hh}:${mi}` : `${mm}-${dd} ${hh}:${mi}`;
}

export function inPolygon(lat, lon, polygon) {
  const pts = String(polygon || '').trim().split(/\s+/).map(s => s.split(',').map(Number));
  if (pts.length < 3 || pts.some(p => p.length !== 2 || !p.every(Number.isFinite))) return false;
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [y, x] = pts[i], [yy, xx] = pts[j];
    if ((y > lat) !== (yy > lat) && lon < (xx - x) * (lat - y) / (yy - y) + x) hit = !hit;
  }
  return hit;
}

async function retrieve(file = '') {
  const krFile = file ? file.replace(/_EN\.xml$/, '_KR.xml') : '';
  const hasBackend = await isBackendAvailable();
  const candidates = file
    ? [
        ...(hasBackend
          ? [apiUrl('/api/kma-cap?file=' + encodeURIComponent(krFile)), apiUrl('/api/kma-cap?file=' + encodeURIComponent(file))]
          : []),
        origin + '/w/repositary/xml/wrn/xml/' + krFile,
        origin + '/w/repositary/xml/wrn/xml/' + file
      ]
    : [...(hasBackend ? [apiUrl('/api/kma-cap')] : []), feed];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
      if (doc.documentElement.localName === (file ? 'alert' : 'rss')) return doc;
    } catch {}
  }
  throw Error('기상청 특보 자료 연결 지연');
}

function loadXml(file = '') {
  const entry = xmlCache.get(file);
  if (entry && Date.now() < entry.until) return entry.promise;
  if (xmlCache.size > 100) xmlCache.delete(xmlCache.keys().next().value);
  const promise = retrieve(file).catch(e => { xmlCache.delete(file); throw e; });
  xmlCache.set(file, { promise, until: Date.now() + (file ? 1800000 : 60000) });
  return promise;
}

function parseCapBulletin(doc, place, file) {
  if (text(doc, 'status') !== 'Actual' || text(doc, 'scope') !== 'Public') return [];
  const results = [];
  const sentIso = text(doc, 'sent');
  const sentMs = Date.parse(sentIso) || Date.now();
  const msgType = text(doc, 'msgType');

  for (const info of doc.querySelectorAll('info')) {
    const eventRaw = text(info, 'event') || text(info, 'headline');
    if (!eventRaw) continue;
    const { kind, level, cancel: eventCancel, title } = mapEventToKorean(eventRaw);
    const isCancel = msgType === 'Cancel' || eventCancel;

    const areas = [...info.querySelectorAll('area')];
    const matchedAreas = areas.filter(a => {
      const polys = [...a.querySelectorAll('polygon')];
      if (polys.length) {
        return polys.some(p => inPolygon(place.lat, place.lon, p.textContent));
      }
      const desc = text(a, 'areaDesc').replace(/\s+/g, '');
      const pName = String(place.name || '').replace(/\s+/g, '');
      if (!desc || !pName) return false;
      const isSubZone = /(서북|서남|동북|동남|중북|중남|동부|서부|남부|북부|중부|산지|평지)$/.test(desc);
      return desc === pName || pName.includes(desc) || (!isSubZone && desc.includes(pName));
    });

    if (!matchedAreas.length) continue;

    const onsetIso = text(info, 'onset') || text(info, 'effective') || sentIso;
    const expiresIso = text(info, 'expires');
    const onsetMs = Date.parse(onsetIso);
    const isFuture = Number.isFinite(onsetMs) && onsetMs > Date.now();

    const areaNames = matchedAreas.map(a => text(a, 'areaDesc')).filter(Boolean);

    results.push({
      id: text(doc, 'identifier') + ':' + kind,
      kind,
      level,
      title,
      areaName: areaNames[0] || '',
      cancel: isCancel,
      action: isCancel ? '해제' : msgType === 'Update' ? '변경' : '발표',
      sent: sentMs,
      sentIso,
      onsetIso,
      expiresIso,
      effectiveText: formatIsoToShortKst(onsetIso, false),
      isFutureEffective: isFuture || level === '예비특보',
      expiresText: expiresIso ? formatIsoToShortKst(expiresIso, true) + ' 해제예정' : '해제예정 미정',
      priorityScore: calcPriorityScore(kind, level),
      file
    });
  }
  return results;
}

function parseT6Summary(doc, place) {
  const results = [];
  const pName = String(place.name || '').replace(/\s+/g, '');
  const shortPrefix = pName.slice(0, 2);
  for (const param of doc.querySelectorAll('info > parameter')) {
    if (text(param, 'valueName') !== 't6') continue;
    const val = text(param, 'value');
    for (const rawLine of val.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith('o ')) continue;
      const m = line.match(/^o\s*([^\s:]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const [, wrnTitle, regionsText] = m;
      const cleanRegions = regionsText.replace(/\s+/g, '');
      const hasToken = token => new RegExp(`(?:^|[(,])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:시|군|구)?(?=[,)]|$)`).test(cleanRegions);
      if (
        (pName && hasToken(pName)) ||
        (shortPrefix.length === 2 && ['함양', '거창', '합천', '고령', '남원', '달성'].includes(shortPrefix) && hasToken(shortPrefix))
      ) {
        const { kind, level, title } = mapEventToKorean(wrnTitle);
        results.push({
          id: 't6:' + title,
          kind,
          level,
          title,
          cancel: false,
          action: '발효중',
          sent: Date.now() - 3600000,
          effectiveText: '발효중',
          isFutureEffective: false,
          expiresText: '기상청 특보문 참조',
          priorityScore: calcPriorityScore(kind, level)
        });
      }
    }
  }
  return results;
}

export function buildWarningSummary(activeWarnings = []) {
  const sorted = [...activeWarnings].sort((a, b) => (a.priorityScore ?? 999) - (b.priorityScore ?? 999));
  if (!sorted.length) {
    return {
      active: [],
      count: 0,
      top: null,
      badgeText: null,
      badgeShortText: null,
      badgeLevel: null,
      tooltipLines: []
    };
  }
  const top = sorted[0];
  const extraCount = sorted.length - 1;
  const badgeText = extraCount > 0 ? `${top.title} 외 ${extraCount}개` : top.title;
  const badgeShortText = extraCount > 0 ? `${top.title} 외${extraCount}` : top.title;
  const badgeLevel = top.level === '경보' ? 'danger' : 'warning';
  const tooltipLines = sorted.map((w, idx) => {
    const effLabel = w.isFutureEffective ? `${w.effectiveText} 발효예정` : `${w.effectiveText} 발효`;
    const expLabel = w.expiresText
      ? (w.expiresText.includes('해제') || w.expiresText.includes('발표') ? w.expiresText : `${w.expiresText} 해제예정`)
      : '해제시각 미정';
    return {
      rank: idx + 1,
      title: w.title,
      areaName: w.areaName || '',
      level: w.level,
      kind: w.kind,
      effectiveLabel: effLabel,
      expiresLabel: expLabel,
      line: `• ${w.title}${w.areaName ? ` (${w.areaName})` : ''} (${effLabel} · ${expLabel})`
    };
  });
  return {
    active: sorted,
    count: sorted.length,
    top,
    badgeText,
    badgeShortText,
    badgeLevel,
    tooltipLines
  };
}

function toActiveWarningItem(w) {
  return {
    id: `${w.regId}:${w.kind}:${w.tmFc}`,
    kind: w.kind,
    level: w.level,
    title: w.title,
    areaName: w.regKo || '',
    cancel: false,
    action: w.cmd || '발효',
    sent: Date.now(),
    effectiveText: w.effectiveText,
    isFutureEffective: w.isFutureEffective,
    expiresText: w.expiresText ? (w.expiresText.includes('해제') || w.expiresText.includes('발표') ? w.expiresText : `${w.expiresText} 해제예정`) : '해제시각 추후 발표',
    priorityScore: w.priorityScore ?? calcPriorityScore(w.kind, w.level)
  };
}

export function buildWarningsFromApi(rawWarnings = []) {
  const activeByKind = new Map();
  for (const w of rawWarnings || []) {
    if (w?.kind) activeByKind.set(w.kind, toActiveWarningItem(w));
  }
  const summary = buildWarningSummary([...activeByKind.values()]);
  return {
    ...summary,
    recentEvents: [],
    officialUrl: official
  };
}

let lastCapFallbackAt = 0;
let capDocsInFlight = null;

async function loadCapBulletinDocs() {
  if (capDocsInFlight) return capDocsInFlight;
  capDocsInFlight = (async () => {
    const rssDoc = await loadXml('');
    const files = [];
    for (const item of rssDoc.querySelectorAll('item')) {
      const linkText = text(item, 'link');
      try {
        const u = new URL(linkText);
        const m = u.pathname.match(bulletinPath);
        if (m && files.length < 18) files.push(m[1]);
      } catch {}
    }
    const settled = await Promise.allSettled(files.map(async f => {
      const doc = await loadXml(f);
      return { f, doc };
    }));
    return settled.filter(x => x.status === 'fulfilled').map(x => x.value);
  })().finally(() => {
    capDocsInFlight = null;
  });
  return capDocsInFlight;
}

function summarizeFromCapDocs(docs, place) {
  const activeByKind = new Map();
  const recentEvents = [];
  const chronological = docs
    .flatMap(({ doc, f }) => parseCapBulletin(doc, place, f))
    .sort((a, b) => a.sent - b.sent);

  for (const ev of chronological) {
    recentEvents.push(ev);
    if (ev.cancel) {
      activeByKind.delete(ev.kind);
    } else {
      activeByKind.set(ev.kind, ev);
    }
  }
  const firstDoc = docs[0]?.doc;
  if (firstDoc) {
    for (const t6Item of parseT6Summary(firstDoc, place)) {
      if (!activeByKind.has(t6Item.kind)) {
        activeByKind.set(t6Item.kind, t6Item);
      }
    }
  }
  const summary = buildWarningSummary([...activeByKind.values()]);
  return {
    ...summary,
    recentEvents: recentEvents.sort((a, b) => b.sent - a.sent).slice(0, 6),
    officialUrl: official
  };
}

export async function fetchBatchWarnings(placesList = []) {
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
  const targetPlaces = [...deduped.values()].sort((a, b) => a.key.localeCompare(b.key));
  const resultsByKey = new Map();
  if (!targetPlaces.length) return { ok: true, resultsByKey };

  let loadedPrimary = false;
  if (await isBackendAvailable()) {
    try {
      const serialized = targetPlaces.map(p => `${p.name}|${p.key}`).join(';');
      const res = await fetch(
        apiUrl('/api/warnings?places=' + encodeURIComponent(serialized)),
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.items) {
          for (const p of targetPlaces) {
            const entry = data.items[p.key];
            resultsByKey.set(p.key, { ...buildWarningsFromApi(entry?.warnings || []), confirmed: data.warningsConfirmed === true && Array.isArray(entry?.warnings) });
          }
          loadedPrimary = true;
          return { ok: true, stale: Boolean(data.stale), resultsByKey };
        }
      }
    } catch {}
  }

  let hasSnapshot = false;
  if (!loadedPrimary) {
    try {
      const snap = await getSnapshotFallback();
      if (snap?.warnings) {
        hasSnapshot = true;
        for (const p of targetPlaces) {
          resultsByKey.set(p.key, buildWarningsFromApi(snap.warnings[p.key]?.warnings || []));
        }
      }
    } catch {}
  }

  const now = Date.now();
  if (!loadedPrimary && (now - lastCapFallbackAt >= 180000 || !hasSnapshot)) {
    lastCapFallbackAt = now;
    try {
      const docs = await loadCapBulletinDocs();
      if (docs.length) {
        for (const p of targetPlaces) {
          resultsByKey.set(p.key, summarizeFromCapDocs(docs, p));
        }
      }
    } catch {}
  }

  for (const p of targetPlaces) {
    if (!resultsByKey.has(p.key)) {
      resultsByKey.set(p.key, buildWarningsFromApi([]));
    }
  }
  return { ok: false, resultsByKey };
}

export async function fetchPlaceWarnings(place) {
  const activeByKind = new Map();

  // 1. Server-side KMA wrn_now_data.php + CAP polygon endpoint (/api/warnings)
  let loadedPrimary = false;
  if (await isBackendAvailable()) {
    try {
      const res = await fetch(
        apiUrl('/api/warnings?name=' + encodeURIComponent(place.name) + '&lat=' + place.lat + '&lon=' + place.lon),
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        for (const w of data.warnings || []) {
          activeByKind.set(w.kind, toActiveWarningItem(w));
        }
        loadedPrimary = true;
      }
    } catch {}
  }
  let hasSnapshot = false;
  if (!loadedPrimary) {
    try {
      const snap = await getSnapshotFallback();
      if (snap) {
        hasSnapshot = true;
        const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
        for (const w of snap?.warnings?.[key]?.warnings || []) {
          activeByKind.set(w.kind, toActiveWarningItem(w));
        }
      }
    } catch {}
  }

  // 2. CAP RSS & XML 보조 조회는 백엔드(/api/warnings) 실패 + 3분 쿨다운 조건에서만 공유 실행
  const now = Date.now();
  if (!loadedPrimary && (now - lastCapFallbackAt >= 180000 || !hasSnapshot)) {
    lastCapFallbackAt = now;
    try {
      const docs = await loadCapBulletinDocs();
      if (docs.length) {
        return summarizeFromCapDocs(docs, place);
      }
    } catch {}
  }

  const summary = buildWarningSummary([...activeByKind.values()]);
  return {
    ...summary,
    recentEvents: [],
    officialUrl: official
  };
}
