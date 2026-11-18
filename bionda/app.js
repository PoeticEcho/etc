import { loadWeather, loadProbabilities } from './weather.js';
import { loadObservation, loadRoadStations } from './observations.js';
import { fetchPlaceWarnings, buildWarningSummary } from './warnings.js';
import { renderOverviewCanvas, renderDetailCanvas, canvasToJpgBlob } from './share.js';

const $ = id => document.getElementById(id);
const el = (tag, txt = '', cls = '') => {
  const a = document.createElement(tag);
  if (txt !== null && txt !== undefined) a.textContent = txt;
  if (cls) a.className = cls;
  return a;
};

// 광주대구선(14번 고속도로) 및 지리산·고령권역 기본 8개 관심지역
export const presets = [
  ['대구 달성군남부', '현풍읍', 35.697, 128.447],
  ['함양중부', '지곡면', 35.566, 127.774],
  ['거창군남부', '남상면', 35.644, 127.910],
  ['합천군서북부', '야로면', 35.706, 128.168],
  ['고령군', '대가야읍', 35.728, 128.263],
  ['남원', '남원시청', 35.416, 127.390],
  ['함양', '함양읍', 35.520, 127.725],
  ['거창', '거창읍', 35.687, 127.910]
].map(([name, site, lat, lon]) => ({ name, site, lat, lon }));

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

const STORAGE_KEY = 'weather-watch:locations:v3';
const SETTINGS_KEY = 'weather-watch:settings:v2';

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
  simMode: false,
  pcLayout: 'stacked', // 'stacked' (상하 기본 4x2 + 하단 분할) | 'split' (좌우 FHD 분할: 좌 2x4 + 우 상하)
  mapSplitPct: 43 // 미니맵 영역 폭 비율 (30 ~ 68%)
};
try {
  const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (savedSettings && typeof savedSettings === 'object') {
    settings.sound = savedSettings.sound ?? true;
    settings.wakeLock = savedSettings.wakeLock ?? true;
    settings.sortRisk = savedSettings.sortRisk ?? true;
    settings.darkMode = savedSettings.darkMode ?? false;
    settings.pcLayout = savedSettings.pcLayout === 'split' ? 'split' : 'stacked';
    if (Number.isFinite(savedSettings.mapSplitPct)) {
      settings.mapSplitPct = Math.max(30, Math.min(68, savedSettings.mapSplitPct));
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
        pcLayout: settings.pcLayout,
        mapSplitPct: settings.mapSplitPct
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

const records = new Map();
let roadStations = [];
let filter = 'all';
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
function getEffectiveRecord(p) {
  const baseRec = record(p);
  if (!settings.simMode) return baseRec;

  const simMap = {
    '거창군남부': {
      temp: -1.4,
      humidity: 92,
      roadTemp: -2.1,
      surfaceState: '적설·결빙주의',
      snowDepth: 2.3,
      dayPrecip: 6.4,
      description: '눈 (적설 2.3cm)',
      maxPop: 90,
      iceLevel: '주의',
      iceRank: 2,
      shortCause: '야간 영하·강수',
      reason: '15:00 강설·강수 흔적 + 영하권 기온 지속 및 야간 복사냉각 (최저 -4.1°C) · 기온 -1.4°C · 습도 92%',
      snowActions: [
        { stage: 'preheat', rank: 2, text: '🔑 [제설차 시동·살포기 예열] 예비살포 1시간 전 시동·유압 예열 필수' },
        { stage: 'immediate', rank: 2, text: '🚜 [현장 대응 단계] 즉시 제설차 시동·예열 및 습염 살포 / 삽날 제설 대기' }
      ],
      warnings: [
        { kind: '대설', level: '경보', title: '대설경보', effectiveText: '11-18 14:00', isFutureEffective: false, expiresText: '19일 09:00 해제예정', priorityScore: 102 },
        { kind: '한파', level: '주의보', title: '한파주의보', effectiveText: '11-18 21:00', isFutureEffective: true, expiresText: '20일 12:00 해제예정', priorityScore: 206 },
        { kind: '강풍', level: '주의보', title: '강풍주의보', effectiveText: '11-18 11:00', isFutureEffective: false, expiresText: '19일 06:00 해제예정', priorityScore: 207 }
      ]
    },
    '함양중부': {
      temp: 0.2,
      humidity: 89,
      roadTemp: -0.4,
      surfaceState: '습윤·결빙주의',
      snowDepth: 0.5,
      dayPrecip: 3.1,
      description: '진눈깨비',
      maxPop: 80,
      iceLevel: '주의',
      iceRank: 2,
      shortCause: '0.2°C·진눈깨비',
      reason: '15:00 진눈깨비 및 교량 복사냉각 결빙 위험 · 기온 0.2°C · 습도 89%',
      snowActions: [
        { stage: 'presalt', rank: 2, text: '🚜 [사전 제설(예비살포) 권장] 즉시 죽산천교·함양구간 습염 사전 살포 출동' }
      ],
      warnings: [
        { kind: '대설', level: '주의보', title: '대설주의보', effectiveText: '11-18 13:30', isFutureEffective: false, expiresText: '19일 06:00 해제예정', priorityScore: 202 },
        { kind: '강풍', level: '주의보', title: '강풍주의보', effectiveText: '11-18 11:00', isFutureEffective: false, expiresText: '19일 06:00 해제예정', priorityScore: 207 }
      ]
    },
    '합천군서북부': {
      temp: 1.3,
      humidity: 85,
      roadTemp: 0.4,
      surfaceState: '습윤',
      snowDepth: 0,
      dayPrecip: 0.8,
      description: '흐림 (교량 결빙주의)',
      maxPop: 40,
      iceLevel: '관심',
      iceRank: 1,
      shortCause: '야간 교량 냉각',
      reason: '18:00 최근 강수와 야간 교량 복사냉각 관심 · 기온 1.3°C · 습도 85%',
      snowActions: [
        { stage: 'preheat', rank: 1, text: '🔑 [제설차 시동·살포기 예열] 15:00 시동 권장 (살포기 유압 예열 → 16:00 예비살포 → 18:00 결빙 예상)' }
      ],
      warnings: [
        { kind: '한파', level: '주의보', title: '한파주의보', effectiveText: '11-18 21:00', isFutureEffective: true, expiresText: '20일 12:00 해제예정', priorityScore: 206 }
      ]
    },
    '대구 달성군남부': { temp: 6.8, humidity: 52, roadTemp: 9.2, surfaceState: '건조', dayPrecip: 0, description: '구름 조금', maxPop: 10, iceLevel: '뚜렷한 신호 없음', iceRank: 0, warnings: [] },
    '고령군': { temp: 6.1, humidity: 55, roadTemp: 8.5, surfaceState: '건조', dayPrecip: 0, description: '대체로 맑음', maxPop: 10, iceLevel: '뚜렷한 신호 없음', iceRank: 0, warnings: [] },
    '남원': { temp: 4.5, humidity: 68, roadTemp: 6.1, surfaceState: '건조', dayPrecip: 0.2, description: '흐림', maxPop: 20, iceLevel: '뚜렷한 신호 없음', iceRank: 0, warnings: [] },
    '함양': { temp: 3.4, humidity: 74, roadTemp: 4.8, surfaceState: '건조', dayPrecip: 0.5, description: '흐림', maxPop: 30, iceLevel: '뚜렷한 신호 없음', iceRank: 0, warnings: [] },
    '거창': { temp: 2.8, humidity: 77, roadTemp: 4.1, surfaceState: '건조', dayPrecip: 1.0, description: '흐림', maxPop: 30, iceLevel: '뚜렷한 신호 없음', iceRank: 0, warnings: [] }
  };

  const sim = simMap[p.name];
  if (!sim) return baseRec;

  const baseRows = [
    { time: '2026-11-18T15:00', temp: sim.temp - 0.1, pop: sim.maxPop, rainPop: sim.temp > 1 ? sim.maxPop : 10, snowPop: sim.temp <= 1 ? Math.max(0, sim.maxPop - 5) : 0, precip: sim.maxPop >= 80 ? 1.2 : 0, rain: sim.temp > 1 && sim.maxPop >= 80 ? 1.2 : 0, snow: sim.temp <= 1 && sim.maxPop >= 80 ? 1.1 : 0 },
    { time: '2026-11-18T16:00', temp: sim.temp - 0.4, pop: Math.max(10, sim.maxPop - 10), rainPop: 5, snowPop: sim.temp <= 1 ? Math.max(0, sim.maxPop - 10) : 0, precip: sim.maxPop >= 80 ? 0.9 : 0, rain: 0, snow: sim.temp <= 1 && sim.maxPop >= 80 ? 0.9 : 0 },
    { time: '2026-11-18T17:00', temp: sim.temp - 0.8, pop: Math.max(10, sim.maxPop - 20), rainPop: 0, snowPop: sim.temp <= 1 ? Math.max(0, sim.maxPop - 20) : 0, precip: sim.maxPop >= 80 ? 0.6 : 0, rain: 0, snow: sim.temp <= 1 && sim.maxPop >= 80 ? 0.6 : 0 },
    { time: '2026-11-18T18:00', temp: sim.temp - 1.5, pop: Math.max(10, sim.maxPop - 40), rainPop: 0, snowPop: sim.temp <= 1 ? Math.max(0, sim.maxPop - 45) : 0, precip: sim.maxPop >= 80 ? 0.2 : 0, rain: 0, snow: sim.temp <= 1 && sim.maxPop >= 80 ? 0.2 : 0 },
    { time: '2026-11-18T19:00', temp: sim.temp - 2.1, pop: Math.max(10, sim.maxPop - 60), rainPop: 0, snowPop: sim.temp <= 1 ? 25 : 0, precip: 0, rain: 0, snow: 0 },
    { time: '2026-11-18T20:00', temp: sim.temp - 2.7, pop: Math.max(10, sim.maxPop - 70), rainPop: 0, snowPop: sim.temp <= 1 ? 15 : 0, precip: 0, rain: 0, snow: 0 }
  ];

  return {
    ...baseRec,
    o: {
      ...(baseRec.o || {}),
      name: baseRec.o?.name || `${p.name} 관측소`,
      roadStationName: baseRec.o?.roadStationName || `${p.site || p.name}(도)`,
      distanceKm: baseRec.o?.distanceKm ?? 1.2,
      time: '2026-11-18T14:40:00+09:00',
      temp: sim.temp,
      roadTemp: sim.roadTemp,
      surfaceState: sim.surfaceState,
      humidity: sim.humidity,
      dayPrecip: sim.dayPrecip,
      snowDepth: sim.snowDepth ?? null,
      windSpeed: 2.4,
      description: sim.description
    },
    w: {
      ...(baseRec.w || {}),
      stale: false,
      through: '2026-11-18T14:40',
      current: { time: '2026-11-18T14:40', temp: sim.temp, humidity: sim.humidity, wind: 2.4, code: 71, precip: sim.dayPrecip },
      today: { precip: sim.dayPrecip, rain: Number((sim.dayPrecip * 0.28).toFixed(1)), snow: sim.snowDepth ? Number((sim.snowDepth * 2).toFixed(1)) : 0 },
      last24: { precip: sim.dayPrecip, rain: Number((sim.dayPrecip * 0.28).toFixed(1)), snow: sim.snowDepth ? Number((sim.snowDepth * 2).toFixed(1)) : 0 },
      rows: baseRows,
      ice: {
        level: sim.iceLevel,
        rank: sim.iceRank,
        shortCause: sim.shortCause || '',
        reason: sim.reason || '결빙 위험 신호 없음',
        samples: [{ time: '현재', level: sim.iceRank ? sim.iceLevel : '정상', rank: sim.iceRank }, ...baseRows.map(r => ({ time: r.time, level: sim.iceRank ? sim.iceLevel : '정상', rank: sim.iceRank }))],
        snowActions: sim.snowActions || [],
        flood: { rank: 0 },
        windAlert: { active: false }
      },
      kma: baseRec.w?.kma || {
        ok: true,
        hours: baseRows.map((r, i) => ({
          time: r.time + ':00+09:00',
          offset: i + 1,
          type: r.snow > 0 ? '눈' : r.precip > 0 ? '비' : '없음',
          wet: r.precip > 0 || r.snow > 0,
          chance: r.pop,
          risk: r.pop >= 50 && !(r.precip > 0),
          amount: r.precip > 0 ? `${r.precip}mm` : '강수없음',
          temp: String(r.temp.toFixed(1))
        })),
        analysis: {
          now: { wet: sim.maxPop >= 80, type: sim.temp <= 0 ? '눈' : '비' },
          start: sim.maxPop >= 80 ? { time: '2026-11-18T15:00:00+09:00', current: true } : null,
          end: sim.maxPop >= 80 ? { time: '2026-11-18T19:00:00+09:00', rule: '연속 2시간 무강수 예보' } : null,
          horizons: [
            { hours: 3, hasPrecipitation: sim.maxPop >= 80, hasRisk: sim.maxPop >= 50, kinds: [sim.temp <= 0 ? '눈' : '비'] },
            { hours: 6, hasPrecipitation: sim.maxPop >= 80, hasRisk: sim.maxPop >= 50, kinds: [sim.temp <= 0 ? '눈' : '비'] },
            { hours: 12, hasPrecipitation: sim.maxPop >= 80, hasRisk: sim.maxPop >= 50, kinds: [sim.temp <= 0 ? '눈' : '비'] }
          ]
        }
      }
    },
    wrn: buildWarningSummary(sim.warnings || [])
  };
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

// 감시 상태 요약은 [⚙ 설정] 패널 내부 상단에 직관적으로 표시!
function updateMonitorStatusBar() {
  const dot = $('wakeDot');
  const txt = $('statusSummaryText');
  if (!dot || !txt) return;
  dot.classList.toggle('active', settings.wakeLock);
  const parts = [
    settings.wakeLock ? '👁️ 계속 켜두기 작동 중' : '👁️ 절전 기본',
    settings.sound ? '🔔 알림 소리 ON' : '🔕 소리 OFF',
    settings.sortRisk ? '위험지역 정렬됨' : '기본순서'
  ];
  txt.textContent = parts.join(' · ');
}

// 인앱 특보/위험 변동 토스트 배너 (요구사항 5)
let toastTargetPlace = null;
export function showAlertToast(place, badgeLabel, message, isClear = false) {
  const toast = $('alertToast');
  if (!toast) return;
  toastTargetPlace = place;
  toast.classList.toggle('theme-clear', isClear);
  $('toastBadge').textContent = badgeLabel;
  $('toastText').textContent = message;
  toast.hidden = false;
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

// 위험도 점수 계산 (위험 지역 상단 우선 정렬용)
function placeDangerScore(p) {
  const rec = getEffectiveRecord(p);
  let score = 0;
  if (rec.wrn?.count > 0) {
    score += rec.wrn.top.level === '경보' ? 1000 : 500;
    score += Math.max(0, 50 - (rec.wrn.top.priorityScore % 100));
  }
  const iceRank = rec.w?.ice?.rank || 0;
  const floodRank = rec.w?.ice?.flood?.rank || 0;
  score += Math.max(iceRank, floodRank) * 200;
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
 * 직관적 강수 시간대 요약 생성 ("19:00 ~ 23:00 강수예상" 형식)
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
    return { mainText: '기상청 예보 연동 중', roadText, shortMapText: '예보 연동', active: false };
  }
  if (a.now?.wet) {
    const ed = a.end ? a.end.time.slice(11, 16) : null;
    return {
      mainText: ed ? `${icon} 현재${tilde}${ed} ${a.now.type}중` : `${icon} 현재 ${a.now.type}중(지속)`,
      roadText,
      shortMapText: ed ? `현재~${ed} ${a.now.type}` : `현재 ${a.now.type}중`,
      active: true
    };
  }
  if (a.start) {
    const st = a.start.time.slice(11, 16);
    const ed = a.end ? a.end.time.slice(11, 16) : null;
    return {
      mainText: ed ? `${icon} ${st}${tilde}${ed} ${kindWord}` : `${icon} ${st}${tilde}지속 ${kindWord}`,
      roadText,
      shortMapText: ed ? `${st.slice(0, 2)}~${ed.slice(0, 2)}시 비` : `${st.slice(0, 2)}시~ 비`,
      active: true
    };
  }
  if (a.horizons?.some(h => h.hasRisk)) {
    return {
      mainText: '◇ 12h 강수 가능성',
      roadText,
      shortMapText: '강수가능',
      active: false
    };
  }
  return {
    mainText: '☀ 12h 무강수 예보',
    roadText,
    shortMapText: '무강수',
    active: false
  };
}

function updateUnifiedGlobalStamp() {
  let latestStr = null;
  for (const p of places) {
    const r = getEffectiveRecord(p);
    const candidate = r.o?.time || r.w?.current?.time;
    if (candidate && (!latestStr || candidate > latestStr)) latestStr = candidate;
  }
  const stampFormatted = latestStr ? fmt(latestStr) : fmt(new Date(Date.now() + 9 * 3600000).toISOString());
  $('globalStamp').textContent = `기준 자료: ${stampFormatted} · 5분마다 자동 갱신 (모든 카드 통합 기준 시각)`;
  return stampFormatted;
}

/**
 * 광주대구선(14번 노선) 8개 관심지역 & 도로기상관측소 미니맵 렌더링
 * 2단 정렬 콜아웃 레일(상단 4개·하단 4개) + 실제 좌표 리더라인 구조로 어떤 해상도에서도 글자 겹침 0건 보장!
 */
function renderMiniMap() {
  const container = $('minimapContainer');
  const strip = $('roadStnStrip');
  if (!container) return;

  const minLon = 127.32, maxLon = 128.50;
  const minLat = 35.36, maxLat = 35.78;
  const W = 540, H = 236;
  // Highway curve occupies the middle band (y = 78 .. 158)
  const project = (lat, lon) => {
    const x = 38 + ((lon - minLon) / (maxLon - minLon)) * (W - 76);
    const y = 158 - ((lat - minLat) / (maxLat - minLat)) * 80;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };

  // 광주대구선(14번) 고속도로 선형 좌표열
  const routeWaypoints = [
    [35.416, 127.345],
    [35.475, 127.544],
    [35.483, 127.569],
    [35.538, 127.655],
    [35.533, 127.749],
    [35.566, 127.774],
    [35.549, 127.829],
    [35.637, 127.907],
    [35.687, 127.910],
    [35.707, 128.054],
    [35.706, 128.168],
    [35.725, 128.298],
    [35.765, 128.402],
    [35.697, 128.447]
  ];
  const polyPoints = routeWaypoints.map(([la, lo]) => project(la, lo).join(',')).join(' ');

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="광주대구고속도로 14번 노선 및 8개 관심지역 기상 미니맵">
    <defs>
      <linearGradient id="hwyGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#38b2ac" stop-opacity="0.85"/>
        <stop offset="50%" stop-color="#7fe3b3" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#63b3ed" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <!-- Top Header Band -->
    <rect x="0" y="0" width="${W}" height="24" fill="rgba(7, 24, 27, 0.55)"/>
    <rect x="10" y="4" width="96" height="16" rx="4" fill="#1b5e57" stroke="#4fd1c5" stroke-width="0.8"/>
    <text x="58" y="15" text-anchor="middle" fill="#e6fffa" font-size="9.5" font-weight="800">고속국도 12 · 노선 14</text>
    <text x="114" y="15.5" fill="#a8d5cf" font-size="10" font-weight="700">광주대구선 실시간 노면·기상 상황도</text>
    <text x="${W - 12}" y="15" text-anchor="end" fill="#81bfb7" font-size="9.5" font-weight="600">◀ 남원·함양  |  거창·고령·대구 ▶</text>

    <!-- Middle Corridor Band Guide Lines -->
    <line x1="20" y1="84" x2="${W - 20}" y2="84" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
    <line x1="20" y1="122" x2="${W - 20}" y2="122" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
    <line x1="20" y1="160" x2="${W - 20}" y2="160" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>

    <!-- Highway Corridor Glow & Line -->
    <polyline points="${polyPoints}" fill="none" stroke="rgba(127,227,179,0.20)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${polyPoints}" fill="none" stroke="url(#hwyGrad)" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
  `;

  // Plot Route 14 KMA Road Weather Stations as subtle diamond sensors on the highway
  const corridorStns = roadStations.filter(s => s.lon >= minLon && s.lon <= maxLon);
  for (const stn of corridorStns) {
    const [sx, sy] = project(stn.lat, stn.lon);
    const trTxt = stn.roadTemp !== null ? `노면 ${stn.roadTemp.toFixed(1)}°C` : '';
    svg += `<g class="stn-dot" transform="translate(${sx},${sy})">
      <title>[도로기상관측] ${stn.name} (${stn.stationType}, 고도 ${stn.elevation ?? '—'}m) ${trTxt}</title>
      <rect x="-2.8" y="-2.8" width="5.6" height="5.6" fill="#81e6d9" opacity="0.7" transform="rotate(45)"/>
    </g>`;
  }

  // Fixed non-overlapping 2-Rail Callout Slots (4 Top Rail, 4 Bottom Rail, sorted West-to-East)
  // Top Rail (y = 32): 함양중부, 거창, 합천군서북부, 고령군
  // Bottom Rail (y = 184): 남원, 함양, 거창군남부, 대구 달성군남부
  const slotMap = {
    '함양중부': { cx: 74, cy: 50, anchorY: 68 },
    '거창': { cx: 202, cy: 50, anchorY: 68 },
    '합천군서북부': { cx: 330, cy: 50, anchorY: 68 },
    '고령군': { cx: 458, cy: 50, anchorY: 68 },
    '남원': { cx: 74, cy: 204, anchorY: 186 },
    '함양': { cx: 202, cy: 204, anchorY: 186 },
    '거창군남부': { cx: 330, cy: 204, anchorY: 186 },
    '대구 달성군남부': { cx: 458, cy: 204, anchorY: 186 }
  };

  // Fallback slot assignment if user added custom places
  let customTopIdx = 0, customBotIdx = 0;

  places.forEach((p, idx) => {
    const [px, py] = project(Math.max(minLat, Math.min(maxLat, p.lat)), Math.max(minLon, Math.min(maxLon, p.lon)));
    const rec = getEffectiveRecord(p);
    const iceRank = rec.w?.ice?.rank || 0;
    const floodRank = rec.w?.ice?.flood?.rank || 0;
    const hasWrn = (rec.wrn?.count || 0) > 0;
    const isDanger = iceRank === 2 || floodRank === 2 || rec.wrn?.top?.level === '경보';
    const isWatch = !isDanger && (iceRank === 1 || floodRank === 1 || hasWrn || rec.w?.kma?.analysis?.now?.wet || rec.w?.kma?.analysis?.start);

    const fillCol = isDanger ? '#ef4444' : isWatch ? '#f59e0b' : '#10b981';
    const ringCol = isDanger ? 'rgba(239,68,68,0.38)' : isWatch ? 'rgba(245,158,11,0.35)' : 'rgba(16,185,129,0.28)';
    const tempVal = rec.o?.temp ?? rec.w?.current?.temp;
    const roadVal = rec.o?.roadTemp;
    const timing = rainTimingSummary(rec.w, rec.o);

    let slot = slotMap[p.name];
    if (!slot) {
      const isTop = idx % 2 === 0;
      const col = isTop ? (customTopIdx++ % 4) : (customBotIdx++ % 4);
      slot = {
        cx: 74 + col * 128,
        cy: isTop ? 50 : 204,
        anchorY: isTop ? 68 : 186
      };
    }

    const shortName = p.name.replace('대구 ', '');
    const roadPart = roadVal != null ? `노면 ${roadVal.toFixed(1)}°` : (p.site || '');
    const statusPart = hasWrn ? rec.wrn.top.title : timing.shortMapText;

    svg += `<g class="map-node" data-coord="${coord(p)}" style="cursor:pointer">
      <!-- Leader line from Highway GPS pin to Callout Box -->
      <line x1="${px}" y1="${py}" x2="${slot.cx}" y2="${slot.anchorY}" stroke="${fillCol}" stroke-width="1.3" stroke-dasharray="2.5,2.5" opacity="0.85"/>
      <!-- Highway GPS Pin -->
      <circle cx="${px}" cy="${py}" r="11" fill="${ringCol}"/>
      <circle cx="${px}" cy="${py}" r="6" fill="${fillCol}" stroke="#ffffff" stroke-width="1.8"/>
      <!-- Non-Overlapping Callout Card -->
      <g transform="translate(${slot.cx},${slot.cy})">
        <rect x="-58" y="-18" width="116" height="36" rx="7" fill="rgba(8, 25, 28, 0.94)" stroke="${fillCol}" stroke-width="1.4"/>
        <text x="0" y="-3" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800">${shortName} ${n(tempVal, 1)}°</text>
        <text x="0" y="11" text-anchor="middle" fill="#b5e8de" font-size="9.3" font-weight="650">${roadPart} · ${statusPart}</text>
      </g>
    </g>`;
  });

  svg += `</svg>`;
  container.innerHTML = svg;

  container.querySelectorAll('.map-node').forEach(node => {
    node.addEventListener('click', () => {
      const target = places.find(p => coord(p) === node.dataset.coord);
      if (!target) return;
      focusWindyOnPlace(target);
    });
    node.addEventListener('dblclick', () => {
      const target = places.find(p => coord(p) === node.dataset.coord);
      if (target) location.hash = detailURL(target);
    });
  });

  // 하단 도로기상관측소 컴팩트 그리드 (가로 스크롤바 없이 깔끔한 2열/4열 카드!)
  if (strip) {
    strip.replaceChildren();
    // 광주대구선 핵심 8개 도로기상관측소 우선 표출
    const priorityNames = ['남원주차장', '지리산휴', '번암교', '옥계1교', '함양', '죽산천교', '남상졸음', '거창휴', '양전교', '논공교', '논공휴'];
    const corridor = roadStations
      .filter(s => s.lon >= 127.3 && (s.temp !== null || s.roadTemp !== null))
      .sort((a, b) => a.lon - b.lon);

    const picked = corridor.filter(s => priorityNames.some(pn => s.name.includes(pn))).slice(0, 8);
    const listToShow = picked.length ? picked : corridor.slice(0, 8);

    for (const s of listToShow) {
      const chip = el('button', '', 'road-stn-chip');
      chip.type = 'button';

      const topRow = el('div', '', 'road-stn-top');
      const cleanName = s.name.replace('(도)', '');
      const elevStr = s.elevation && s.elevation >= 300 ? `(${s.elevation}m)` : s.stationType?.includes('결빙') ? '(교량)' : '';
      topRow.append(el('b', `${cleanName}${elevStr}`));

      const stateTxt = s.surfaceState || (s.stationType?.includes('결빙') ? '교량센서' : '건조');
      const isWarnState = s.surfaceCode >= 2 || (s.roadTemp !== null && s.roadTemp <= 1.0);
      topRow.append(el('span', stateTxt, 'road-stn-state' + (isWarnState ? ' warn' : '')));

      const valRow = el('div', '', 'road-stn-vals');
      const roadSpan = el('em', s.roadTemp !== null ? `노면 ${s.roadTemp.toFixed(1)}°C` : '노면 —');
      const airTxt = s.temp !== null ? ` · 기온 ${s.temp.toFixed(1)}°C` : ' · 교량결빙감시';
      valRow.append(roadSpan, document.createTextNode(airTxt));

      chip.append(topRow, valRow);
      chip.onclick = () => {
        windyState.lat = s.lat;
        windyState.lon = s.lon;
        windyState.detailLat = s.lat;
        windyState.detailLon = s.lon;
        windyState.label = `${s.name} (${s.lat.toFixed(3)}, ${s.lon.toFixed(3)})`;
        updateWindyIframe();
      };
      strip.append(chip);
    }
  }
}

function focusWindyOnPlace(p) {
  windyState.lat = Number((p.lat - 0.03).toFixed(3));
  windyState.lon = Number(p.lon.toFixed(3));
  windyState.detailLat = Number(p.lat.toFixed(3));
  windyState.detailLon = Number(p.lon.toFixed(3));
  windyState.label = `${p.name} · ${p.site || ''} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})`;
  updateWindyIframe();
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
  const img = new Image();
  img.alt = '기상청 공식 전국 강수 레이더 HSR 합성 영상';
  img.onload = () => box.replaceChildren(img);
  img.onerror = () => {
    const fallback = new Image();
    fallback.alt = '기상청 레이더 스냅샷 영상';
    fallback.onload = () => box.replaceChildren(fallback);
    fallback.onerror = () => {
      box.innerHTML = '<div class="radar-placeholder">레이더 영상을 불러오지 못했습니다. 서버 환경변수 KMA_SERVICE_KEY / KMA_RADAR_KEY 설정을 확인하세요.</div>';
    };
    fallback.src = './api/radar.png';
  };
  img.src = '/api/radar?t=' + (force ? Date.now() : Math.floor(Date.now() / 180000));
}

// 메인 대시보드(8개 지역 고밀도 카드 그리드) 렌더링 (요구사항 1, 2, 3)
export function board() {
  $('addBtnText').textContent = `지역 관리 (${places.length}/8)`;
  updateMonitorStatusBar();
  updateUnifiedGlobalStamp();

  const riskPlaces = places.filter(isRiskPlace);
  const extras = places.filter(isExtra);

  const mkFilterBtn = (label, id, extraCls = '') => {
    const b = el('button', label, extraCls);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!mobileMapView && filter === id));
    b.onclick = () => {
      filter = id;
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

  $('groups').replaceChildren(
    mkFilterBtn(`전체 ${places.length}`, 'all'),
    mkFilterBtn(isMob ? `⚠️ 특보·결빙 ${riskPlaces.length}` : `⚠️ 위험·특보 발효 ${riskPlaces.length}`, 'risk', 'grp-warn'),
    mkFilterBtn(`남원·함양·거창 ${extras.length}`, 'extra'),
    mapJumpBtn
  );

  let visible = filter === 'risk' ? riskPlaces : filter === 'extra' ? extras : [...places];
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
      const isDanger = iceRank === 2 || floodRank === 2 || wrn?.top?.level === '경보';
      const isWatch =
        !isDanger &&
        (iceRank === 1 || floodRank === 1 || hasWarning || w?.kma?.analysis?.now?.wet || w?.kma?.analysis?.start);

      const cardCls = ['regioncard', isDanger ? 'state-danger' : isWatch ? 'state-watch' : ''].filter(Boolean).join(' ');
      const a = el('a', '', cardCls);
      a.href = detailURL(p);

      // 1. 카드 상단 지역명 + 지연 배지 + 화살표
      const top = el('div', '', 'cardline');
      const topRight = el('span', '', 'cardline-right');
      if (w?.stale) topRight.append(el('span', '지연', 'stale-badge'));
      topRight.append(el('span', '↗'));
      top.append(el('h2', p.name), topRight);
      a.append(top);

      // 2. 대표 지점명 + 인라인 살얼음/수방 배지 + 특보 요약 배지
      const siteLine = el('div', '', 'site-line');
      siteLine.append(el('span', p.site || coord(p), 'site-name'));

      if (iceRank > 0) {
        const iceBadge = el('span', '', `badge-ice rank-${iceRank}`);
        iceBadge.append(
          el('span', `❄ 살얼음 ${w.ice.level}`, 'badge-full'),
          el('span', `❄${w.ice.level}`, 'badge-short')
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

      // 4. 직관적 비·눈 시간대("19:00 ~ 23:00 강수예상") + 우측 노면온도
      const timing = rainTimingSummary(w, o);
      const timingEl = el('div', '', 'rain-timing-chip' + (timing.active ? ' active-rain' : ''));
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
  $('quick').replaceChildren();
  if (missing.length && places.length < 8) {
    $('quick').append(el('b', '광주대구선 관심지역 빠른 추가:'));
    for (const p of missing) {
      const b = el('button', `＋ ${p.name}(${p.site})`);
      b.type = 'button';
      b.onclick = () => choose(p);
      $('quick').append(b);
    }
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

  const temp = o?.temp ?? w?.current?.temp;
  const hum = o?.humidity ?? w?.current?.humidity;
  const wind = o?.windSpeed ?? w?.current?.wind;
  $('place').textContent = p.site ? `${p.name} (${p.site})` : p.name;
  $('temp').textContent = `${n(temp, 1)}°`;
  $('condition').textContent = o?.description || summary(w?.current?.code);
  $('humidity').textContent = `상대습도 ${n(hum, 0)}% · 풍속 ${n(wind, 1)} m/s`;

  const roadParts = [];
  if (o?.roadStationName && Number.isFinite(o.roadTemp)) {
    roadParts.push(`🛣️ ${o.roadStationName} 광학 노면온도 ${o.roadTemp.toFixed(1)}°C (${o.surfaceState || '건조'})`);
  }
  if (o?.bridgeStationName && Number.isFinite(o.bridgeRoadTemp)) {
    roadParts.push(`🌉 결빙목표 ${o.bridgeStationName} 노면 ${o.bridgeRoadTemp.toFixed(1)}°C`);
  }
  $('roadSurfaceInfo').textContent = roadParts.join(' · ') || '기상청 도로기상관측망 연동 중';

  $('stamp').textContent = [
    o ? `${o.name} 관측 · ${n(o.distanceKm, 1)} km · ${fmt(o.time)}` : '',
    w?.current ? `모델 ${fmt(w.current.time)}` : '',
    o?.snowDepth != null ? `관측 적설 ${n(o.snowDepth, 1)} cm` : ''
  ].filter(Boolean).join('   /   ') || '자료 시각 확인 중';

  // 비·눈 시작~종료 전망 + 12시간 타임라인
  const a = w?.kma?.analysis;
  const kHours = w?.kma?.hours || [];
  if (a) {
    const st = a.start?.time?.slice(11, 16);
    const ed = a.end?.time?.slice(11, 16);
    $('rainStartText').textContent = a.now?.wet
      ? ed ? `현재 ~ ${ed} ${a.now.type} 관측중` : `현재 ${a.now.type} 관측중 (지속)`
      : st
      ? ed ? `${st} ~ ${ed} 강수예상` : `${st} ~ 지속 강수예상`
      : a.horizons?.some(h => h.hasRisk)
      ? '강수 가능성(≥50%) 있음'
      : '12시간 내 강수 신호 없음';
    $('rainStartSub').textContent = a.now?.wet
      ? '기상청 초단기실황 관측 기준'
      : '기상청 초단기·단기예보 12시간 병합 기준';

    $('rainEndText').textContent = ed
      ? `${ed}경 종료 추정`
      : st || a.now?.wet
      ? '12시간 이후까지 이어질 수 있음'
      : '해당 없음 (무강수)';
    $('rainEndSub').textContent = a.end ? a.end.rule : '연속 2시간 무강수 예보 시 종료 시각 추정';

    $('horizonBadges').replaceChildren(
      ...(a.horizons || []).map(h => {
        const cls = h.hasPrecipitation ? 'wet' : h.hasRisk ? 'risk' : 'clear';
        const lbl = h.hasPrecipitation ? (h.kinds.join('·') || '비·눈') + ' 예상' : h.hasRisk ? '강수 가능성' : '신호 없음';
        const d = el('div', '', `h-badge ${cls}`);
        d.append(el('span', `향후 ${h.hours}시간`), el('strong', lbl));
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
      slot.append(
        el('b', kh.time.slice(11, 13) + '시'),
        el('span', kh.wet ? kh.type : kh.risk ? `${kh.chance}%` : `${kh.temp}°`)
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

  // 도로 살얼음 전망 & 제설 3단계 역산 타임라인
  const iceLevel = w && !w.stale ? w.ice.level : '판단 보류';
  const iceRank = w?.ice?.rank || 0;
  $('ice').textContent = iceLevel;
  $('ice').className = `rank-${iceRank}`;
  $('iceBadgePill').textContent = iceRank === 2 ? '❄ 주의 (최고단계)' : iceRank === 1 ? '❄ 관심 단계' : '❄ 신호 없음';
  $('reason').textContent = w && !w.stale ? w.ice.reason : '최신 예보가 있어야 기온과 노면 수분 조건을 함께 판단할 수 있습니다.';

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

  const guideContainer = $('actionGuides');
  guideContainer.replaceChildren();
  if (w?.ice?.snowActions?.length) {
    for (const sa of w.ice.snowActions) {
      guideContainer.append(el('div', sa.text, `guide-banner rank-${sa.rank}`));
    }
  } else {
    guideContainer.append(
      el(
        'div',
        '🔑 [제설차 예열·사전살포 기준] 강설·결빙 예상 3시간 전(예비살포 1시간 전) 제설차 시동·살포기 유압 예열 → 1~2시간 전 습염 사전 살포',
        'guide-banner'
      )
    );
  }
  if (w?.ice?.flood?.guide) {
    guideContainer.append(el('div', w.ice.flood.guide, 'guide-banner flood'));
  }
  if (w?.ice?.windAlert?.guide) {
    guideContainer.append(el('div', w.ice.windAlert.guide, 'guide-banner rank-1'));
  }

  // 기상특보 발효 및 해제 예정 현황
  $('detailWrnCount').textContent = wrn?.count ? `${wrn.count}건 발효중` : '특보 없음';
  const wrnBox = $('warnings');
  wrnBox.replaceChildren();
  if (wrn?.count) {
    const listWrap = el('div', '', 'wrn-list-box');
    for (const item of wrn.tooltipLines) {
      const card = el('div', '', 'wrn-item-card');
      card.append(
        el('strong', `[${item.rank}순위] ${item.title}`),
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
    o ? `도로기상관측(${o.name})` : '관측 연동 중',
    w?.kma ? '기상청 초단기·단기예보' : '',
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

async function pollWarnings() {
  await Promise.allSettled(
    targets().map(async p => {
      const r = record(p);
      if (r.checking || Date.now() - r.checked < 50000) return;
      r.checking = true;
      try {
        r.wrn = await fetchPlaceWarnings(p);
      } catch {}
      r.checking = false;
      r.checked = Date.now();
    })
  );
  checkRiskDiffs();
  render();
}

export async function refresh(force = false) {
  render();
  loadRoadStations(14).then(stns => {
    if (stns?.length) {
      roadStations = stns;
      if (!detailPlace) renderMiniMap();
    }
  }).catch(() => {});
  pollWarnings();

  const queue = [...targets()];
  if (detailPlace) {
    queue.sort((a, b) => Number(coord(b) === coord(detailPlace)) - Number(coord(a) === coord(detailPlace)));
  }

  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const r = record(p);
      if (r.busy || (!force && r.last && Date.now() - r.last < 240000)) continue;
      r.busy = true;
      try {
        try {
          r.o = await loadObservation(p);
        } catch {}
        try {
          r.w = await loadWeather(p, r.o);
          if (r.w?.rows) {
            loadProbabilities(p, r.w.rows).then(render).catch(() => {});
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
}

function route() {
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
  }
  refresh();
}

// 1:1 정방형(1080x1080) JPG 공유 모달
let currentShareBlob = null;
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
  const tag = isDetail ? detailPlace.name.replace(/\s+/g, '_') : '종합상황판_8개소';
  currentShareFilename = `기상브리핑_${tag}_1080x1080.jpg`;

  const url = URL.createObjectURL(blob);
  $('sharePreviewImg').src = url;
  $('shareDialogTitle').textContent = isDetail
    ? `📤 ${detailPlace.name} 상세 브리핑 (1080×1080 JPG)`
    : `📤 관심지역 8개소 종합 브리핑 (1080×1080 JPG)`;
  $('shareStatus').textContent = '';
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

// PC 레이아웃 모드 및 미니맵:Windy 분할 비율 적용
function applyLayoutAndSplit() {
  const container = $('overviewContainer');
  if (container) {
    container.classList.toggle('layout-stacked', settings.pcLayout !== 'split');
    container.classList.toggle('layout-fhd-split', settings.pcLayout === 'split');
  }
  document.documentElement.style.setProperty('--map-split', `${settings.mapSplitPct}%`);
  if ($('pcLayoutLabel')) {
    $('pcLayoutLabel').textContent = settings.pcLayout === 'split' ? '좌우 분할(FHD)' : '상하 기본';
  }
  document.querySelectorAll('.sp-btn[data-split]').forEach(btn => {
    btn.classList.toggle('active', Math.abs(Number(btn.dataset.split) - settings.mapSplitPct) <= 3);
  });
}

// 드래그 리사이즈 바(#mapSplitter) 이벤트 바인딩
function bindSplitterDrag() {
  const splitter = $('mapSplitter');
  const workspace = $('mapSection');
  if (!splitter || !workspace) return;

  let dragging = false;
  const onMove = clientX => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    if (rect.width < 500) return;
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    settings.mapSplitPct = Math.max(30, Math.min(68, pct));
    applyLayoutAndSplit();
  };

  splitter.addEventListener('mousedown', e => {
    e.preventDefault();
    dragging = true;
    document.body.classList.add('is-resizing');
  });
  window.addEventListener('mousemove', e => onMove(e.clientX));
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.classList.remove('is-resizing');
      persistSettings();
    }
  });

  // 빠른 비율 프리셋 버튼
  document.querySelectorAll('.sp-btn[data-split]').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.mapSplitPct = Number(btn.dataset.split);
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
  setPill('toggleSimMode', settings.simMode, '훈련시안 ON', '실제 데이터');
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
$('toggleSimMode').onclick = () => {
  settings.simMode = !settings.simMode;
  syncSettingsUI();
  render();
  if (settings.simMode) {
    const target = places.find(p => p.name === '거창군남부') || places[0];
    showAlertToast(
      target,
      '🚨 특보 상향 발효',
      '거창군남부(남상면) · 대설경보 변경 발효 (11-18 14:00)  해제예정: 11-19 오전(09:00) · 도로 살얼음 \'주의\' 단계 동시 발효 중',
      false
    );
    playAlertTone('warning');
  } else {
    $('alertToast').hidden = true;
  }
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
  $('tabWindy').classList.add('active');
  $('tabWindy').setAttribute('aria-selected', 'true');
  $('tabKmaRadar').classList.remove('active');
  $('tabKmaRadar').setAttribute('aria-selected', 'false');
  $('windyBox').hidden = false;
  $('kmaRadarBox').hidden = true;
};
$('tabKmaRadar').onclick = () => {
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
  if ($('dialog').open) $('dialog').close();
  filter = 'all';
  if (detailPlace && !existing) location.hash = 'overview';
  else if (existing) location.hash = detailURL(p);
  refresh();
}

$('restorePresetsBtn').onclick = () => {
  places = presets.slice(0, 8);
  persist();
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
      const res = await fetch('/api/search?name=' + encodeURIComponent(q), { signal: AbortSignal.timeout(7000) });
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
  $('notify').textContent = !('Notification' in window)
    ? '기기 알림 미지원'
    : Notification.permission === 'granted'
    ? '기기 알림 사용 중'
    : Notification.permission === 'denied'
    ? '기기 알림 차단됨'
    : '기기 알림 켜기';
}
$('notify').onclick = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
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

// 초기화
bindSplitterDrag();
syncSettingsUI();
syncWakeLock();
notificationState();
route();

setInterval(() => {
  if (!document.hidden) refresh();
}, 300000);
setInterval(() => {
  if (!document.hidden) pollWarnings();
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    syncWakeLock();
    refresh();
  }
});
