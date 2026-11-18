// 기상청 단기·초단기예보(비·눈 시작/종료·3/6/12시간 전망) + Open-Meteo 시계열·ICON 앙상블 통합 모듈
import { iceOutlook } from './ice.js';

const HOUR = 3600000;
const kst = ms => new Date(ms + 9 * HOUR).toISOString().slice(0, 16);
const val = x => Number.isFinite(x) ? x : null;
const currentFields = 'temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m';
const hourlyFields = currentFields + ',precipitation_probability,rain,showers,snowfall';

let snapshotCache = null;
async function getSnapshotFallback() {
  if (snapshotCache) return snapshotCache;
  try {
    const r = await fetch('./api/snapshot.json', { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      snapshotCache = await r.json();
      return snapshotCache;
    }
  } catch {}
  return null;
}

async function requestOpenMeteo(endpoint, query) {
  const params = new URLSearchParams(query);
  const direct = endpoint === 'ensemble'
    ? 'https://ensemble-api.open-meteo.com/v1/ensemble'
    : 'https://api.open-meteo.com/v1/forecast';
  const proxy = `/api/open-meteo?endpoint=${endpoint}&` + params.toString();

  for (const url of [proxy, direct + '?' + params.toString()]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.hourly?.time) && data.hourly.time.length) return data;
      }
    } catch {}
  }
  throw Error('격자 날씨 자료 조회 지연');
}

export async function loadKmaForecast(place) {
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  try {
    const r = await fetch('/api/forecast?' + params.toString(), { signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const d = await r.json();
      if (d?.ok) return d;
    }
  } catch {}
  const snap = await getSnapshotFallback();
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  if (snap?.forecasts?.[key]) return snap.forecasts[key];
  return null;
}

function row(h, i, time) {
  const read = key => val(h[key]?.[i]);
  const rain = read('rain'), showers = read('showers');
  return {
    time,
    temp: read('temperature_2m'),
    humidity: read('relative_humidity_2m'),
    wind: Number.isFinite(h.wind_speed_10m?.[i]) ? Number((h.wind_speed_10m[i] / 3.6).toFixed(1)) : null,
    code: read('weather_code'),
    precip: read('precipitation'),
    snow: read('snowfall'),
    rain: rain === null || showers === null ? null : Number((rain + showers).toFixed(2)),
    pop: read('precipitation_probability'),
    rainPop: null,
    snowPop: null
  };
}

function totals(rows) {
  const result = {};
  for (const key of ['precip', 'rain', 'snow']) {
    result[key] = rows.length > 0 && rows.every(r => r[key] !== null)
      ? Number(rows.reduce((sum, r) => sum + r[key], 0).toFixed(2))
      : null;
  }
  return result;
}

function ensembleProbability(h, variable, index) {
  if (!h || index < 0) return null;
  const series = Object.entries(h).filter(([k]) => k === variable || new RegExp('^' + variable + '_member[0-9]+$').test(k));
  const amounts = series.map(([, a]) => a[index]);
  if (amounts.length < 10 || !amounts.every(Number.isFinite)) return null;
  return Math.round((100 * amounts.filter(v => v >= 0.1).length) / amounts.length);
}

export async function loadWeather(place, obs = null) {
  const base = { latitude: place.lat, longitude: place.lon, timezone: 'Asia/Seoul' };
  const [omSettled, kmaSettled] = await Promise.allSettled([
    requestOpenMeteo('forecast', { ...base, current: currentFields, hourly: hourlyFields, past_days: 1, forecast_days: 2 }),
    loadKmaForecast(place)
  ]);

  const omData = omSettled.status === 'fulfilled' ? omSettled.value : null;
  const kmaData = kmaSettled.status === 'fulfilled' ? kmaSettled.value : null;

  if (!omData && !kmaData) throw Error('예보 시계열 조회 실패');

  let current, history, rows, through, today, last24, stale = false;

  if (omData) {
    const c = omData.current, h = omData.hourly;
    const now = Date.now(), reference = Date.parse(c.time + '+09:00');
    const hour = Math.floor((Number.isFinite(reference) ? reference : now) / HOUR) * HOUR;
    const at = offset => {
      const t = kst(hour + offset * HOUR);
      return row(h, h.time.indexOf(t), t);
    };
    history = Array.from({ length: 24 }, (_, i) => at(i - 23));
    rows = Array.from({ length: 6 }, (_, i) => at(i + 1));
    current = {
      time: c.time,
      temp: val(c.temperature_2m),
      humidity: val(c.relative_humidity_2m),
      wind: Number.isFinite(c.wind_speed_10m) ? Number((c.wind_speed_10m / 3.6).toFixed(1)) : null,
      code: val(c.weather_code),
      precip: val(c.precipitation)
    };
    through = kst(hour);
    const midnight = through.slice(0, 10) + 'T00:00';
    today = totals(history.filter(r => r.time > midnight));
    last24 = totals(history);
    stale = Number.isFinite(reference) && (now - reference > 2 * HOUR || reference - now > 30 * 60000);
  } else {
    // Fallback to KMA 12-hour forecast when Open-Meteo is unreachable
    const kHours = kmaData.hours || [];
    const nowIso = kst(Date.now());
    through = nowIso.slice(0, 13) + ':00';
    current = {
      time: through,
      temp: kmaData.analysis?.now?.temp != null ? Number(kmaData.analysis.now.temp) : Number(kHours[0]?.temp ?? 0),
      humidity: kmaData.analysis?.now?.humidity != null ? Number(kmaData.analysis.now.humidity) : Number(kHours[0]?.humidity ?? 60),
      wind: kmaData.analysis?.now?.wind != null ? Number(kmaData.analysis.now.wind) : (kHours[0]?.wind ?? 1.5),
      code: kHours[0]?.weatherCode ?? 1,
      precip: kmaData.analysis?.now?.wet ? Math.max(0.1, Number(kmaData.analysis.now.amount) || 0.1) : 0
    };
    history = [];
    rows = kHours.slice(0, 6).map(kh => ({
      time: kh.time.slice(0, 16),
      temp: kh.temp != null ? Number(kh.temp) : null,
      humidity: kh.humidity != null ? Number(kh.humidity) : null,
      wind: kh.wind ?? null,
      code: kh.weatherCode ?? 1,
      precip: kh.rainMm ?? 0,
      rain: kh.rainMm ?? 0,
      snow: kh.snowCm ?? 0,
      pop: kh.chance ?? 0,
      rainPop: kh.wet && !kh.type?.includes('눈') ? Math.max(60, kh.chance ?? 60) : (kh.chance ?? 0),
      snowPop: kh.type?.includes('눈') ? Math.max(60, kh.chance ?? 60) : 0
    }));
    today = { precip: obs?.dayPrecip ?? 0, rain: obs?.dayPrecip ?? 0, snow: obs?.snowDepth ?? 0 };
    last24 = { ...today };
  }

  // Merge KMA precipitation probability / precipitation signals into the 6-hour rows when KMA predicts rain/snow
  if (kmaData?.hours?.length) {
    for (const r of rows) {
      const kh = kmaData.hours.find(h => h.time && h.time.slice(0, 16) === r.time.slice(0, 16));
      if (kh) {
        if (Number.isFinite(kh.chance) && (r.pop === null || kh.chance > r.pop)) {
          r.pop = kh.chance;
        }
        if (kh.wet && (r.precip === null || r.precip === 0)) {
          r.precip = Math.max(0.1, kh.rainMm || 0.1);
          if (kh.type?.includes('눈')) {
            r.snow = Math.max(0.1, kh.snowCm || 0.1);
          } else {
            r.rain = Math.max(0.1, kh.rainMm || 0.1);
          }
        }
        r.kmaType = kh.type;
        r.kmaSky = kh.skyLabel;
        r.kmaSource = kh.source;
      }
    }
  }

  const ice = iceOutlook(current, history, rows, obs, kmaData?.hours || []);
  return {
    current,
    history,
    rows,
    through,
    today,
    last24,
    ice,
    kma: kmaData,
    stale
  };
}

export async function loadProbabilities(place, rows) {
  try {
    const ens = await requestOpenMeteo('ensemble', {
      latitude: place.lat,
      longitude: place.lon,
      timezone: 'Asia/Seoul',
      hourly: 'rain,snowfall',
      models: 'icon_seamless',
      forecast_hours: 8
    });
    for (const r of rows) {
      const idx = ens.hourly.time.indexOf(r.time);
      const rPop = ensembleProbability(ens.hourly, 'rain', idx);
      const sPop = ensembleProbability(ens.hourly, 'snowfall', idx);
      if (rPop !== null) r.rainPop = rPop;
      if (sPop !== null) r.snowPop = sPop;
    }
  } catch {
    // Fallback heuristic if ensemble API is slow
    for (const r of rows) {
      if (r.rainPop === null) r.rainPop = r.temp !== null && r.temp <= 0 ? 0 : (r.pop ?? 0);
      if (r.snowPop === null) r.snowPop = r.temp !== null && r.temp <= 1 ? (r.pop ?? 0) : 0;
    }
  }
}
