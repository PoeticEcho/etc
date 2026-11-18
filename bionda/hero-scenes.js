/**
 * 상세 페이지 상단 히어로(.hero) 기상·주야간·달령 연동 동적 연출 엔진
 * - 기상 상태(맑음/구름/흐림/안개/비/뇌우/태풍/눈/폭설) × 주야간(새벽/주간/황혼/야간)
 *   × 실제 달령(삭·초승·상현·보름·하현·그믐) × 노면위험(도로 살얼음·한파) 조합 지원
 * - 구름·강수·안개에 따른 천체(달·별) 투과/가림 물리 규칙 반영
 * - 순수 내장 SVG/CSS 기반(외부 이미지 의존 0) + 인스턴스별 고유 SVG ID 부여
 */

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

  // 태양 적위 근사
  const decl = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * RAD) * RAD;
  const latRad = HERO_LAT * RAD;
  const cosH = clamp(
    (Math.cos(90.833 * RAD) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl)),
    -0.99,
    0.99
  );
  const halfDayHours = (Math.acos(cosH) / RAD) / 15;
  const solarNoonKst = 12 + (135 - HERO_LON) / 15; // 한국 표준시(135E) 경도차 +0.47h
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
 * - 맑은 밤: 달 100%, 별 100%
 * - 구름많음 밤: 반투명 구름 너머로 달빛 확산 투과(moonThroughCloud: true), 별 성글게
 * - 흐림 밤: 보름달급만 희미한 확산 달무리 힌트, 별 0
 * - 비/눈/폭설/뇌우/태풍: 두꺼운 비구름에 달·별 완전 비노출
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

  // 비, 천둥·번개, 태풍, 눈, 폭설 시 달·별 보이지 않음
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

/**
 * 입력 옵션을 정규화해 완전한 장면 명세 객체 생성
 */
export function resolveHeroScene(input = {}) {
  const date = input.date instanceof Date ? input.date : input.date ? new Date(input.date) : new Date();
  const dayPhase = resolveDayPhase({ dayPhase: input.dayPhase, date, hourKst: input.hourKst });
  const weather = WEATHER_LABELS[input.weather] ? input.weather : inferWeatherFromKma(input);
  const blackIce = Boolean(input.blackIce);
  const coldWave = Boolean(input.coldWave);
  const lunar = getLunarInfo(date, input.moonAgeDays);
  const celestial = computeCelestialVisibility(weather, dayPhase, lunar);

  return {
    weather,
    weatherLabel: WEATHER_LABELS[weather],
    dayPhase,
    dayPhaseLabel: DAY_PHASE_LABELS[dayPhase],
    blackIce,
    coldWave,
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

/**
 * 정확한 위상(phaseRatio 0~1)의 SVG 달 경로 생성
 */
function buildMoonLitPath(r, phaseRatio) {
  const cosA = Math.cos(phaseRatio * 2 * Math.PI);
  if (phaseRatio < 0.02 || phaseRatio > 0.98) return ''; // 삭(신월)
  if (Math.abs(phaseRatio - 0.5) < 0.02) {
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  }

  const rx = Math.abs(cosA) * r;
  const waxing = phaseRatio < 0.5;
  const outerSweep = waxing ? 1 : 0;

  if (rx < 0.25) {
    // 상현 / 하현 반달 직선 터미네이터
    return `M 0 ${-r} A ${r} ${r} 0 0 ${outerSweep} 0 ${r} Z`;
  }

  const termSweep = waxing
    ? (phaseRatio < 0.25 ? 0 : 1)
    : (phaseRatio < 0.75 ? 0 : 1);

  return `M 0 ${-r} A ${r} ${r} 0 0 ${outerSweep} 0 ${r} A ${rx.toFixed(2)} ${r} 0 0 ${termSweep} 0 ${-r} Z`;
}

function renderStarsLayer(starOpacity, uid) {
  if (starOpacity <= 0) return '';
  // 균형 잡힌 별자리 배치(왼쪽 텍스트 영역 피하고 중앙-우측 상공 중심)
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
  // partly_cloudy 등 낮은 starOpacity일 때는 밝은 12개만 틈새 별빛으로 유지
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

  // 초승·삭 등 어두운 면에도 지구조(Earthshine) 느낌의 옅은 윤곽 표현
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

function renderCloudsLayer(scene, uid) {
  const { weather, dayPhase, celestial, lunar } = scene;
  const isNight = dayPhase === 'night';
  const isTwilight = dayPhase === 'dawn' || dayPhase === 'dusk';

  if (weather === 'clear') return '';

  // 구름 색상/투명도 결정
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
    ? (isNight ? 0.44 : 0.48) // 밤 구름많음: 보름달이 반투명 구름에 비치도록 투명도 최적화!
    : weather === 'fog'
      ? 0.28
      : weather === 'overcast'
        ? (isNight ? 0.78 : 0.74)
        : 0.84;

  // 달이 구름 뒤에 있을 때 구름 아래쪽 가장자리/중앙에 달빛 투과 글로우(silver bloom)를 겹침
  const moonCloudBloom = isNight && weather === 'partly_cloudy' && celestial.moonVisible && lunar.illumination > 0.15
    ? `<radialGradient id="${uid}mbloom" cx="84%" cy="40%" r="22%">
         <stop offset="0%" stop-color="#f5f9ff" stop-opacity="${(0.22 + lunar.illumination * 0.3).toFixed(2)}"/>
         <stop offset="55%" stop-color="#c2d8f2" stop-opacity="${(0.10 + lunar.illumination * 0.16).toFixed(2)}"/>
         <stop offset="100%" stop-color="#c2d8f2" stop-opacity="0"/>
       </radialGradient>`
    : '';

  const cloudPathBack = 'M250,74 C272,56 306,56 326,72 C342,60 368,62 380,76 C398,74 418,86 414,100 L236,100 C226,88 234,76 250,74 Z';
  // 구름 1 (달 왼쪽-중앙을 부드럽게 스치며 달빛이 투과하는 반투명 구름 띠)
  const cloudPathAcrossMoon = 'M588,58 C614,34 662,32 692,52 C714,34 756,34 786,52 C814,40 848,46 864,66 C884,68 896,82 888,96 L572,96 C558,82 568,62 588,58 Z';
  // 흐림/폭풍 시 조각 구름·상층 층운
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

function renderWeatherFxLayer(scene, uid) {
  const { weather, dayPhase, blackIce, coldWave } = scene;
  const isNight = dayPhase === 'night';
  const parts = [];

  // 1. 비 (rain)
  if (weather === 'rain') {
    const drops = [];
    for (let i = 0; i < 36; i++) {
      const x = 230 + ((i * 37) % 720);
      const y = -10 + ((i * 53) % 190);
      const len = 14 + (i % 3) * 5;
      const dx = -len * 0.24;
      const cls = i % 2 === 0 ? 'hs-rain-a' : 'hs-rain-b';
      const alpha = i % 2 === 0 ? 0.56 : 0.34;
      drops.push(`<line class="${cls}" x1="${x}" y1="${y}" x2="${(x + dx).toFixed(1)}" y2="${y + len}" stroke="#a8dcff" stroke-width="${i % 2 === 0 ? 1.6 : 1.1}" stroke-linecap="round" opacity="${alpha}"/>`);
    }
    parts.push(`<g class="hs-fx-rain">${drops.join('')}</g>`);
  }

  // 2. 천둥·번개 (thunder)
  if (weather === 'thunder') {
    const stormRain = [];
    for (let i = 0; i < 42; i++) {
      const x = 220 + ((i * 31) % 740);
      const y = -15 + ((i * 47) % 190);
      const len = 16 + (i % 4) * 5;
      const dx = -len * 0.32;
      stormRain.push(`<line class="${i % 2 === 0 ? 'hs-rain-a' : 'hs-rain-b'}" x1="${x}" y1="${y}" x2="${(x + dx).toFixed(1)}" y2="${y + len}" stroke="#93c5fd" stroke-width="1.4" stroke-linecap="round" opacity="${i % 2 === 0 ? 0.54 : 0.3}"/>`);
    }
    parts.push(`<g class="hs-fx-rain">${stormRain.join('')}</g>`);
    // 번개 섬광 + 2개의 번개 볼트
    parts.push(`
      <g class="hs-lightning-group">
        <ellipse class="hs-thunder-glow" cx="765" cy="75" rx="180" ry="70" fill="url(#${uid}tflash)"/>
        <path class="hs-bolt hs-bolt-1" d="M778,34 L750,86 L773,86 L748,144 L796,74 L770,74 Z" fill="#fde047" stroke="#fef9c3" stroke-width="1.2" stroke-linejoin="round"/>
        <path class="hs-bolt hs-bolt-2" d="M618,42 L598,82 L614,82 L594,126 L632,74 L613,74 Z" fill="#fef08a" opacity="0.82"/>
      </g>
    `);
  }

  // 3. 태풍·강풍 (typhoon)
  if (weather === 'typhoon') {
    const galeRain = [];
    for (let i = 0; i < 44; i++) {
      const x = 210 + ((i * 29) % 750);
      const y = -10 + ((i * 43) % 190);
      const len = 20 + (i % 3) * 6;
      const dx = -len * 0.72; // 36도 급경사 돌풍 빗줄기
      galeRain.push(`<line class="hs-gale-streak" x1="${x}" y1="${y}" x2="${(x + dx).toFixed(1)}" y2="${y + len}" stroke="#7dd3fc" stroke-width="1.5" stroke-linecap="round" opacity="${0.34 + (i % 3) * 0.14}"/>`);
    }
    // 횡풍 유선(wind streamlines) + 우측 소용돌이 태풍 아이
    parts.push(`
      <g class="hs-fx-typhoon">
        ${galeRain.join('')}
        <path class="hs-wind-line hs-wind-1" d="M290,54 Q460,40 620,62 T890,46" fill="none" stroke="rgba(186,230,253,0.48)" stroke-width="2" stroke-linecap="round"/>
        <path class="hs-wind-line hs-wind-2" d="M350,96 Q530,82 690,104 T940,88" fill="none" stroke="rgba(224,242,254,0.42)" stroke-width="1.7" stroke-linecap="round"/>
        <path class="hs-wind-line hs-wind-3" d="M240,136 Q420,122 610,142 T910,126" fill="none" stroke="rgba(125,211,252,0.36)" stroke-width="1.5" stroke-linecap="round"/>
        <g transform="translate(792, 82)">
          <g class="hs-vortex">
            <circle cx="0" cy="0" r="8.5" fill="none" stroke="rgba(224,242,254,0.82)" stroke-width="2.2"/>
            <path d="M-28,-8 C-14,-34 26,-32 34,-6 C38,10 24,26 4,28 C-18,30 -32,14 -28,-8" fill="none" stroke="rgba(186,230,253,0.72)" stroke-width="2.4" stroke-dasharray="28 10" stroke-linecap="round"/>
            <path d="M-44,-14 C-22,-50 38,-48 50,-10 C56,16 34,42 2,44 C-28,46 -50,24 -44,-14" fill="none" stroke="rgba(125,211,252,0.52)" stroke-width="2" stroke-dasharray="38 14" stroke-linecap="round"/>
          </g>
        </g>
      </g>
    `);
  }

  // 4. 안개·박무 (fog)
  if (weather === 'fog') {
    const fogTint = isNight ? '#b9cedb' : '#e6f1f2';
    parts.push(`
      <g class="hs-fx-fog">
        <rect x="200" y="92" width="780" height="28" rx="14" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-1"/>
        <rect x="250" y="122" width="740" height="32" rx="16" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-2"/>
        <rect x="190" y="152" width="800" height="44" rx="22" fill="url(#${uid}fogGrad)" class="hs-fog-band hs-fog-3"/>
        <ellipse cx="670" cy="148" rx="290" ry="38" fill="${fogTint}" opacity="0.16" filter="url(#${uid}blurSoft)"/>
      </g>
    `);
  }

  // 5. 눈 (snow) & 폭설 (heavy_snow)
  if (weather === 'snow' || weather === 'heavy_snow') {
    const isHeavy = weather === 'heavy_snow';
    const flakeCount = isHeavy ? 54 : 30;
    const flakes = [];
    for (let i = 0; i < flakeCount; i++) {
      const x = 230 + ((i * 41) % 720);
      const y = 8 + ((i * 59) % 175);
      const r = isHeavy ? (1.8 + (i % 4) * 1.1) : (1.5 + (i % 3) * 0.9);
      const cls = i % 3 === 0 ? 'hs-snow-a' : i % 3 === 1 ? 'hs-snow-b' : 'hs-snow-c';
      if (i % 5 === 0) {
        // 정교한 6각 눈결정
        const s = r * 2.1;
        flakes.push(`
          <g class="${cls}" stroke="#f0f9ff" stroke-width="1.1" stroke-linecap="round" opacity="${isHeavy ? 0.88 : 0.8}">
            <line x1="${x}" y1="${y - s}" x2="${x}" y2="${y + s}"/>
            <line x1="${(x - s * 0.86).toFixed(1)}" y1="${(y - s * 0.5).toFixed(1)}" x2="${(x + s * 0.86).toFixed(1)}" y2="${(y + s * 0.5).toFixed(1)}"/>
            <line x1="${(x - s * 0.86).toFixed(1)}" y1="${(y + s * 0.5).toFixed(1)}" x2="${(x + s * 0.86).toFixed(1)}" y2="${(y - s * 0.5).toFixed(1)}"/>
          </g>
        `);
      } else {
        flakes.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" fill="#f8fafc" opacity="${isHeavy ? (0.45 + (i % 3) * 0.2) : (0.42 + (i % 3) * 0.16)}"/>`);
      }
    }
    const blizzardMist = isHeavy
      ? `<path class="hs-fog-band hs-fog-2" d="M220,164 Q440,142 640,162 T960,152 L960,200 L220,200 Z" fill="rgba(241,245,249,0.22)"/>
         <path d="M280,72 Q490,56 710,74 T950,62" fill="none" stroke="rgba(241,245,249,0.24)" stroke-width="1.8" stroke-dasharray="14 24" stroke-linecap="round"/>`
      : '';
    parts.push(`<g class="${isHeavy ? 'hs-fx-blizzard' : 'hs-fx-snow'}">${flakes.join('')}${blizzardMist}</g>`);
  }

  // 6. 한파 (coldWave) — 우측 성애 결정 프레임 + 빙정(다이아몬드 더스트) 반짝임
  if (coldWave) {
    parts.push(`
      <g class="hs-fx-cold" aria-hidden="true">
        <path d="M956,0 C936,24 912,32 886,36 M956,0 C928,8 906,24 892,50 M938,16 L916,12 M922,28 L926,48 M904,34 L888,22 M956,42 C944,58 934,74 934,94" fill="none" stroke="rgba(224,242,254,0.48)" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M956,196 C930,174 904,166 876,166 M956,196 C936,168 920,152 908,130 M936,180 L912,184" fill="none" stroke="rgba(186,230,253,0.42)" stroke-width="1.3" stroke-linecap="round"/>
        <g stroke="#e0f2fe" stroke-width="1.15" stroke-linecap="round">
          <g transform="translate(874, 24)" opacity="0.72"><path d="M0,-8 V8 M-7,-4 L7,4 M-7,4 L7,-4"/></g>
          <g transform="translate(918, 68)" opacity="0.6"><path d="M0,-6 V6 M-5.2,-3 L5.2,3 M-5.2,3 L5.2,-3"/></g>
          <g transform="translate(540, 44)" opacity="0.45"><path d="M0,-4.5 V4.5 M-4,-2.2 L4,2.2 M-4,2.2 L4,-2.2"/></g>
          <g transform="translate(692, 134)" opacity="0.5"><path d="M0,-5 V5 M-4.3,-2.5 L4.3,2.5 M-4.3,2.5 L4.3,-2.5"/></g>
        </g>
        <circle class="hs-star hs-star-t1" cx="628" cy="40" r="1.4" fill="#bae6fd"/>
        <circle class="hs-star hs-star-t2" cx="812" cy="96" r="1.3" fill="#e0f2fe"/>
        <circle class="hs-star hs-star-t3" cx="468" cy="112" r="1.2" fill="#bae6fd"/>
      </g>
    `);
  }

  // 7. 도로 살얼음 (blackIce) — 노면 위 차가운 얼음 결정·서리 광택
  if (blackIce) {
    parts.push(`
      <g class="hs-fx-blackice" aria-hidden="true">
        <rect x="330" y="168" width="630" height="28" fill="url(#${uid}iceFloor)"/>
        <path class="hs-ice-sheen" d="M360,186 Q560,174 740,184 T956,178" fill="none" stroke="rgba(125,211,252,0.72)" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M410,192 Q610,183 840,190" fill="none" stroke="rgba(224,242,254,0.46)" stroke-width="1.1" stroke-dasharray="18 12" stroke-linecap="round"/>
        <g stroke="#bae6fd" stroke-width="1.2" stroke-linecap="round" opacity="0.82">
          <g transform="translate(650, 178)"><path d="M0,-6 V6 M-5.2,-3 L5.2,3 M-5.2,3 L5.2,-3"/></g>
          <g transform="translate(792, 182)"><path d="M0,-7.5 V7.5 M-6.5,-3.7 L6.5,3.7 M-6.5,3.7 L6.5,-3.7"/></g>
          <g transform="translate(894, 174)"><path d="M0,-5.5 V5.5 M-4.8,-2.7 L4.8,2.7 M-4.8,2.7 L4.8,-2.7"/></g>
          <g transform="translate(510, 185)"><path d="M0,-4.5 V4.5 M-3.9,-2.2 L3.9,2.2 M-3.9,2.2 L3.9,-2.2"/></g>
        </g>
      </g>
    `);
  }

  if (!parts.length) return '';

  return `<svg class="hs-layer hs-fx" viewBox="0 0 960 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="${uid}tflash">
        <stop offset="0%" stop-color="#fef08a" stop-opacity="0.45"/>
        <stop offset="55%" stop-color="#a78bfa" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${uid}fogGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#dceaf0" stop-opacity="0"/>
        <stop offset="25%" stop-color="#dceaf0" stop-opacity="0.22"/>
        <stop offset="55%" stop-color="#e9f3f7" stop-opacity="0.28"/>
        <stop offset="85%" stop-color="#dceaf0" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#dceaf0" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${uid}iceFloor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0"/>
        <stop offset="60%" stop-color="#7dd3fc" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.34"/>
      </linearGradient>
      <filter id="${uid}blurSoft"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    ${parts.join('')}
  </svg>`;
}

function getTerrainColors(scene) {
  const { weather, dayPhase, coldWave, blackIce, isSnowTerrain } = scene;
  if (isSnowTerrain) {
    return dayPhase === 'night'
      ? { back: '#243c50', front: '#182b3b', cap: '#d9ecfb', capAlpha: 0.72, roadGlow: '#93c5fd' }
      : { back: '#4d6f85', front: '#355368', cap: '#f1f7fc', capAlpha: 0.85, roadGlow: '#bae6fd' };
  }
  if (blackIce || coldWave) {
    return dayPhase === 'night'
      ? { back: '#152e46', front: '#0e2135', cap: '#bae6fd', capAlpha: 0.42, roadGlow: '#38bdf8' }
      : { back: '#2d5c78', front: '#1f445c', cap: '#dff4ff', capAlpha: 0.36, roadGlow: '#7dd3fc' };
  }
  if (dayPhase === 'night') {
    return weather === 'thunder'
      ? { back: '#1c1f36', front: '#121526', cap: '#818cf8', capAlpha: 0.14, roadGlow: '' }
      : { back: '#183344', front: '#0f2331', cap: '#93c5fd', capAlpha: 0.15, roadGlow: '' };
  }
  if (dayPhase === 'dawn' || dayPhase === 'dusk') {
    return { back: '#4d4c63', front: '#2f3447', cap: '#fed7aa', capAlpha: 0.24, roadGlow: '' };
  }
  if (weather === 'overcast' || weather === 'fog' || weather === 'rain') {
    return { back: '#3d5860', front: '#294047', cap: '#cbd5e1', capAlpha: 0.12, roadGlow: '' };
  }
  // 기본 12호선 주간 맑음 청록 능선(기존 .hero 브랜드 컬러 계승)
  return { back: '#4e8679', front: '#2f655f', cap: '#d9f2cc', capAlpha: 0.16, roadGlow: '' };
}

function renderTerrainLayer(scene, uid) {
  const t = getTerrainColors(scene);
  const backPts = '0,162 110,136 190,140 310,94 375,112 490,62 542,84 628,48 696,76 804,34 960,72 960,180 0,180';
  const frontPts = '0,174 140,152 245,156 355,114 435,130 565,84 652,108 755,66 862,88 960,64 960,180 0,180';
  // 눈/서리 능선 highlight polyline
  const ridgeCap = 'M310,94 L375,112 L490,62 L542,84 L628,48 L696,76 L804,34 L960,72';
  // 우측 하단 12호선 교량·노면 실루엣 (살얼음일 때 파란 결빙 반사광 강조)
  const bridgeSilhouette = scene.blackIce
    ? `<g opacity="0.9">
         <path d="M520,166 Q730,150 960,156" fill="none" stroke="${t.roadGlow}" stroke-width="3.2" stroke-linecap="round"/>
         <path d="M535,171 Q735,156 960,161" fill="none" stroke="rgba(224,242,254,0.65)" stroke-width="1.2" stroke-dasharray="10 8"/>
         <path d="M620,161 V180 M710,156 V180 M800,154 V180 M890,155 V180" stroke="rgba(125,211,252,0.36)" stroke-width="3"/>
       </g>`
    : `<path d="M560,168 Q750,154 960,159" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="10 10"/>`;

  return `<svg class="hs-layer hs-terrain" viewBox="0 0 960 180" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}tb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${t.back}"/>
        <stop offset="100%" stop-color="${t.front}"/>
      </linearGradient>
    </defs>
    <polygon points="${backPts}" fill="url(#${uid}tb)" opacity="0.88"/>
    <path d="${ridgeCap}" fill="none" stroke="${t.cap}" stroke-width="${scene.isSnowTerrain ? 4.2 : 1.6}" stroke-linejoin="round" opacity="${t.capAlpha}"/>
    <polygon points="${frontPts}" fill="${t.front}" opacity="0.94"/>
    ${bridgeSilhouette}
  </svg>`;
}

/**
 * .horizon 내부에 삽입할 전체 동적 기상·천체 SVG 마크업 생성
 */
export function renderHeroSceneMarkup(input = {}) {
  const scene = input.celestial && input.lunar ? input : resolveHeroScene(input);
  const uid = nextUid();
  const isNight = scene.dayPhase === 'night';
  const showMoonFirst = isNight && scene.celestial.moonVisible;

  return {
    scene,
    html: [
      renderStarsLayer(scene.celestial.starOpacity, uid),
      renderSunLayer(scene, uid),
      showMoonFirst ? renderMoonLayer(scene, uid) : '',
      renderCloudsLayer(scene, uid),
      renderWeatherFxLayer(scene, uid),
      renderTerrainLayer(scene, uid)
    ].join('')
  };
}

/**
 * 실제 DOM `.hero` 요소에 장면 클래스/속성 및 SVG 레이어 적용
 */
export function applyHeroScene(heroEl, input = {}) {
  if (!heroEl) return null;
  const { scene, html } = renderHeroSceneMarkup(input);

  heroEl.dataset.weather = scene.weather;
  heroEl.dataset.dayphase = scene.dayPhase;
  heroEl.dataset.blackIce = scene.blackIce ? 'true' : 'false';
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

  return scene;
}
