/**
 * 상세 페이지 상단 히어로(.hero) 기상·주야간·달령·태풍·도로살얼음(0~3단계) 연동 동적 연출 엔진
 * - 기상 상태(맑음/구름/흐림/안개/비/뇌우/태풍/눈/폭설) × 주야간(새벽/주간/황혼/야간)
 *   × 실제 음력 달령(삭·초승·상현·보름·하현·그믐) × 노면위험(0 평온 / 1 관심 / 2 주의 / 3 위험) × 한파
 * - Canvas 2D 입자 엔진(weather-particles.js: 비·물보라·눈·폭설·태풍 바람 유선·빙정)과 SVG 천체/구름/벡터도로 레이어 통합
 */
import { attachWeatherParticles, detachWeatherParticles } from './weather-particles.js';

const RAD = Math.PI / 180;
export const SYNODIC_MONTH_DAYS = 29.530588853;
const HERO_LAT = 35.68; // 광주대구선 중앙(함양~거창 부근) 위도
const HERO_LON = 127.91;

let sceneUidSeq = 0;

function nextUid() {
  sceneUidSeq = (sceneUidSeq + 1) % 1000000;
  return `hs${sceneUidSeq}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ICE_RANK_META = {
  0: {
    rank: 0,
    key: 'calm',
    label: '0단계 평온·건조',
    shortLabel: '0단계 평온',
    accent: '#10b981',
    railColor: '#34d399',
    edgeLine: '#e2e8f0',
    centerLine: '#f59e0b',
    beaconGlow: 'rgba(16, 185, 129, 0.35)',
    iceAlpha: 0
  },
  1: {
    rank: 1,
    key: 'watch',
    label: '1단계 살얼음 관심',
    shortLabel: '1단계 관심',
    accent: '#eab308',
    railColor: '#facc15',
    edgeLine: '#fde047',
    centerLine: '#f59e0b',
    beaconGlow: 'rgba(234, 179, 8, 0.55)',
    iceAlpha: 0.16
  },
  2: {
    rank: 2,
    key: 'caution',
    label: '2단계 살얼음 주의',
    shortLabel: '2단계 주의',
    accent: '#f97316',
    railColor: '#fb923c',
    edgeLine: '#fdba74',
    centerLine: '#fb923c',
    beaconGlow: 'rgba(249, 115, 22, 0.68)',
    iceAlpha: 0.34
  },
  3: {
    rank: 3,
    key: 'danger',
    label: '3단계 살얼음 위험',
    shortLabel: '3단계 위험',
    accent: '#ef4444',
    railColor: '#f87171',
    edgeLine: '#fca5a5',
    centerLine: '#f87171',
    beaconGlow: 'rgba(239, 68, 68, 0.85)',
    iceAlpha: 0.56
  }
};

export const DEFAULT_TYPHOON_INFO = {
  no: '제11호',
  name: '힌남노',
  pressureHpa: 945,
  maxWindMs: 45,
  note: '영남 내륙 강풍·호우 영향'
};

/**
 * Date 또는 명시적 달령(0~29.53일)으로부터 천문학적 달 위상 정보 계산
 */
export function getLunarInfo(dateInput = new Date(), overrideAgeDays = null) {
  let ageDays;
  let elongDeg;

  if (Number.isFinite(Number(overrideAgeDays)) && overrideAgeDays !== null && overrideAgeDays !== '') {
    ageDays = ((Number(overrideAgeDays) % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
    elongDeg = (ageDays / SYNODIC_MONTH_DAYS) * 360;
  } else {
    const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const ms = Number.isFinite(dt.getTime()) ? dt.getTime() : Date.now();
    const jd = ms / 86400000 + 2440587.5;
    const d = jd - 2451545.0;
    const lSunMean = (280.460 + 0.9856474 * d) % 360;
    const gSun = ((357.528 + 0.9856003 * d) % 360) * RAD;
    const lSun = lSunMean + 1.915 * Math.sin(gSun) + 0.020 * Math.sin(2 * gSun);
    const lMoonMean = (218.316 + 13.176396 * d) % 360;
    const gMoon = ((134.963 + 13.064993 * d) % 360) * RAD;
    const lMoon = lMoonMean + 6.289 * Math.sin(gMoon);
    elongDeg = ((lMoon - lSun) % 360 + 360) % 360;
    ageDays = (elongDeg / 360) * SYNODIC_MONTH_DAYS;
  }

  const phaseRatio = ageDays / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(phaseRatio * 2 * Math.PI)) / 2;
  const illuminationPct = Math.round(illumination * 100);

  let phaseKey = 'full';
  let phaseNameKo = '보름달';
  if (ageDays < 1.1 || ageDays >= 28.4) {
    phaseKey = 'new';
    phaseNameKo = '삭(그믐·신월)';
  } else if (ageDays < 6.4) {
    phaseKey = 'waxing_crescent';
    phaseNameKo = '초승달';
  } else if (ageDays < 8.4) {
    phaseKey = 'first_quarter';
    phaseNameKo = '상현달';
  } else if (ageDays < 13.8) {
    phaseKey = 'waxing_gibbous';
    phaseNameKo = '차오르는 달';
  } else if (ageDays < 16.0) {
    phaseKey = 'full';
    phaseNameKo = '보름달';
  } else if (ageDays < 21.3) {
    phaseKey = 'waning_gibbous';
    phaseNameKo = '기우는 달';
  } else if (ageDays < 23.3) {
    phaseKey = 'third_quarter';
    phaseNameKo = '하현달';
  } else {
    phaseKey = 'waning_crescent';
    phaseNameKo = '그믐달';
  }

  return {
    ageDays: Number(ageDays.toFixed(2)),
    lunarDay: Math.max(1, Math.min(30, Math.round(ageDays) + 1)),
    elongDeg: Number(elongDeg.toFixed(1)),
    phaseRatio,
    illumination,
    illuminationPct,
    phaseKey,
    phaseNameKo
  };
}

/**
 * 날짜(KST) 기준 대략 일출·일몰 시각 및 주야간 구분 계산
 */
export function getSolarScheduleKst(dateInput = new Date()) {
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const kstMs = (Number.isFinite(dt.getTime()) ? dt.getTime() : Date.now()) + 9 * 3600000;
  const kstDate = new Date(kstMs);
  const yearStart = Date.UTC(kstDate.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((kstMs - yearStart) / 86400000) + 1;

  const decl = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * RAD) * RAD;
  const latRad = HERO_LAT * RAD;
  const cosH = clamp(
    (Math.cos(90.833 * RAD) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl)),
    -0.99,
    0.99
  );
  const halfDayHours = (Math.acos(cosH) / RAD) / 15;
  const solarNoonKst = 12 + (135 - HERO_LON) / 15;
  const sunriseHour = Number((solarNoonKst - halfDayHours).toFixed(2));
  const sunsetHour = Number((solarNoonKst + halfDayHours).toFixed(2));
  const hourKst = kstDate.getUTCHours() + kstDate.getUTCMinutes() / 60;

  return { sunriseHour, sunsetHour, hourKst };
}

export function resolveDayPhase({ dayPhase = null, date = new Date(), hourKst = null } = {}) {
  if (dayPhase && ['dawn', 'day', 'dusk', 'night'].includes(dayPhase)) {
    return dayPhase;
  }
  const sched = getSolarScheduleKst(date);
  const h = Number.isFinite(Number(hourKst)) && hourKst !== null && hourKst !== ''
    ? ((Number(hourKst) % 24) + 24) % 24
    : sched.hourKst;

  if (h >= sched.sunriseHour - 0.85 && h <= sched.sunriseHour + 0.95) return 'dawn';
  if (h > sched.sunriseHour + 0.95 && h < sched.sunsetHour - 0.95) return 'day';
  if (h >= sched.sunsetHour - 0.95 && h <= sched.sunsetHour + 0.85) return 'dusk';
  return 'night';
}

export const WEATHER_LABELS = {
  clear: '맑음',
  partly_cloudy: '구름많음',
  overcast: '흐림',
  fog: '안개·박무',
  rain: '비·소나기',
  thunder: '천둥·번개',
  typhoon: '태풍·강풍',
  snow: '눈',
  heavy_snow: '폭설·눈보라'
};

export const DAY_PHASE_LABELS = {
  dawn: '새벽·여명',
  day: '주간(낮)',
  dusk: '해질녘·황혼',
  night: '야간(밤)'
};

/**
 * 구름·강수·안개 상태와 주야간·달령 조합으로부터 달/별/태양 가시성 물리 계수 도출
 */
export function computeCelestialVisibility(weather, dayPhase, lunarInfo) {
  const isNight = dayPhase === 'night';
  const isTwilight = dayPhase === 'dawn' || dayPhase === 'dusk';

  if (!isNight) {
    const sunOpacityMap = {
      clear: 1.0,
      partly_cloudy: 0.82,
      fog: 0.48,
      overcast: 0.14,
      rain: 0,
      thunder: 0,
      typhoon: 0,
      snow: 0,
      heavy_snow: 0
    };
    const sunOpacity = sunOpacityMap[weather] ?? 0;
    return {
      sunVisible: sunOpacity > 0,
      sunOpacity,
      sunDiffused: weather === 'partly_cloudy' || weather === 'fog' || weather === 'overcast',
      moonVisible: false,
      moonOpacity: 0,
      moonThroughCloud: false,
      starOpacity: isTwilight && weather === 'clear' ? 0.24 : 0,
      visibilityLabel: sunOpacity > 0
        ? (isTwilight ? '저고도 태양 · 여명/황혼광' : weather === 'clear' ? '맑은 태양' : '구름·안개 투과 햇살')
        : '강수 구름으로 태양 가려짐'
    };
  }

  if (weather === 'clear') {
    return {
      sunVisible: false,
      sunOpacity: 0,
      sunDiffused: false,
      moonVisible: true,
      moonOpacity: 1.0,
      moonThroughCloud: false,
      starOpacity: 1.0,
      visibilityLabel: `${lunarInfo.phaseNameKo}(${lunarInfo.illuminationPct}%) + 별빛 선명`
    };
  }

  if (weather === 'partly_cloudy') {
    return {
      sunVisible: false,
      sunOpacity: 0,
      sunDiffused: false,
      moonVisible: true,
      moonOpacity: 0.86,
      moonThroughCloud: true,
      starOpacity: 0.34,
      visibilityLabel: `반투명 구름 사이로 ${lunarInfo.phaseNameKo} 은은히 투과`
    };
  }

  if (weather === 'fog') {
    return {
      sunVisible: false,
      sunOpacity: 0,
      sunDiffused: false,
      moonVisible: lunarInfo.illumination >= 0.18,
      moonOpacity: lunarInfo.illumination >= 0.45 ? 0.36 : 0.2,
      moonThroughCloud: true,
      starOpacity: 0.06,
      visibilityLabel: '안개 속 흐릿하게 번지는 달무리'
    };
  }

  if (weather === 'overcast') {
    const showFaintHalo = lunarInfo.illumination >= 0.45;
    return {
      sunVisible: false,
      sunOpacity: 0,
      sunDiffused: false,
      moonVisible: showFaintHalo,
      moonOpacity: showFaintHalo ? 0.18 : 0,
      moonThroughCloud: true,
      starOpacity: 0,
      visibilityLabel: showFaintHalo ? '두꺼운 구름 뒤 희미한 달무리만 힌트' : '짙은 구름층으로 달·별 가려짐'
    };
  }

  return {
    sunVisible: false,
    sunOpacity: 0,
    sunDiffused: false,
    moonVisible: false,
    moonOpacity: 0,
    moonThroughCloud: false,
    starOpacity: 0,
    visibilityLabel: '강수·강설 먹구름으로 달·별 비노출'
  };
}

export function normalizeIceRank(input = {}) {
  if (input.iceRank !== undefined && input.iceRank !== null && Number.isFinite(Number(input.iceRank))) {
    return clamp(Math.round(Number(input.iceRank)), 0, 3);
  }
  if (input.blackIce) return 2;
  return 0;
}

export function formatTyphoonHeadline(typhoonInfo) {
  if (!typhoonInfo) return `${DEFAULT_TYPHOON_INFO.no} 태풍 ${DEFAULT_TYPHOON_INFO.name}`;
  if (typeof typhoonInfo === 'string') return typhoonInfo;
  const no = typhoonInfo.no || DEFAULT_TYPHOON_INFO.no;
  const name = typhoonInfo.name || DEFAULT_TYPHOON_INFO.name;
  return `${no} 태풍 ${name}`.trim();
}

/**
 * 입력 옵션을 정규화해 완전한 장면 명세 객체 생성
 */
export function resolveHeroScene(input = {}) {
  const date = input.date instanceof Date ? input.date : input.date ? new Date(input.date) : new Date();
  const dayPhase = resolveDayPhase({ dayPhase: input.dayPhase, date, hourKst: input.hourKst });
  const weather = WEATHER_LABELS[input.weather] ? input.weather : inferWeatherFromKma(input);
  const iceRank = normalizeIceRank(input);
  const blackIce = iceRank >= 1;
  const coldWave = Boolean(input.coldWave);
  const lunar = getLunarInfo(date, input.moonAgeDays);
  const celestial = computeCelestialVisibility(weather, dayPhase, lunar);
  const iceMeta = ICE_RANK_META[iceRank] || ICE_RANK_META[0];
  const typhoon = weather === 'typhoon'
    ? (input.typhoonInfo && typeof input.typhoonInfo === 'object'
      ? { ...DEFAULT_TYPHOON_INFO, ...input.typhoonInfo }
      : { ...DEFAULT_TYPHOON_INFO })
    : null;

  return {
    weather,
    weatherLabel: WEATHER_LABELS[weather],
    dayPhase,
    dayPhaseLabel: DAY_PHASE_LABELS[dayPhase],
    iceRank,
    iceMeta,
    blackIce,
    coldWave,
    typhoon,
    typhoonTitle: weather === 'typhoon' ? formatTyphoonHeadline(input.typhoonInfo || typhoon) : '',
    lunar,
    celestial,
    isSnowTerrain: weather === 'snow' || weather === 'heavy_snow'
  };
}

export function inferWeatherFromKma(input = {}) {
  if (input.typhoon || Number(input.wind) >= 17) return 'typhoon';
  if (input.lightning) return 'thunder';
  const p = String(input.pty ?? '0');
  const s = String(input.sky ?? '1');
  if (input.heavySnow || ((p === '3' || p === '7') && Number(input.snowAmount) >= 3)) return 'heavy_snow';
  if (p === '3' || p === '7' || p === '2' || p === '6') return 'snow';
  if (p === '1' || p === '4' || p === '5') return 'rain';
  if (input.fog || (Number(input.humidity) >= 95 && Number(input.wind) <= 1.2 && s !== '1')) return 'fog';
  if (s === '4') return 'overcast';
  if (s === '2' || s === '3') return 'partly_cloudy';
  return 'clear';
}

function buildMoonLitPath(r, phaseRatio) {
  const cosA = Math.cos(phaseRatio * 2 * Math.PI);
  if (phaseRatio < 0.02 || phaseRatio > 0.98) return '';
  if (Math.abs(phaseRatio - 0.5) < 0.02) {
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  }

  const rx = Math.abs(cosA) * r;
  const waxing = phaseRatio < 0.5;
  const outerSweep = waxing ? 1 : 0;

  if (rx < 0.25) {
    return `M 0 ${-r} A ${r} ${r} 0 0 ${outerSweep} 0 ${r} Z`;
  }

  const termSweep = waxing
    ? (phaseRatio < 0.25 ? 0 : 1)
    : (phaseRatio < 0.75 ? 0 : 1);

  return `M 0 ${-r} A ${r} ${r} 0 0 ${outerSweep} 0 ${r} A ${rx.toFixed(2)} ${r} 0 0 ${termSweep} 0 ${-r} Z`;
}

function renderStarsLayer(starOpacity) {
  if (starOpacity <= 0) return '';
  const stars = [
    [280, 26, 1.3, 't1', true], [340, 52, 0.9, 't2', false], [405, 22, 1.1, 't3', false],
    [458, 64, 1.4, 't1', false], [512, 34, 0.85, 't2', false], [568, 19, 1.5, 't3', true],
    [624, 58, 0.95, 't1', false], [678, 30, 1.15, 't2', false], [715, 76, 1.0, 't3', false],
    [758, 22, 1.35, 't1', false], [810, 48, 0.9, 't2', false], [862, 18, 1.4, 't3', true],
    [910, 52, 1.0, 't1', false], [948, 29, 1.2, 't2', false], [485, 92, 0.85, 't3', false],
    [594, 88, 1.05, 't2', false], [652, 108, 0.9, 't1', false], [742, 95, 1.25, 't3', false],
    [884, 86, 0.95, 't2', false], [928, 104, 1.1, 't1', false], [372, 94, 0.85, 't2', false],
    [795, 114, 0.9, 't1', false], [540, 125, 0.85, 't3', false], [428, 128, 1.0, 't2', false]
  ];
  const filtered = starOpacity < 0.6 ? stars.filter((_, i) => i % 2 === 0) : stars;

  const nodes = filtered.map(([x, y, r, anim, sparkle]) => {
    const circle = `<circle class="hs-star hs-star-${anim}" cx="${x}" cy="${y}" r="${r}" fill="#eef6ff"/>`;
    if (!sparkle) return circle;
    const arm = r * 3.1;
    return `${circle}<path class="hs-star hs-star-${anim}" d="M${x} ${y - arm} L${x + 0.55} ${y - 0.55} L${x + arm} ${y} L${x + 0.55} ${y + 0.55} L${x} ${y + arm} L${x - 0.55} ${y + 0.55} L${x - arm} ${y} L${x - 0.55} ${y - 0.55} Z" fill="#ffffff" opacity="0.88"/>`;
  }).join('');

  return `<svg class="hs-layer hs-stars" viewBox="0 0 980 200" preserveAspectRatio="xMaxYMin slice" style="opacity:${starOpacity}" aria-hidden="true">${nodes}</svg>`;
}

function renderSunLayer(scene, uid) {
  const { celestial, dayPhase, weather, coldWave } = scene;
  if (!celestial.sunVisible) return '';

  const isTwilight = dayPhase === 'dawn' || dayPhase === 'dusk';
  const lowPos = isTwilight;
  const cy = lowPos ? 26 : -4;
  const r = lowPos ? 26 : 24;
  const coreA = isTwilight ? '#ffd480' : coldWave ? '#fff6db' : '#fff0a8';
  const coreB = isTwilight ? (dayPhase === 'dusk' ? '#f97316' : '#fb923c') : coldWave ? '#bae6fd' : '#e4c96b';
  const haloColor = isTwilight ? 'rgba(251, 146, 60, 0.45)' : coldWave ? 'rgba(186, 230, 253, 0.36)' : 'rgba(250, 224, 130, 0.36)';
  const rayOpacity = celestial.sunDiffused ? 0.16 : 0.34;
  const blurRadius = weather === 'fog' ? 'filter:blur(3px);' : celestial.sunDiffused ? 'filter:blur(0.6px);' : '';

  const rays = !lowPos && weather === 'clear'
    ? `<g class="hs-sun-rays" stroke="${coreA}" stroke-width="1.4" stroke-linecap="round" opacity="${rayOpacity}">
        ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
          const rad = deg * RAD;
          const x1 = (Math.cos(rad) * (r + 6)).toFixed(1);
          const y1 = (cy + Math.sin(rad) * (r + 6)).toFixed(1);
          const x2 = (Math.cos(rad) * (r + (deg % 60 === 0 ? 15 : 10))).toFixed(1);
          const y2 = (cy + Math.sin(rad) * (r + (deg % 60 === 0 ? 15 : 10))).toFixed(1);
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
        }).join('')}
      </g>`
    : '';

  return `<div class="hs-celestial ${lowPos ? 'is-low' : ''} ${celestial.sunDiffused ? 'is-diffused' : ''}" style="opacity:${celestial.sunOpacity};${blurRadius}" aria-hidden="true">
    <svg viewBox="-72 -72 144 144" class="hs-orb-svg">
      <defs>
        <radialGradient id="${uid}sh">
          <stop offset="0%" stop-color="${haloColor}"/>
          <stop offset="52%" stop-color="${haloColor}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${haloColor}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="${uid}sc" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stop-color="${coreA}"/>
          <stop offset="100%" stop-color="${coreB}"/>
        </linearGradient>
      </defs>
      <circle cx="0" cy="${cy}" r="${weather === 'partly_cloudy' || weather === 'fog' ? 68 : 60}" fill="url(#${uid}sh)"/>
      ${rays}
      <circle cx="0" cy="${cy}" r="${r}" fill="url(#${uid}sc)"/>
    </svg>
  </div>`;
}

function renderMoonLayer(scene, uid) {
  const { celestial, lunar, weather } = scene;
  if (!celestial.moonVisible || celestial.moonOpacity <= 0) return '';

  const r = 24;
  const litPath = buildMoonLitPath(r, lunar.phaseRatio);
  const haloR = celestial.moonThroughCloud ? 70 : (36 + lunar.illumination * 30);
  const haloAlpha = (0.14 + lunar.illumination * 0.28) * (celestial.moonThroughCloud ? 1.15 : 1);
  const extraBlur = weather === 'fog' ? 'filter:blur(5px);' : weather === 'overcast' ? 'filter:blur(7px);' : celestial.moonThroughCloud ? 'filter:blur(0.7px);' : '';

  const moonShape = weather === 'overcast'
    ? `<circle cx="0" cy="0" r="${r * 1.15}" fill="rgba(214,228,245,0.45)"/>`
    : `<circle cx="0" cy="0" r="${r}" fill="rgba(165,186,214,0.13)" stroke="rgba(220,235,255,0.22)" stroke-width="0.9"/>
       ${litPath ? `
         <clipPath id="${uid}mc"><path d="${litPath}"/></clipPath>
         <circle cx="0" cy="0" r="${r}" fill="url(#${uid}mfill)" clip-path="url(#${uid}mc)"/>
         <g clip-path="url(#${uid}mc)" opacity="0.16" fill="#6b7f99">
           <circle cx="-6" cy="-7" r="6.2"/>
           <circle cx="8" cy="-4" r="4.5"/>
           <circle cx="4" cy="9" r="7.2"/>
           <circle cx="-9" cy="6" r="3.4"/>
           <ellipse cx="-1" cy="1" rx="4.8" ry="3.2" transform="rotate(-22)"/>
         </g>` : ''}`;

  return `<div class="hs-celestial ${celestial.moonThroughCloud ? 'is-veiled' : ''}" style="opacity:${celestial.moonOpacity};${extraBlur}" aria-hidden="true">
    <svg viewBox="-72 -72 144 144" class="hs-orb-svg">
      <defs>
        <radialGradient id="${uid}mh">
          <stop offset="0%" stop-color="rgba(232,242,255,${haloAlpha.toFixed(2)})"/>
          <stop offset="48%" stop-color="rgba(186,212,245,${(haloAlpha * 0.42).toFixed(2)})"/>
          <stop offset="100%" stop-color="rgba(186,212,245,0)"/>
        </radialGradient>
        <radialGradient id="${uid}mfill" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#fffdf4"/>
          <stop offset="65%" stop-color="#f2ecda"/>
          <stop offset="100%" stop-color="#cfd9e6"/>
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r="${haloR.toFixed(1)}" fill="url(#${uid}mh)"/>
      ${moonShape}
    </svg>
  </div>`;
}

/**
 * 고해상도 기상청 태풍 심볼 SVG (고정밀 캘리그라피 나선 구름 + 눈 + 기압파동) + 태풍 정보 배지
 */
function renderTyphoonEmblemLayer(scene, uid) {
  if (scene.weather !== 'typhoon') return '';
  const info = scene.typhoon || DEFAULT_TYPHOON_INFO;
  const subParts = [];
  if (info.pressureHpa) subParts.push(`${info.pressureHpa} hPa`);
  if (info.maxWindMs) subParts.push(`최대풍속 ${info.maxWindMs} m/s`);
  const headline = formatTyphoonHeadline(info);
  const subLine = subParts.join(' · ') || info.note || '강풍·호우 주의';

  // 정사각형 SVG로 진원 비율 완벽 유지
  return `<div class="hs-typhoon-cluster" aria-hidden="true">
    <svg class="hs-typhoon-svg" viewBox="-72 -72 144 144">
      <defs>
        <radialGradient id="${uid}tyGlow">
          <stop offset="0%" stop-color="rgba(56, 189, 248, 0.48)"/>
          <stop offset="55%" stop-color="rgba(14, 165, 233, 0.16)"/>
          <stop offset="100%" stop-color="rgba(14, 165, 233, 0)"/>
        </radialGradient>
        <linearGradient id="${uid}tyArm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f0f9ff"/>
          <stop offset="55%" stop-color="#7dd3fc"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <circle cx="0" cy="0" r="64" fill="url(#${uid}tyGlow)"/>
      <circle class="hs-ty-wave" cx="0" cy="0" r="46" fill="none" stroke="rgba(125,211,252,0.34)" stroke-width="1.2" stroke-dasharray="10 7"/>
      <g class="hs-typhoon-arms">
        <path d="M0,-13 C18,-13 33,-2 38,16 C40,26 36,36 28,44 C31,26 23,12 10,7 C10,2 6,-3 0,-5 Z" fill="url(#${uid}tyArm)"/>
        <path d="M0,13 C-18,13 -33,2 -38,-16 C-40,-26 -36,-36 -28,-44 C-31,-26 -23,-12 -10,-7 C-10,-2 -6,3 0,5 Z" fill="url(#${uid}tyArm)"/>
        <path d="M-44,6 C-46,24 -32,42 -12,48 C-26,38 -32,24 -28,10 Z" fill="rgba(186,230,253,0.45)"/>
        <path d="M44,-6 C46,-24 32,-42 12,-48 C26,-38 32,-24 28,-10 Z" fill="rgba(186,230,253,0.45)"/>
      </g>
      <circle cx="0" cy="0" r="13.5" fill="rgba(15, 23, 42, 0.72)" stroke="#e0f2fe" stroke-width="2.2"/>
      <circle cx="0" cy="0" r="6.2" fill="#38bdf8" opacity="0.85"/>
    </svg>
    <div class="hs-typhoon-tag">
      <strong>🌀 ${esc(headline)}</strong>
      <span>${esc(subLine)}</span>
    </div>
  </div>`;
}

function renderCloudsLayer(scene, uid) {
  const { weather, dayPhase, celestial, lunar } = scene;
  const isNight = dayPhase === 'night';
  const isTwilight = dayPhase === 'dawn' || dayPhase === 'dusk';

  if (weather === 'clear') return '';

  const stormWeather = ['rain', 'thunder', 'typhoon', 'snow', 'heavy_snow'].includes(weather);
  const topColor = stormWeather
    ? (isNight ? '#213142' : '#4a5f70')
    : weather === 'overcast'
      ? (isNight ? '#2b3e4f' : '#778f9c')
      : isTwilight
        ? '#b89496'
        : isNight
          ? '#6f87a3'
          : '#e7f2f6';
  const botColor = stormWeather
    ? (isNight ? '#111b26' : '#2d3f4d')
    : weather === 'overcast'
      ? (isNight ? '#1c2a37' : '#536976')
      : isTwilight
        ? '#6f5c6b'
        : isNight
          ? '#3b4f68'
          : '#aac5cf';

  const primaryOpacity = weather === 'partly_cloudy'
    ? (isNight ? 0.44 : 0.48)
    : weather === 'fog'
      ? 0.28
      : weather === 'overcast'
        ? (isNight ? 0.78 : 0.74)
        : 0.84;

  const moonCloudBloom = isNight && weather === 'partly_cloudy' && celestial.moonVisible && lunar.illumination > 0.15
    ? `<radialGradient id="${uid}mbloom" cx="84%" cy="40%" r="22%">
         <stop offset="0%" stop-color="#f5f9ff" stop-opacity="${(0.22 + lunar.illumination * 0.3).toFixed(2)}"/>
         <stop offset="55%" stop-color="#c2d8f2" stop-opacity="${(0.10 + lunar.illumination * 0.16).toFixed(2)}"/>
         <stop offset="100%" stop-color="#c2d8f2" stop-opacity="0"/>
       </radialGradient>`
    : '';

  const cloudPathBack = 'M250,74 C272,56 306,56 326,72 C342,60 368,62 380,76 C398,74 418,86 414,100 L236,100 C226,88 234,76 250,74 Z';
  const cloudPathAcrossMoon = 'M588,58 C614,34 662,32 692,52 C714,34 756,34 786,52 C814,40 848,46 864,66 C884,68 896,82 888,96 L572,96 C558,82 568,62 588,58 Z';
  const overcastMidCloud = weather === 'overcast'
    ? `<path class="hs-cloud-drift-slow" d="M310,82 C345,54 404,52 440,74 C478,48 548,46 588,72 C628,50 694,52 732,76 C776,56 842,58 886,84 L886,106 L296,106 Z" fill="url(#${uid}cg)" opacity="0.58"/>`
    : '';
  const stormDeck = (stormWeather || weather === 'overcast')
    ? `<path class="hs-cloud-drift-slow" d="M180,-12 L920,-12 L920,62 C882,78 832,74 796,60 C754,76 704,76 664,58 C620,78 558,76 520,56 C474,76 412,72 374,56 C322,74 252,70 212,50 Z" fill="url(#${uid}cg)" opacity="${weather === 'overcast' ? 0.72 : 0.85}"/>`
    : '';

  return `<svg class="hs-layer hs-clouds" viewBox="0 0 900 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${topColor}"/>
        <stop offset="100%" stop-color="${botColor}"/>
      </linearGradient>
      ${moonCloudBloom}
    </defs>
    ${stormDeck}
    ${overcastMidCloud}
    <g class="hs-cloud-drift-a" opacity="${(primaryOpacity * 0.72).toFixed(2)}">
      <path d="${cloudPathBack}" fill="url(#${uid}cg)"/>
      <path d="M445,42 C464,26 498,28 514,44 C532,34 558,38 568,54 L430,54 C422,46 431,42 445,42 Z" fill="url(#${uid}cg)"/>
    </g>
    <g class="hs-cloud-drift-b" opacity="${primaryOpacity.toFixed(2)}">
      <path d="${cloudPathAcrossMoon}" fill="url(#${uid}cg)"/>
      ${moonCloudBloom ? `<ellipse cx="758" cy="70" rx="155" ry="66" fill="url(#${uid}mbloom)"/>` : ''}
    </g>
  </svg>`;
}

/**
 * 번개 볼트, 안개 띠, 성애 프레임 등 SVG 고정밀 기상 오버레이 (입자는 Canvas 엔진이 담당)
 */
function renderWeatherFxLayer(scene, uid) {
  const { weather, dayPhase, coldWave } = scene;
  const isNight = dayPhase === 'night';
  const parts = [];

  if (weather === 'thunder') {
    parts.push(`
      <g class="hs-lightning-group">
        <ellipse class="hs-thunder-glow" cx="765" cy="75" rx="185" ry="74" fill="url(#${uid}tflash)"/>
        <path class="hs-bolt hs-bolt-1" d="M782,30 L752,84 L775,84 L748,144 L798,70 L772,70 Z" fill="#fde047" stroke="#fef9c3" stroke-width="1.3" stroke-linejoin="round"/>
        <path class="hs-bolt hs-bolt-2" d="M624,42 L603,82 L619,82 L599,126 L637,74 L618,74 Z" fill="#fef08a" opacity="0.86"/>
      </g>
    `);
  }

  if (weather === 'fog') {
    const fogTint = isNight ? '#b9cedb' : '#e6f1f2';
    parts.push(`
      <g class="hs-fx-fog">
        <rect x="200" y="90" width="780" height="30" rx="15" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-1"/>
        <rect x="250" y="122" width="740" height="34" rx="17" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-2"/>
        <rect x="190" y="152" width="800" height="44" rx="22" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-3"/>
        <ellipse cx="670" cy="146" rx="290" ry="38" fill="${fogTint}" opacity="0.18" filter="url(#${uid}blurSoft)"/>
      </g>
    `);
  }

  if (coldWave) {
    parts.push(`
      <g class="hs-fx-cold" aria-hidden="true">
        <path d="M956,0 C936,24 912,32 886,36 M956,0 C928,8 906,24 892,50 M938,16 L916,12 M922,28 L926,48 M904,34 L888,22 M956,42 C944,58 934,74 934,94" fill="none" stroke="rgba(224,242,254,0.52)" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M956,196 C930,174 904,166 876,166 M956,196 C936,168 920,152 908,130 M936,180 L912,184" fill="none" stroke="rgba(186,230,253,0.44)" stroke-width="1.4" stroke-linecap="round"/>
        <g stroke="#e0f2fe" stroke-width="1.2" stroke-linecap="round">
          <g transform="translate(874, 24)" opacity="0.78"><path d="M0,-8 V8 M-7,-4 L7,4 M-7,4 L7,-4"/></g>
          <g transform="translate(918, 68)" opacity="0.65"><path d="M0,-6 V6 M-5.2,-3 L5.2,3 M-5.2,3 L5.2,-3"/></g>
          <g transform="translate(540, 44)" opacity="0.48"><path d="M0,-4.5 V4.5 M-4,-2.2 L4,2.2 M-4,2.2 L4,-2.2"/></g>
        </g>
      </g>
    `);
  }

  if (!parts.length) return '';

  return `<svg class="hs-layer hs-fx" viewBox="0 0 960 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="${uid}tflash">
        <stop offset="0%" stop-color="#fef08a" stop-opacity="0.48"/>
        <stop offset="55%" stop-color="#a78bfa" stop-opacity="0.20"/>
        <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${uid}fogGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#dceaf0" stop-opacity="0"/>
        <stop offset="25%" stop-color="#dceaf0" stop-opacity="0.22"/>
        <stop offset="55%" stop-color="#e9f3f7" stop-opacity="0.30"/>
        <stop offset="85%" stop-color="#dceaf0" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#dceaf0" stop-opacity="0"/>
      </linearGradient>
      <filter id="${uid}blurSoft"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    ${parts.join('')}
  </svg>`;
}

function getTerrainColors(scene) {
  const { weather, dayPhase, coldWave, iceRank, isSnowTerrain } = scene;
  if (isSnowTerrain) {
    return dayPhase === 'night'
      ? { back: '#243c50', front: '#182b3b', cap: '#d9ecfb', capAlpha: 0.72 }
      : { back: '#4d6f85', front: '#355368', cap: '#f1f7fc', capAlpha: 0.85 };
  }
  if (iceRank >= 2 || coldWave) {
    return dayPhase === 'night'
      ? { back: '#152e46', front: '#0e2135', cap: '#bae6fd', capAlpha: 0.42 }
      : { back: '#2d5c78', front: '#1f445c', cap: '#dff4ff', capAlpha: 0.36 };
  }
  if (dayPhase === 'night') {
    return weather === 'thunder'
      ? { back: '#1c1f36', front: '#121526', cap: '#818cf8', capAlpha: 0.14 }
      : { back: '#183344', front: '#0f2331', cap: '#93c5fd', capAlpha: 0.15 };
  }
  if (dayPhase === 'dawn' || dayPhase === 'dusk') {
    return { back: '#4d4c63', front: '#2f3447', cap: '#fed7aa', capAlpha: 0.24 };
  }
  if (weather === 'overcast' || weather === 'fog' || weather === 'rain') {
    return { back: '#3d5860', front: '#294047', cap: '#cbd5e1', capAlpha: 0.12 };
  }
  return { back: '#4e8679', front: '#2f655f', cap: '#d9f2cc', capAlpha: 0.16 };
}

/**
 * 산악 능선 + 실제 고속도로 아스팔트 벡터(원근 노면 · 황색 중앙선 · 차선 점선 · 양쪽 갓길 실선 · 교각 · 0~3단계 살얼음 색상 연동)
 */
function renderTerrainLayer(scene, uid) {
  const t = getTerrainColors(scene);
  const ice = scene.iceMeta || ICE_RANK_META[0];
  const isWet = ['rain', 'thunder', 'typhoon'].includes(scene.weather);
  const backPts = '0,162 110,136 190,140 310,94 375,112 490,62 542,84 628,48 696,76 804,34 960,72 960,180 0,180';
  const frontPts = '0,174 140,152 245,156 355,114 435,130 565,84 652,108 755,66 862,88 960,64 960,180 0,180';
  const ridgeCap = 'M310,94 L375,112 L490,62 L542,84 L628,48 L696,76 L804,34 L960,72';

  // 원근 곡선 고속도로 (산 능선 앞 우측 하단 490..960을 가로질러 전경 하단으로 확장)
  // 상단 갓길: M495,155 Q720,124 960,121
  // 하단 갓길: M585,180 Q765,157 960,156
  // 중심 황색선: M532,170 Q742,140 960,138.5
  const asphaltTop = scene.iceRank >= 3 ? '#1a2736' : scene.iceRank === 2 ? '#1f2833' : '#222933';
  const asphaltBot = scene.iceRank >= 3 ? '#101d2b' : '#171c23';

  // 아스팔트 위 물기/얼음/적설 질감 오버레이
  const roadIcePatch = ice.iceAlpha > 0
    ? `<path d="M510,166 Q735,134 960,130 L960,148 Q750,151 560,180 Z" fill="url(#${uid}roadIceGrad)" opacity="${ice.iceAlpha.toFixed(2)}"/>
       <g class="hs-ice-sheen" stroke="#e0f2fe" stroke-width="1.2" stroke-linecap="round" opacity="${Math.min(0.92, ice.iceAlpha + 0.3).toFixed(2)}">
         <g transform="translate(705,153)"><path d="M0,-4.5 V4.5 M-3.9,-2.2 L3.9,2.2 M-3.9,2.2 L3.9,-2.2"/></g>
         <g transform="translate(815,141)"><path d="M0,-5.5 V5.5 M-4.8,-2.7 L4.8,2.7 M-4.8,2.7 L4.8,-2.7"/></g>
         <g transform="translate(902,138)"><path d="M0,-5 V5 M-4.3,-2.5 L4.3,2.5 M-4.3,2.5 L4.3,-2.5"/></g>
       </g>`
    : isWet
      ? `<path d="M510,166 Q735,134 960,130 L960,148 Q750,151 560,180 Z" fill="rgba(147,197,253,0.12)"/>`
      : '';

  const roadSnowBank = scene.isSnowTerrain
    ? `<path d="M492,155 Q718,123 960,120 L960,125 Q720,128 498,158 Z" fill="rgba(241,245,249,0.75)"/>
       <path d="M578,180 Q762,156 960,155 L960,161 Q765,161 595,180 Z" fill="rgba(241,245,249,0.68)"/>`
    : '';

  // 갓길/난간 델리네이터 비콘(0:초록, 1:노랑, 2:주황, 3:빨강)
  const beacons = [
    [605, 141], [678, 132], [752, 126], [832, 122], [912, 120]
  ].map(([bx, by]) => `
    <circle cx="${bx}" cy="${by}" r="${scene.iceRank >= 2 ? 4.8 : 3.4}" fill="${ice.beaconGlow}"/>
    <circle cx="${bx}" cy="${by}" r="${scene.iceRank >= 2 ? 2.1 : 1.5}" fill="${ice.railColor}"/>
  `).join('');

  return `<svg class="hs-layer hs-terrain" viewBox="0 0 960 180" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}tb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${t.back}"/>
        <stop offset="100%" stop-color="${t.front}"/>
      </linearGradient>
      <linearGradient id="${uid}roadAsph" x1="0" y1="0" x2="1" y2="0.4">
        <stop offset="0%" stop-color="${asphaltTop}"/>
        <stop offset="100%" stop-color="${asphaltBot}"/>
      </linearGradient>
      <linearGradient id="${uid}roadIceGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.15"/>
        <stop offset="45%" stop-color="#bae6fd" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#7dd3fc" stop-opacity="0.48"/>
      </linearGradient>
    </defs>

    <!-- 2중 산악 능선 -->
    <polygon points="${backPts}" fill="url(#${uid}tb)" opacity="0.88"/>
    <path d="${ridgeCap}" fill="none" stroke="${t.cap}" stroke-width="${scene.isSnowTerrain ? 4.2 : 1.6}" stroke-linejoin="round" opacity="${t.capAlpha}"/>
    <polygon points="${frontPts}" fill="${t.front}" opacity="0.95"/>

    <!-- 12호선 고가교각 · 사면 성토 -->
    <g stroke="rgba(15, 23, 42, 0.55)" stroke-width="4">
      <line x1="658" y1="168" x2="658" y2="180"/>
      <line x1="742" y1="161" x2="742" y2="180"/>
      <line x1="830" y1="158" x2="830" y2="180"/>
      <line x1="916" y1="156" x2="916" y2="180"/>
    </g>

    <!-- 콘크리트 갓길 외곽 방호벽 -->
    <path d="M490,157 Q720,122 960,118 L960,162 Q768,162 595,180 L488,180 Z" fill="#334155" opacity="0.92"/>

    <!-- 실제 아스팔트 노면 -->
    <path d="M496,158 Q722,125 960,121 L960,156 Q766,157 586,180 L496,180 Z" fill="url(#${uid}roadAsph)"/>

    ${roadIcePatch}
    ${roadSnowBank}

    <!-- 양쪽 갓길 실선 (노면 경계선) -->
    <path d="M502,160 Q724,128 960,124" fill="none" stroke="${ice.edgeLine}" stroke-width="1.35" opacity="0.88"/>
    <path d="M582,179 Q766,155 960,154" fill="none" stroke="${ice.edgeLine}" stroke-width="1.6" opacity="0.92"/>

    <!-- 상·하행 차선 점선 -->
    <path d="M518,165 Q732,134 960,130.5" fill="none" stroke="rgba(248,250,252,0.52)" stroke-width="1.15" stroke-dasharray="11 10"/>
    <path d="M558,174 Q752,147 960,145.5" fill="none" stroke="rgba(248,250,252,0.58)" stroke-width="1.25" stroke-dasharray="14 11"/>

    <!-- 도로 황색 중심선 -->
    <path d="M538,169.5 Q742,140.5 960,138" fill="none" stroke="${ice.centerLine}" stroke-width="1.75" opacity="0.9"/>

    <!-- 0·1·2·3단계 살얼음 직관 방호벽 컬러 라인 + 교량 경고 비콘 -->
    <path class="${scene.iceRank >= 3 ? 'hs-ice-sheen' : ''}" d="M494,157 Q720,123 960,119" fill="none" stroke="${ice.accent}" stroke-width="${scene.iceRank >= 2 ? 2.6 : 1.8}" opacity="0.95"/>
    <path d="M594,180 Q768,159 960,158" fill="none" stroke="${ice.accent}" stroke-width="${scene.iceRank >= 2 ? 2.8 : 2.0}" opacity="0.95"/>
    ${beacons}
  </svg>`;
}

/**
 * .horizon 내부에 삽입할 전체 동적 기상·천체·벡터도로 SVG + UI 태그 마크업 생성
 */
export function renderHeroSceneMarkup(input = {}) {
  const scene = input.celestial && input.lunar && input.iceMeta ? input : resolveHeroScene(input);
  const uid = nextUid();
  const isNight = scene.dayPhase === 'night';
  const showMoonFirst = isNight && scene.celestial.moonVisible;
  const roadStageBadge = scene.iceRank >= 1
    ? `<div class="hs-road-stage-pill rank-${scene.iceRank}" aria-hidden="true"><span class="hs-stage-dot"></span><span>${esc(scene.iceMeta.shortLabel)}</span></div>`
    : '';

  return {
    scene,
    html: [
      renderStarsLayer(scene.celestial.starOpacity),
      renderSunLayer(scene, uid),
      showMoonFirst ? renderMoonLayer(scene, uid) : '',
      renderTyphoonEmblemLayer(scene, uid),
      renderCloudsLayer(scene, uid),
      renderWeatherFxLayer(scene, uid),
      renderTerrainLayer(scene, uid),
      roadStageBadge
    ].join('')
  };
}

/**
 * 실제 DOM `.hero` 요소에 장면 클래스/속성, SVG 레이어 및 Canvas 입자 엔진 적용
 */
export function applyHeroScene(heroEl, input = {}) {
  if (!heroEl) return null;
  const { scene, html } = renderHeroSceneMarkup(input);

  heroEl.dataset.weather = scene.weather;
  heroEl.dataset.dayphase = scene.dayPhase;
  heroEl.dataset.blackIce = scene.blackIce ? 'true' : 'false';
  heroEl.dataset.iceRank = String(scene.iceRank);
  heroEl.dataset.coldWave = scene.coldWave ? 'true' : 'false';
  heroEl.classList.add('has-dynamic-scene');

  let horizonEl = heroEl.querySelector('.horizon');
  if (!horizonEl) {
    horizonEl = document.createElement('div');
    horizonEl.className = 'horizon';
    horizonEl.setAttribute('aria-hidden', 'true');
    heroEl.prepend(horizonEl);
  }
  horizonEl.innerHTML = html;

  // 비·눈·폭설·태풍바람·한파빙정은 Canvas 2D 입자 엔진으로 입체 렌더링
  const needCanvas = ['rain', 'thunder', 'typhoon', 'snow', 'heavy_snow'].includes(scene.weather) || scene.coldWave;
  if (needCanvas) {
    attachWeatherParticles(horizonEl, {
      weather: scene.weather,
      coldWave: scene.coldWave,
      dayPhase: scene.dayPhase,
      densityScale: heroEl.closest('.hp-item') ? 0.72 : 1.0
    });
  } else {
    detachWeatherParticles(horizonEl);
  }

  return scene;
}
