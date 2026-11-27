// 기상청 단기·초단기예보(비·눈 시작/종료·3/6/12시간 전망) + Open-Meteo 다중좌표 일괄 조회·ICON 앙상블 통합 모듈
import { iceOutlook } from './ice.js';
import { apiUrl, isBackendAvailable } from './config.js';
import { getSnapshotFallback } from './observations.js';

const HOUR = 3600000;
const kst = ms => new Date(ms + 9 * HOUR).toISOString().slice(0, 16);
const val = x => Number.isFinite(x) ? x : null;
const currentFields = 'temperature_2m,relative_humidity_2m,weather_code,precipitation,wind_speed_10m';
const hourlyFields = currentFields + ',precipitation_probability,rain,showers,snowfall';

const coordKey = p => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;
const omForecastCache = new Map(); // coordKey -> { expires, data }
const omEnsembleCache = new Map(); // coordKey -> { expires, fetchedAt, data }
const kmaForecastCache = new Map(); // `${lat.toFixed(3)},${lon.toFixed(3)}` -> { expires, data }
let ensembleCooldownUntil = 0;

export function seedKmaForecast(place, data) {
  if (!place || !data?.ok) return;
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  kmaForecastCache.set(key, { expires: Date.now() + 4 * 60000, data: { ...data, _fromSnapshot: false } });
}

export function clearWeatherMemCache({ includeEnsemble = false } = {}) {
  omForecastCache.clear();
  kmaForecastCache.clear();
  if (includeEnsemble) omEnsembleCache.clear();
}

let forecastPrefetchPromise = null;
let ensemblePrefetchPromise = null;

async function requestOpenMeteo(endpoint, query, { force = false, hard = false } = {}) {
  if (endpoint === 'ensemble' && Date.now() < ensembleCooldownUntil) {
    throw Error('앙상블 API 일일 요청 한도 쿨다운 중');
  }
  const params = new URLSearchParams(query);
  const direct = endpoint === 'ensemble'
    ? 'https://ensemble-api.open-meteo.com/v1/ensemble'
    : 'https://api.open-meteo.com/v1/forecast';
  const bypass = Boolean(force || hard);
  const urls = [];
  if (await isBackendAvailable()) {
    const workerExtra = `${bypass ? '&force=1' : ''}${hard ? '&hard=1' : ''}`;
    urls.push(apiUrl(`/api/open-meteo?endpoint=${endpoint}${workerExtra}&` + params.toString()));
  }
  urls.push(direct + '?' + params.toString());

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        ...(bypass ? { cache: 'no-store' } : {})
      });
      if (response.status === 429) {
        if (endpoint === 'ensemble') ensembleCooldownUntil = Date.now() + 15 * 60000;
        continue;
      }
      if (response.ok) {
        const data = await response.json();
        const validSingle = data && !Array.isArray(data) && Array.isArray(data.hourly?.time) && data.hourly.time.length;
        const validBatch = Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.hourly?.time);
        if (validSingle || validBatch) return data;
      }
    } catch {}
  }
  throw Error('격자 날씨 자료 조회 지연');
}

function dedupePlaces(placesList) {
  const seen = new Map();
  for (const p of placesList || []) {
    if (!p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) continue;
    const k = coordKey(p);
    if (!seen.has(k)) seen.set(k, p);
  }
  return [...seen.values()];
}

/**
 * 복수 관심지역의 Open-Meteo 예보(forecast) 및 앙상블(ensemble)을 콤마 일괄 쿼리(각 1회 호출)로 미리 조회합니다.
 */
export async function prefetchOpenMeteo(placesList, { force = false, hard = false } = {}) {
  const unique = dedupePlaces(placesList);
  if (!unique.length) return;
  const now = Date.now();
  const bypass = Boolean(force || hard);

  if (bypass) {
    omForecastCache.clear();
  }
  if (hard) {
    kmaForecastCache.clear();
  }

  const needFcst = unique.filter(p => {
    const hit = omForecastCache.get(coordKey(p));
    return !hit || hit.expires <= now;
  });

  if (needFcst.length) {
    forecastPrefetchPromise = (async () => {
      try {
        const raw = await requestOpenMeteo('forecast', {
          latitude: needFcst.map(p => Number(p.lat).toFixed(4)).join(','),
          longitude: needFcst.map(p => Number(p.lon).toFixed(4)).join(','),
          timezone: 'Asia/Seoul',
          current: currentFields,
          hourly: hourlyFields,
          past_days: 1,
          forecast_days: 2
        }, { force: bypass, hard });
        const items = Array.isArray(raw) ? raw : [raw];
        needFcst.forEach((p, idx) => {
          const item = items[idx];
          if (item && Array.isArray(item.hourly?.time) && item.hourly.time.length) {
            omForecastCache.set(coordKey(p), { expires: Date.now() + 3 * 60000, data: item });
          }
        });
      } catch {}
    })().finally(() => {
      forecastPrefetchPromise = null;
    });
  }

  const needEns = Date.now() >= ensembleCooldownUntil
    ? unique.filter(p => {
        const hit = omEnsembleCache.get(coordKey(p));
        if (!hit || hit.expires <= now) return true;
        if (hard) return true;
        if (force && now - hit.fetchedAt > 5 * 60000) return true;
        return false;
      })
    : [];

  if (needEns.length) {
    ensemblePrefetchPromise = (async () => {
      try {
        const raw = await requestOpenMeteo('ensemble', {
          latitude: needEns.map(p => Number(p.lat).toFixed(4)).join(','),
          longitude: needEns.map(p => Number(p.lon).toFixed(4)).join(','),
          timezone: 'Asia/Seoul',
          hourly: 'rain,snowfall',
          models: 'icon_seamless',
          forecast_hours: 8
        }, { force: bypass, hard });
        const items = Array.isArray(raw) ? raw : [raw];
        needEns.forEach((p, idx) => {
          const item = items[idx];
          if (item && Array.isArray(item.hourly?.time) && item.hourly.time.length) {
            const ts = Date.now();
            omEnsembleCache.set(coordKey(p), { expires: ts + 30 * 60000, fetchedAt: ts, data: item });
          }
        });
      } catch {}
    })().finally(() => {
      ensemblePrefetchPromise = null;
    });
  }

  await forecastPrefetchPromise;
}

export async function loadKmaForecast(place, { cacheOnly = false, force = false, hard = false } = {}) {
  const key = `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}`;
  const bypass = Boolean(force || hard);
  const cached = !bypass ? kmaForecastCache.get(key) : null;
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  if (cacheOnly) return null;
  const params = new URLSearchParams({ lat: place.lat, lon: place.lon });
  if (bypass) params.set('force', '1');
  if (hard) params.set('hard', '1');
  if (await isBackendAvailable()) {
    try {
      const r = await fetch(apiUrl('/api/forecast?' + params.toString()), {
        signal: AbortSignal.timeout(12000),
        ...(bypass ? { cache: 'no-store' } : {})
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.ok) {
          const out = { ...d, _fromSnapshot: false };
          kmaForecastCache.set(key, { expires: Date.now() + 4 * 60000, data: out });
          return out;
        }
      }
    } catch {}
  }
  const snap = await getSnapshotFallback();
  if (snap?.forecasts?.[key]) {
    return { ...snap.forecasts[key], _fromSnapshot: true, _snapshotGeneratedAt: snap.generatedAt || null };
  }
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

async function getSingleOpenMeteoForecast(place) {
  if (forecastPrefetchPromise) {
    try { await forecastPrefetchPromise; } catch {}
  }
  const key = coordKey(place);
  const hit = omForecastCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const raw = await requestOpenMeteo('forecast', {
    latitude: place.lat,
    longitude: place.lon,
    timezone: 'Asia/Seoul',
    current: currentFields,
    hourly: hourlyFields,
    past_days: 1,
    forecast_days: 2
  });
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (data && Array.isArray(data.hourly?.time) && data.hourly.time.length) {
    omForecastCache.set(key, { expires: Date.now() + 3 * 60000, data });
    return data;
  }
  throw Error('격자 날씨 자료 조회 지연');
}

export async function loadWeather(place, obs = null, { skipKmaNetwork = false } = {}) {
  const [omSettled, kmaSettled] = await Promise.allSettled([
    getSingleOpenMeteoForecast(place),
    loadKmaForecast(place, { cacheOnly: skipKmaNetwork })
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

  // 기상청 초단기·단기예보(기온·습도·풍속·강수확률·강수형태)를 6시간 ICON 앙상블 표에도 동기화하여
  // 상단 타임라인(기상청 4~5°C)과 6시간 표(Open-Meteo 광역 격자 7.6~7.7°C) 간 야간 복사냉각 기온 괴리 원천 제거
  if (kmaData?.hours?.length) {
    for (const r of rows) {
      const kh = kmaData.hours.find(h => h.time && h.time.slice(0, 16) === r.time.slice(0, 16));
      if (kh) {
        const kTemp = kh.temp != null && kh.temp !== '' ? Number(kh.temp) : NaN;
        if (Number.isFinite(kTemp)) {
          r.omTemp = r.temp;
          r.temp = kTemp;
        }
        const kHum = kh.humidity != null && kh.humidity !== '' ? Number(kh.humidity) : NaN;
        if (Number.isFinite(kHum)) {
          r.humidity = kHum;
        }
        const kWind = kh.wind != null && kh.wind !== '' ? Number(kh.wind) : NaN;
        if (Number.isFinite(kWind)) {
          r.wind = kWind;
        }
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
    if (ensemblePrefetchPromise) {
      try { await ensemblePrefetchPromise; } catch {}
    }
    const key = coordKey(place);
    const hit = omEnsembleCache.get(key);
    let ens = hit && hit.expires > Date.now() ? hit.data : null;

    if (!ens) {
      const raw = await requestOpenMeteo('ensemble', {
        latitude: place.lat,
        longitude: place.lon,
        timezone: 'Asia/Seoul',
        hourly: 'rain,snowfall',
        models: 'icon_seamless',
        forecast_hours: 8
      });
      ens = Array.isArray(raw) ? raw[0] : raw;
      if (ens && Array.isArray(ens.hourly?.time) && ens.hourly.time.length) {
        const ts = Date.now();
        omEnsembleCache.set(key, { expires: ts + 30 * 60000, fetchedAt: ts, data: ens });
      }
    }

    for (const r of rows) {
      const idx = ens.hourly.time.indexOf(r.time);
      const rPop = ensembleProbability(ens.hourly, 'rain', idx);
      const sPop = ensembleProbability(ens.hourly, 'snowfall', idx);
      if (rPop !== null) r.rainPop = rPop;
      if (sPop !== null) r.snowPop = sPop;
    }
  } catch {
    // Fallback heuristic if ensemble API is slow or 429 rate-limited
    for (const r of rows) {
      if (r.rainPop === null) r.rainPop = r.temp !== null && r.temp <= 0 ? 0 : (r.pop ?? 0);
      if (r.snowPop === null) r.snowPop = r.temp !== null && r.temp <= 1 ? (r.pop ?? 0) : 0;
    }
  }
}
