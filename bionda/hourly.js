import { apiUrl, getApiBase, setApiBase, DEFAULT_API_BASE } from './config.js';
import { getKmaIconInfo, renderKmaIconSvg, renderWindArrowSvg } from './kma-icons.js';
import {
  readPageCache,
  writePageCache,
  clearPageCache,
  evaluateCachePolicy,
  currentKstHourKey as cacheHourKey,
  DEFAULT_FRESH_MS,
  DEFAULT_DWELL_MS,
  HOURLY_REFRESH_MS
} from './page-cache.js';

const SETTINGS_KEY = 'weather-watch:settings:v2';
const HOURLY_CACHE_KEY = 'weather-watch:cache:hourly:v1';
const hourlyCacheScope = () => getApiBase() || '__same_origin__';
const CORRIDOR_WATCH_POINTS = [
  { name: '대구 달성군남부', lat: 35.697, lon: 128.447 },
  { name: '함양중부', lat: 35.566, lon: 127.774 },
  { name: '거창군남부', lat: 35.644, lon: 127.910 },
  { name: '합천군서북부', lat: 35.706, lon: 128.168 },
  { name: '고령군', lat: 35.728, lon: 128.263 },
  { name: '남원', lat: 35.416, lon: 127.390 },
  { name: '함양', lat: 35.520, lon: 127.725 },
  { name: '거창', lat: 35.687, lon: 127.910 }
];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

let state = {
  range: '12',     // '6' | '12' (1920x1080 1-screen default) | '24' | 'tomorrow'
  mode: 'all',     // 'all' | 'pop' | 'temp' | 'pcp' | 'wind'
  sort: 'group',   // 'group' (고령·합천·거창·함양·달성) | 'route' (서->동)
  payload: null,
  fromSnapshot: false,
  fromCache: false,
  isRevalidating: false,
  cacheSavedAt: 0,
  lastLoadedAt: 0,
  selectedRegionId: null
};

// Dark / Light Theme synced with 상황판 index.html
function loadDarkMode() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return !!raw?.darkMode;
  } catch {
    return false;
  }
}

function applyDarkMode(on, persist = false) {
  document.body.classList.toggle('dark-mode', !!on);
  const lbl = $('themeToggleLabel');
  if (lbl) lbl.textContent = on ? '라이트모드' : '다크모드';
  if (persist) {
    try {
      const prev = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
      prev.darkMode = !!on;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(prev));
    } catch {}
  }
}

function formatHm(isoStr) {
  if (!isoStr) return '';
  return String(isoStr).slice(11, 16);
}

function formatMdHm(isoStr) {
  if (!isoStr) return '';
  const s = String(isoStr);
  if (s.endsWith('+09:00')) return `${s.slice(5, 10)} ${s.slice(11, 16)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return `${s.slice(5, 10)} ${s.slice(11, 16)}`;
  const k = new Date(d.getTime() + 9 * 3600000);
  const pad2 = n => String(n).padStart(2, '0');
  return `${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())} ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
}

export function alignHourlyMatrix(regions = [], range = '12') {
  const colMap = new Map();
  for (const r of regions) {
    for (const h of r?.hours || []) {
      const k = String(h?.time || '').slice(0, 13);
      if (k && !colMap.has(k)) colMap.set(k, h);
    }
  }
  let allCols = [...colMap.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
  if (range !== 'tomorrow') {
    const n = Number(range) || 12;
    allCols = allCols.slice(0, n);
  }
  const headerHours = allCols;

  const rows = regions.map(r => {
    const rMap = new Map();
    for (const h of r?.hours || []) {
      const k = String(h?.time || '').slice(0, 13);
      if (k) rMap.set(k, h);
    }
    const cells = headerHours.map(col => rMap.get(String(col.time).slice(0, 13)) || null);
    const validHours = cells.filter(Boolean);
    return {
      region: r,
      cells,
      hours: validHours,
      validCount: validHours.length,
      missingCount: Math.max(0, headerHours.length - validHours.length),
      sum: summarizeRegionSlice(validHours)
    };
  });

  return { headerHours, rows };
}

function getWindowHours(region) {
  const hrs = Array.isArray(region?.hours) ? region.hours : [];
  if (state.range === 'tomorrow') return hrs;
  const n = Number(state.range) || 12;
  return hrs.slice(0, n);
}

function summarizeRegionSlice(hours) {
  let wetHours = 0, firstWetTime = null;
  let freezingHours = 0, firstFreezingTime = null;
  let overlapHours = 0, firstOverlapTime = null;
  let minTemp = null, maxTemp = null, maxPop = 0, totalRainMm = 0, maxSnowCm = 0, maxWind = 0;

  for (const h of hours) {
    const t = h.temp != null && Number.isFinite(Number(h.temp)) ? Number(h.temp) : null;
    const pop = h.pop != null && Number.isFinite(Number(h.pop)) ? Number(h.pop) : 0;
    const isWet = !!h.wet;
    const isSubzero = t !== null && t < 0;

    if (isWet) {
      wetHours++;
      if (!firstWetTime) firstWetTime = h.time;
    }
    if (isSubzero) {
      freezingHours++;
      if (!firstFreezingTime) firstFreezingTime = h.time;
    }
    if (isWet && isSubzero) {
      overlapHours++;
      if (!firstOverlapTime) firstOverlapTime = h.time;
    }
    if (t !== null) {
      minTemp = minTemp === null ? t : Math.min(minTemp, t);
      maxTemp = maxTemp === null ? t : Math.max(maxTemp, t);
    }
    if (pop > maxPop) maxPop = pop;
    if (Number.isFinite(h.rainMm)) totalRainMm += h.rainMm;
    if (Number.isFinite(h.snowCm) && h.snowCm > maxSnowCm) maxSnowCm = h.snowCm;
    if (Number.isFinite(h.wind) && h.wind > maxWind) maxWind = h.wind;
  }

  return {
    wetHours,
    firstWetTime,
    freezingHours,
    firstFreezingTime,
    overlapHours,
    firstOverlapTime,
    minTemp,
    maxTemp,
    maxPop,
    totalRainMm: Math.round(totalRainMm * 10) / 10,
    maxSnowCm: Math.round(maxSnowCm * 10) / 10,
    maxWind: Math.round(maxWind * 10) / 10
  };
}

function orderedRegions() {
  const list = [...(state.payload?.regions || [])];
  if (state.sort === 'route') {
    list.sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99));
  }
  return list;
}

function nearestWatchPointUrl(region) {
  let best = CORRIDOR_WATCH_POINTS[0];
  let bestDist = Infinity;
  for (const pt of CORRIDOR_WATCH_POINTS) {
    const d = Math.hypot(pt.lat - region.lat, pt.lon - region.lon);
    if (d < bestDist) { bestDist = d; best = pt; }
  }
  return `./index.html#region/${encodeURIComponent(best.name)}/${best.lat.toFixed(3)},${best.lon.toFixed(3)}`;
}

function renderCellContent(h, iconInfo) {
  const tempText = h.temp != null ? `${h.temp}°` : '—';
  const popText = h.pop != null ? `${h.pop}%` : '—';

  if (state.mode === 'pop') {
    const sub = h.pty !== '0' ? h.skyLabel : (h.pop >= 50 ? '강수 높음' : '강수 낮음');
    return {
      c1: `<span class="hr-val-pop">${popText}</span>`,
      c2: sub,
      hasAmt: h.pop >= 50
    };
  }
  if (state.mode === 'temp') {
    const tag = h.temp == null ? '—' : h.temp < 0 ? '영하' : h.temp === 0 ? '0℃' : '영상';
    return {
      c1: `<span class="hr-temp">${tempText}</span>`,
      c2: tag,
      hasAmt: h.temp != null && h.temp < 0
    };
  }
  if (state.mode === 'pcp') {
    const hasSnow = h.snowCm > 0;
    const hasRain = h.rainMm > 0 || (h.wet && h.amount && !/없음/.test(h.amount));
    const pcpTxt = hasSnow
      ? `${h.snowCm}cm`
      : h.rainMm > 0
        ? `${h.rainMm.toFixed(1)}mm`
        : hasRain
          ? String(h.amount)
          : '—';
    return {
      c1: `<span>${esc(pcpTxt)}</span>`,
      c2: h.wet ? esc(iconInfo.label) : '강수 없음',
      hasAmt: h.wet
    };
  }
  if (state.mode === 'wind') {
    const wTxt = h.wind != null ? `${h.wind.toFixed(1)}` : '—';
    const arrow = renderWindArrowSvg(h.vec, 13);
    return {
      c1: `${arrow}<span>${wTxt}</span>`,
      c2: `${esc(h.windDir || '-')} m/s`,
      hasAmt: h.wind != null && h.wind >= 7
    };
  }

  // 종합 (기상청 단기예보 내장 SVG 아이콘 + 기온 + 강수량/강수확률)
  const amtSub = h.snowCm > 0
    ? `${h.snowCm}cm`
    : h.rainMm > 0
      ? `${h.rainMm.toFixed(1)}mm`
      : popText;
  return {
    c1: `${renderKmaIconSvg(iconInfo, 24)}<span class="hr-temp">${tempText}</span>`,
    c2: esc(amtSub),
    hasAmt: h.wet
  };
}

function renderKPIs(regionsWithSlices) {
  const labelRange = state.range === 'tomorrow' ? '내일까지' : `향후 ${state.range}시간`;
  $('kpiWetLabel').textContent = `${labelRange} 강수 예상`;
  $('kpiFreezingLabel').textContent = `${labelRange} 영하 예상`;
  $('kpiOverlapLabel').textContent = `강수·영하 동시 겹침`;

  let wetRegions = 0, freezingRegions = 0, overlapRegions = 0;
  let earliestWet = null, earliestFreezing = null, earliestOverlap = null, lowestTemp = null;

  for (const { sum } of regionsWithSlices) {
    if (sum.wetHours > 0) {
      wetRegions++;
      if (!earliestWet || sum.firstWetTime < earliestWet) earliestWet = sum.firstWetTime;
    }
    if (sum.freezingHours > 0) {
      freezingRegions++;
      if (!earliestFreezing || sum.firstFreezingTime < earliestFreezing) earliestFreezing = sum.firstFreezingTime;
    }
    if (sum.overlapHours > 0) {
      overlapRegions++;
      if (!earliestOverlap || sum.firstOverlapTime < earliestOverlap) earliestOverlap = sum.firstOverlapTime;
    }
    if (sum.minTemp !== null) {
      lowestTemp = lowestTemp === null ? sum.minTemp : Math.min(lowestTemp, sum.minTemp);
    }
  }

  $('kpiWetCount').innerHTML = `${wetRegions}<small> / 12곳</small>`;
  $('kpiWetPill').textContent = wetRegions > 0 ? `최초 ${formatHm(earliestWet)}~` : '강수 없음';

  $('kpiFreezingCount').innerHTML = `${freezingRegions}<small> / 12곳</small>`;
  $('kpiFreezingPill').textContent = freezingRegions > 0
    ? `최초 ${formatHm(earliestFreezing)}↓ · 최저 ${lowestTemp}°`
    : lowestTemp !== null ? `전 지역 영상 (최저 ${lowestTemp}°)` : '기온 확인';

  $('kpiOverlapCount').innerHTML = `${overlapRegions}<small> / 12곳</small>`;
  const ovPill = $('kpiOverlapPill');
  ovPill.textContent = overlapRegions > 0 ? `최초 ${formatHm(earliestOverlap)} 겹침` : '동시 겹침 없음';
  ovPill.classList.toggle('has-hits', overlapRegions > 0);
}

function renderSheet() {
  const sheet = $('sheet');
  const regions = orderedRegions();
  if (!regions.length) {
    sheet.innerHTML = '<div class="hr-loading">표시할 예보 자료가 없습니다. API 연결 상태를 확인해 주세요.</div>';
    return;
  }

  const { headerHours, rows: regionsWithSlices } = alignHourlyMatrix(regions, state.range);
  renderKPIs(regionsWithSlices);

  if (!headerHours.length) {
    sheet.innerHTML = '<div class="hr-loading">12개 지역 모두 예보 시간 데이터를 불러오지 못했습니다. 잠시 후 [새로고침]을 눌러 주세요.</div>';
    return;
  }

  const colCount = headerHours.length;
  const minColPx = state.range === '6' ? 88 : state.range === '12' ? 66 : 56;
  sheet.style.setProperty('--hr-cols', String(colCount));
  sheet.style.setProperty('--hr-min-col', `${minColPx}px`);

  // Header Row
  let html = '<div class="hr-headrow">';
  html += `<div class="hr-th hr-th-name">${state.sort === 'route' ? '대상 지역 (서→동 순)' : '대상 지역 (권역별)'}</div>`;
  html += `<div class="hr-th hr-th-sum">시작·요약 (${state.range === 'tomorrow' ? '내일' : state.range + 'h'})</div>`;

  const nowHst = new Date(Date.now() + 9 * 3600000).getUTCHours();
  for (let i = 0; i < headerHours.length; i++) {
    const h = headerHours[i];
    const prev = i > 0 ? headerHours[i - 1] : null;
    const isBoundary = prev && prev.dayNum !== h.dayNum;
    const cls = [
      'hr-hour',
      h.isNight ? 'is-night' : '',
      isBoundary ? 'is-day-boundary' : '',
      i === 0 ? 'is-now-col' : ''
    ].filter(Boolean).join(' ');
    const subTag = (i === 0 && h.hourKst === nowHst)
      ? '현재'
      : isBoundary
        ? `${h.dateLabel.slice(3)}일`
        : (i === 0 ? '시작' : (h.isTomorrow ? '내일' : '오늘'));
    html += `<div class="${cls}">${String(h.hourKst).padStart(2, '0')}시<small>${esc(subTag)}</small></div>`;
  }
  html += '</div>';

  // 12 Region Rows (모든 행이 headerHours와 동일한 colCount 열을 시간 키 매칭으로 유지 → 1곳 누락 시에도 격자 깨짐 없음)
  for (let idx = 0; idx < regionsWithSlices.length; idx++) {
    const { region: r, cells, validCount, missingCount, sum } = regionsWithSlices[idx];
    const prevRegion = idx > 0 ? regionsWithSlices[idx - 1].region : null;
    const isGroupStart = state.sort === 'group' && (!prevRegion || prevRegion.group !== r.group);
    const allMissing = validCount === 0;

    let sumTopHtml;
    let sumBotHtml;
    if (allMissing) {
      sumTopHtml = `<span class="hr-sum-missing">자료 누락</span><span class="hr-sum-freeze">일시 지연</span>`;
      sumBotHtml = `<span>—</span><span>수신 대기</span>`;
    } else {
      const wetTxt = sum.firstWetTime ? `강수 ${formatHm(sum.firstWetTime)}~` : '무강수';
      const frzTxt = sum.firstFreezingTime ? `영하 ${formatHm(sum.firstFreezingTime)}↓` : '영상';
      const tempRange = sum.minTemp !== null ? `${sum.minTemp}~${sum.maxTemp}°` : '—';
      const botRight = sum.overlapHours > 0
        ? `<span class="hr-sum-overlap">겹침 ${sum.overlapHours}h</span>`
        : missingCount > 0
          ? `<span class="hr-sum-missing">누락 ${missingCount}h</span>`
          : `<span>최대 ${sum.maxPop}%</span>`;
      sumTopHtml = `<span class="hr-sum-onset ${sum.wetHours > 0 ? 'is-wet' : ''}">${esc(wetTxt)}</span><span class="hr-sum-freeze ${sum.freezingHours > 0 ? 'is-cold' : ''}">${esc(frzTxt)}</span>`;
      sumBotHtml = `<span>${esc(tempRange)}</span>${botRight}`;
    }

    html += `<div class="hr-datarow ${isGroupStart ? 'groupstart' : ''} ${allMissing ? 'is-missing-row' : ''}" tabindex="0" role="button" data-region-id="${esc(r.id)}" aria-label="${esc(r.county)} ${esc(r.name)} 1시간 상세예보 보기">`;
    html += `<div class="hr-namecol"><span class="hr-groupbar" style="background:${esc(r.color)}"></span><div class="hr-geo"><div class="hr-geo-main">${esc(r.county)} ${esc(r.name)}</div><div class="hr-geo-sub">${esc(r.admin)} · ${state.sort === 'route' ? `노선 ${r.routeOrder}/12` : `${esc(r.group)}권역`}</div></div></div>`;
    html += `<div class="hr-sumcol"><div class="hr-sum-top">${sumTopHtml}</div><div class="hr-sum-bot">${sumBotHtml}</div></div>`;

    for (let j = 0; j < headerHours.length; j++) {
      const col = headerHours[j];
      const h = cells[j];
      const prevCol = j > 0 ? headerHours[j - 1] : null;
      const isBoundary = prevCol && prevCol.dayNum !== col.dayNum;

      if (!h) {
        const missCls = ['hr-cell', 'is-missing', col.isNight ? 'is-night' : '', isBoundary ? 'is-day-boundary' : ''].filter(Boolean).join(' ');
        html += `<div class="${missCls}" title="${esc(r.name)} ${esc(col.dateLabel)} ${String(col.hourKst).padStart(2, '0')}:00 · 예보 자료 일시 누락"><div class="hr-c1"><span class="hr-miss">—</span></div><div class="hr-c2">미수신</div><div class="hr-rainbar"><b style="width:0%"></b></div></div>`;
        continue;
      }

      const iconInfo = getKmaIconInfo({ sky: h.sky, pty: h.pty, isNight: h.isNight, lightning: h.lightning });
      const isSnow = h.wet && (h.snowCm > 0 || ['2', '3', '6', '7'].includes(String(h.pty)));
      const isSubzero = h.temp != null && h.temp < 0;
      const isWarm = h.temp != null && h.temp >= 12;
      const isOverlap = h.wet && isSubzero;
      const cellCls = [
        'hr-cell',
        h.isNight ? 'is-night' : '',
        isBoundary ? 'is-day-boundary' : '',
        isSnow ? 'is-snow' : (h.wet ? 'is-wet' : ''),
        (h.pop ?? 0) >= 60 ? 'is-highpop' : '',
        isSubzero ? 'is-subzero' : (isWarm ? 'is-warm' : ''),
        isOverlap ? 'is-overlap' : ''
      ].filter(Boolean).join(' ');

      const cell = renderCellContent(h, iconInfo);
      const popPct = Math.max(0, Math.min(100, Number(h.pop) || 0));
      html += `<div class="${cellCls}" title="${esc(r.name)} ${esc(h.dateLabel)} ${String(h.hourKst).padStart(2, '0')}:00 · ${esc(iconInfo.label)} ${h.temp ?? '-'}℃ · 강수확률 ${popPct}%"><div class="hr-c1">${cell.c1}</div><div class="hr-c2 ${cell.hasAmt ? 'has-amt' : ''}">${cell.c2}</div><div class="hr-rainbar"><b style="width:${popPct}%"></b></div></div>`;
    }
    html += '</div>';
  }

  sheet.innerHTML = html;

  sheet.querySelectorAll('.hr-datarow').forEach(el => {
    const open = () => openRegionDetail(el.dataset.regionId);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function openRegionDetail(regionId) {
  const region = (state.payload?.regions || []).find(r => r.id === regionId);
  if (!region) return;
  state.selectedRegionId = regionId;

  const hours = getWindowHours(region);
  const sum = summarizeRegionSlice(hours);
  const sharedText = region.sharedGridRegions?.length
    ? `공유 지역: ${region.sharedGridRegions.join(', ')}`
    : '동일 격자 공유 없음 (독립 격자)';

  $('dSubTag').textContent = `${region.admin} · ${region.group}권역 · 노선순 ${region.routeOrder}/12`;
  $('dTitle').textContent = `${region.county} ${region.name}`;
  $('dMeta').textContent = `기상청 DFS 격자 (${region.grid.nx}, ${region.grid.ny}) · ${sharedText} · 단기발표 ${formatMdHm(region.sources?.short) || '-'}`;

  $('dSummaryBoxes').innerHTML = `
    <div class="hr-mbox"><span>최대 강수확률</span><strong>${sum.maxPop}%</strong></div>
    <div class="hr-mbox"><span>예상 기온 범위</span><strong>${sum.minTemp ?? '-'} ~ ${sum.maxTemp ?? '-'}°C</strong></div>
    <div class="hr-mbox"><span>강수 시작 예상</span><strong>${sum.firstWetTime ? formatMdHm(sum.firstWetTime) : '강수 없음'}</strong></div>
    <div class="hr-mbox"><span>영하 진입 예상</span><strong>${sum.firstFreezingTime ? formatMdHm(sum.firstFreezingTime) : '영상 유지'}</strong></div>
    <div class="hr-mbox"><span>강수·영하 동시 겹침</span><strong>${sum.overlapHours > 0 ? `${sum.overlapHours}시간 (${formatHm(sum.firstOverlapTime)}~)` : '없음'}</strong></div>
    <div class="hr-mbox"><span>최대 풍속 / 누적 강수</span><strong>${sum.maxWind} m/s · ${sum.totalRainMm} mm</strong></div>
  `;

  // 기상청 날씨누리 short-term.do 형식 다행 상세표
  if (!hours.length) {
    $('dKmaTable').innerHTML = '<div class="hr-loading">이 지역의 기상청 단기·초단기예보 자료를 일시적으로 불러오지 못했습니다. 상단 [새로고침]을 눌러 다시 조회해 주세요.</div>';
    $('dCorridorLink').href = nearestWatchPointUrl(region);
    const dlg = $('detailDialog');
    if (!dlg.open) dlg.showModal();
    return;
  }

  let tbl = '<table class="hr-kma-tbl"><thead><tr><th>항목</th>';
  for (const h of hours) {
    tbl += `<th>${esc(h.dateLabel.slice(3))}일<br>${String(h.hourKst).padStart(2, '0')}시</th>`;
  }
  tbl += '</tr></thead><tbody>';

  // 날씨 (아이콘 + 상태)
  tbl += '<tr><th>날씨</th>';
  for (const h of hours) {
    const ic = getKmaIconInfo({ sky: h.sky, pty: h.pty, isNight: h.isNight, lightning: h.lightning });
    const ovCls = h.wet && h.temp != null && h.temp < 0 ? 'is-overlap-col' : '';
    tbl += `<td class="${ovCls}">${renderKmaIconSvg(ic, 22)}<div style="font-size:10px">${esc(ic.label)}</div></td>`;
  }
  tbl += '</tr>';

  // 기온
  tbl += '<tr><th>기온(℃)</th>';
  for (const h of hours) {
    const sub = h.temp != null && h.temp < 0 ? ' style="color:#0284c7;font-weight:850"' : '';
    tbl += `<td${sub}>${h.temp != null ? `${h.temp}°` : '-'}</td>`;
  }
  tbl += '</tr>';

  // 강수확률
  tbl += '<tr><th>강수확률(%)</th>';
  for (const h of hours) tbl += `<td>${h.pop != null ? `${h.pop}%` : '-'}</td>`;
  tbl += '</tr>';

  // 강수/적설
  tbl += '<tr><th>강수·적설</th>';
  for (const h of hours) {
    const txt = h.snowCm > 0 ? `${h.snowCm}cm` : h.rainMm > 0 ? `${h.rainMm}mm` : (h.wet && h.amount ? h.amount : '-');
    tbl += `<td>${esc(txt)}</td>`;
  }
  tbl += '</tr>';

  // 바람
  tbl += '<tr><th>바람(m/s)</th>';
  for (const h of hours) {
    tbl += `<td><div class="hr-kma-wind-cell">${renderWindArrowSvg(h.vec, 12)}<span>${esc(h.windDir || '-')}</span><b>${h.wind != null ? h.wind.toFixed(1) : '-'}</b></div></td>`;
  }
  tbl += '</tr>';

  // 습도
  tbl += '<tr><th>습도(%)</th>';
  for (const h of hours) tbl += `<td>${h.humidity != null ? `${h.humidity}%` : '-'}</td>`;
  tbl += '</tr></tbody></table>';

  $('dKmaTable').innerHTML = tbl;
  $('dCorridorLink').href = nearestWatchPointUrl(region);

  const dlg = $('detailDialog');
  if (!dlg.open) dlg.showModal();
}

function updateSourceStatus() {
  const pill = $('hourlySourcePill');
  const stamp = $('hourlyStamp');
  const footerStamp = $('hourlyFooterStamp');
  const apiBtnLabel = $('hourlyApiBtnLabel');
  const p = state.payload;

  if (!p) {
    pill.hidden = false;
    pill.textContent = '연결 오류';
    pill.className = 'hr-status-pill is-error';
    return;
  }

  const shortStr = formatMdHm(p.sources?.shortBase) || '-';
  const ultraStr = formatMdHm(p.sources?.ultraBase) || '-';

  if (state.fromSnapshot) {
    pill.hidden = false;
    pill.textContent = '스냅샷 기준 (백엔드 오프라인)';
    pill.className = 'hr-status-pill is-snapshot';
    if (apiBtnLabel) apiBtnLabel.textContent = '스냅샷';
  } else {
    pill.hidden = true;
    pill.textContent = '';
    pill.className = 'hr-status-pill';
    if (apiBtnLabel) apiBtnLabel.textContent = 'API 연결됨';
  }

  const uniqCount = p.uniqueGridCount || 11;
  const stampText = `단기예보 ${shortStr} 발표(3h주기) · 초단기 ${ultraStr}(매시35분+) · 1회 통합 호출(${uniqCount}격자)`;
  stamp.textContent = stampText;
  if (footerStamp) {
    const syncNote = state.isRevalidating
      ? '캐시 즉시표출(백그라운드 최신화 중…) · 매 정시·36분·10분 자동 갱신'
      : state.fromCache
        ? '5분 내 캐시(3분 머무름 시 자동갱신) · 매 정시·36분·10분마다 자동 갱신'
        : '매 정시·36분·10분마다 자동 갱신';
    footerStamp.textContent = `기준 자료: ${stampText} · 갱신 ${formatMdHm(p.updatedAt)} · ${syncNote}`;
  }
}

let flashClearTimer = null;
function flashKpiCells(kind, cardEl) {
  const sheet = $('sheet');
  if (!sheet) return;
  const flashClasses = ['flash-wet', 'flash-freezing', 'flash-overlap'];
  sheet.classList.remove('is-dimming');
  sheet.querySelectorAll('.hr-cell').forEach(c => c.classList.remove(...flashClasses));
  sheet.querySelectorAll('.hr-datarow').forEach(r => r.classList.remove('flash-row'));
  document.querySelectorAll('[data-kpi-flash]').forEach(k => k.classList.remove('is-flashing', 'is-empty-pulse'));

  const selector = kind === 'wet'
    ? '.hr-cell.is-wet, .hr-cell.is-snow'
    : kind === 'freezing'
      ? '.hr-cell.is-subzero'
      : '.hr-cell.is-overlap';
  const targets = [...sheet.querySelectorAll(selector)];

  // Reflow로 연속 클릭 시 스윕 애니메이션 즉시 재시작
  void sheet.offsetWidth;

  if (!targets.length) {
    if (cardEl) cardEl.classList.add('is-empty-pulse');
    clearTimeout(flashClearTimer);
    flashClearTimer = setTimeout(() => {
      if (cardEl) cardEl.classList.remove('is-empty-pulse');
    }, 600);
    return;
  }

  const cls = `flash-${kind}`;
  sheet.classList.add('is-dimming');
  if (cardEl) cardEl.classList.add('is-flashing');
  for (const cell of targets) {
    cell.classList.add(cls);
    cell.closest('.hr-datarow')?.classList.add('flash-row');
  }
  const wrap = $('sheetWrap');
  if (wrap && targets[0]) {
    const cellRect = targets[0].getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (cellRect.left < wrapRect.left + 220 || cellRect.right > wrapRect.right) {
      targets[0].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  clearTimeout(flashClearTimer);
  flashClearTimer = setTimeout(() => {
    sheet.classList.remove('is-dimming');
    sheet.querySelectorAll('.hr-cell').forEach(c => c.classList.remove(...flashClasses));
    sheet.querySelectorAll('.hr-datarow').forEach(r => r.classList.remove('flash-row'));
    document.querySelectorAll('[data-kpi-flash]').forEach(k => k.classList.remove('is-flashing'));
  }, 1650);
}

let hourlyFetchInFlight = null;
let lastLoadedHourKst = null;
let topOfHourTimer = null;
let ultraPickupTimer = null;
let dwellRefreshTimer = null;

function buildBackgroundHourlyOpts(sources, nowMs = Date.now()) {
  const due = sources ? isUltraUpdateDue(sources, nowMs) : false;
  return due
    ? { ...computeManualRefreshFlags(sources, nowMs), silent: !!state.payload }
    : { force: false, silent: !!state.payload };
}

function scheduleHourlyDwellRefresh(delayMs) {
  clearTimeout(dwellRefreshTimer);
  dwellRefreshTimer = null;
  if (!Number.isFinite(delayMs) || delayMs === null) return;
  dwellRefreshTimer = setTimeout(() => {
    dwellRefreshTimer = null;
    if (typeof document !== 'undefined' && document.hidden) return;
    fetchShortTerm12Data(buildBackgroundHourlyOpts(state.payload?.sources, Date.now()));
  }, Math.max(5000, delayMs));
}

/**
 * 상단 [새로고침] 버튼 클릭 시 사용자 지정 강제 재조회 규칙:
 * - 단기예보: 기존 기준시각(shortBase)으로부터 3시간(180분) 이상 경과 시 강제 갱신
 * - 초단기예보: 기존 기준시각(ultraBase)으로부터 10분 초과 경과 시 강제 갱신
 */
export function computeManualRefreshFlags(sources = {}, nowMs = Date.now()) {
  const shortMs = Date.parse(sources?.shortBase || '');
  const ultraMs = Date.parse(sources?.ultraBase || '');
  return {
    force: true,
    refreshShort: !Number.isFinite(shortMs) || (nowMs - shortMs) >= 3 * 3600000,
    refreshUltra: !Number.isFinite(ultraMs) || (nowMs - ultraMs) > 10 * 60000
  };
}

export function isUltraUpdateDue(sources = {}, nowMs = Date.now()) {
  const ultraMs = Date.parse(sources?.ultraBase || '');
  if (!Number.isFinite(ultraMs)) return true;
  // KMA 초단기는 매시 :30 발표분이 :35 무렵 생성되므로 직전 HH:30 대비 66분 경과(예: 05:30 -> 06:36) 시 신규 갱신 대상
  return (nowMs - ultraMs) >= 66 * 60000;
}

async function fetchShortTerm12Data(optsOrForce = false) {
  if (hourlyFetchInFlight) return hourlyFetchInFlight;
  const opts = typeof optsOrForce === 'object' && optsOrForce !== null
    ? optsOrForce
    : { force: Boolean(optsOrForce) };
  const force = Boolean(opts.force);
  const silent = Boolean(opts.silent && state.payload);
  const btn = $('reloadHourlyBtn');
  if (btn && !silent) btn.classList.add('is-busy');
  if (silent) {
    state.isRevalidating = true;
    updateSourceStatus();
  }

  hourlyFetchInFlight = (async () => {
    try {
      const params = new URLSearchParams();
      if (force) params.set('force', '1');
      if (opts.refreshShort !== undefined) params.set('refreshShort', opts.refreshShort ? '1' : '0');
      if (opts.refreshUltra !== undefined) params.set('refreshUltra', opts.refreshUltra ? '1' : '0');
      const qs = params.toString();
      const endpoint = apiUrl('/api/short-term-12' + (qs ? `?${qs}` : ''));
      const r = await fetch(endpoint, {
        signal: AbortSignal.timeout(15000),
        ...(force ? { cache: 'no-store' } : {})
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.ok && Array.isArray(data.regions)) {
          clearTimeout(dwellRefreshTimer);
          dwellRefreshTimer = null;
          const nowMs = Date.now();
          state.payload = data;
          state.fromSnapshot = false;
          state.fromCache = false;
          state.isRevalidating = false;
          state.cacheSavedAt = nowMs;
          state.lastLoadedAt = nowMs;
          lastLoadedHourKst = cacheHourKey(nowMs);
          writePageCache(HOURLY_CACHE_KEY, { scope: hourlyCacheScope(), data, nowMs });
          updateSourceStatus();
          renderSheet();
          if ($('detailDialog')?.open && state.selectedRegionId) openRegionDetail(state.selectedRegionId);
          return;
        }
      }
    } catch {}

    if (silent && state.payload) {
      state.isRevalidating = false;
      updateSourceStatus();
      return;
    }

    // Fallback to static snapshot JSON generated at build time
    try {
      const r2 = await fetch('./api/short-term-12.json', { signal: AbortSignal.timeout(8000) });
      if (r2.ok) {
        const snap = await r2.json();
        if (snap?.ok && Array.isArray(snap.regions)) {
          state.payload = snap;
          state.fromSnapshot = true;
          state.fromCache = false;
          state.isRevalidating = false;
          state.lastLoadedAt = Date.now();
          lastLoadedHourKst = cacheHourKey();
          updateSourceStatus();
          renderSheet();
          if ($('detailDialog')?.open && state.selectedRegionId) openRegionDetail(state.selectedRegionId);
          return;
        }
      }
    } catch {}

    state.payload = null;
    state.fromCache = false;
    state.isRevalidating = false;
    updateSourceStatus();
    $('sheet').innerHTML = '<div class="hr-loading">단기예보 API 서버에 연결하지 못했습니다. 상단 [API 연결]에서 Worker 주소를 확인한 뒤 다시 시도해 주세요.</div>';
  })().finally(() => {
    hourlyFetchInFlight = null;
    if (btn) btn.classList.remove('is-busy');
  });
  return hourlyFetchInFlight;
}

export function msUntilNextTopOfHour(nowMs = Date.now(), marginMs = 1500) {
  return (3600000 - (nowMs % 3600000)) + marginMs;
}

export function msUntilNextUltraRelease(nowMs = Date.now(), minute = 36, second = 15) {
  const hourMs = 3600000;
  const hourStart = nowMs - (nowMs % hourMs);
  let target = hourStart + minute * 60000 + second * 1000;
  if (target <= nowMs) target += hourMs;
  return target - nowMs;
}

function scheduleTopOfHourRefresh() {
  clearTimeout(topOfHourTimer);
  const waitMs = msUntilNextTopOfHour(Date.now(), 1500);
  topOfHourTimer = setTimeout(() => {
    fetchShortTerm12Data({ force: true, refreshShort: true, refreshUltra: true }).finally(scheduleTopOfHourRefresh);
  }, waitMs);
}

function scheduleUltraPickupRefresh() {
  clearTimeout(ultraPickupTimer);
  const waitMs = msUntilNextUltraRelease(Date.now(), 36, 15);
  ultraPickupTimer = setTimeout(() => {
    const flags = computeManualRefreshFlags(state.payload?.sources, Date.now());
    fetchShortTerm12Data({ ...flags, refreshUltra: true }).finally(scheduleUltraPickupRefresh);
  }, waitMs);
}

function triggerSmartManualRefresh() {
  clearTimeout(dwellRefreshTimer);
  dwellRefreshTimer = null;
  state.isRevalidating = false;
  const flags = computeManualRefreshFlags(state.payload?.sources, Date.now());
  return fetchShortTerm12Data(flags);
}

function bindEvents() {
  applyDarkMode(loadDarkMode(), false);

  $('themeToggleBtn').addEventListener('click', () => {
    applyDarkMode(!document.body.classList.contains('dark-mode'), true);
  });

  $('reloadHourlyBtn').addEventListener('click', triggerSmartManualRefresh);

  document.querySelectorAll('[data-kpi-flash]').forEach(card => {
    const trigger = () => flashKpiCells(card.dataset.kpiFlash, card);
    card.addEventListener('click', trigger);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    });
  });

  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.range = btn.dataset.range;
      document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b === btn));
      renderSheet();
    });
  });

  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      renderSheet();
    });
  });

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.toggle('active', b === btn));
      renderSheet();
    });
  });

  const detailDlg = $('detailDialog');
  $('closeDetailBtn').addEventListener('click', () => detailDlg.close());
  detailDlg.addEventListener('click', e => {
    if (e.target === detailDlg) detailDlg.close();
  });

  const apiDlg = $('apiDialog');
  $('hourlyApiBtn').addEventListener('click', () => {
    $('hourlyApiInput').value = getApiBase() || DEFAULT_API_BASE;
    $('apiStatusDesc').textContent = state.fromSnapshot
      ? `현재 정적 스냅샷 Fallback 모드 (설정 주소: ${getApiBase() || '미설정'})`
      : `현재 연결됨: ${getApiBase() || '동일 도메인 로컬 서버 (/api/short-term-12)'}`;
    apiDlg.showModal();
  });
  $('closeApiDialogBtn').addEventListener('click', () => apiDlg.close());
  apiDlg.addEventListener('click', e => {
    if (e.target === apiDlg) apiDlg.close();
  });
  $('hourlyApiSaveBtn').addEventListener('click', () => {
    setApiBase($('hourlyApiInput').value.trim());
    clearPageCache(HOURLY_CACHE_KEY);
    apiDlg.close();
    fetchShortTerm12Data(true);
  });
  $('hourlyApiResetBtn').addEventListener('click', () => {
    setApiBase('');
    clearPageCache(HOURLY_CACHE_KEY);
    $('hourlyApiInput').value = getApiBase() || DEFAULT_API_BASE;
    apiDlg.close();
    fetchShortTerm12Data(true);
  });

  // 1) 매 정시(HH:00:01.5 KST) 및 매시 36분(KMA 초단기 발표 직후) 자동 새로고침 스케줄링
  scheduleTopOfHourRefresh();
  scheduleUltraPickupRefresh();

  // 2) 백그라운드 스로틀/절전 복귀로 정시·초단기 또는 10분 주기가 지난 경우 즉시 보정 새로고침
  const checkHourOrStale = () => {
    const nowMs = Date.now();
    const hourChanged = lastLoadedHourKst && cacheHourKey(nowMs) !== lastLoadedHourKst;
    const ultraDue = state.payload?.sources ? isUltraUpdateDue(state.payload.sources, nowMs) : false;
    const stale10m = state.lastLoadedAt > 0 && (nowMs - state.lastLoadedAt) >= HOURLY_REFRESH_MS;
    if (hourChanged || ultraDue || stale10m) {
      if (hourChanged) {
        scheduleTopOfHourRefresh();
        scheduleUltraPickupRefresh();
        fetchShortTerm12Data({ ...computeManualRefreshFlags(state.payload?.sources, nowMs), force: true, silent: !!state.payload });
        return;
      }
      fetchShortTerm12Data(buildBackgroundHourlyOpts(state.payload?.sources, nowMs));
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkHourOrStale();
  });
  setInterval(checkHourOrStale, 60000);

  // 3) 10분마다 주기적 자동 갱신 (1시간 예보 특성을 고려한 호출량·신선도 균형)
  setInterval(() => {
    fetchShortTerm12Data(buildBackgroundHourlyOpts(state.payload?.sources, Date.now()));
  }, HOURLY_REFRESH_MS);
}

function restoreHourlyCacheAndBoot() {
  const nowMs = Date.now();
  const hit = readPageCache(HOURLY_CACHE_KEY, { expectedScope: hourlyCacheScope(), nowMs });
  const cachedPayload = hit?.entry?.data;
  const validPayload = Boolean(cachedPayload?.ok && !cachedPayload._fromSnapshot && Array.isArray(cachedPayload.regions));
  const ultraDue = validPayload ? isUltraUpdateDue(cachedPayload.sources, nowMs) : false;
  const policy = evaluateCachePolicy({
    cacheHit: validPayload ? hit : null,
    freshMs: DEFAULT_FRESH_MS,
    dwellMs: DEFAULT_DWELL_MS,
    forceImmediate: ultraDue
  });

  if (policy.hasUsableCache && validPayload) {
    state.payload = cachedPayload;
    state.fromSnapshot = false;
    state.fromCache = true;
    state.cacheSavedAt = hit.entry.savedAt;
    state.lastLoadedAt = hit.entry.savedAt;
    lastLoadedHourKst = hit.entry.hourKey || cacheHourKey(nowMs);
    state.isRevalidating = policy.shouldFetchNow;

    updateSourceStatus();
    renderSheet();

    if (policy.shouldFetchNow) {
      fetchShortTerm12Data(buildBackgroundHourlyOpts(cachedPayload.sources, nowMs));
    } else if (policy.backgroundDwellDelayMs != null) {
      scheduleHourlyDwellRefresh(policy.backgroundDwellDelayMs);
    }
    return;
  }

  fetchShortTerm12Data(false);
}

if (typeof document !== 'undefined') {
  bindEvents();
  restoreHourlyCacheAndBoot();
}
