/**
 * 기상청 단기예보(weather.go.kr/w/forecast/overall/short-term.do) 스타일 내장 SVG 날씨 아이콘 세트
 * - 외부 PNG 핫링크 없이 자체 내장 벡터 심볼(NB01~NB15 매칭)로 다크/라이트 모드 모두 선명하게 렌더링
 */

export function getKmaIconInfo({ sky = '1', pty = '0', isNight = false } = {}) {
  const p = String(pty ?? '0');
  const s = String(sky ?? '1');
  if (p === '1') return { code: 'NB09', label: '비', kind: 'rain' };
  if (p === '2') return { code: 'NB13', label: '비·눈', kind: 'sleet' };
  if (p === '3') return { code: 'NB11', label: '눈', kind: 'snow' };
  if (p === '4') return { code: 'NB08', label: '소나기', kind: 'shower' };
  if (p === '5') return { code: 'NB10', label: '빗방울', kind: 'rain' };
  if (p === '6') return { code: 'NB15', label: '빗방울·눈날림', kind: 'sleet' };
  if (p === '7') return { code: 'NB12', label: '눈날림', kind: 'snow' };
  if (s === '3') return { code: isNight ? 'NB06' : 'NB05', label: '구름많음', kind: 'partly' };
  if (s === '4') return { code: 'NB07', label: '흐림', kind: 'cloudy' };
  return { code: isNight ? 'NB02' : 'NB01', label: '맑음', kind: 'clear' };
}

const SVG_SUN_FULL = `
  <circle cx="18" cy="18" r="6.8" fill="#ffb703" stroke="#e08900" stroke-width="1"/>
  <g stroke="#ffb703" stroke-width="2" stroke-linecap="round">
    <line x1="18" y1="4.5" x2="18" y2="8"/>
    <line x1="18" y1="28" x2="18" y2="31.5"/>
    <line x1="4.5" y1="18" x2="8" y2="18"/>
    <line x1="28" y1="18" x2="31.5" y2="18"/>
    <line x1="8.5" y1="8.5" x2="11" y2="11"/>
    <line x1="25" y1="25" x2="27.5" y2="27.5"/>
    <line x1="27.5" y1="8.5" x2="25" y2="11"/>
    <line x1="11" y1="25" x2="8.5" y2="27.5"/>
  </g>`;

const SVG_MOON_FULL = `
  <path d="M21.5 9.5A8.8 8.8 0 1 0 28.5 23a7.2 7.2 0 0 1-7-13.5Z" fill="#f7c948" stroke="#d99b18" stroke-width="1.1" stroke-linejoin="round"/>
  <circle cx="26" cy="10.5" r="1.3" fill="#fde68a"/>
  <circle cx="28.5" cy="14.5" r="0.9" fill="#fde68a"/>`;

const SVG_SUN_PEEK = `
  <circle cx="13" cy="13.5" r="5.2" fill="#ffb703" stroke="#e08900" stroke-width="0.9"/>
  <g stroke="#ffb703" stroke-width="1.6" stroke-linecap="round">
    <line x1="13" y1="4.5" x2="13" y2="6.8"/>
    <line x1="4" y1="13.5" x2="6.3" y2="13.5"/>
    <line x1="6.7" y1="7.2" x2="8.4" y2="8.9"/>
    <line x1="19.3" y1="7.2" x2="17.6" y2="8.9"/>
  </g>`;

const SVG_MOON_PEEK = `
  <path d="M14.2 8A5.4 5.4 0 1 0 19 15.8a4.5 4.5 0 0 1-4.8-7.8Z" fill="#f7c948" stroke="#d99b18" stroke-width="0.9"/>`;

const SVG_CLOUD_LIGHT = `
  <path d="M11 25h15.2a4.6 4.6 0 0 0 .6-9.15A6.2 6.2 0 0 0 15 14.3a4.9 4.9 0 0 0-4 10.7Z" fill="#dce8f4" stroke="#8aa3bb" stroke-width="1.15" stroke-linejoin="round"/>`;

const SVG_CLOUD_DARK = `
  <path d="M14.5 19.5h12.2a3.8 3.8 0 0 0 .4-7.55 5 5 0 0 0-9.3-1.45 4 4 0 0 0-3.3 9Z" fill="#b7cade" stroke="#7892ab" stroke-width="1" stroke-linejoin="round"/>
  <path d="M9.5 23.2h15a4.3 4.3 0 0 0 .5-8.55 5.8 5.8 0 0 0-11-1.35 4.5 4.5 0 0 0-4.5 9.9Z" fill="#cfdeec" stroke="#7c96b0" stroke-width="1.1" stroke-linejoin="round"/>`;

const SVG_RAIN_CLOUD = `
  <path d="M9.5 21.5h16.5a4.4 4.4 0 0 0 .6-8.75 5.9 5.9 0 0 0-11.2-1.45 4.6 4.6 0 0 0-5.9 10.2Z" fill="#bfd3e6" stroke="#6c89a6" stroke-width="1.15" stroke-linejoin="round"/>`;

const SVG_RAINDROPS = `
  <g stroke="#2fa4ff" stroke-width="2" stroke-linecap="round">
    <line x1="13" y1="24.5" x2="11.2" y2="29.5"/>
    <line x1="18.5" y1="24.5" x2="16.7" y2="29.5"/>
    <line x1="24" y1="24.5" x2="22.2" y2="29.5"/>
  </g>`;

const SVG_DRIZZLE = `
  <g stroke="#4bb7ff" stroke-width="1.9" stroke-linecap="round">
    <line x1="15" y1="25" x2="13.8" y2="28.8"/>
    <line x1="21.5" y1="25" x2="20.3" y2="28.8"/>
  </g>`;

const SVG_SNOW_CRYSTALS = `
  <g stroke="#7ed4ff" stroke-width="1.5" stroke-linecap="round">
    <path d="M12.5 24.5v5M10.3 25.8l4.4 2.4M14.7 25.8l-4.4 2.4"/>
    <path d="M18.5 26v5M16.3 27.3l4.4 2.4M20.7 27.3l-4.4 2.4"/>
    <path d="M24.5 24.5v5M22.3 25.8l4.4 2.4M26.7 25.8l-4.4 2.4"/>
  </g>`;

const SVG_SLEET = `
  <line x1="13.5" y1="24.5" x2="11.7" y2="29.5" stroke="#2fa4ff" stroke-width="2" stroke-linecap="round"/>
  <g stroke="#7ed4ff" stroke-width="1.5" stroke-linecap="round">
    <path d="M22.5 24.5v5M20.3 25.8l4.4 2.4M24.7 25.8l-4.4 2.4"/>
  </g>`;

const ICON_BODY_MAP = {
  NB01: SVG_SUN_FULL,
  NB02: SVG_MOON_FULL,
  NB05: SVG_SUN_PEEK + SVG_CLOUD_LIGHT,
  NB06: SVG_MOON_PEEK + SVG_CLOUD_LIGHT,
  NB07: SVG_CLOUD_DARK,
  NB08: SVG_SUN_PEEK + SVG_RAIN_CLOUD + SVG_RAINDROPS,
  NB09: SVG_RAIN_CLOUD + SVG_RAINDROPS,
  NB10: SVG_RAIN_CLOUD + SVG_DRIZZLE,
  NB11: SVG_RAIN_CLOUD + SVG_SNOW_CRYSTALS,
  NB12: SVG_RAIN_CLOUD + `<g stroke="#7ed4ff" stroke-width="1.5" stroke-linecap="round"><path d="M18 24.5v5M15.8 25.8l4.4 2.4M20.2 25.8l-4.4 2.4"/></g>`,
  NB13: SVG_RAIN_CLOUD + SVG_SLEET,
  NB15: SVG_RAIN_CLOUD + SVG_SLEET
};

export function renderKmaIconSvg(specOrHour, size = 22) {
  const info = specOrHour?.code ? specOrHour : getKmaIconInfo(specOrHour);
  const body = ICON_BODY_MAP[info.code] || SVG_SUN_FULL;
  const s = Number.isFinite(Number(size)) ? Number(size) : 22;
  return `<svg class="kma-sym kma-${info.kind}" viewBox="0 0 36 36" width="${s}" height="${s}" aria-hidden="true">${body}</svg>`;
}

export function renderWindArrowSvg(deg, size = 14) {
  const s = Number.isFinite(Number(size)) ? Number(size) : 14;
  if (deg == null || !Number.isFinite(Number(deg))) return '';
  // 기상청 VEC(풍향)는 바람이 불어오는 각도 -> 화살표는 바람이 불어가는 방향(+180deg)으로 표시
  const rot = Math.round(((Number(deg) + 180) % 360 + 360) % 360);
  return `<svg class="kma-wind-arrow" viewBox="0 0 20 20" width="${s}" height="${s}" style="transform:rotate(${rot}deg)" aria-hidden="true"><path d="M10 2.5l4.4 13.5-4.4-3.1-4.4 3.1z" fill="currentColor"/></svg>`;
}
