import { mountCctv } from './cctv-player.js';
import { loadWeather, loadProbabilities, prefetchOpenMeteo, seedKmaForecast } from './weather.js';
import { loadOverviewBundle, loadObservation, loadRoadStations, loadRoadRisk, seedOverviewCache, getLastObsError } from './observations.js';
import { fetchBatchWarnings, buildWarningSummary, buildWarningsFromApi } from './warnings.js';
import {
  classifySeverityTier,
  isRoadRiskEscalated,
  ROAD_RISK_LABELS,
  FOG_RISK_LABELS,
  evaluateResaltCard,
  isSnowRelatedWarning,
  evaluateStandbyReturnDirective
} from './ice.js';
import { renderOverviewCanvas, renderDetailCanvas, canvasToJpgBlob } from './share.js';
import { apiUrl, getApiBase, setApiBase, probeBackend, isBackendAvailable, getBackendStatusSnapshot } from './config.js';
import { applyHeroScene, buildHeroSceneInputFromRecord, clearHeroScene } from './hero-scenes.js';
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

const $ = id => document.getElementById(id);
const el = (tag, txt = '', cls = '') => {
  const a = document.createElement(tag);
  if (txt !== null && txt !== undefined) a.textContent = txt;
  if (cls) a.className = cls;
  return a;
};

// 광주대구선(14번 고속도로) 및 지리산·고령권역 기본 8개 관심지역
export const presets = [
  ['대구 달성군남부', '현풍읍', 35.697, 128.447, 'dalseong-nambu'],
  ['함양중부', '지곡면', 35.566, 127.774, 'hamyang-jungbu'],
  ['거창군남부', '남상면', 35.644, 127.910, 'geochang-nambu'],
  ['합천군서북부', '야로면', 35.706, 128.168, 'hapcheon-seobuk'],
  ['고령군', '대가야읍', 35.728, 128.263, 'goryeong'],
  ['남원', '남원시청', 35.416, 127.390, 'namwon'],
  ['함양', '함양읍', 35.520, 127.725, 'hamyang-eup'],
  ['거창', '거창읍', 35.687, 127.910, 'geochang-eup']
].map(([name, site, lat, lon, cctvSite]) => ({ name, site, lat, lon, cctvSite }));

const NATIONWIDE_PLACES = [
  ...presets,
  ['서울 종로구', '광화문', 37.5729, 126.9794],
  ['서울 중구', '시청', 37.5637, 126.9976],
  ['서울 강남구', '역삼동', 37.5172, 127.0473],
  ['부산 해운대구', '좌동', 35.1632, 129.1636],
  ['대구 수성구', '범어동', 35.8581, 128.6306],
  ['대구 중구', '동성로', 35.8693, 128.6062],
  ['대전 서구', '둔산동', 36.3553, 127.3834],
  ['광주 서구', '치평동', 35.1519, 126.8902],
  ['광주 북구', '용봉동', 35.1741, 126.9116],
  ['전북 장수군', '장수읍', 35.6474, 127.5212],
  ['전북 순창군', '순창읍', 35.3744, 127.1374],
  ['전남 담양군', '담양읍', 35.3211, 126.9882],
  ['경남 산청군', '산청읍', 35.4156, 127.8735],
  ['경남 진주시', '상대동', 35.1803, 128.1076],
  ['경북 성주군', '성주읍', 35.9191, 128.2830],
  ['경북 김천시', '신음동', 36.1398, 128.1136],
  ['강원 평창군', '대관령면', 37.6772, 128.7183],
  ['강원 강릉시', '교동', 37.7519, 128.8761],
  ['제주시', '연동', 33.4996, 126.5312]
].map(x => (Array.isArray(x) ? { name: x[0], site: x[1], lat: x[2], lon: x[3] } : x));

const STORAGE_KEY = 'bionda-review:locations:v3';
const SETTINGS_KEY = 'bionda-review:settings:v2';

const valid = p =>
  p &&
  typeof p.name === 'string' &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lon) &&
  p.lat >= 32 &&
  p.lat <= 40 &&
  p.lon >= 124 &&
  p.lon <= 132;

const coord = p => `${Number(p.lat).toFixed(3)},${Number(p.lon).toFixed(3)}`;

let places = presets.slice(0, 8);
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved?.places?.some(valid)) {
    places = saved.places.filter(valid).slice(0, 8);
  }
} catch {}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ places }));
  } catch {}
}

// 감시 및 레이아웃 설정 상태
const settings = {
  fullscreen: false,
  sound: true,
  wakeLock: true,
  sortRisk: true,
  darkMode: false,
  showActionCards: false,
  desktopNotify: true,
  pcLayout: 'stacked', // 'stacked' (상하 기본 4x2 + 하단 분할) | 'split' (좌우 FHD 분할: 좌 2x4 + 우 상하 레이더/미니맵)
  mapSplitPct: 43, // 미니맵 영역 폭 비율 (30 ~ 68%)
  splitRadarPx: 390 // 좌우 분할 시 우측 상단 영상 높이 (220 ~ 640px)
};
try {
  const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (savedSettings && typeof savedSettings === 'object') {
    settings.sound = savedSettings.sound ?? true;
    settings.wakeLock = savedSettings.wakeLock ?? true;
    settings.sortRisk = savedSettings.sortRisk ?? true;
    settings.darkMode = savedSettings.darkMode ?? false;
    settings.showActionCards = savedSettings.showActionCards ?? false;
    settings.desktopNotify = savedSettings.desktopNotify ?? true;
    settings.pcLayout = savedSettings.pcLayout === 'split' ? 'split' : 'stacked';
    if (Number.isFinite(savedSettings.mapSplitPct)) {
      settings.mapSplitPct = Math.max(30, Math.min(68, savedSettings.mapSplitPct));
    }
    if (Number.isFinite(savedSettings.splitRadarPx)) {
      settings.splitRadarPx = Math.max(220, Math.min(640, savedSettings.splitRadarPx));
    }
  }
} catch {}

function persistSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        sound: settings.sound,
        wakeLock: settings.wakeLock,
        sortRisk: settings.sortRisk,
        darkMode: settings.darkMode,
        showActionCards: settings.showActionCards,
        desktopNotify: settings.desktopNotify,
        pcLayout: settings.pcLayout,
        mapSplitPct: settings.mapSplitPct,
        splitRadarPx: settings.splitRadarPx
      })
    );
  } catch {}
}

const n = (x, d = 0) => (Number.isFinite(x) ? (x === 0 ? '0' : x.toFixed(d)) : '—');
function amount(value, unit) {
  if (!Number.isFinite(value)) return '—';
  const display = value > 0 && value < 0.1 ? '<0.1' : n(value, 1);
  return display + (unit ? ' ' + unit : '');
}
export const summary = c =>
  c == null
    ? '맑음'
    : c === 0
    ? '맑음'
    : c === 1
    ? '대체로 맑음'
    : c === 2
    ? '구름 조금'
    : c === 3
    ? '흐림'
    : c <= 48
    ? '안개'
    : c <= 57
    ? '이슬비'
    : c <= 65
    ? '비'
    : c <= 67
    ? '어는 비'
    : c <= 77
    ? '눈'
    : c <= 82
    ? '소나기'
    : c <= 86
    ? '진눈깨비'
    : '뇌우';

const fmt = t => (t ? t.slice(5, 16).replace('T', ' ') : '—');
const escHtml = s =>
  String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const toEpochMs = t => {
  if (!t) return NaN;
  const s = String(t).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Date.parse(s + ':00+09:00');
  return Date.parse(s);
};

const records = new Map();
let roadStations = [];
let roadRiskData = null;
let initialRoadRiskDone = false;
const prevRoadRiskSnapshot = new Map();
const recentEscalations = [];
let filter = 'all';
let actionStageFilter = null; // null | 'preheat' | 'presalt' | 'mainplow' | 'floodwind'
let selectedWindyKey = null; // 'place:...' | 'stn:...'
let detailPlace = null;
let mobileMapView = false;
let tableMode = '6h'; // '6h' | '12h'
let windyState = {
  overlay: 'satellite',
  lat: 35.47,
  lon: 127.725,
  detailLat: 35.52,
  detailLon: 127.725,
  detailOpen: true,
  label: '함양·지리산 (35.52, 127.725)'
};
let initialSnapshotDone = false;
const prevRiskSnapshot = new Map();

const OVERVIEW_CACHE_KEY = 'bionda-review:cache:overview:v1';
const overviewCacheScope = () => `${getApiBase() || '__same_origin__'}|${targets().map(coord).join(';')}`;
let lastLiveOverviewSyncAt = 0;
let lastSyncHourKey = null;
let overviewFromCache = false;
let overviewRevalidating = false;
let overviewDwellTimer = null;
let overviewRefreshPromise = null;

export function record(p) {
  const id = coord(p);
  if (!records.has(id)) {
    records.set(id, {
      w: null,
      o: null,
      wrn: buildWarningSummary([]),
      last: 0,
      checked: 0
    });
  }
  return records.get(id);
}

// 시안(preview_pc.jpg / preview_mobile.jpg) 검증 및 상황실 훈련용 데이터 오버레이
function findPlaceRoadRisk(p) {
  if (!roadRiskData?.ok) return null;
  const direct = roadRiskData.placeRisks?.[coord(p)];
  if (direct) return { ...direct, tmKst: roadRiskData.tmKst, tmUtc: roadRiskData.tmUtc };
  const stns = roadRiskData.stationRisks || [];
  if (!stns.length) return null;
  let best = stns[0], bestD = Infinity;
  for (const s of stns) {
    const d = (s.lat - p.lat) ** 2 + (s.lon - p.lon) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  const distKm = Number((Math.sqrt(bestD) * 102).toFixed(2));
  return {
    stationId: best.stnId,
    stationName: best.name,
    stationKm: best.km,
    stationType: best.stationType,
    stationDistanceKm: distKm,
    iceLevel: best.iceLevel,
    iceLabel: best.iceLabel,
    fogLevel: best.fogLevel,
    fogLabel: best.fogLabel,
    flagLabel: best.flagLabel,
    segmentCount: best.segmentCount,
    tmKst: roadRiskData.tmKst,
    tmUtc: roadRiskData.tmUtc
  };
}

function findStationRoadRisk(stn) {
  if (!roadRiskData?.ok || !stn) return null;
  return (
    roadRiskData.stationRisks?.find(s => String(s.stnId) === String(stn.stnId)) ||
    roadRiskData.stationRisks?.find(s => s.name === stn.name) ||
    null
  );
}

function getEffectiveRecord(p) {
  const baseRec = record(p);
  return { ...baseRec, roadRisk: baseRec.roadRisk || findPlaceRoadRisk(p) };
}

// Web Audio API 합성 차임벨 (요구사항 7.2)
let audioCtx = null;
export function playAlertTone(type = 'warning') {
  if (!settings.sound && type !== 'test') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const notes = type === 'clear' ? [587.33, 783.99] : [523.25, 659.25, 880.0];
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.3);
    });
  } catch {}
}

// Screen Wake Lock API 연동 및 탭 복귀 자동 재획득 (요구사항 7.3)
let wakeLockSentinel = null;
async function syncWakeLock() {
  if (!settings.wakeLock) {
    if (wakeLockSentinel) {
      try { await wakeLockSentinel.release(); } catch {}
      wakeLockSentinel = null;
    }
    updateMonitorStatusBar();
    return;
  }
  if ('wakeLock' in navigator && !document.hidden) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        updateMonitorStatusBar();
      });
    } catch {}
  }
  updateMonitorStatusBar();
}

function syncBackendStatusUI() {
  const badge = $('backendModeBadge');
  const label = $('backendModeLabel');
  const input = $('apiBaseInput');
  const st = getBackendStatusSnapshot();
  const base = getApiBase();
  if (input && document.activeElement !== input) {
    input.value = base;
  }
  if (!badge || !label) return;
  badge.classList.remove('is-live', 'is-snapshot');
  if (!st) {
    badge.textContent = '확인중';
    label.textContent = base ? `연결 확인 중 (${base})` : '동일 서버 /api 및 정적 스냅샷 확인 중…';
  } else if (st.available) {
    const obsErr = getLastObsError();
    badge.textContent = obsErr ? '🟠 일부 지연' : '🟢 실시간 KMA';
    badge.classList.add(obsErr ? 'is-snapshot' : 'is-live');
    label.textContent = obsErr
      ? `백엔드 연결됨(${obsErr}) · 재시도 시 실시간 복구`
      : st.base
        ? `외부 백엔드 실시간 연동 중 (${st.base})`
        : '로컬/서버 Node 백엔드(/api/*) 실시간 기상청 관측 연동 중';
  } else {
    badge.textContent = '🟡 스냅샷+모델';
    badge.classList.add('is-snapshot');
    label.textContent = st.base
      ? `연결 실패(${st.base}${st.error ? ': ' + st.error : ''}) · 스냅샷 + Open-Meteo 실시간 동작`
      : '정적 호스팅(스냅샷 관측) + Open-Meteo 실시간 모델 동작 중';
  }
}

// 감시 상태 요약은 [⚙ 설정] 패널 내부 상단에 직관적으로 표시!
function updateMonitorStatusBar() {
  const dot = $('wakeDot');
  const txt = $('statusSummaryText');
  if (!dot || !txt) return;
  dot.classList.toggle('active', settings.wakeLock);
  const st = getBackendStatusSnapshot();
  const modeTxt = st?.available ? '🟢 실시간 기상청' : st ? '🟡 스냅샷+Open-Meteo' : '🔄 연결 확인중';
  const parts = [
    settings.wakeLock ? '👁️ 계속 켜두기 작동 중' : '👁️ 절전 기본',
    settings.sound ? '🔔 알림 소리 ON' : '🔕 소리 OFF',
    settings.sortRisk ? '위험지역 정렬됨' : '기본순서',
    modeTxt
  ];
  txt.textContent = parts.join(' · ');
  syncBackendStatusUI();
}

// 인앱 특보/위험 변동 토스트 배너 (요구사항 5 — 12초 후 자동 닫힘으로 하단 화면 가림 방지)
let toastTargetPlace = null;
let toastAutoTimer = null;
export function showAlertToast(place, badgeLabel, message, isClear = false) {
  const toast = $('alertToast');
  if (!toast) return;
  toastTargetPlace = place;
  toast.classList.toggle('theme-clear', isClear);
  $('toastBadge').textContent = badgeLabel;
  $('toastText').textContent = message;
  toast.hidden = false;
  clearTimeout(toastAutoTimer);
  toastAutoTimer = setTimeout(() => {
    if (toast) toast.hidden = true;
  }, 12000);
}

function checkRiskDiffs() {
  for (const p of places) {
    const rec = getEffectiveRecord(p);
    const id = coord(p);
    const iceRank = rec.w?.ice?.rank || 0;
    const wrnTop = rec.wrn?.top?.title || '';
    const wrnCount = rec.wrn?.count || 0;
    const sig = `${wrnTop}|${wrnCount}|${iceRank}`;
    const prev = prevRiskSnapshot.get(id);
    prevRiskSnapshot.set(id, sig);

    if (!initialSnapshotDone || !prev || prev === sig) continue;
    const [prevWrn, , prevIceStr] = prev.split('|');
    const prevIce = Number(prevIceStr || 0);

    if (wrnTop && wrnTop !== prevWrn) {
      const topObj = rec.wrn.top;
      const iceNote = iceRank === 2 ? " · 도로 살얼음 '주의' 단계 동시 발효 중" : '';
      showAlertToast(
        p,
        '🚨 특보 상향 발효',
        `${p.name}(${p.site || ''}) · ${topObj.title} 발효 (${topObj.effectiveText})  해제예정: ${topObj.expiresText}${iceNote}`,
        false
      );
      playAlertTone('warning');
      break;
    } else if (!wrnTop && prevWrn) {
      showAlertToast(p, '✅ 특보 해제', `${p.name}(${p.site || ''}) · ${prevWrn} 해제 완료`, true);
      playAlertTone('clear');
      break;
    } else if (iceRank > prevIce && iceRank >= 1) {
      showAlertToast(
        p,
        iceRank === 2 ? '❄️ 살얼음 주의' : '❄️ 살얼음 관심',
        `${p.name}(${p.site || ''}) · 도로 살얼음 '${rec.w.ice.level}' 단계 격상 (${rec.w.ice.shortCause || '노면 결빙 주의'})`,
        false
      );
      playAlertTone('warning');
      break;
    }
  }
  initialSnapshotDone = true;
}

function findNearestPlace(lat, lon) {
  let best = places[0], bestD = Infinity;
  for (const p of places) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function sendDesktopEscalationNotify(title, body, targetPlace) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const nObj = new Notification(title, { body, tag: 'bionda-road-risk' });
    nObj.onclick = () => {
      window.focus();
      if (targetPlace) location.hash = detailURL(targetPlace);
    };
  } catch {}
}

function checkRoadRiskEscalations(payload) {
  if (!payload?.ok) return;
  const targetsList = [];
  for (const s of payload.stationRisks || []) {
    targetsList.push({
      id: `stn:${s.stnId}`,
      label: `${s.name}(${s.km}k)`,
      iceLevel: s.iceLevel || 0,
      fogLevel: s.fogLevel || 0,
      linkedPlace: findNearestPlace(s.lat, s.lon)
    });
  }
  for (const p of places) {
    const pr = findPlaceRoadRisk(p);
    if (!pr) continue;
    targetsList.push({
      id: `place:${coord(p)}`,
      label: `${p.name}${pr.stationName ? ` · ${pr.stationName}` : ''}`,
      iceLevel: pr.iceLevel || 0,
      fogLevel: pr.fogLevel || 0,
      linkedPlace: p
    });
  }

  let notified = false;
  const tmShort = payload.tmKst ? fmt(payload.tmKst) : '방금';
  for (const item of targetsList) {
    const prev = prevRoadRiskSnapshot.get(item.id);
    prevRoadRiskSnapshot.set(item.id, { iceLevel: item.iceLevel, fogLevel: item.fogLevel });
    if (!initialRoadRiskDone || !prev) continue;

    if (isRoadRiskEscalated(prev.iceLevel, item.iceLevel)) {
      const fromLbl = ROAD_RISK_LABELS[prev.iceLevel] || `${prev.iceLevel}단계`;
      const toLbl = ROAD_RISK_LABELS[item.iceLevel] || `${item.iceLevel}단계`;
      const summaryLine = `${item.label} · 살얼음 ${prev.iceLevel}→${item.iceLevel}단계 [${toLbl}] (${tmShort})`;
      recentEscalations.unshift({ kind: '살얼음', from: prev.iceLevel, to: item.iceLevel, label: item.label, text: summaryLine, time: tmShort });
      if (recentEscalations.length > 4) recentEscalations.pop();
      if (!notified) {
        const badge = item.iceLevel === 3 ? '🚨 살얼음 위험(3단계) 격상' : '⚠️ 살얼음 주의(2단계) 격상';
        showAlertToast(item.linkedPlace, badge, `${item.label} · ${prev.iceLevel}단계(${fromLbl}) → ${item.iceLevel}단계 [${toLbl}] 격상`, false);
        sendDesktopEscalationNotify(badge, `${item.label} 구간 살얼음 ${prev.iceLevel}→${item.iceLevel}단계 [${toLbl}]`, item.linkedPlace);
        playAlertTone('warning');
        notified = true;
      }
    }

    if (isRoadRiskEscalated(prev.fogLevel, item.fogLevel)) {
      const fromLbl = FOG_RISK_LABELS[prev.fogLevel] || `${prev.fogLevel}단계`;
      const toLbl = FOG_RISK_LABELS[item.fogLevel] || `${item.fogLevel}단계`;
      const summaryLine = `${item.label} · 안개 ${prev.fogLevel}→${item.fogLevel}단계 [${toLbl}] (${tmShort})`;
      recentEscalations.unshift({ kind: '안개', from: prev.fogLevel, to: item.fogLevel, label: item.label, text: summaryLine, time: tmShort });
      if (recentEscalations.length > 4) recentEscalations.pop();
      if (!notified) {
        const badge = item.fogLevel === 3 ? '🌫️ 안개 위험(3단계) 격상' : '🌫️ 안개 주의(2단계) 격상';
        showAlertToast(item.linkedPlace, badge, `${item.label} · ${prev.fogLevel}단계(${fromLbl}) → ${item.fogLevel}단계 [${toLbl}] 격상`, false);
        sendDesktopEscalationNotify(badge, `${item.label} 구간 안개 ${prev.fogLevel}→${item.fogLevel}단계 [${toLbl}]`, item.linkedPlace);
        playAlertTone('warning');
        notified = true;
      }
    }
  }
  initialRoadRiskDone = true;
}

// 위험도 점수 계산 (4단계 등급 빨강>주황>노랑>회색 순 상단 우선 정렬)
function placeDangerScore(p) {
  const rec = getEffectiveRecord(p);
  const sev = classifySeverityTier(rec);
  let score = sev.tier * 2000;
  if (rec.wrn?.count > 0) {
    score += rec.wrn.top.level === '경보' ? 600 : 300;
    score += Math.max(0, 50 - (rec.wrn.top.priorityScore % 100));
  }
  const iceRank = rec.w?.ice?.rank || 0;
  const roadIce = rec.roadRisk?.iceLevel || 0;
  const roadFog = rec.roadRisk?.fogLevel || 0;
  const floodRank = rec.w?.ice?.flood?.rank || 0;
  score += Math.max(iceRank, roadIce, roadFog, floodRank) * 200;
  if (rec.w?.kma?.analysis?.now?.wet) score += 90;
  else if (rec.w?.kma?.analysis?.start) score += 45;
  return score;
}

function isExtra(p) {
  return presets.slice(5).some(q => coord(q) === coord(p));
}
function isRiskPlace(p) {
  const rec = getEffectiveRecord(p);
  return (
    (rec.wrn?.count || 0) > 0 ||
    (rec.w?.ice?.rank || 0) > 0 ||
    (rec.roadRisk?.iceLevel || 0) > 0 ||
    (rec.roadRisk?.fogLevel || 0) > 0 ||
    (rec.w?.ice?.flood?.rank || 0) > 0 ||
    !!rec.w?.kma?.analysis?.now?.wet
  );
}

// 특보 발효·해제예정 팝오버 툴팁 (요구사항 3.3)
let activeTooltipBtn = null;
function showWarningTooltip(btn, place, wrnSummary) {
  const tip = $('wrnTooltip');
  if (!tip || !wrnSummary?.count) return;
  activeTooltipBtn = btn;
  tip.innerHTML = '';

  const head = el('div', '', 'wrn-tooltip-head');
  head.append(
    el('span', `📋 ${place.site || place.name} 발효 특보 (우선순위순)`),
    el('span', `${wrnSummary.count}건`)
  );
  const ul = el('ul');
  for (const item of wrnSummary.tooltipLines) {
    const li = el('li', '', item.level === '경보' ? 'lvl-danger' : '');
    const b = el('b', `• ${item.title}`);
    const span = el('span', ` (${item.effectiveLabel} · ${item.expiresLabel})`);
    li.append(b, span);
    ul.append(li);
  }
  tip.append(head, ul);
  tip.hidden = false;

  const rect = btn.getBoundingClientRect();
  const top = Math.min(window.innerHeight - tip.offsetHeight - 12, rect.bottom + 6);
  const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, rect.left));
  tip.style.top = `${Math.max(8, top)}px`;
  tip.style.left = `${left}px`;
}

function hideWarningTooltip() {
  const tip = $('wrnTooltip');
  if (tip) tip.hidden = true;
  activeTooltipBtn = null;
}

document.addEventListener('click', e => {
  if ($('wrnTooltip') && !$('wrnTooltip').hidden && !e.target.closest('.badge-wrn') && !e.target.closest('#wrnTooltip')) {
    hideWarningTooltip();
  }
  if ($('actionConfirmPopover') && !$('actionConfirmPopover').hidden && !e.target.closest('.card-action-chips') && !e.target.closest('#actionConfirmPopover')) {
    $('actionConfirmPopover').hidden = true;
  }
  if ($('settingsPanel') && !$('settingsPanel').hidden && !e.target.closest('#settingsPanel') && !e.target.closest('#settingsBtn')) {
    $('settingsPanel').hidden = true;
    $('settingsBtn')?.setAttribute('aria-expanded', 'false');
  }
});

function precipitationStrip(rows = []) {
  const chart = el('span', '', 'popstrip');
  const description = [];
  chart.setAttribute('role', 'img');
  for (let i = 0; i < 6; i++) {
    const row = rows[i];
    const value = row?.pop;
    const time = row?.time?.slice(11, 16) ?? `${i + 1}시간 뒤`;
    const slot = el('span', '', 'popslot');
    const present = Number.isFinite(value) && value >= 0 && value <= 100;
    slot.title = `${time} · ${present ? value + '%' : '자료 없음'}`;
    description.push(slot.title);
    if (present) {
      const fill = el('span', '', 'popfill');
      fill.style.height = `${Math.max(8, value)}%`;
      slot.append(fill);
    } else {
      slot.classList.add('missing');
    }
    chart.append(slot);
  }
  chart.setAttribute('aria-label', '시간순 강수확률. ' + description.join(', '));
  return chart;
}

const detailURL = p => '#region/' + encodeURIComponent(p.name) + '/' + coord(p);

/**
 * 직관적 강수 시간대 요약 생성 ("19:00 ~ 23:00 강수예상", 12시간 전구간 강수 시 "19:00 ~ 06:00+ 계속")
 * - 기상청 초단기·단기예보 향후 12시간 창 기준
 */
export function rainTimingSummary(w, o) {
  const a = w?.kma?.analysis;
  const isMob = typeof window !== 'undefined' && window.innerWidth <= 768;
  const roadText = Number.isFinite(o?.roadTemp) ? `노면 ${o.roadTemp.toFixed(1)}°${isMob ? '' : 'C'}` : '';
  const hasSnow = a?.horizons?.some(h => h.kinds?.some(k => k.includes('눈'))) || a?.now?.type?.includes('눈');
  const icon = hasSnow ? '❄️' : '☔';
  const kindWord = hasSnow ? '눈예상' : '강수예상';
  const tilde = isMob ? '~' : ' ~ ';

  if (!a) {
    return { mainText: '기상청 예보 연동 중', roadText, shortMapText: '예보 연동', tooltip: '기상청 12시간 예보 불러오는 중', active: false };
  }
  const winEnd = (a.lastWetTime || a.windowEndTime)?.slice(11, 16);
  if (a.now?.wet) {
    const ed = a.end ? a.end.time.slice(11, 16) : null;
    if (ed) {
      return {
        mainText: `${icon} 현재${tilde}${ed} ${a.now.type}중`,
        roadText,
        shortMapText: `현재~${ed} ${a.now.type}`,
        tooltip: `기상청 12시간 예보 기준: 현재 ${a.now.type} 관측중 · ${ed}경 종료 추정(연속 2시간 무강수 기준)`,
        active: true
      };
    }
    return {
      mainText: winEnd ? `${icon} 현재${tilde}${winEnd}+ 계속` : `${icon} 현재 ${a.now.type}중(지속)`,
      roadText,
      shortMapText: winEnd ? `현재~${winEnd}+` : `현재 ${a.now.type}중`,
      tooltip: `기상청 12시간 예보 기준: 현재부터 ${winEnd || '12시간 이후'}까지 연속 강수(2시간 무강수 구간 없음)`,
      active: true
    };
  }
  if (a.start) {
    const st = a.start.time.slice(11, 16);
    const ed = a.end ? a.end.time.slice(11, 16) : null;
    if (ed) {
      const reRain = a.secondStartTime ? ` (+${a.secondStartTime.slice(11, 16)} 재강수)` : '';
      return {
        mainText: `${icon} ${st}${tilde}${ed} ${kindWord}`,
        roadText,
        shortMapText: `${st.slice(0, 2)}~${ed.slice(0, 2)}시 비`,
        tooltip: `기상청 12시간 예보 기준: ${st} 시작 ~ ${ed}경 종료 추정${reRain}`,
        active: true
      };
    }
    const label12h = a.allWindowWet ? '12h 계속' : '계속';
    return {
      mainText: winEnd ? `${icon} ${st}${tilde}${winEnd}+ ${isMob ? '계속' : label12h}` : `${icon} ${st}${tilde}지속 ${kindWord}`,
      roadText,
      shortMapText: winEnd ? `${st.slice(0, 2)}~${winEnd.slice(0, 2)}시+` : `${st.slice(0, 2)}시~ 비`,
      tooltip: `기상청 12시간 예보 기준: ${st}부터 ${winEnd || '12시간'} 이후까지 계속 강수 예상(2시간 이상 무강수 종료 구간 없음)`,
      active: true
    };
  }
  if (a.horizons?.some(h => h.hasRisk)) {
    return {
      mainText: '◇ 12h 강수 가능성',
      roadText,
      shortMapText: '강수가능',
      tooltip: '기상청 12시간 예보 기준 강수확률 50% 이상 시간대 존재',
      active: false
    };
  }
  return {
    mainText: '☀ 12h 무강수 예보',
    roadText,
    shortMapText: '무강수',
    tooltip: '기상청 초단기·단기 12시간 예보 기준 강수 신호 없음',
    active: false
  };
}

function updateUnifiedGlobalStamp() {
  let latestObs = null;
  let latestObsMs = -Infinity;
  let latestModel = null;
  let latestModelMs = -Infinity;
  let anyObsSnapshot = false;

  for (const p of places) {
    const r = getEffectiveRecord(p);
    if (r.o?.time) {
      if (r.o._fromSnapshot) anyObsSnapshot = true;
      const ms = toEpochMs(r.o.time);
      if (Number.isFinite(ms) && ms > latestObsMs) {
        latestObsMs = ms;
        latestObs = r.o.time;
      } else if (!latestObs) {
        latestObs = r.o.time;
      }
    }
    if (r.w?.current?.time) {
      const ms = toEpochMs(r.w.current.time);
      if (Number.isFinite(ms) && ms > latestModelMs) {
        latestModelMs = ms;
        latestModel = r.w.current.time;
      } else if (!latestModel) {
        latestModel = r.w.current.time;
      }
    }
  }

  const latestOverall =
    latestModelMs > latestObsMs && latestModel
      ? latestModel
      : latestObs || latestModel;
  const stampFormatted = latestOverall
    ? fmt(latestOverall)
    : fmt(new Date(Date.now() + 9 * 3600000).toISOString());

  let footerLabel;
  if (latestObs && latestModel) {
    if (anyObsSnapshot) {
      footerLabel = `기준 자료: 관측 ${fmt(latestObs)}(스냅샷) · 모델 ${fmt(latestModel)}(실시간) · 5분마다 자동 갱신`;
    } else if (fmt(latestObs) === fmt(latestModel)) {
      footerLabel = `기준 자료: ${fmt(latestObs)} · 5분마다 실시간 자동 갱신 (모든 카드 통합 기준 시각)`;
    } else {
      footerLabel = `기준 자료: 도로관측 ${fmt(latestObs)} · 모델 ${fmt(latestModel)} · 5분마다 실시간 자동 갱신`;
    }
  } else if (latestObs) {
    footerLabel = `기준 자료: 관측 ${fmt(latestObs)}${anyObsSnapshot ? '(스냅샷)' : ''} · 5분마다 자동 갱신`;
  } else if (latestModel) {
    footerLabel = `기준 자료: 모델 ${fmt(latestModel)} · 5분마다 자동 갱신`;
  } else {
    footerLabel = `기준 자료: ${stampFormatted} · 5분마다 자동 갱신 (모든 카드 통합 기준 시각)`;
  }

  if (overviewRevalidating) {
    footerLabel += ' · 백그라운드 최신화 중…';
  } else if (overviewFromCache) {
    footerLabel += ' · 5분 내 캐시(3분 머무름 시 자동갱신)';
  }

  $('globalStamp').textContent = footerLabel;
  return stampFormatted;
}

const ROUTE12_POLYLINE_KM = [
  [48.8, 35.4117, 127.3233], [52.8, 35.4248, 127.3630], [56.8, 35.4334, 127.4033], [60.8, 35.4497, 127.4411],
  [64.8, 35.4720, 127.4698], [68.8, 35.4910, 127.5061], [72.8, 35.4751, 127.5438], [76.8, 35.4831, 127.5846],
  [80.8, 35.5119, 127.6065], [84.8, 35.5335, 127.6409], [88.8, 35.5415, 127.6835], [92.8, 35.5378, 127.7262],
  [96.8, 35.5341, 127.7688], [100.8, 35.5512, 127.8065], [104.8, 35.5627, 127.8397], [108.8, 35.5903, 127.8668],
  [112.8, 35.6197, 127.8887], [116.8, 35.6434, 127.9207], [120.8, 35.6772, 127.9330], [124.8, 35.7049, 127.9561],
  [128.8, 35.7036, 127.9972], [132.8, 35.7074, 128.0397], [136.8, 35.7079, 128.0838], [140.8, 35.7058, 128.1275],
  [144.8, 35.6927, 128.1672], [148.8, 35.7029, 128.2087], [152.8, 35.7016, 128.2507], [156.8, 35.7132, 128.2912],
  [160.8, 35.7394, 128.3176], [164.8, 35.7527, 128.3578], [168.8, 35.7624, 128.3988], [172.8, 35.7744, 128.4371],
  [175.9, 35.7918, 128.4629], [176.0, 35.7925, 128.4635]
];

const ROUTE12_ICS = [
  ['남원56k', 35.430, 127.394, -10],
  ['지리산77k', 35.487, 127.589, 12],
  ['함양95k', 35.535, 127.752, 12],
  ['거창121k', 35.678, 127.934, -9],
  ['해인사146k', 35.696, 128.183, 12],
  ['고령153k', 35.702, 128.252, -9],
  ['옥포176k', 35.792, 128.463, -8]
];

const ROUTE12_PLACE_KM = {
  '남원': 55.5,
  '함양': 93.5,
  '함양중부': 99.2,
  '거창군남부': 115.9,
  '거창': 120.5,
  '합천군서북부': 145.5,
  '고령군': 154.6,
  '대구 달성군남부': 171.6
};

const ROUTE12_STN_KM_FALLBACK = [
  ['남원주차장', 50.8], ['번암교', 72.9], ['지리산휴', 75.4], ['옥계1교', 86.2],
  ['함양', 95.0], ['죽산천교', 102.9], ['남상졸음', 115.3], ['거창휴', 134.1],
  ['양전교', 158.2], ['논공휴', 169.2], ['논공교', 171.3]
];

function resolveStationKm(s) {
  if (Number.isFinite(s?.milepostKm)) return s.milepostKm;
  const match = ROUTE12_STN_KM_FALLBACK.find(([key]) => (s?.name || '').includes(key));
  return match ? match[1] : null;
}

/**
 * 고속국도 제12호선(광주대구선 · KMA 14번) 8개 관심지역 & 전구간 도로기상관측소 미니맵 렌더링
 * 고령지사 MMF DB 실제 34포인트 노선 선형(48.8k~176.0k) 및 11개 도로관측소 이정표 매칭
 */
function renderMiniMap() {
  const container = $('minimapContainer');
  const strip = $('roadStnStrip');
  if (!container) return;

  const minLon = 127.30, maxLon = 128.49;
  const minLat = 35.38, maxLat = 35.80;
  const W = 540, H = 242;
  const project = (lat, lon) => {
    const x = 34 + ((lon - minLon) / (maxLon - minLon)) * (W - 68);
    const y = 162 - ((lat - minLat) / (maxLat - minLat)) * 78;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };

  const fullPoly = ROUTE12_POLYLINE_KM.map(([, la, lo]) => project(la, lo).join(',')).join(' ');
  const goryeongPoly = ROUTE12_POLYLINE_KM.filter(([km]) => km >= 92.8).map(([, la, lo]) => project(la, lo).join(',')).join(' ');

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="고속국도 제12호선 광주대구선 실시간 노면·기상 미니맵">
    <defs>
      <radialGradient id="mmBgGlow" cx="54%" cy="54%" r="62%">
        <stop offset="0%" stop-color="#175159" stop-opacity="0.72"/>
        <stop offset="60%" stop-color="#0b282f" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#06181d" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="hwyGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.94"/>
        <stop offset="48%" stop-color="#6ee7b7" stop-opacity="0.98"/>
        <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.95"/>
      </linearGradient>
      <linearGradient id="mmCardBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0e3037" stop-opacity="0.94"/>
        <stop offset="100%" stop-color="#071d22" stop-opacity="0.96"/>
      </linearGradient>
      <linearGradient id="mmRidge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5eead4" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#06181d" stop-opacity="0"/>
      </linearGradient>
      <pattern id="mmDots" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="11" cy="11" r="0.75" fill="#99f6e4" opacity="0.14"/>
      </pattern>
    </defs>

    <!-- Layered Telemetry Backdrop & Subtle Jirisan-Gaya Ridge Silhouette -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#mmBgGlow)"/>
    <rect x="0" y="27" width="${W}" height="${H - 27}" fill="url(#mmDots)"/>
    <path d="M0 176 L48 152 L98 164 L152 132 L212 146 L278 118 L342 136 L412 108 L474 126 L540 104 L540 194 L0 194 Z" fill="url(#mmRidge)"/>

    <!-- Top Header Band with Route 12 Shield -->
    <rect x="0" y="0" width="${W}" height="27" fill="rgba(4, 17, 21, 0.78)"/>
    <line x1="0" y1="27" x2="${W}" y2="27" stroke="rgba(127, 227, 179, 0.18)" stroke-width="1"/>
    <image href="./route12.svg" x="9" y="4.5" width="18" height="18"/>
    <text x="32" y="17.2" fill="#ecfdf5" font-size="10.2" font-weight="800" letter-spacing="-0.2">고속국도 12 광주대구선</text>
    <text x="148" y="17" fill="#7ec9bf" font-size="9" font-weight="650">기상청 14번 노선</text>
    <rect x="${W - 188}" y="5.5" width="179" height="16" rx="8" fill="rgba(45, 212, 191, 0.12)" stroke="rgba(94, 234, 212, 0.25)" stroke-width="0.8"/>
    <text x="${W - 98.5}" y="16.2" text-anchor="middle" fill="#a7f3d0" font-size="8.8" font-weight="700">남원 50k → 고령 80k+ → 옥포 176k</text>

    <!-- Subtle Corridor Horizon Guide -->
    <line x1="18" y1="128" x2="${W - 18}" y2="128" stroke="rgba(153, 246, 228, 0.07)" stroke-dasharray="2,4"/>

    <!-- Full Route 12 Corridor (48.8k ~ 176.0k) 3-Layer Highway Ribbon -->
    <polyline points="${fullPoly}" fill="none" stroke="rgba(56, 217, 169, 0.16)" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${goryeongPoly}" fill="none" stroke="rgba(251, 191, 36, 0.26)" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${fullPoly}" fill="none" stroke="#041418" stroke-width="6.8" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${fullPoly}" fill="none" stroke="url(#hwyGrad)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${fullPoly}" fill="none" stroke="rgba(255, 255, 255, 0.42)" stroke-width="0.9" stroke-dasharray="4,4" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  // Key IC/JC Milepost Markers along the highway
  for (const [label, ila, ilo, dy] of ROUTE12_ICS) {
    const [ix, iy] = project(ila, ilo);
    svg += `<g class="ic-tick">
      <circle cx="${ix}" cy="${iy}" r="2.1" fill="#ecfdf5" opacity="0.82"/>
      <text x="${ix}" y="${(iy + dy).toFixed(1)}" text-anchor="middle" fill="#9dd5cd" font-size="7.8" font-weight="700" opacity="0.9">${label}</text>
    </g>`;
  }

  // 8 Watched Regions Callouts + GPS Pins (4-Tier Severity Colors: Green -> Yellow -> Orange -> Red)
  const slotMap = {
    '함양중부': { cx: 69, cy: 53, anchorY: 72 },
    '거창': { cx: 203, cy: 53, anchorY: 72 },
    '합천군서북부': { cx: 337, cy: 53, anchorY: 72 },
    '고령군': { cx: 471, cy: 53, anchorY: 72 },
    '남원': { cx: 69, cy: 210, anchorY: 191 },
    '함양': { cx: 203, cy: 210, anchorY: 191 },
    '거창군남부': { cx: 337, cy: 210, anchorY: 191 },
    '대구 달성군남부': { cx: 471, cy: 210, anchorY: 191 }
  };

  // 기본 8개(광주대구선 권역) 관심지역만 노선 미니맵에 매칭·표시 (사용자 추가 타지역은 미니맵 제외)
  places.forEach((p) => {
    const isCorridorPreset = presets.some(q => coord(q) === coord(p));
    const slot = isCorridorPreset ? slotMap[p.name] : null;
    if (!slot) return;

    const [px, py] = project(Math.max(minLat, Math.min(maxLat, p.lat)), Math.max(minLon, Math.min(maxLon, p.lon)));
    const rec = getEffectiveRecord(p);
    const sev = classifySeverityTier(rec);
    const fillCol = sev.pinColor;
    const ringCol = sev.ringColor;
    const tempVal = rec.o?.temp ?? rec.w?.current?.temp;
    const roadVal = rec.o?.roadTemp;
    const timing = rainTimingSummary(rec.w, rec.o);
    const hasWrn = (rec.wrn?.count || 0) > 0;
    const isPlaceSelected = selectedWindyKey === `place:${coord(p)}`;

    const shortName = p.name.replace('대구 ', '');
    const kmVal = ROUTE12_PLACE_KM[p.name];
    const nameLabel = kmVal ? `${shortName}(${Math.round(kmVal)}k)` : shortName;
    const tempLabel = `${n(tempVal, 1)}°`;
    const roadPart = roadVal != null ? `노면 ${roadVal.toFixed(1)}°` : (p.site || '');
    const statusPart = hasWrn ? rec.wrn.top.title : timing.shortMapText;
    const cardStroke = isPlaceSelected
      ? '#38bdf8'
      : sev.rank >= 2
        ? fillCol
        : 'rgba(148, 226, 213, 0.28)';
    const subCol = sev.rank >= 3 ? '#fecaca' : sev.rank === 2 ? '#fed7aa' : '#9edbd0';

    svg += `<g class="map-node" role="button" tabindex="0" aria-label="${escHtml(p.name)} 영상 선택" data-coord="${escHtml(coord(p))}" style="cursor:pointer">
      <line x1="${px}" y1="${py}" x2="${slot.cx}" y2="${slot.anchorY}" stroke="${fillCol}" stroke-width="1.1" opacity="0.7"/>
      <circle cx="${slot.cx}" cy="${slot.anchorY}" r="2.1" fill="${fillCol}" opacity="0.9"/>
      <circle class="${sev.rank >= 2 || isPlaceSelected ? 'mm-pin-pulse' : ''}" cx="${px}" cy="${py}" r="${isPlaceSelected ? 12.5 : 10}" fill="${ringCol}"/>
      <circle cx="${px}" cy="${py}" r="5.2" fill="${fillCol}" stroke="${isPlaceSelected ? '#38bdf8' : '#f8fafc'}" stroke-width="${isPlaceSelected ? 2.2 : 1.6}"/>
      <g transform="translate(${slot.cx},${slot.cy})">
        <rect class="mm-card-bg" x="-62" y="-19" width="124" height="38" rx="8" fill="url(#mmCardBg)" stroke="${cardStroke}" stroke-width="${isPlaceSelected ? 1.8 : 1.1}"/>
        <rect x="-59.5" y="-14.5" width="3.4" height="29" rx="1.7" fill="${fillCol}"/>
        <text x="-53" y="-3.2" text-anchor="start" fill="#e2f7f3" font-size="${nameLabel.length >= 10 ? '8.8' : '9.6'}" font-weight="750" letter-spacing="-0.25">${escHtml(nameLabel)}</text>
        <text x="57" y="-2.5" text-anchor="end" fill="#ffffff" font-size="11" font-weight="850">${escHtml(tempLabel)}</text>
        <text x="-53" y="11" text-anchor="start" fill="${subCol}" font-size="8.6" font-weight="650" letter-spacing="-0.15">${escHtml(roadPart)} · ${escHtml(statusPart)}</text>
      </g>
    </g>`;
  });

  // All 11 Corridor KMA Road Weather Stations sorted Eastbound (50.8k -> 171.3k), clickable circular markers!
  const corridorStns = roadStations
    .filter(s => s.lon >= minLon && s.lon <= maxLon && (s.temp !== null || s.roadTemp !== null))
    .map(s => ({ ...s, resolvedKm: resolveStationKm(s) }))
    .sort((a, b) => (a.resolvedKm ?? 999) - (b.resolvedKm ?? 999) || a.lon - b.lon);

  const classifyStnCol = s => {
    const rRisk = findStationRoadRisk(s);
    const iceLv = rRisk?.iceLevel || 0;
    const fogLv = rRisk?.fogLevel || 0;
    if (iceLv >= 3 || fogLv >= 3 || s.surfaceCode >= 4 || (s.roadTemp !== null && s.roadTemp <= 0.0)) return '#ef4444';
    if (iceLv === 2 || fogLv === 2 || s.surfaceCode === 3 || (s.roadTemp !== null && s.roadTemp <= 2.5)) return '#f97316';
    if (iceLv === 1 || fogLv === 1 || s.surfaceCode === 2 || (s.roadTemp !== null && s.roadTemp <= 4.5)) return '#eab308';
    return '#10b981';
  };

  for (const stn of corridorStns) {
    const [sx, sy] = project(stn.lat, stn.lon);
    const kmTxt = stn.resolvedKm !== null ? `${stn.resolvedKm.toFixed(1)}k ` : '';
    const trTxt = stn.roadTemp !== null ? `노면 ${stn.roadTemp.toFixed(1)}°C` : '';
    const stnRisk = findStationRoadRisk(stn);
    const riskTxt = stnRisk?.iceLevel ? ` · 012선 살얼음 ${stnRisk.iceLevel}단계(${stnRisk.iceLabel})` : '';
    const dotCol = classifyStnCol(stn);
    const isSel = selectedWindyKey === `stn:${stn.stnId}`;
    svg += `<g class="stn-dot" data-stnid="${escHtml(stn.stnId)}" role="button" tabindex="0" transform="translate(${sx},${sy})" style="cursor:pointer">
      <title>[도로기상 ${escHtml(kmTxt)}] ${escHtml(stn.name)} (${escHtml(stn.stationType)}, 고도 ${escHtml(stn.elevation ?? '—')}m) ${escHtml(trTxt)}${escHtml(riskTxt)} · 클릭 시 위성·레이더 이동</title>
      <circle cx="0" cy="0" r="10.5" fill="transparent"/>
      ${isSel ? '<circle cx="0" cy="0" r="9.5" fill="rgba(56,189,248,0.28)" stroke="#38bdf8" stroke-width="1.3"/>' : ''}
      <circle class="stn-marker-core" cx="0" cy="0" r="4.3" fill="${dotCol}" stroke="#041418" stroke-width="1.4"/>
    </g>`;
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  container.querySelectorAll('.map-node').forEach(node => {
    node.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.dispatchEvent(new Event('click')); }
    };
    node.addEventListener('click', () => {
      const target = places.find(p => coord(p) === node.dataset.coord);
      if (!target) return;
      $('mapChoices').hidden = false;
      $('mapChoicePlace').textContent = target.name;
      $('chooseWindy').onclick = () => { $('tabWindy').click(); focusWindyOnPlace(target); };
      $('chooseCctv').onclick = () => {
        closeMapCctv();
        selectedWindyKey = 'place:' + coord(target);
        renderMiniMap();
        $('windyBox').hidden = $('kmaRadarBox').hidden = true;
        for (const tab of [$('tabWindy'), $('tabKmaRadar')]) {
          tab.classList.remove('active');
          tab.setAttribute('aria-selected', 'false');
        }
        $('visualPanelTitle').textContent = '실시간 도로 영상';
        $('mapCctv').hidden = false;
        releaseCctv = mountCctv($('mapCctv'), cctvQuery(target));
        focusVisualPaneIntoView();
      };
      $('chooseWindy').focus({ preventScroll: true });
    });
    node.addEventListener('dblclick', () => {
      const target = places.find(p => coord(p) === node.dataset.coord);
      if (target) location.hash = detailURL(target);
    });
  });

  container.querySelectorAll('.stn-dot').forEach(node => {
    const activateStn = () => {
      const target = corridorStns.find(s => String(s.stnId) === String(node.dataset.stnid));
      if (!target) return;
      focusWindyOnStation(target);
    };
    node.addEventListener('click', e => {
      e.stopPropagation();
      activateStn();
    });
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateStn();
      }
    });
    node.addEventListener('dblclick', () => {
      const stn = corridorStns.find(s => String(s.stnId) === String(node.dataset.stnid));
      const nearest = stn ? findNearestPlace(stn.lat, stn.lon) : null;
      if (nearest) location.hash = detailURL(nearest);
    });
  });

  const riskSummaryEl = $('corridorRiskSummary');
  if (riskSummaryEl) {
    if (roadRiskData?.ok) {
      const sum = roadRiskData.branchSummary || roadRiskData.corridorSummary || {};
      const cnt = sum.iceCounts || [0, 0, 0, 0];
      const fogCnt = sum.fogCounts || [0, 0, 0, 0];
      const tmLabel = roadRiskData.tmKst ? fmt(roadRiskData.tmKst) : roadRiskData.tmUtc || '';
      const areaTitle = roadRiskData.branchSummary?.rangeLabel
        ? `🛣️ 고령지사[${roadRiskData.branchSummary.rangeLabel}]`
        : '🛣️ 012선 도로살얼음';
      const infoSpan = el(
        'span',
        `${areaTitle}(${tmLabel} · 10분갱신): 위험 ${cnt[3] || 0} · 주의 ${cnt[2] || 0} · 관심 ${cnt[1] || 0}` +
          (fogCnt[1] + fogCnt[2] + fogCnt[3] > 0 ? ` | 🌫️ 안개 위험 ${fogCnt[3] || 0} · 주의 ${fogCnt[2] || 0} · 관심 ${fogCnt[1] || 0}` : '')
      );
      const children = [infoSpan];
      if (recentEscalations.length) {
        const latestEsc = recentEscalations[0];
        children.push(el('span', `▲ 최근 격상: ${latestEsc.text}`, 'esc-tag'));
      }
      riskSummaryEl.replaceChildren(...children);
      riskSummaryEl.hidden = false;
    } else {
      riskSummaryEl.hidden = true;
    }
  }

  // 하단 도로기상관측소 전체 목록 (고속국도 12호선 이정표 오름차순 50.8k -> 171.3k 전구간 표출)
  if (strip) {
    strip.replaceChildren();
    for (const s of corridorStns) {
      const stnKey = `stn:${s.stnId}`;
      const chip = el('button', '', 'road-stn-chip' + (selectedWindyKey === stnKey ? ' is-selected' : ''));
      chip.type = 'button';
      chip.dataset.stnid = s.stnId;

      const topRow = el('div', '', 'road-stn-top');
      const cleanName = s.name.replace('(도)', '');
      const kmTag = s.resolvedKm !== null ? `${s.resolvedKm.toFixed(1)}k ` : '';
      const elevStr = s.elevation && s.elevation >= 300 ? `(${s.elevation}m)` : s.stationType?.includes('결빙') ? '(교량)' : '';
      const labelEl = el('b', `${kmTag}${cleanName}${elevStr}`);
      labelEl.title = `${kmTag}${cleanName}${elevStr}`;
      topRow.append(labelEl);

      const stateTxt = s.surfaceState || (s.stationType?.includes('결빙') ? '교량센서' : '건조');
      const isWarnState = s.surfaceCode >= 2 || (s.roadTemp !== null && s.roadTemp <= 1.0);
      topRow.append(el('span', stateTxt, 'road-stn-state' + (isWarnState ? ' warn' : '')));

      const valRow = el('div', '', 'road-stn-vals');
      const roadSpan = el('em', s.roadTemp !== null ? `노면 ${s.roadTemp.toFixed(1)}°C` : '노면 —');
      const airTxt = s.temp !== null ? ` · 기온 ${s.temp.toFixed(1)}°C` : ' · 교량결빙감시';
      valRow.append(roadSpan, document.createTextNode(airTxt));

      chip.append(topRow, valRow);
      const stnRisk = findStationRoadRisk(s);
      if (stnRisk && (stnRisk.iceLevel >= 1 || stnRisk.fogLevel >= 1)) {
        const riskRow = el('div', '', 'road-stn-risk-row');
        if (stnRisk.iceLevel >= 1) {
          riskRow.append(el('span', `${stnRisk.iceLevel === 3 ? '🚨' : '❄'} 살얼음 ${stnRisk.iceLabel}`, `badge-ice rank-${stnRisk.iceLevel}`));
        }
        if (stnRisk.fogLevel >= 1) {
          riskRow.append(el('span', `🌫️ 안개 ${stnRisk.fogLabel}`, `badge-ice rank-${stnRisk.fogLevel}`));
        }
        chip.append(riskRow);
      }
      chip.onclick = () => focusWindyOnStation(s);
      strip.append(chip);
    }
  }
}

function focusVisualPaneIntoView() {
  const pane = $('visualPane');
  const minimap = $('minimapPane');
  if (!pane) return;
  pane.classList.remove('focus-flash');
  void pane.offsetWidth;
  pane.classList.add('focus-flash');
  setTimeout(() => pane.classList.remove('focus-flash'), 1100);

  const vRect = pane.getBoundingClientRect();
  const mRect = minimap?.getBoundingClientRect();
  const minimapAbove = mRect && mRect.bottom <= vRect.top + 24;
  const outOfView = vRect.top < 62 || vRect.bottom > window.innerHeight - 12;
  if (minimapAbove || outOfView) {
    const targetY = Math.max(0, window.scrollY + vRect.top - 66);
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }
}

function syncMiniMapSelectionUI() {
  document.querySelectorAll('#roadStnStrip .road-stn-chip').forEach(btn => {
    btn.classList.toggle('is-selected', selectedWindyKey === `stn:${btn.dataset.stnid}`);
  });
}

let releaseCctv;
function closeMapCctv() {
  releaseCctv?.();
  releaseCctv = null;
  $('mapCctv').hidden = true;
  $('visualPanelTitle').textContent = '실시간 위성 · 강수 레이더 영상';
}
function cctvQuery(place) {
  const preset = presets.find(p => coord(p) === coord(place));
  return new URLSearchParams(preset ? { site: preset.cctvSite } : { lat: place.lat, lon: place.lon });
}

function focusWindyOnStation(s) {
  $('mapChoices').hidden = true;
  $('tabWindy').click();
  const kmVal = resolveStationKm(s);
  const kmTag = kmVal !== null ? `${kmVal.toFixed(1)}k ` : '';
  selectedWindyKey = `stn:${s.stnId}`;
  windyState.lat = Number((s.lat - 0.03).toFixed(3));
  windyState.lon = Number(s.lon.toFixed(3));
  windyState.detailLat = Number(s.lat.toFixed(3));
  windyState.detailLon = Number(s.lon.toFixed(3));
  windyState.label = `${kmTag}${s.name} (${s.lat.toFixed(3)}, ${s.lon.toFixed(3)})`;
  updateWindyIframe();
  renderMiniMap();
  syncMiniMapSelectionUI();
  focusVisualPaneIntoView();
}

function focusWindyOnPlace(p) {
  selectedWindyKey = `place:${coord(p)}`;
  windyState.lat = Number((p.lat - 0.03).toFixed(3));
  windyState.lon = Number(p.lon.toFixed(3));
  windyState.detailLat = Number(p.lat.toFixed(3));
  windyState.detailLon = Number(p.lon.toFixed(3));
  windyState.label = `${p.name} · ${p.site || ''} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})`;
  updateWindyIframe();
  renderMiniMap();
  syncMiniMapSelectionUI();
  focusVisualPaneIntoView();
}

function updateWindyIframe() {
  const iframe = $('windyIframe');
  const lbl = $('windyFocusLabel');
  if (lbl) lbl.textContent = `중심: ${windyState.label}`;
  if (!iframe) return;
  const product = windyState.overlay === 'satellite' ? 'satellite' : windyState.overlay === 'radar' ? 'radar' : 'ecmwf';
  const detailParam = windyState.detailOpen ? '&detail=true' : '';
  const nextSrc = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=default&zoom=11&overlay=${windyState.overlay}&product=${product}&level=surface&lat=${windyState.lat}&lon=${windyState.lon}&detailLat=${windyState.detailLat}&detailLon=${windyState.detailLon}${detailParam}&pressure=true&message=true`;
  if (iframe.src !== nextSrc) iframe.src = nextSrc;
}

// 기상청 공식 전국 HSR 레이더 이미지 로드
async function loadKmaRadarImage(force = false) {
  const box = $('kmaRadarContainer');
  if (!box) return;
  box.innerHTML = '<div class="radar-placeholder">기상청 API허브 전국 레이더 HSR 합성영상을 불러오는 중…</div>';
  const hasBackend = await isBackendAvailable(force);
  const img = new Image();
  img.alt = '기상청 공식 전국 강수 레이더 HSR 합성 영상';
  img.onload = () => box.replaceChildren(img);
  if (hasBackend) {
    img.onerror = () => {
      const fallback = new Image();
      fallback.alt = '기상청 레이더 스냅샷 영상';
      fallback.onload = () => box.replaceChildren(fallback);
      fallback.onerror = () => {
        box.innerHTML = '<div class="radar-placeholder">레이더 영상을 불러오지 못했습니다. 서버 환경변수 KMA_SERVICE_KEY / KMA_RADAR_KEY 설정을 확인하세요.</div>';
      };
      fallback.src = './api/radar.png';
    };
    img.src = apiUrl('/api/radar?t=' + (force ? Date.now() : Math.floor(Date.now() / 180000)));
  } else {
    img.onerror = () => {
      box.innerHTML = '<div class="radar-placeholder">정적 호스팅 모드에서는 실시간 HSR 레이더 대신 배포 스냅샷 또는 Windy 위성·레이더를 이용하세요.</div>';
    };
    img.src = './api/radar.png';
  }
}

const ACTION_STAGE_META = [
  { id: 'preheat', icon: '🔑', label: '시동ON' },
  { id: 'presalt', icon: '🚜', label: '예비살포' },
  { id: 'mainplow', icon: '❄', label: '본살포' },
  { id: 'floodwind', icon: '🌊', label: '수방·횡풍' }
];
const ACTION_STAGE_ORDER = { preheat: 0, presalt: 1, mainplow: 2, floodwind: 3 };

const ACK_KEY = 'bionda-review:ack:v1';
let acknowledgedActions = {};
try {
  acknowledgedActions = JSON.parse(localStorage.getItem(ACK_KEY) || '{}') || {};
} catch {
  acknowledgedActions = {};
}
function persistAck() {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify(acknowledgedActions));
  } catch {}
}

// 세부페이지 예비살포/본살포 살포시각 기록 (입력 시에만 재살포 카드로 전환)
const SPREAD_LOG_KEY = 'bionda-review:spread-log:v1';
const SPREAD_MAX_AGE_MS = 24 * 3600000;
let spreadLogs = {};
let activeSpreadEditor = null; // { placeKey, stageId } | null
try {
  spreadLogs = JSON.parse(localStorage.getItem(SPREAD_LOG_KEY) || '{}') || {};
} catch {
  spreadLogs = {};
}
function persistSpreadLogs() {
  try {
    localStorage.setItem(SPREAD_LOG_KEY, JSON.stringify(spreadLogs));
  } catch {}
}
function getSpreadEntry(place, stageId, nowMs = Date.now()) {
  if (!place || !stageId) return null;
  const id = coord(place);
  const entry = spreadLogs[id]?.[stageId];
  if (!entry || !Number.isFinite(entry.atMs)) return null;
  if (nowMs - entry.atMs > SPREAD_MAX_AGE_MS) {
    delete spreadLogs[id][stageId];
    persistSpreadLogs();
    return null;
  }
  return entry;
}
function setSpreadTime(place, stageId, atMs) {
  const id = coord(place);
  if (!spreadLogs[id]) spreadLogs[id] = {};
  spreadLogs[id][stageId] = { atMs };
  persistSpreadLogs();
}
function clearSpreadTime(place, stageId) {
  const id = coord(place);
  if (spreadLogs[id]) {
    delete spreadLogs[id][stageId];
    if (!Object.keys(spreadLogs[id]).length) delete spreadLogs[id];
    persistSpreadLogs();
  }
}
function formatKstClock(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
function parseKstHhmmToMs(hhmm, nowMs = Date.now()) {
  const m = String(hhmm || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const kstNow = new Date(nowMs + 9 * 3600000);
  const y = kstNow.getUTCFullYear();
  const mo = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const da = String(kstNow.getUTCDate()).padStart(2, '0');
  let epoch = Date.parse(`${y}-${mo}-${da}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
  if (!Number.isFinite(epoch)) return null;
  // 입력 시각이 현재보다 10분 이상 미래면 자정 이전(전일) 살포 시각으로 해석
  if (epoch - nowMs > 10 * 60000) epoch -= 24 * 3600000;
  return epoch;
}

// 제설 관련 기상특보(대설·한파 등) 해제 추적 (대기 차량 복귀 지시용)
const SNOW_WRN_HIST_KEY = 'bionda-review:snow-wrn-hist:v1';
const SNOW_WRN_CLEARED_TTL_MS = 6 * 3600000;
let snowWrnHistory = {};
try {
  snowWrnHistory = JSON.parse(localStorage.getItem(SNOW_WRN_HIST_KEY) || '{}') || {};
} catch {
  snowWrnHistory = {};
}
function persistSnowWrnHistory() {
  try {
    localStorage.setItem(SNOW_WRN_HIST_KEY, JSON.stringify(snowWrnHistory));
  } catch {}
}
function extractSnowWarnings(wrn) {
  const list = Array.isArray(wrn?.raw) && wrn.raw.length
    ? wrn.raw
    : (Array.isArray(wrn?.tooltipLines) ? wrn.tooltipLines : []);
  return list.filter(isSnowRelatedWarning);
}
function syncSnowWarningHistory(place, wrn, nowMs = Date.now()) {
  if (!place || !wrn) return;
  const id = coord(place);
  const snowWrns = extractSnowWarnings(wrn);
  const prev = snowWrnHistory[id];
  if (snowWrns.length > 0) {
    const titles = [...new Set(snowWrns.map(w => w.title || w.kind).filter(Boolean))];
    snowWrnHistory[id] = { active: true, titles, lastSeenMs: nowMs, clearedAtMs: null, dismissed: false };
    persistSnowWrnHistory();
  } else if (prev?.active) {
    snowWrnHistory[id] = {
      active: false,
      lastTitles: prev.titles || ['제설 관련 특보'],
      clearedAtMs: nowMs,
      dismissed: false
    };
    persistSnowWrnHistory();
  } else if (prev && !prev.active && prev.clearedAtMs && nowMs - prev.clearedAtMs > SNOW_WRN_CLEARED_TTL_MS) {
    delete snowWrnHistory[id];
    persistSnowWrnHistory();
  }
}
function getSnowWarningClearedState(place, wrn, nowMs = Date.now()) {
  const id = coord(place);
  const hasActiveSnowWrn = extractSnowWarnings(wrn).length > 0;
  const entry = snowWrnHistory[id];
  if (!entry || entry.active || entry.dismissed || !entry.clearedAtMs) {
    return { recentlyCleared: false, clearedTitles: [], hasActiveSnowWrn };
  }
  if (nowMs - entry.clearedAtMs > SNOW_WRN_CLEARED_TTL_MS) {
    delete snowWrnHistory[id];
    persistSnowWrnHistory();
    return { recentlyCleared: false, clearedTitles: [], hasActiveSnowWrn };
  }
  return {
    recentlyCleared: true,
    clearedTitles: entry.lastTitles || ['제설 관련 특보'],
    hasActiveSnowWrn
  };
}

function resolveDecisionCardsForPlace(place, rec, nowMs = Date.now()) {
  const baseCards = rec?.w?.ice?.decisionCards || [
    { stageId: 'preheat', title: '제설차 시동 ON', subtitle: '(살포기 유압 예열)', status: '대기', detail: '결빙·강설 신호 없음', state: 'idle' },
    { stageId: 'presalt', title: '예비살포', subtitle: '(습염 사전 살포)', status: '대기', detail: '노면 결빙 위험 없음', state: 'idle' },
    { stageId: 'mainplow', title: '본살포', subtitle: '(제설삽날·연속 살포)', status: '대기', detail: '강설 1.0cm/h 이상 시', state: 'idle' },
    { stageId: 'floodwind', title: '수방 · 횡풍', subtitle: '(배수로·교량 안전)', status: '정상', detail: '강수·강풍 특이사항 없음', state: 'idle' }
  ];
  if (!place) return baseCards;
  const ice = rec?.w?.ice;
  const obs = rec?.o;
  const airTemp = Number.isFinite(obs?.temp) ? obs.temp : (Number.isFinite(ice?.curTemp) ? ice.curTemp : rec?.w?.current?.temp ?? null);
  const roadTemp = Number.isFinite(obs?.bridgeRoadTemp)
    ? obs.bridgeRoadTemp
    : Number.isFinite(obs?.roadTemp)
      ? obs.roadTemp
      : (Number.isFinite(ice?.bridgeTemp) ? ice.bridgeTemp : null);
  const surfaceWet = Number.isFinite(obs?.surfaceCode)
    ? [2, 3, 6].includes(obs.surfaceCode)
    : ice?.curSurfaceWet ?? (rec?.w?.current?.precip > 0);
  const surfaceState = obs?.surfaceState || ice?.curSurfaceState || (surfaceWet ? '습윤' : '건조');

  return baseCards.map(card => {
    if (!card || (card.stageId !== 'presalt' && card.stageId !== 'mainplow')) return card;
    const logged = getSpreadEntry(place, card.stageId, nowMs);
    if (!logged) return card;
    return evaluateResaltCard(card, logged.atMs, {
      nowMs,
      airTemp,
      roadTemp,
      surfaceWet,
      surfaceState,
      stageLabel: card.stageId === 'mainplow' ? '본살포' : '예비살포'
    });
  });
}

function getActionSignature(cards) {
  return cards.map(c => `${c.stageId}:${c.state}:${c.pcChip}`).join('|');
}

function getActiveActionCards(rec, place = null) {
  const cards = place ? resolveDecisionCardsForPlace(place, rec) : (rec?.w?.ice?.decisionCards || []);
  return cards
    .filter(c => c && c.pcChip && (c.state === 'urgent' || c.state === 'watch'))
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'urgent' ? -1 : 1;
      const ha = Number.isFinite(a.hoursLeft) ? a.hoursLeft : 9;
      const hb = Number.isFinite(b.hoursLeft) ? b.hoursLeft : 9;
      if (ha !== hb) return ha - hb;
      return (ACTION_STAGE_ORDER[a.stageId] ?? 9) - (ACTION_STAGE_ORDER[b.stageId] ?? 9);
    });
}

function getUnackedActionCards(place, rec) {
  const active = getActiveActionCards(rec, place);
  if (!active.length) return [];
  const sig = getActionSignature(active);
  const id = coord(place);
  // Safety guardrail: if state escalated or time/directives changed, signature no longer matches -> re-surfaces automatically!
  return acknowledgedActions[id] === sig ? [] : active;
}

function showActionConfirmPopover(anchorEl, place, activeCards) {
  const pop = $('actionConfirmPopover');
  if (!pop || !activeCards.length) return;
  pop.replaceChildren();

  const head = el('div', '', 'action-popover-head');
  head.append(el('span', `🚜 ${place.name} 제설·수방 지시 (${activeCards.length}건)`));
  const closeBtn = el('button', '✕', 'settings-close');
  closeBtn.type = 'button';
  closeBtn.onclick = () => { pop.hidden = true; };
  head.append(closeBtn);

  const list = el('div', '', 'action-popover-list');
  for (const c of activeCards) {
    const row = el('div', '', `action-pop-row${c.state === 'urgent' ? ' urgent' : ''}`);
    const meta = el('div', '', 'action-pop-meta');
    meta.append(el('b', c.pcChip || c.title), el('small', `${c.title} · ${c.detail || c.status}`));
    row.append(meta);
    list.append(row);
  }

  const ackBtn = el('button', '✓ 확인했습니다 (이 카드 지시 숨김)', 'action-ack-btn');
  ackBtn.type = 'button';
  ackBtn.onclick = () => {
    acknowledgedActions[coord(place)] = getActionSignature(activeCards);
    persistAck();
    pop.hidden = true;
    board();
  };

  pop.append(head, list, ackBtn);
  pop.hidden = false;

  const rect = anchorEl.getBoundingClientRect();
  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, rect.bottom + 6);
  const left = Math.max(10, Math.min(window.innerWidth - pop.offsetWidth - 10, rect.right - pop.offsetWidth));
  pop.style.top = `${Math.max(58, top)}px`;
  pop.style.left = `${left}px`;
}

function buildCardActionChips(place, unackedCards) {
  if (!unackedCards.length) return null;
  const wrap = el('div', '', 'card-action-chips');
  const topCard = unackedCards[0];
  const chip = el('button', '', `card-act-chip state-${topCard.state}`);
  chip.type = 'button';
  chip.title = `${topCard.title}: ${topCard.status} — 클릭 시 [확인했습니다] 처리`;
  chip.append(
    el('span', topCard.pcChip, 'act-full'),
    el('span', topCard.mobChip || topCard.status, 'act-short')
  );
  chip.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    showActionConfirmPopover(wrap, place, unackedCards);
  };
  wrap.append(chip);

  if (unackedCards.length > 1) {
    const more = el('button', `+${unackedCards.length - 1}`, 'card-act-more');
    more.type = 'button';
    more.title = unackedCards.slice(1).map(c => c.pcChip).join(', ');
    more.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      showActionConfirmPopover(wrap, place, unackedCards);
    };
    wrap.append(more);
  }
  return wrap;
}

// 메인 대시보드(8개 지역 고밀도 카드 그리드) 렌더링 (요구사항 1, 2, 3)
export function board() {
  $('addBtnText').textContent = `지역 관리 (${places.length}/8)`;
  updateMonitorStatusBar();
  updateUnifiedGlobalStamp();

  const riskPlaces = places.filter(isRiskPlace);
  const actionPlaces = places.filter(p => getUnackedActionCards(p, getEffectiveRecord(p)).length > 0);
  const ackedCount = places.filter(p => {
    const allAct = getActiveActionCards(getEffectiveRecord(p));
    return allAct.length > 0 && getUnackedActionCards(p, getEffectiveRecord(p)).length === 0;
  }).length;
  const extras = places.filter(isExtra);

  if ((!settings.showActionCards || !actionPlaces.length) && filter === 'action') {
    filter = 'all';
    actionStageFilter = null;
  }

  const mkFilterBtn = (label, id, extraCls = '') => {
    const b = el('button', label, extraCls);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!mobileMapView && filter === id));
    b.onclick = () => {
      filter = id;
      actionStageFilter = null;
      if (mobileMapView) {
        location.hash = 'overview';
      } else {
        board();
      }
    };
    return b;
  };

  const isMob = window.innerWidth <= 1024;
  const mapJumpBtn = el('button', isMob ? '🗺️ 노선 미니맵 · Windy (별도화면)' : '🗺️ 노선 미니맵 · Windy', 'grp-map');
  mapJumpBtn.type = 'button';
  mapJumpBtn.setAttribute('aria-pressed', String(mobileMapView));
  mapJumpBtn.onclick = () => {
    if (window.innerWidth <= 1024) {
      if (mobileMapView) {
        location.hash = 'overview';
      } else {
        location.hash = 'map';
      }
    } else {
      $('mapSection')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const groupBtns = [mkFilterBtn(`전체 ${places.length}`, 'all')];
  if (settings.showActionCards && actionPlaces.length > 0) {
    groupBtns.push(
      mkFilterBtn(isMob ? `🚜 지시 ${actionPlaces.length}` : `🚜 제설·수방 지시 ${actionPlaces.length}`, 'action', 'grp-action')
    );
  }
  groupBtns.push(
    mkFilterBtn(isMob ? `⚠️ 특보·결빙 ${riskPlaces.length}` : `⚠️ 위험·특보 발효 ${riskPlaces.length}`, 'risk', 'grp-warn'),
    mkFilterBtn(`남원·함양·거창 ${extras.length}`, 'extra'),
    mapJumpBtn
  );
  $('groups').replaceChildren(...groupBtns);

  const summaryBar = $('actionSummaryBar');
  if (summaryBar) {
    const stagePills = [];
    if (settings.showActionCards) {
      for (const meta of ACTION_STAGE_META) {
        let count = 0;
        let hasUrgent = false;
        for (const p of places) {
          const match = getUnackedActionCards(p, getEffectiveRecord(p)).find(c => c.stageId === meta.id);
          if (match) {
            count++;
            if (match.state === 'urgent') hasUrgent = true;
          }
        }
        if (count > 0) {
          const pill = el('button', `${meta.icon} ${meta.label} ${count}`, `act-pill${hasUrgent ? '' : ' state-watch'}`);
          pill.type = 'button';
          pill.setAttribute('aria-pressed', String(filter === 'action' && actionStageFilter === meta.id));
          pill.onclick = () => {
            if (filter === 'action' && actionStageFilter === meta.id) {
              actionStageFilter = null;
              filter = 'all';
            } else {
              filter = 'action';
              actionStageFilter = meta.id;
            }
            board();
          };
          stagePills.push(pill);
        }
      }
      if (ackedCount > 0) {
        const restoreBtn = el('button', `✓ 확인됨 ${ackedCount} · 다시보기`, 'act-ack-restore');
        restoreBtn.type = 'button';
        restoreBtn.onclick = () => {
          acknowledgedActions = {};
          persistAck();
          board();
        };
        stagePills.push(restoreBtn);
      }
    }
    summaryBar.replaceChildren(...stagePills);
    summaryBar.hidden = !settings.showActionCards || stagePills.length === 0;
  }

  let visible =
    filter === 'action'
      ? actionStageFilter
        ? places.filter(p => getUnackedActionCards(p, getEffectiveRecord(p)).some(c => c.stageId === actionStageFilter))
        : actionPlaces
      : filter === 'risk'
      ? riskPlaces
      : filter === 'extra'
      ? extras
      : [...places];
  if (settings.sortRisk) {
    visible = [...visible].sort((a, b) => placeDangerScore(b) - placeDangerScore(a));
  }

  $('grid').replaceChildren(
    ...visible.map(p => {
      const r = getEffectiveRecord(p);
      const w = r.w, o = r.o, wrn = r.wrn;
      const iceRank = w?.ice?.rank || 0;
      const floodRank = w?.ice?.flood?.rank || 0;
      const hasWarning = (wrn?.count || 0) > 0;
      const sev = classifySeverityTier(r);

      const cardCls = ['regioncard', sev.cls].filter(Boolean).join(' ');
      const a = el('a', '', cardCls);
      a.href = detailURL(p);

      // 1. 카드 상단 지역명 + 제설·수방 지시 칩(1칩+N) + 지연 배지 + 화살표
      const top = el('div', '', 'cardline');
      const topRight = el('span', '', 'cardline-right');
      const actionChips = settings.showActionCards ? buildCardActionChips(p, getUnackedActionCards(p, r)) : null;
      if (actionChips) topRight.append(actionChips);
      if (w?.stale) topRight.append(el('span', '지연', 'stale-badge'));
      topRight.append(el('span', '↗'));
      top.append(el('h2', p.name), topRight);
      a.append(top);

      // 2. 대표 지점명 + 인라인 살얼음[관심/주의/위험]·안개·수방 배지 + 특보 요약 배지
      const siteLine = el('div', '', 'site-line');
      siteLine.append(el('span', p.site || coord(p), 'site-name'));

      const rr = r.roadRisk;
      const officialIceLv = rr?.iceLevel || 0;
      const officialFogLv = rr?.fogLevel || 0;
      const combinedIceStage = Math.max(officialIceLv, iceRank);

      if (combinedIceStage > 0) {
        const iceLbl = ROAD_RISK_LABELS[combinedIceStage] || w?.ice?.level || '관심';
        const icon = combinedIceStage === 3 ? '🚨' : '❄';
        const iceBadge = el('span', '', `badge-ice rank-${combinedIceStage}`);
        const stnNote = rr?.stationName ? ` · 연계 ${rr.stationName}(${rr.stationKm}k)` : '';
        iceBadge.title = `도로살얼음 ${combinedIceStage}단계 [${iceLbl}]${stnNote}` + (officialIceLv ? ` (012선 KMA: ${rr.iceLabel})` : ' (자체 예보모델)');
        iceBadge.append(
          el('span', `${icon} 살얼음 ${iceLbl}`, 'badge-full'),
          el('span', `${icon}${iceLbl}`, 'badge-short')
        );
        siteLine.append(iceBadge);
      } else if (floodRank > 0) {
        const fBadge = el('span', '', 'badge-ice flood-badge');
        fBadge.append(
          el('span', w.ice.flood.badge, 'badge-full'),
          el('span', w.ice.flood.shortBadge, 'badge-short')
        );
        siteLine.append(fBadge);
      } else if (w?.ice?.windAlert?.active) {
        const wBadge = el('span', '', 'badge-ice rank-1');
        wBadge.append(
          el('span', w.ice.windAlert.badge, 'badge-full'),
          el('span', w.ice.windAlert.shortBadge, 'badge-short')
        );
        siteLine.append(wBadge);
      }

      if (officialFogLv >= 1) {
        const fogLbl = FOG_RISK_LABELS[officialFogLv] || '관심';
        const fogBadge = el('span', '', `badge-ice rank-${officialFogLv}`);
        fogBadge.title = `012선 도로 가시거리(안개) ${officialFogLv}단계 [${fogLbl}]`;
        fogBadge.append(
          el('span', `🌫️ 안개 ${fogLbl}`, 'badge-full'),
          el('span', `🌫${fogLbl}`, 'badge-short')
        );
        siteLine.append(fogBadge);
      }

      if (hasWarning) {
        const wrnBtn = el('button', '', `badge-wrn level-${wrn.badgeLevel}`);
        wrnBtn.type = 'button';
        wrnBtn.append(
          el('span', `${wrn.badgeText} ▾`, 'badge-full'),
          el('span', wrn.badgeShortText, 'badge-short')
        );
        wrnBtn.addEventListener('mouseenter', () => showWarningTooltip(wrnBtn, p, wrn));
        wrnBtn.addEventListener('mouseleave', () => hideWarningTooltip());
        wrnBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          if (activeTooltipBtn === wrnBtn && !$('wrnTooltip').hidden) {
            hideWarningTooltip();
          } else {
            showWarningTooltip(wrnBtn, p, wrn);
          }
        });
        siteLine.append(wrnBtn);
      }
      a.append(siteLine);

      // 3. 현재 기온 + 현상(적설) + 상대습도
      const conditions = el('div', '', 'cardweather');
      const tempVal = o?.temp ?? w?.current?.temp;
      const humVal = o?.humidity ?? w?.current?.humidity;
      let condStr = o?.description || summary(w?.current?.code);
      if (Number.isFinite(o?.snowDepth) && o.snowDepth > 0 && !condStr.includes('적설')) {
        condStr += ` (적설 ${n(o.snowDepth, 1)}cm)`;
      }
      conditions.append(
        el('strong', `${n(tempVal, 1)}°`),
        el('span', condStr, 'cond-text'),
        el('small', Number.isFinite(humVal) ? `습도 ${n(humVal, 0)}%` : '', 'hum-text')
      );
      a.append(conditions);

      // 4. 직관적 비·눈 시간대("19:00 ~ 23:00 강수예상" / 12h 지속 시 "19:00 ~ 06:00+ 12h 계속") + 우측 노면온도
      const timing = rainTimingSummary(w, o);
      const timingEl = el('div', '', 'rain-timing-chip' + (timing.active ? ' active-rain' : ''));
      if (timing.tooltip) timingEl.title = timing.tooltip;
      timingEl.append(
        el('span', timing.mainText, 'rain-timing-main'),
        timing.roadText ? el('span', timing.roadText, 'rain-timing-road') : ''
      );
      a.append(timingEl);

      // 5. 오늘 강수 & 6시간 최대 강수확률 + 미니 바 차트
      const nums = el('div', '', 'readings');
      const maxPop =
        w?.rows?.length && w.rows.some(x => Number.isFinite(x.pop))
          ? Math.max(...w.rows.map(x => (Number.isFinite(x.pop) ? x.pop : 0)))
          : null;

      const leftMetric = el('div');
      leftMetric.append(el('small', window.innerWidth <= 768 ? '오늘강수' : '오늘 강수'), el('b', amount(o?.dayPrecip ?? w?.today?.precip, 'mm')));

      const rightMetric = el('div', '', 'popmetric');
      rightMetric.append(
        el('small', window.innerWidth <= 768 ? '6h 강수확률' : '6시간 최대 강수확률'),
        el('b', Number.isFinite(maxPop) ? `${n(maxPop, 0)}%` : '—'),
        precipitationStrip(w?.rows)
      );

      nums.append(leftMetric, rightMetric);
      a.append(nums);
      return a;
    })
  );

  const missing = presets.filter(p => !places.some(q => coord(q) === coord(p)));
  const quickEl = $('quick');
  quickEl.replaceChildren();
  if (missing.length && places.length < 8) {
    quickEl.hidden = false;
    const headRow = el('div', '', 'quick-bar-head');
    headRow.append(
      el('b', '🛣️ 광주대구선 관심지역 빠른 추가'),
      el('span', `추가 가능 ${8 - places.length}곳`, 'quick-bar-cap')
    );
    const chipsRow = el('div', '', 'quick-bar-chips');
    for (const p of missing) {
      const b = el('button', '', 'quick-chip');
      b.type = 'button';
      const plus = el('span', '＋', 'qb-plus');
      const nameTxt = document.createTextNode(`${p.name}`);
      const siteEl = el('small', `(${p.site})`);
      b.append(plus, nameTxt, siteEl);
      b.onclick = () => choose(p);
      chipsRow.append(b);
    }
    quickEl.append(headRow, chipsRow);
  } else {
    quickEl.hidden = true;
  }
  if (!visible.length) {
    $('grid').append(el('p', '선택한 필터 조건에 해당하는 지역이 없습니다. [전체] 탭을 눌러 확인하세요.'));
  }

  renderMiniMap();
}

// 상세 페이지 렌더링
function renderDetail() {
  const p = detailPlace;
  if (!p) return;
  const r = getEffectiveRecord(p);
  const w = r.w, o = r.o, wrn = r.wrn;

  $('nearbyCctv').href = './cctv.html?' + cctvQuery(p);
  const temp = o?.temp ?? w?.current?.temp;
  const hum = o?.humidity ?? w?.current?.humidity;
  const wind = o?.windSpeed ?? w?.current?.wind;
  $('place').textContent = p.site ? `${p.name} (${p.site})` : p.name;
  $('temp').textContent = `${n(temp, 1)}°`;
  $('condition').textContent = o?.description || summary(w?.current?.code);
  $('humidity').textContent = `상대습도 ${n(hum, 0)}% · 풍속 ${n(wind, 1)} m/s`;

  const roadParts = [];
  if (o?.roadStationName && Number.isFinite(o.roadTemp)) {
    const typeNote = o.roadStationType?.includes('결빙') ? '(결빙취약교량)' : '';
    roadParts.push(`🛣️ ${o.roadStationName}${typeNote} 광학 노면온도 ${o.roadTemp.toFixed(1)}°C (${o.surfaceState || '건조'})`);
  }
  if (o?.bridgeStationName && o.bridgeStationName !== o.roadStationName && Number.isFinite(o.bridgeRoadTemp)) {
    roadParts.push(`🌉 결빙취약교량 ${o.bridgeStationName} 노면 ${o.bridgeRoadTemp.toFixed(1)}°C`);
  }
  $('roadSurfaceInfo').textContent = roadParts.join(' · ') || '기상청 도로기상관측망 연동 중';

  $('stamp').textContent = [
    o ? `${o.name} 관측${o._fromSnapshot ? '(스냅샷)' : ''} · ${n(o.distanceKm, 1)} km · ${fmt(o.time)}` : '',
    w?.current ? `모델 ${fmt(w.current.time)}` : '',
    o?.snowDepth != null ? `관측 적설 ${n(o.snowDepth, 1)} cm` : ''
  ].filter(Boolean).join('   /   ') || '자료 시각 확인 중';

  const heroEl = document.querySelector('#detail .hero');
  if (heroEl) {
    applyHeroScene(heroEl, buildHeroSceneInputFromRecord(r));
  }

  // 비·눈 시작~종료 전망 + 12시간 타임라인
  const a = w?.kma?.analysis;
  const kHours = w?.kma?.hours || [];
  if (a) {
    const st = a.start?.time?.slice(11, 16);
    const ed = a.end?.time?.slice(11, 16);
    const winEnd = (a.lastWetTime || a.windowEndTime)?.slice(11, 16);
    $('rainStartText').textContent = a.now?.wet
      ? ed ? `현재 ~ ${ed} ${a.now.type} 관측중` : `현재 ~ ${winEnd || '12h'}+ 계속`
      : st
      ? ed ? `${st} ~ ${ed} 강수예상` : `${st} ~ ${winEnd || '12h'}+ 계속`
      : a.horizons?.some(h => h.hasRisk)
      ? '강수 가능성(≥50%) 있음'
      : '12시간 내 강수 신호 없음';
    $('rainStartSub').textContent = a.now?.wet
      ? '기상청 초단기실황 관측 + 12시간 예보 기준'
      : '기상청 초단기·단기예보 12시간 병합 기준';

    $('rainEndText').textContent = ed
      ? `${ed}경 종료 추정`
      : st || a.now?.wet
      ? `${winEnd ? winEnd + ' 이후 계속 (12h 내 종료없음)' : '12시간 이후까지 이어질 수 있음'}`
      : '해당 없음 (무강수)';
    $('rainEndSub').textContent = a.end
      ? (a.secondStartTime ? `${a.end.rule} · 이후 ${a.secondStartTime.slice(11, 16)} 재강수 신호` : a.end.rule)
      : '연속 2시간 무강수 예보 시 종료 시각 추정';

    const horizonList = Array.isArray(a.horizonRanges) && a.horizonRanges.length === 3
      ? a.horizonRanges.map((r, idx) => ({
          label: idx === 2 ? '향후 6~12시간' : (r.label || ['향후 3시간', '3~6시간', '향후 6~12시간'][idx]),
          hasPrecipitation: r.hasPrecipitation || (idx === 0 && !!a.now?.wet),
          hasRisk: r.hasRisk || (idx === 0 && !!a.now?.wet),
          kinds: idx === 0 && a.now?.wet && !r.kinds?.length ? [a.now.type] : (r.kinds || [])
        }))
      : [
          { label: '향후 3시간', min: 1, max: 3 },
          { label: '3~6시간', min: 4, max: 6 },
          { label: '향후 6~12시간', min: 7, max: 12 }
        ].map((rng, idx) => {
          const block = kHours.slice(rng.min - 1, rng.max);
          const precip = block.filter(h => h?.wet);
          const risk = block.filter(h => h?.wet || h?.risk);
          const nowWet = idx === 0 && !!a.now?.wet;
          return {
            label: rng.label,
            hasPrecipitation: precip.length > 0 || nowWet,
            hasRisk: risk.length > 0 || nowWet,
            kinds: nowWet && !precip.length ? [a.now.type] : [...new Set(precip.map(h => h.type))]
          };
        });

    $('horizonBadges').replaceChildren(
      ...horizonList.map(h => {
        const cls = h.hasPrecipitation ? 'wet' : h.hasRisk ? 'risk' : 'clear';
        const lbl = h.hasPrecipitation ? (h.kinds.join('·') || '비·눈') + ' 예상' : h.hasRisk ? '강수 가능성' : '신호 없음';
        const d = el('div', '', `h-badge ${cls}`);
        d.append(el('span', h.label), el('strong', lbl));
        return d;
      })
    );
  }

  $('kmaTimeline').replaceChildren(
    ...Array.from({ length: 12 }, (_, idx) => {
      const kh = kHours[idx];
      if (!kh) return el('div', '—', 'tl-slot');
      const cls = kh.wet ? (kh.type?.includes('눈') ? 'snow' : 'wet') : kh.risk ? 'risk' : '';
      const slot = el('div', '', `tl-slot ${cls}`.trim());
      const stateLabel = kh.wet ? kh.type : kh.risk ? `${kh.chance}%` : (kh.chance != null ? `${kh.chance}%` : '맑음');
      const tempText = kh.temp != null && kh.temp !== '' ? `${kh.temp}°` : '—';
      slot.append(
        el('b', kh.time.slice(11, 13) + '시'),
        el('span', stateLabel),
        el('em', tempText)
      );
      slot.title = `${kh.time.slice(11, 16)} · ${kh.wet ? kh.type + ' (' + kh.amount + ')' : '강수없음'} · 강수확률 ${kh.chance ?? 0}% · 기온 ${kh.temp}°C`;
      return slot;
    })
  );

  // 누적 강수 및 실측 노면 현황
  const day = $('period').value === 'today';
  const pData = w?.[$('period').value];
  const useObs = day && Number.isFinite(o?.dayPrecip);
  const metricFields = [
    ['총강수량', useObs ? o.dayPrecip : pData?.precip, 'mm', useObs ? '기상청 도로/실황' : 'Open-Meteo 모델'],
    ['강우량 (액체)', pData?.rain, 'mm', 'Open-Meteo 모델'],
    ['신적설 (눈)', pData?.snow, 'cm', 'Open-Meteo 모델'],
    ['광학 노면온도(TR1)', o?.roadTemp ?? w?.ice?.bridgeTemp, '°C', o?.roadTemp != null ? `${o.roadStationName || '도로관측'} 실측` : '교량 추정치']
  ];
  $('metrics').replaceChildren(
    ...metricFields.map(([label, value, unit, src]) => {
      const m = el('div', '', 'metric');
      m.append(
        el('b', label),
        el('strong', Number.isFinite(value) ? (unit === '°C' ? n(value, 1) : amount(value, '')) : '—'),
        el('em', Number.isFinite(value) ? unit : ''),
        el('small', Number.isFinite(value) ? src : '자료 없음')
      );
      return m;
    })
  );
  $('totaltime').textContent = [
    useObs ? `${o.name} 관측 ${fmt(o.time)}` : '',
    pData ? `모델 누적 종료 ${fmt(w?.through)}` : '',
    day ? '오늘 00시부터' : '최근 24시간 누적'
  ].filter(Boolean).join(' · ');

  const rr = r.roadRisk;
  const riskBar = $('detailRoadRiskBar');
  if (riskBar) {
    const stnName = o?.roadStationName || rr?.stationName || o?.name || null;
    const stnKm = o?.roadMilepostKm ?? rr?.stationKm;
    const stnDist = o?.roadDistanceKm ?? rr?.stationDistanceKm;
    const trTxt = Number.isFinite(o?.roadTemp) ? `실측 노면 ${o.roadTemp.toFixed(1)}°C (${o.surfaceState || '건조'})` : '도로기상 연계 중';
    const bridgeTxt = o?.bridgeStationName && o.bridgeStationName !== o.roadStationName && Number.isFinite(o.bridgeRoadTemp)
      ? ` · 결빙취약교량 ${o.bridgeStationName} ${o.bridgeRoadTemp.toFixed(1)}°C`
      : '';
    if (stnName || rr) {
      const leftDiv = el('div', '', 'detail-road-station');
      const stnLabel = stnName ? `${stnName}${stnKm != null ? `(${stnKm}k)` : ''}${stnDist != null ? ` · ${n(stnDist, 1)}km` : ''}` : '고속국도 12호선 연계';
      leftDiv.append(
        el('strong', `🛣️ 모니터링 개소: ${stnLabel} · ${trTxt}`),
        el('small', `012 무안광주대구선 도로위험기상${rr?.tmKst ? ` · ${fmt(rr.tmKst)} (${rr.flagLabel || '분석'})` : ''}${bridgeTxt}`)
      );
      const rightDiv = el('div', '', 'detail-road-pills');
      const iceLv = rr?.iceLevel ?? 0;
      const fogLv = rr?.fogLevel ?? 0;
      const iceLbl = ROAD_RISK_LABELS[iceLv] || '정보없음';
      const fogLbl = FOG_RISK_LABELS[fogLv] || '안개없음';
      const iceBadge = el('span', `${iceLv === 3 ? '🚨' : '❄'} 살얼음 ${iceLbl} (${iceLv}단계)`, `badge-ice rank-${iceLv}`);
      iceBadge.title = '기상청 012선 도로살얼음 위험수준: 0 정보없음 / 1 관심 / 2 주의 / 3 위험';
      const fogBadge = el('span', `🌫️ 안개 ${fogLbl} (${fogLv}단계)`, `badge-ice rank-${fogLv}`);
      fogBadge.title = '기상청 012선 도로 가시거리 위험수준: 0 안개없음 / 1 관심 / 2 주의 / 3 위험';
      rightDiv.append(iceBadge, fogBadge);
      riskBar.replaceChildren(leftDiv, rightDiv);
      riskBar.hidden = false;
    } else {
      riskBar.hidden = true;
    }
  }

  // 시간별 강수·기온 전망 표
  const tbody = $('forecast');
  const thead = $('forecastHead');
  tbody.replaceChildren();
  if (tableMode === '12h' && kHours.length) {
    thead.innerHTML = '<tr><th>시각</th><th>기온</th><th>강수형태</th><th>강수확률</th><th>예상 강수량</th><th>예상 적설</th><th>습도·풍속</th></tr>';
    for (const kh of kHours) {
      const tr = el('tr');
      for (const v of [
        kh.time.slice(11, 16),
        `${kh.temp ?? '—'}°`,
        kh.wet ? `☔ ${kh.type}` : kh.skyLabel || '맑음',
        `${kh.chance ?? 0}%`,
        kh.amount || '강수없음',
        kh.snow || '적설없음',
        `${kh.humidity ?? '—'}% · ${kh.wind ?? '—'}m/s`
      ]) {
        tr.append(el('td', v));
      }
      tbody.append(tr);
    }
  } else {
    thead.innerHTML = '<tr><th>시각</th><th>기온</th><th>강수확률</th><th>비 / 눈 확률¹</th><th>강수량</th><th>강우량</th><th>강설량</th></tr>';
    if (!w?.rows?.length) {
      const tr = el('tr');
      const td = el('td', '시간별 예보를 불러오는 중입니다…');
      td.colSpan = 7;
      tr.append(td);
      tbody.append(tr);
    } else {
      for (const rowItem of w.rows) {
        const tr = el('tr');
        for (const v of [
          rowItem.time.slice(11, 16),
          `${n(rowItem.temp, 1)}°`,
          `${n(rowItem.pop, 0)}%`,
          `${n(rowItem.rainPop, 0)} / ${n(rowItem.snowPop, 0)}%`,
          amount(rowItem.precip, 'mm'),
          amount(rowItem.rain, 'mm'),
          amount(rowItem.snow, 'cm')
        ]) {
          tr.append(el('td', v));
        }
        tbody.append(tr);
      }
    }
  }

  // 도로 살얼음 전망 & 결빙 조건 6지표 카드 & 4단계 의사결정 지시 카드 (012선 공식 3단계 반영)
  const officialIceLv = r.roadRisk?.iceLevel || 0;
  const iceRank = w?.ice?.rank || 0;
  const effectiveIceRank = Math.max(officialIceLv, iceRank);
  const iceLevel = effectiveIceRank >= 3
    ? '살얼음 위험(3단계)'
    : effectiveIceRank === 2
    ? '살얼음 주의(2단계)'
    : effectiveIceRank === 1
    ? '살얼음 관심(1단계)'
    : w && !w.stale
    ? (w.ice.level || '살얼음 정상(0단계)')
    : '판단 보류';
  $('ice').textContent = iceLevel;
  $('ice').className = `rank-${Math.min(3, effectiveIceRank)}`;
  $('iceBadgePill').textContent = effectiveIceRank >= 3
    ? '🚨 살얼음 위험(3단계 · 즉시 순찰)'
    : effectiveIceRank === 2
    ? '❄ 살얼음 주의(2단계)'
    : effectiveIceRank === 1
    ? '❄ 살얼음 관심(1단계)'
    : '❄ 정상 (위험없음)';
  $('reason').textContent = w && !w.stale
    ? (officialIceLv >= 1 && iceRank < officialIceLv
        ? `012선(${r.roadRisk?.stationName || '인접구간'}) 도로살얼음 ${ROAD_RISK_LABELS[officialIceLv]}(${officialIceLv}단계) 감지 · ${w.ice.shortReason || w.ice.reason}`
        : (w.ice.shortReason || w.ice.reason))
    : '최신 예보 확인 중';

  const metricsGrid = $('iceMetricsGrid');
  if (metricsGrid) {
    const cMetrics = w?.ice?.conditionMetrics || [
      { label: '최저기온(6h)', value: Number.isFinite(w?.ice?.minTemp) ? `${w.ice.minTemp.toFixed(1)}°C` : '—' },
      { label: '현재기온', value: Number.isFinite(temp) ? `${n(temp, 1)}°C` : '—' },
      { label: '교량·노면', value: Number.isFinite(o?.roadTemp ?? w?.ice?.bridgeTemp) ? `${n(o?.roadTemp ?? w?.ice?.bridgeTemp, 1)}°C` : '—' },
      { label: '이슬점(Td)', value: Number.isFinite(w?.ice?.dewPoint) ? `${w.ice.dewPoint.toFixed(1)}°C` : '—' },
      { label: '상대습도', value: Number.isFinite(hum) ? `${n(hum, 0)}%` : '—' },
      { label: '현재풍속', value: Number.isFinite(wind) ? `${n(wind, 1)} m/s` : '—' }
    ];
    metricsGrid.replaceChildren(
      ...cMetrics.map(m => {
        const card = el('div', '', 'ice-metric-card' + (m.warn ? ' is-warn' : ''));
        card.append(el('small', m.label), el('strong', m.value));
        if (m.sub) card.append(el('em', m.sub));
        return card;
      })
    );
  }

  const samples = w && !w.stale ? w.ice.samples : [];
  $('iceTimes').replaceChildren(
    ...samples.map((s, i) => {
      const cell = el('div', '', 'icehour');
      cell.dataset.rank = s.rank;
      cell.append(el('small', i === 0 ? '현재' : s.time.slice(11, 16)), el('b', s.level));
      cell.title = s.cause || s.level;
      return cell;
    })
  );

  const decisionHead = $('decisionHead');
  if (decisionHead) decisionHead.hidden = !settings.showActionCards;
  const decisionGrid = $('decisionCardsGrid');
  const spreadEditor = $('spreadTimeEditor');
  const resolvedCards = resolveDecisionCardsForPlace(p, r);
  const placeKey = coord(p);

  if (decisionGrid) {
    decisionGrid.hidden = !settings.showActionCards;
    if (settings.showActionCards) {
      decisionGrid.replaceChildren(
        ...resolvedCards.map(dc => {
          const isSpreadEditable = dc.stageId === 'presalt' || dc.stageId === 'mainplow';
          const isEditing =
            isSpreadEditable &&
            activeSpreadEditor &&
            activeSpreadEditor.placeKey === placeKey &&
            activeSpreadEditor.stageId === dc.stageId;
          const cardCls = [
            'decision-card',
            `state-${dc.state || 'idle'}`,
            isSpreadEditable ? 'is-clickable' : '',
            isEditing ? 'is-editing' : ''
          ].filter(Boolean).join(' ');
          const card = el('div', '', cardCls);
          const top = el('div', '', 'dc-top');
          const titleWrap = el('div');
          titleWrap.append(el('div', dc.title, 'dc-title'), el('div', dc.subtitle, 'dc-sub'));
          top.append(titleWrap, el('span', dc.status, 'dc-badge'));
          card.append(top, el('div', dc.detail, 'dc-detail'));

          if (isSpreadEditable) {
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute(
              'aria-label',
              `${dc.stageId === 'mainplow' ? '본살포' : '예비살포'} 살포 시각 입력 및 재살포 전환`
            );
            const hint = el('div', '', 'dc-click-hint');
            if (dc.isResalt) {
              hint.append(el('span', `⏱ ${dc.spreadClock} 기록됨`), el('span', '수정/해제 ▾'));
            } else {
              hint.append(el('span', '⏱ 살포시각 입력 → 재살포 전환'), el('span', '클릭 ▾'));
            }
            card.append(hint);
            const toggleEditor = () => {
              if (activeSpreadEditor && activeSpreadEditor.placeKey === placeKey && activeSpreadEditor.stageId === dc.stageId) {
                activeSpreadEditor = null;
              } else {
                activeSpreadEditor = { placeKey, stageId: dc.stageId };
              }
              renderDetail();
            };
            card.onclick = toggleEditor;
            card.onkeydown = ev => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                toggleEditor();
              }
            };
          }
          return card;
        })
      );
    } else {
      decisionGrid.replaceChildren();
    }
  }

  if (spreadEditor) {
    const showEditor =
      settings.showActionCards &&
      activeSpreadEditor &&
      activeSpreadEditor.placeKey === placeKey &&
      (activeSpreadEditor.stageId === 'presalt' || activeSpreadEditor.stageId === 'mainplow');
    spreadEditor.hidden = !showEditor;
    spreadEditor.replaceChildren();
    if (showEditor) {
      const stageId = activeSpreadEditor.stageId;
      const stageLabel = stageId === 'mainplow' ? '본살포' : '예비살포';
      const existing = getSpreadEntry(p, stageId);
      const defaultHhmm = existing ? formatKstClock(existing.atMs) : formatKstClock(Date.now());

      const head = el('div', '', 'spread-editor-head');
      head.append(
        el('span', `${stageId === 'mainplow' ? '❄' : '🚜'} ${p.name} · ${stageLabel} 살포 시각 입력`),
        el('small', existing ? `현재 기록: ${defaultHhmm}` : '미입력')
      );
      const desc = el(
        'p',
        '살포 시각을 입력하면 해당 카드가 재살포 카드로 전환되며, 3시간 경과 후 노면이 젖어 있고 대기 또는 노면 온도가 4°C 이하일 때 재살포를 지시합니다.',
        'spread-editor-desc'
      );

      const row = el('div', '', 'spread-editor-row');
      const nowBtn = el('button', '⏱ 지금(현재 시각)', 'spread-btn-now');
      nowBtn.type = 'button';
      nowBtn.onclick = () => {
        setSpreadTime(p, stageId, Date.now());
        activeSpreadEditor = null;
        renderDetail();
      };

      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.className = 'spread-time-input';
      timeInput.value = defaultHhmm;
      timeInput.setAttribute('aria-label', `${stageLabel} 살포 시각`);

      const applyBtn = el('button', '시간 적용', 'spread-btn-apply');
      applyBtn.type = 'button';
      applyBtn.onclick = () => {
        const ms = parseKstHhmmToMs(timeInput.value);
        if (!Number.isFinite(ms)) return;
        setSpreadTime(p, stageId, ms);
        activeSpreadEditor = null;
        renderDetail();
      };

      row.append(nowBtn, timeInput, applyBtn);
      if (existing) {
        const clearBtn = el('button', '기록 해제', 'spread-btn-clear');
        clearBtn.type = 'button';
        clearBtn.onclick = () => {
          clearSpreadTime(p, stageId);
          activeSpreadEditor = null;
          renderDetail();
        };
        row.append(clearBtn);
      }

      const closeBtn = el('button', '닫기', 'spread-btn-close');
      closeBtn.type = 'button';
      closeBtn.onclick = () => {
        activeSpreadEditor = null;
        renderDetail();
      };
      row.append(closeBtn);

      spreadEditor.append(head, desc, row);
    }
  }

  const guideContainer = $('actionGuides');
  guideContainer.hidden = !settings.showActionCards;
  guideContainer.replaceChildren();
  if (settings.showActionCards) {
    // 재살포 지시 / 추적 배너 최우선 표시
    for (const rc of resolvedCards) {
      if (rc?.isResalt && rc.guideBanner) {
        guideContainer.append(el('div', rc.guideBanner, `guide-banner rank-${rc.state === 'urgent' ? 2 : 1}`));
      }
    }
    // 제설 관련 특보 해제 시 상단 기준 확인 후 대기 차량 복귀 지시 / 보류 배너
    const wrnClearState = getSnowWarningClearedState(p, wrn);
    const returnDir = evaluateStandbyReturnDirective({
      recentlyCleared: wrnClearState.recentlyCleared,
      clearedTitles: wrnClearState.clearedTitles,
      hasActiveSnowWrn: wrnClearState.hasActiveSnowWrn,
      ice: wrn?.confirmed && !w?.stale && !o?._fromSnapshot ? w?.ice : null,
      roadRisk: roadRiskData?._fromSnapshot ? null : r?.roadRisk,
      resolvedCards
    });
    if (returnDir) {
      const retBanner = el('div', '', `guide-banner ${returnDir.status === 'return_ok' ? 'return-ok' : 'return-hold'}`);
      retBanner.append(el('span', returnDir.text));
      const dismissBtn = el('button', '확인', 'guide-dismiss-btn');
      dismissBtn.type = 'button';
      dismissBtn.onclick = () => {
        if (snowWrnHistory[placeKey]) {
          snowWrnHistory[placeKey].dismissed = true;
          persistSnowWrnHistory();
        }
        renderDetail();
      };
      retBanner.append(dismissBtn);
      guideContainer.append(retBanner);
    }
    if (w?.ice?.snowActions?.length) {
      for (const sa of w.ice.snowActions) {
        guideContainer.append(el('div', sa.text, `guide-banner rank-${sa.rank}`));
      }
    }
    if (w?.ice?.flood?.guide) {
      guideContainer.append(el('div', w.ice.flood.guide, 'guide-banner flood'));
    }
    if (w?.ice?.windAlert?.guide) {
      guideContainer.append(el('div', w.ice.windAlert.guide, 'guide-banner rank-1'));
    }
  }

  // 기상특보 발효 및 해제 예정 현황 (기상청 특보 원문 링크 연결)
  $('detailWrnCount').textContent = wrn?.count ? `${wrn.count}건 발효중` : '특보 없음';
  const wrnBox = $('warnings');
  wrnBox.replaceChildren();
  if (wrn?.count) {
    const listWrap = el('div', '', 'wrn-list-box');
    const kmaWrnUrl = wrn.officialUrl || 'https://www.weather.go.kr/w/wnuri-fct2021/weather/warning.do';
    for (const item of wrn.tooltipLines) {
      const card = document.createElement('a');
      card.className = 'wrn-item-card';
      card.href = kmaWrnUrl;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.title = '기상청 공식 기상특보 현황 페이지 새 창으로 열기';

      const topRow = el('div', '', 'wrn-item-top');
      const areaSuffix = item.areaName ? ` (${item.areaName})` : '';
      topRow.append(
        el('strong', `[${item.rank}순위] ${item.title}${areaSuffix}`),
        el('span', '기상청 특보 원문 ↗', 'wrn-ext-link')
      );
      card.append(
        topRow,
        el('small', `• 발효시각: ${item.effectiveLabel} · 해제예정: ${item.expiresLabel}`)
      );
      listWrap.append(card);
    }
    wrnBox.append(listWrap);
  } else {
    wrnBox.append(el('p', '현재 이 지역에 발효 중인 기상특보(대설·호우·한파·강풍·안개 등)가 없습니다.'));
  }

  $('radarLink').href = `https://www.windy.com/-Weather-radar-radar?radar,${p.lat},${p.lon},10`;
  $('status').textContent = [
    o ? `도로기상관측(${o.name}${o._fromSnapshot ? '·스냅샷' : ''})` : '관측 연동 중',
    w?.kma ? `기상청 초단기·단기예보${w.kma._fromSnapshot ? '(스냅샷)' : ''}` : '',
    w ? (w.stale ? '이전 모델 자료' : 'Open-Meteo·ICON 앙상블') : '예보 확인 중',
    '5분마다 자동 갱신'
  ].filter(Boolean).join(' · ');

  updateUnifiedGlobalStamp();
}

export function render() {
  if (!detailPlace) {
    board();
  } else {
    renderDetail();
  }
}

function targets() {
  return detailPlace && !places.some(p => coord(p) === coord(detailPlace)) ? [detailPlace, ...places] : places;
}

let warningsPollInFlight = null;

async function pollWarnings(force = false) {
  if (warningsPollInFlight) return warningsPollInFlight;
  const now = Date.now();
  const list = targets().filter(p => {
    const r = record(p);
    return !r.checking && (force || now - r.checked >= 105000);
  });
  if (!list.length) return;

  for (const p of list) record(p).checking = true;
  warningsPollInFlight = (async () => {
    try {
      const batch = await fetchBatchWarnings(list);
      if (batch?.resultsByKey) {
        for (const p of list) {
          const wrn = batch.resultsByKey.get(coord(p));
          if (wrn) {
            record(p).wrn = wrn;
            if (batch.ok && !batch.stale && wrn.confirmed) syncSnowWarningHistory(p, wrn);
          }
        }
      }
    } catch {}
    const doneAt = Date.now();
    for (const p of list) {
      const r = record(p);
      r.checking = false;
      r.checked = doneAt;
    }
    checkRiskDiffs();
    render();
  })().finally(() => {
    warningsPollInFlight = null;
  });
  return warningsPollInFlight;
}

function scheduleOverviewDwellRefresh(delayMs) {
  clearTimeout(overviewDwellTimer);
  overviewDwellTimer = null;
  if (!Number.isFinite(delayMs) || delayMs === null) return;
  overviewDwellTimer = setTimeout(() => {
    overviewDwellTimer = null;
    if (typeof document !== 'undefined' && document.hidden) return;
    refresh({ silent: true, fromDwell: true });
  }, Math.max(5000, delayMs));
}

function persistOverviewCache() {
  const items = {};
  let hasLivePlace = false;
  const obsByCoord = {};

  for (const p of targets()) {
    const key = coord(p);
    const r = record(p);
    const obsLive = r.o && !r.o._fromSnapshot;
    const fcstLive = r.w && (!r.w.kma || !r.w.kma._fromSnapshot);
    if (obsLive || fcstLive) hasLivePlace = true;
    if (r.o || r.w || r.wrn?.count) {
      items[key] = {
        o: r.o || null,
        w: r.w || null,
        wrn: r.wrn || null,
        last: r.last || 0,
        checked: r.checked || 0
      };
      if (obsLive) obsByCoord[key] = r.o;
    }
  }
  if (!hasLivePlace && !(roadRiskData?.ok && !roadRiskData._fromSnapshot)) return;

  seedOverviewCache({ line: 14, roadNum: '012', roadStations, roadRisk: roadRiskData, obsByCoord });
  writePageCache(OVERVIEW_CACHE_KEY, {
    scope: overviewCacheScope(),
    data: {
      roadStations: Array.isArray(roadStations) ? roadStations : [],
      roadRiskData: roadRiskData || null,
      items
    }
  });
}

function hydrateOverviewFromCache() {
  const nowMs = Date.now();
  const hit = readPageCache(OVERVIEW_CACHE_KEY, { expectedScope: overviewCacheScope(), nowMs });
  const cached = hit?.entry?.data;
  if (!cached || !cached.items) return null;

  if (Array.isArray(cached.roadStations) && cached.roadStations.length) {
    roadStations = cached.roadStations;
  }
  if (cached.roadRiskData?.ok) {
    roadRiskData = cached.roadRiskData;
  }

  const obsByCoord = {};
  for (const p of targets()) {
    const key = coord(p);
    const entry = cached.items[key];
    if (!entry) continue;
    const r = record(p);
    if (entry.o) {
      r.o = entry.o;
      if (!entry.o._fromSnapshot) obsByCoord[key] = entry.o;
    }
    if (entry.w) {
      r.w = entry.w;
      if (entry.w?.kma?.ok && !entry.w.kma._fromSnapshot) {
        seedKmaForecast(p, entry.w.kma);
      }
    }
    if (entry.wrn) r.wrn = entry.wrn;
    if (Number.isFinite(entry.last)) r.last = entry.last;
    if (Number.isFinite(entry.checked)) r.checked = entry.checked;
    r.roadRisk = findPlaceRoadRisk(p);
  }

  seedOverviewCache({ line: 14, roadNum: '012', roadStations, roadRisk: roadRiskData, obsByCoord });

  // 캐시 복원 상태는 경보 비교 기준선으로만 조용히 초기화(복원 직후 중복 토스트/알림 방지)
  if (roadRiskData?.ok) checkRoadRiskEscalations(roadRiskData);
  checkRiskDiffs();

  lastLiveOverviewSyncAt = hit.entry.savedAt;
  lastSyncHourKey = hit.entry.hourKey || currentKstHourKey(nowMs);
  overviewFromCache = true;

  const policy = evaluateCachePolicy({
    cacheHit: hit,
    freshMs: DEFAULT_FRESH_MS,
    dwellMs: DEFAULT_DWELL_MS
  });
  if (policy.shouldFetchNow) {
    overviewRevalidating = true;
  } else if (policy.backgroundDwellDelayMs != null) {
    scheduleOverviewDwellRefresh(policy.backgroundDwellDelayMs);
  }
  return policy;
}

function isOverviewFreshForRoute(targetDetailPlace = null) {
  const nowMs = Date.now();
  if (!lastLiveOverviewSyncAt) return false;
  if (lastSyncHourKey !== currentKstHourKey(nowMs)) return false;
  if (nowMs - lastLiveOverviewSyncAt >= DEFAULT_FRESH_MS) return false;
  if (targetDetailPlace) {
    const r = record(targetDetailPlace);
    if (!r.w || !r.o) return false;
  }
  return true;
}

export async function refresh(forceOrOpts = false) {
  const opts = typeof forceOrOpts === 'object' && forceOrOpts !== null
    ? forceOrOpts
    : { force: Boolean(forceOrOpts) };
  const force = Boolean(opts.force);
  const silent = Boolean(opts.silent && lastLiveOverviewSyncAt > 0);
  const fromDwell = Boolean(opts.fromDwell);

  if (force) {
    clearTimeout(overviewDwellTimer);
    overviewDwellTimer = null;
  } else if (overviewRefreshPromise) {
    return overviewRefreshPromise;
  }

  if (silent) {
    overviewRevalidating = true;
  } else {
    overviewRevalidating = false;
  }
  render();

  const run = (async () => {
    const queue = [...targets()];
    if (detailPlace) {
      queue.sort((a, b) => Number(coord(b) === coord(detailPlace)) - Number(coord(a) === coord(detailPlace)));
    }

    const probeTask = probeBackend(force).then(updateMonitorStatusBar).catch(() => {});
    // Open-Meteo 8개 지역 다중 좌표 일괄 선행 조회 + 백엔드 KMA 통합 번들(관측·단기·특보·도로·012위험) 동시 출발
    const omBatchTask = prefetchOpenMeteo(queue, { force });
    const bundleTask = loadOverviewBundle(queue, { line: 14, roadNum: '012', force });

    const bundledKeys = new Set();
    let anyLiveFetched = false;
    const probPromises = [];

    const applyBundlePayload = bundle => {
      if (!bundle?.ok) return false;
      anyLiveFetched = true;
      if (bundle.roadStations?.length) {
        roadStations = bundle.roadStations;
        if (!detailPlace) renderMiniMap();
      }
      if (bundle.roadRisk?.ok) {
        roadRiskData = { ...bundle.roadRisk, _fromSnapshot: false };
        checkRoadRiskEscalations(roadRiskData);
        for (const p of targets()) {
          record(p).roadRisk = findPlaceRoadRisk(p);
        }
      }
      if (bundle.items) {
        for (const p of queue) {
          const entry = bundle.items[coord(p)];
          if (!entry) continue;
          const r = record(p);
          if (entry.observation) r.o = { ...entry.observation, _fromSnapshot: false };
          if (entry.forecast?.ok) seedKmaForecast(p, entry.forecast);
          if (Array.isArray(entry.warnings)) {
            r.wrn = buildWarningsFromApi(entry.warnings);
            r.wrn.confirmed = entry.warningsConfirmed === true;
            if (r.wrn.confirmed) syncSnowWarningHistory(p, r.wrn);
            r.checked = Date.now();
          }
          bundledKeys.add(coord(p));
        }
      }
      render();
      return true;
    };

    // 콜드 워커 구간(첫 방문)에서는 Open-Meteo 기온이 먼저(~1초) 도착하면 최대 2초만 기다렸다가 즉시 1차 기온 표출
    let bundle = silent
      ? await bundleTask
      : await Promise.race([
          bundleTask,
          omBatchTask.then(() => new Promise(r => setTimeout(() => r('__PENDING__'), 800))),
          new Promise(r => setTimeout(() => r('__PENDING__'), 2000))
        ]);

    if (bundle === '__PENDING__') {
      try {
        await omBatchTask;
        await Promise.all(
          queue.map(async p => {
            const r = record(p);
            if (r.w) return;
            try {
              const interimW = await loadWeather(p, r.o, { skipKmaNetwork: true });
              if (interimW) {
                r.w = interimW;
                if (interimW.rows) {
                  probPromises.push(loadProbabilities(p, interimW.rows).then(render).catch(() => {}));
                }
              }
            } catch {}
          })
        );
        render();
      } catch {}
      bundle = await bundleTask;
    }

    await probeTask;
    const bundleOk = applyBundlePayload(bundle);

    if (!bundleOk) {
      loadRoadStations(14).then(stns => {
        if (stns?.length) {
          roadStations = stns;
          if (!detailPlace) renderMiniMap();
        }
      }).catch(() => {});
      loadRoadRisk('012', force).then(riskPayload => {
        if (riskPayload?.ok) {
          roadRiskData = riskPayload;
          checkRoadRiskEscalations(riskPayload);
          for (const p of targets()) {
            record(p).roadRisk = findPlaceRoadRisk(p);
          }
          render();
        }
      }).catch(() => {});
    }

    // 번들에 포함되지 않은 지점(또는 번들 실패 시)만 보조 특보 조회 수행
    const missingWarnings = queue.filter(p => !bundledKeys.has(coord(p)));
    if (missingWarnings.length) {
      pollWarnings(force);
    }

    const workList = [...queue];
    async function worker() {
      while (workList.length) {
        const p = workList.shift();
        const r = record(p);
        const isFreshObs = !force && !fromDwell && !r.o?._fromSnapshot && r.last && Date.now() - r.last < 240000;
        if (!bundledKeys.has(coord(p)) && isFreshObs) continue;
        if (!silent) r.busy = true;
        try {
          if (!r.o || r.o._fromSnapshot || force || !bundledKeys.has(coord(p))) {
            try {
              const nextObs = await loadObservation(p);
              if (nextObs && (!nextObs._fromSnapshot || !r.o)) {
                r.o = nextObs;
                if (!nextObs._fromSnapshot) anyLiveFetched = true;
              }
            } catch {}
          }
          try {
            await omBatchTask;
            const nextW = await loadWeather(p, r.o);
            if (nextW && (!nextW.kma?._fromSnapshot || !r.w)) {
              r.w = nextW;
              if (!nextW.kma?._fromSnapshot) anyLiveFetched = true;
              if (r.w?.rows) {
                probPromises.push(loadProbabilities(p, r.w.rows).then(render).catch(() => {}));
              }
            }
          } catch {}
        } finally {
          r.last = Date.now();
          r.busy = false;
          render();
        }
      }
    }

    await Promise.all([worker(), worker(), worker()]);
    checkRiskDiffs();

    clearTimeout(overviewDwellTimer);
    overviewDwellTimer = null;
    overviewRevalidating = false;
    if (anyLiveFetched) {
      overviewFromCache = false;
      lastLiveOverviewSyncAt = Date.now();
      lastSyncHourKey = currentKstHourKey();
      persistOverviewCache();
      if (probPromises.length) {
        Promise.allSettled(probPromises).then(() => {
          if (!overviewRevalidating) persistOverviewCache();
        });
      }
    }
    render();
  })();

  overviewRefreshPromise = run;
  try {
    return await run;
  } finally {
    if (overviewRefreshPromise === run) overviewRefreshPromise = null;
  }
}

function route() {
  if (releaseCctv) $('tabWindy').click();
  const hash = location.hash;
  const m = hash.match(/^#region\/([^/]+)\/([\d.]+),([\d.]+)$/);
  detailPlace = null;
  mobileMapView = hash === '#map';

  if (m) {
    try {
      const candidate = { name: decodeURIComponent(m[1]), lat: Number(m[2]), lon: Number(m[3]) };
      if (valid(candidate)) {
        detailPlace = [...places, ...presets].find(q => coord(q) === coord(candidate)) ?? candidate;
      }
    } catch {}
  }

  document.body.classList.toggle('mobile-map-mode', mobileMapView && !detailPlace);
  $('topSubbar').hidden = !!detailPlace;
  $('detail').hidden = !detailPlace;
  $('overview').hidden = !!detailPlace;

  document.title = (detailPlace ? `${detailPlace.name} 상세 브리핑` : mobileMapView ? '광주대구선 노선 미니맵·Windy' : '관심지역 상시 기상 모니터') + ' | 날씨봇 × 비온다?';
  if (detailPlace) {
    const select = $('jump');
    select.replaceChildren(
      ...targets().map(p => {
        const opt = el('option', p.site ? `${p.name} (${p.site})` : p.name);
        opt.value = detailURL(p);
        return opt;
      })
    );
    select.value = detailURL(detailPlace);
  } else {
    clearHeroScene(document.querySelector('#detail .hero'));
  }

  render();
  if (!isOverviewFreshForRoute(detailPlace)) {
    refresh({ silent: lastLiveOverviewSyncAt > 0 });
  } else if (overviewFromCache && !overviewDwellTimer) {
    const ageMs = Math.max(0, Date.now() - lastLiveOverviewSyncAt);
    const policy = evaluateCachePolicy({
      cacheHit: { entry: { savedAt: lastLiveOverviewSyncAt }, ageMs, sameHour: true },
      freshMs: DEFAULT_FRESH_MS,
      dwellMs: DEFAULT_DWELL_MS
    });
    if (policy.backgroundDwellDelayMs != null) {
      scheduleOverviewDwellRefresh(policy.backgroundDwellDelayMs);
    }
  }
}

// 1:1 정방형(1080x1080) JPG 공유 모달
let currentShareBlob = null;
let currentShareObjectUrl = null;
let currentShareFilename = 'weather-briefing-1080x1080.jpg';

async function openShareModal() {
  const stampStr = updateUnifiedGlobalStamp();
  const isDetail = !!detailPlace;
  const canvas = isDetail
    ? renderDetailCanvas(detailPlace, getEffectiveRecord(detailPlace), stampStr, summary)
    : renderOverviewCanvas(
        settings.sortRisk ? [...places].sort((a, b) => placeDangerScore(b) - placeDangerScore(a)) : places,
        getEffectiveRecord,
        stampStr,
        summary
      );

  const blob = await canvasToJpgBlob(canvas, 0.92);
  currentShareBlob = blob;
  if (currentShareObjectUrl) {
    try { URL.revokeObjectURL(currentShareObjectUrl); } catch {}
  }
  const tag = isDetail ? detailPlace.name.replace(/\s+/g, '_') : '종합상황판_8개소';
  currentShareFilename = `기상브리핑_${tag}_1080x1080.jpg`;

  currentShareObjectUrl = URL.createObjectURL(blob);
  $('sharePreviewImg').src = currentShareObjectUrl;
  $('shareDialogTitle').textContent = isDetail
    ? `📤 ${detailPlace.name} 상세 브리핑 (1080×1080 JPG)`
    : `📤 관심지역 8개소 종합 브리핑 (1080×1080 JPG)`;
  $('shareStatus').textContent = '※ 이 이미지는 서버 부하 없이 브라우저에서 즉시 생성됩니다.';
  $('shareDialog').showModal();
}

$('shareBtn').onclick = openShareModal;
$('detailShareBtn').onclick = openShareModal;
$('closeShareDialog').onclick = () => $('shareDialog').close();

$('downloadJpgBtn').onclick = () => {
  if (!currentShareBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(currentShareBlob);
  a.download = currentShareFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  $('shareStatus').textContent = `✅ ${currentShareFilename} 저장 완료 (1080×1080 정방형 JPG)`;
};

$('copyImageBtn').onclick = async () => {
  if (!currentShareBlob) return;
  try {
    const imgBitmap = await createImageBitmap(currentShareBlob);
    const c = document.createElement('canvas');
    c.width = imgBitmap.width;
    c.height = imgBitmap.height;
    c.getContext('2d').drawImage(imgBitmap, 0, 0);
    const pngBlob = await new Promise(r => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    $('shareStatus').textContent = '✅ 클립보드에 1080×1080 브리핑 이미지가 복사되었습니다. 메신저에 붙여넣기(Ctrl+V) 하세요.';
  } catch {
    $('shareStatus').textContent = '이 브라우저에서는 클립보드 직접 복사가 제한됩니다. [JPG 파일 저장]을 이용해 주세요.';
  }
};

$('nativeShareBtn').onclick = async () => {
  if (!currentShareBlob) return;
  const file = new File([currentShareBlob], currentShareFilename, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: '관심지역 기상·도로살얼음 브리핑',
        text: '관심지역 실시간 기상·도로살얼음 정방형 브리핑 리포트입니다.',
        files: [file]
      });
      $('shareStatus').textContent = '✅ 공유 완료';
      return;
    } catch {}
  }
  $('downloadJpgBtn').click();
};

// PC 레이아웃 모드 및 미니맵:Windy 분할 비율 적용 (상하=좌우폭% | 좌우FHD=상하영상높이px)
function applyLayoutAndSplit() {
  const container = $('overviewContainer');
  const isSplit = settings.pcLayout === 'split';
  if (container) {
    container.classList.toggle('layout-stacked', !isSplit);
    container.classList.toggle('layout-fhd-split', isSplit);
  }
  document.documentElement.style.setProperty('--map-split', `${settings.mapSplitPct}%`);
  document.documentElement.style.setProperty('--split-radar-h', `${settings.splitRadarPx}px`);
  if ($('pcLayoutLabel')) {
    $('pcLayoutLabel').textContent = isSplit ? '좌우 분할(FHD)' : '상하 기본';
  }
  const splitter = $('mapSplitter');
  const grip = $('splitterGrip');
  if (splitter) {
    splitter.setAttribute('aria-orientation', isSplit ? 'horizontal' : 'vertical');
    splitter.title = isSplit
      ? '위·아래로 드래그하여 상단 위성·레이더 영상과 하단 미니맵 높이를 조절하세요'
      : '좌·우로 드래그하여 미니맵과 Windy/레이더 영상 폭 비율을 조절하세요';
  }
  if (grip) {
    grip.textContent = isSplit ? '⋯' : '⋮';
  }
  document.querySelectorAll('.sp-btn[data-split]').forEach(btn => {
    const val = Number(btn.dataset.split);
    const active = isSplit
      ? val === 35
        ? settings.splitRadarPx >= 410
        : val === 55
        ? settings.splitRadarPx <= 280
        : settings.splitRadarPx > 280 && settings.splitRadarPx < 410
      : Math.abs(val - settings.mapSplitPct) <= 3;
    btn.classList.toggle('active', active);
  });
}

// 드래그 리사이즈 바(#mapSplitter) 이벤트 바인딩 (상하=좌우폭 | 좌우분할=상하높이)
function bindSplitterDrag() {
  const splitter = $('mapSplitter');
  const workspace = $('mapSection');
  if (!splitter || !workspace) return;

  let dragState = null; // { mode: 'col'|'row', startY, startRadarH }
  const startDrag = clientY => {
    const isRow = settings.pcLayout === 'split' && window.innerWidth > 1024;
    const radarEl = workspace.querySelector('#mapCctv:not([hidden]) video, #kmaRadarBox:not([hidden]) .kma-radar-container, #windyBox:not([hidden]) .iframe-wrap');
    dragState = {
      mode: isRow ? 'row' : 'col',
      startY: clientY,
      startRadarH: radarEl ? radarEl.getBoundingClientRect().height : settings.splitRadarPx
    };
    document.body.classList.add('is-resizing');
    if (isRow) document.body.classList.add('is-resizing-row');
  };

  const onMove = (clientX, clientY) => {
    if (!dragState) return;
    if (dragState.mode === 'row') {
      const nextH = Math.max(220, Math.min(640, Math.round(dragState.startRadarH + (clientY - dragState.startY))));
      settings.splitRadarPx = nextH;
      applyLayoutAndSplit();
      return;
    }
    const rect = workspace.getBoundingClientRect();
    if (rect.width < 500) return;
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    settings.mapSplitPct = Math.max(30, Math.min(68, pct));
    applyLayoutAndSplit();
  };

  const endDrag = () => {
    if (!dragState) return;
    dragState = null;
    document.body.classList.remove('is-resizing', 'is-resizing-row');
    persistSettings();
  };

  splitter.addEventListener('mousedown', e => {
    e.preventDefault();
    startDrag(e.clientY);
  });
  splitter.addEventListener('touchstart', e => {
    if (!e.touches[0]) return;
    startDrag(e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('touchmove', e => {
    if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('touchend', endDrag);

  // 빠른 비율 프리셋 버튼 (레이아웃 모드별 자동 매핑)
  document.querySelectorAll('.sp-btn[data-split]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.split);
      if (settings.pcLayout === 'split') {
        settings.splitRadarPx = val === 35 ? 470 : val === 55 ? 270 : 390;
      } else {
        settings.mapSplitPct = val;
      }
      applyLayoutAndSplit();
      persistSettings();
    });
  });
}

// 설정 메뉴 바인딩 (요구사항 7)
function syncSettingsUI() {
  document.body.classList.toggle('dark-mode', settings.darkMode);
  applyLayoutAndSplit();
  const setPill = (id, on, onTxt = '켜짐 ON', offTxt = '꺼짐 OFF') => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? onTxt : offTxt;
  };
  setPill('togglePcLayout', settings.pcLayout === 'split', '좌우 분할', '상하 기본');
  setPill('toggleFullscreen', !!document.fullscreenElement);
  setPill('toggleSound', settings.sound);
  setPill('toggleWakeLock', settings.wakeLock);
  setPill('toggleSortRisk', settings.sortRisk);
  setPill('toggleDark', settings.darkMode);
  setPill('toggleActionCards', settings.showActionCards, '켜짐 ON', '꺼짐 OFF');
  updateMonitorStatusBar();
}

function togglePcLayoutMode() {
  settings.pcLayout = settings.pcLayout === 'split' ? 'stacked' : 'split';
  persistSettings();
  syncSettingsUI();
}
$('pcLayoutToggleBtn').onclick = togglePcLayoutMode;
$('togglePcLayout').onclick = togglePcLayoutMode;

$('settingsBtn').onclick = () => {
  const panel = $('settingsPanel');
  const nextHidden = !panel.hidden;
  panel.hidden = nextHidden;
  $('settingsBtn').setAttribute('aria-expanded', String(!nextHidden));
  syncSettingsUI();
};
$('closeSettings').onclick = () => {
  $('settingsPanel').hidden = true;
  $('settingsBtn').setAttribute('aria-expanded', 'false');
};

$('toggleFullscreen').onclick = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {}
  syncSettingsUI();
};
document.addEventListener('fullscreenchange', syncSettingsUI);

$('toggleSound').onclick = () => {
  settings.sound = !settings.sound;
  persistSettings();
  syncSettingsUI();
  if (settings.sound) playAlertTone('test');
};
$('testSoundBtn').onclick = e => {
  e.stopPropagation();
  playAlertTone('test');
};
$('toggleWakeLock').onclick = () => {
  settings.wakeLock = !settings.wakeLock;
  persistSettings();
  syncWakeLock();
  syncSettingsUI();
};
$('toggleSortRisk').onclick = () => {
  settings.sortRisk = !settings.sortRisk;
  persistSettings();
  syncSettingsUI();
  render();
};
$('toggleDark').onclick = () => {
  settings.darkMode = !settings.darkMode;
  persistSettings();
  syncSettingsUI();
};
$('toggleActionCards').onclick = () => {
  settings.showActionCards = !settings.showActionCards;
  persistSettings();
  syncSettingsUI();
  render();
};

$('saveApiBaseBtn').onclick = async () => {
  const raw = ($('apiBaseInput')?.value || '').trim();
  if (raw && !/^https:\/\//i.test(raw) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(raw)) {
    const lbl = $('backendModeLabel');
    if (lbl) lbl.textContent = '⚠ 보안을 위해 https:// 주소(또는 localhost)만 입력할 수 있습니다.';
    return;
  }
  const clean = setApiBase(raw);
  if ($('apiBaseInput')) $('apiBaseInput').value = clean;
  clearPageCache(OVERVIEW_CACHE_KEY);
  lastLiveOverviewSyncAt = 0;
  await probeBackend(true);
  updateMonitorStatusBar();
  refresh(true);
};

$('resetApiBaseBtn').onclick = async () => {
  setApiBase('');
  clearPageCache(OVERVIEW_CACHE_KEY);
  lastLiveOverviewSyncAt = 0;
  if ($('apiBaseInput')) $('apiBaseInput').value = getApiBase();
  await probeBackend(true);
  updateMonitorStatusBar();
  refresh(true);
};

$('toastCloseBtn').onclick = () => {
  $('alertToast').hidden = true;
};
$('toastDetailBtn').onclick = () => {
  if (toastTargetPlace) {
    location.hash = detailURL(toastTargetPlace);
    $('alertToast').hidden = true;
  }
};

// Windy / KMA HSR Radar 탭 전환 및 레이어 컨트롤
$('tabWindy').onclick = () => {
  closeMapCctv();
  $('tabWindy').classList.add('active');
  $('tabWindy').setAttribute('aria-selected', 'true');
  $('tabKmaRadar').classList.remove('active');
  $('tabKmaRadar').setAttribute('aria-selected', 'false');
  $('windyBox').hidden = false;
  $('kmaRadarBox').hidden = true;
};
$('tabKmaRadar').onclick = () => {
  closeMapCctv();
  $('tabKmaRadar').classList.add('active');
  $('tabKmaRadar').setAttribute('aria-selected', 'true');
  $('tabWindy').classList.remove('active');
  $('tabWindy').setAttribute('aria-selected', 'false');
  $('windyBox').hidden = true;
  $('kmaRadarBox').hidden = false;
  loadKmaRadarImage(false);
};
$('radarRefreshBtn').onclick = () => loadKmaRadarImage(true);

document.querySelectorAll('.wc-btn[data-overlay]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.wc-btn[data-overlay]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    windyState.overlay = btn.dataset.overlay;
    updateWindyIframe();
  });
});

$('windyDetailCheck').onchange = e => {
  windyState.detailOpen = e.target.checked;
  updateWindyIframe();
};

// 상세페이지 시간별 전망 표 6h / 12h 전환
$('tab6h').onclick = () => {
  tableMode = '6h';
  $('tab6h').classList.add('active');
  $('tab12h').classList.remove('active');
  renderDetail();
};
$('tab12h').onclick = () => {
  tableMode = '12h';
  $('tab12h').classList.add('active');
  $('tab6h').classList.remove('active');
  renderDetail();
};

// 관심지역 관리 다이얼로그
function manage() {
  $('manage').replaceChildren(
    el('b', `저장된 관심지역 ${places.length} / 8`),
    ...places.map(p => {
      const row = el('div', '', 'managerow');
      const b = el('button', '삭제');
      b.type = 'button';
      b.disabled = places.length === 1;
      b.setAttribute('aria-label', p.name + ' 삭제');
      b.onclick = () => {
        places = places.filter(q => coord(q) !== coord(p));
        persist();
        clearPageCache(OVERVIEW_CACHE_KEY);
        manage();
        if (detailPlace && coord(p) === coord(detailPlace)) location.hash = 'overview';
        route();
      };
      row.append(el('span', p.site ? `${p.name} (${p.site})` : p.name), b);
      return row;
    })
  );
}

function choose(p) {
  if (!valid(p)) return;
  const existing = places.some(q => coord(q) === coord(p));
  if (!existing && places.length >= 8) {
    $('formstatus').textContent = '8곳을 모두 사용 중입니다. 저장한 지역을 하나 삭제한 뒤 추가하세요.';
    return;
  }
  if (!existing) places.push(p);
  persist();
  clearPageCache(OVERVIEW_CACHE_KEY);
  if ($('dialog').open) $('dialog').close();
  filter = 'all';
  if (detailPlace && !existing) location.hash = 'overview';
  else if (existing) location.hash = detailURL(p);
  refresh(true);
}

$('restorePresetsBtn').onclick = () => {
  places = presets.slice(0, 8);
  persist();
  clearPageCache(OVERVIEW_CACHE_KEY);
  manage();
  $('formstatus').textContent = '✅ 광주대구선 8개 기본 관심지역(달성군남부·함양중부·거창군남부·합천군서북부·고령군·남원·함양·거창)으로 복원되었습니다.';
  refresh(true);
};

$('jump').onchange = e => {
  location.hash = e.target.value;
};
$('refresh').onclick = $('reloadAll').onclick = () => refresh(true);
$('period').onchange = renderDetail;
window.addEventListener('hashchange', route);
window.addEventListener('resize', () => {
  board();
});

let searchId = 0, timer;
function showSearchResults(list) {
  $('results').replaceChildren(
    ...list.slice(0, 20).map(p => {
      const b = el('button', p.site ? `📍 ${p.name} (${p.site})` : `📍 ${p.name}`);
      b.type = 'button';
      b.onclick = () => choose(p);
      return b;
    })
  );
}

function search() {
  const q = $('query').value.trim();
  const id = ++searchId;
  clearTimeout(timer);
  const cleanQ = q.replaceAll(' ', '');
  const local = NATIONWIDE_PLACES.filter(
    p => p.name.replaceAll(' ', '').includes(cleanQ) || (p.site && p.site.replaceAll(' ', '').includes(cleanQ))
  );
  showSearchResults(local);
  $('formstatus').textContent = '';
  if (q.length < 2) return;
  timer = setTimeout(async () => {
    try {
      const searchUrl = (await isBackendAvailable())
        ? apiUrl('/api/search?name=' + encodeURIComponent(q))
        : `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=12&language=ko&format=json`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw Error();
      const data = await res.json();
      if (id !== searchId) return;
      const remote = (data.results ?? [])
        .filter(x => x.country_code === 'KR')
        .map(x => ({
          name: [x.admin1, x.admin2, x.name].filter(Boolean).join(' '),
          site: x.admin3 || x.name || '',
          lat: x.latitude,
          lon: x.longitude
        }))
        .filter(valid);
      showSearchResults([...local, ...remote]);
      if (!local.length && !remote.length) {
        $('formstatus').textContent = '검색 결과가 없습니다. 아래에서 위도·경도 좌표로 직접 지정할 수 있습니다.';
      }
    } catch {
      if (id === searchId && !local.length) {
        $('formstatus').textContent = '지역 검색 연결 지연 · 좌표로 직접 지정할 수 있습니다.';
      }
    }
  }, 300);
}

$('query').oninput = search;
$('add').onclick = () => {
  $('query').value = '';
  $('siteInput').value = '';
  $('lat').value = '';
  $('lon').value = '';
  $('custom').open = false;
  search();
  manage();
  $('dialog').showModal();
};
$('close').onclick = () => $('dialog').close();

$('locationForm').onsubmit = e => {
  e.preventDefault();
  const p = {
    name: $('query').value.trim() || '사용자 지정 지역',
    site: $('siteInput').value.trim() || '지정좌표',
    lat: Number($('lat').value),
    lon: Number($('lon').value)
  };
  if (!p.name || !valid(p)) {
    $('custom').open = true;
    $('formstatus').textContent = '지역명과 대한민국 내 유효 위도(32~40)·경도(124~132)를 입력하세요.';
    return;
  }
  choose(p);
};

function notificationState() {
  const btn = $('notify');
  if (!btn) return;
  const supported = 'Notification' in window;
  const perm = supported ? Notification.permission : 'unsupported';
  const isOn = perm === 'granted' && settings.desktopNotify;
  btn.classList.toggle('on', isOn);
  btn.setAttribute('aria-pressed', String(isOn));
  btn.textContent = !supported
    ? '🔕 미지원'
    : perm === 'denied'
    ? '🔕 알림 차단'
    : isOn
    ? '🔔 알림 ON'
    : '🔕 알림 OFF';
  btn.title = !supported
    ? '현재 브라우저는 기기 알림을 지원하지 않습니다'
    : perm === 'denied'
    ? '브라우저 사이트 설정에서 알림 차단을 해제하세요'
    : isOn
    ? '기기 위험·특보 알림 ON (클릭하여 끄기)'
    : '기기 위험·특보 알림 OFF (클릭하여 켜기)';
}
$('notify').onclick = async () => {
  if (!('Notification' in window)) {
    notificationState();
    return;
  }
  if (Notification.permission === 'default') {
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        settings.desktopNotify = true;
        persistSettings();
      }
    } catch {}
  } else if (Notification.permission === 'granted') {
    settings.desktopNotify = !settings.desktopNotify;
    persistSettings();
  }
  notificationState();
};

$('locate').onclick = () => {
  if (!navigator.geolocation) {
    $('formstatus').textContent = '위치 확인을 지원하지 않는 브라우저입니다.';
    return;
  }
  $('formstatus').textContent = '현재 위치를 확인하고 있습니다…';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const p = {
        name: $('query').value.trim() || '현재 위치',
        site: 'GPS 위치',
        lat: coords.latitude,
        lon: coords.longitude
      };
      if (valid(p)) choose(p);
      else $('formstatus').textContent = '대한민국 내 위치를 지정하세요.';
    },
    () => {
      $('formstatus').textContent = '위치 권한 또는 GPS 수신 상태를 확인하거나 좌표로 지정하세요.';
    },
    { timeout: 9000 }
  );
};

// 초기화 (캐시 선복원 0ms 표출 → 필요 시 백그라운드 SWR · 5분 자동갱신)
bindSplitterDrag();
syncSettingsUI();
syncWakeLock();
notificationState();
hydrateOverviewFromCache();
route();

setInterval(() => {
  if (!document.hidden) refresh({ silent: true });
}, OVERVIEW_REFRESH_MS);
setInterval(() => {
  if (!document.hidden) pollWarnings();
}, 120000);
setInterval(() => {
  if (!document.hidden && detailPlace && settings.showActionCards && !activeSpreadEditor) {
    if (getSpreadEntry(detailPlace, 'presalt') || getSpreadEntry(detailPlace, 'mainplow')) {
      renderDetail();
    }
  }
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncWakeLock();
    const nowMs = Date.now();
    const staleOrRollover =
      !lastLiveOverviewSyncAt ||
      (nowMs - lastLiveOverviewSyncAt >= OVERVIEW_REFRESH_MS) ||
      (lastSyncHourKey !== currentKstHourKey(nowMs));
    if (staleOrRollover) {
      refresh({ silent: lastLiveOverviewSyncAt > 0 });
    }
  }
});
