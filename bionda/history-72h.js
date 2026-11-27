import { apiUrl } from './config.js';

export const BRANCH_STN_ORDER = ['14206', '14409', '14207', '14208', '14209', '14103', '14410'];
export const ALL11_STN_ORDER = ['14205', '14407', '14102', '14408', ...BRANCH_STN_ORDER];
const SPRAY_STORAGE_KEY = 'weather-watch:history72h-sprays:v1';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function toKstInputValue(ms = Date.now()) {
  const k = new Date(ms + 9 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export function parseKstInputToMs(val) {
  const s = String(val || '').trim();
  if (!s) return NaN;
  if (s.includes('+09:00') || s.endsWith('Z')) return Date.parse(s);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Date.parse(`${s}:00+09:00`);
  return Date.parse(s);
}

export function fmtKstShort(isoOrMs) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ms)) return String(isoOrMs || '—');
  const k = new Date(ms + 9 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

/**
 * 여러 개의 12시간 청크(/api/road-obs-history)를 시간순으로 중복 제거·병합하는 순수 함수
 */
export function mergeHistoryChunks(chunks = []) {
  const timeIndexMap = new Map();
  const stnMetaMap = new Map();

  for (const ch of chunks || []) {
    if (!ch?.ok || !Array.isArray(ch.times)) continue;
    for (let i = 0; i < ch.times.length; i++) {
      const iso = ch.times[i];
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) continue;
      if (!timeIndexMap.has(iso)) {
        timeIndexMap.set(iso, { iso, ms, tm1: ch.tm1s?.[i] || '', byStn: new Map() });
      }
      const slotRec = timeIndexMap.get(iso);
      for (const [stnId, stnObj] of Object.entries(ch.stations || {})) {
        if (!stnMetaMap.has(stnId)) {
          stnMetaMap.set(stnId, {
            stnId,
            name: stnObj.name || stnId,
            km: stnObj.km ?? null,
            stationType: stnObj.stationType || '',
            elevation: stnObj.elevation ?? null
          });
        }
        slotRec.byStn.set(stnId, {
          tr: stnObj.tr?.[i] ?? null,
          ta: stnObj.ta?.[i] ?? null,
          rh: stnObj.rh?.[i] ?? null,
          sc: stnObj.sc?.[i] ?? null,
          ss: stnObj.ss?.[i] ?? null,
          rn: stnObj.rn?.[i] ?? null,
          sd: stnObj.sd?.[i] ?? null,
          ws: stnObj.ws?.[i] ?? null,
          vis: stnObj.vis?.[i] ?? null,
          presalt: stnObj.presalt?.[i] ?? null
        });
      }
    }
  }

  const sortedSlots = [...timeIndexMap.values()].sort((a, b) => a.ms - b.ms);
  const times = sortedSlots.map(s => s.iso);
  const tm1s = sortedSlots.map(s => s.tm1);
  const stations = {};

  for (const [stnId, meta] of stnMetaMap.entries()) {
    const series = { ...meta, tr: [], ta: [], rh: [], sc: [], ss: [], rn: [], sd: [], ws: [], vis: [], presalt: [] };
    for (const sl of sortedSlots) {
      const v = sl.byStn.get(stnId);
      series.tr.push(v?.tr ?? null);
      series.ta.push(v?.ta ?? null);
      series.rh.push(v?.rh ?? null);
      series.sc.push(v?.sc ?? null);
      series.ss.push(v?.ss ?? null);
      series.rn.push(v?.rn ?? null);
      series.sd.push(v?.sd ?? null);
      series.ws.push(v?.ws ?? null);
      series.vis.push(v?.vis ?? null);
      series.presalt.push(v?.presalt ?? null);
    }
    stations[stnId] = series;
  }

  return { ok: true, times, tm1s, stations, slotCount: times.length };
}

function findNearestSlotIdx(times = [], targetMs, maxTolMs = 45 * 60000) {
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(Date.parse(times[i]) - targetMs);
    if (diff < bestDiff && diff <= maxTolMs) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * 제설 투입(예비살포·본살포) 전 2시간(T-2h) -> 살포 시점(T=0) -> 후 2시간(T+2h) 기상·노면 상태 자동 매칭 분석
 */
export function analyzeSprayEventWindow({ merged, event } = {}) {
  const sprayMs = parseKstInputToMs(event?.timeIso);
  if (!merged?.times?.length || !Number.isFinite(sprayMs)) {
    return { matched: false, event };
  }

  const idx0 = findNearestSlotIdx(merged.times, sprayMs, 65 * 60000);
  if (idx0 < 0) return { matched: false, event };

  const idxBefore = findNearestSlotIdx(merged.times, sprayMs - 2 * 3600000, 75 * 60000);
  const idxAfter = findNearestSlotIdx(merged.times, sprayMs + 2 * 3600000, 75 * 60000);

  // 기준 관측소 결정 ('all'이면 T=0 시점 고령지사 7개소 중 최저 노면온도 관측소 선택)
  let targetStnId = event.stnId && event.stnId !== 'all' ? String(event.stnId) : '';
  if (!targetStnId || !merged.stations[targetStnId]) {
    let minTr = Infinity;
    for (const id of BRANCH_STN_ORDER) {
      const s = merged.stations[id];
      const v = s?.tr?.[idx0];
      if (Number.isFinite(v) && v < minTr) {
        minTr = v;
        targetStnId = id;
      }
    }
    if (!targetStnId) targetStnId = Object.keys(merged.stations)[0] || '';
  }

  const stn = merged.stations[targetStnId];
  if (!stn) return { matched: false, event };

  const readAt = idx => (idx >= 0 ? {
    time: merged.times[idx],
    ta: stn.ta[idx],
    tr: stn.tr[idx],
    rh: stn.rh[idx],
    ss: stn.ss[idx] || '건조',
    presalt: stn.presalt[idx] || '정상'
  } : null);

  const before2h = readAt(idxBefore);
  const atSpray = readAt(idx0);
  const after2h = readAt(idxAfter);

  let minTrAfter2h = atSpray?.tr ?? null;
  for (let i = idx0; i < merged.times.length; i++) {
    const tMs = Date.parse(merged.times[i]);
    if (tMs - sprayMs > 2.5 * 3600000) break;
    const v = stn.tr[i];
    if (Number.isFinite(v) && (minTrAfter2h === null || v < minTrAfter2h)) minTrAfter2h = v;
  }

  const coolingDelta2h = (before2h?.tr != null && atSpray?.tr != null)
    ? Number((atSpray.tr - before2h.tr).toFixed(1))
    : null;

  const cleanStn = String(stn.name || targetStnId).replace(/\(도\)$/, '');
  const coolingTxt = coolingDelta2h !== null
    ? `2시간 전 대비 노면 ${coolingDelta2h > 0 ? '+' : ''}${coolingDelta2h.toFixed(1)}°C 변화`
    : '사전 추이 확인';
  const rationaleSummary =
    `[${event.kind} · ${fmtKstShort(sprayMs)} · ${cleanStn} 기준] ` +
    `투입 시점 대기 ${atSpray.ta ?? '—'}°C / 노면 ${atSpray.tr ?? '—'}°C (${atSpray.ss}, ${atSpray.presalt}) · ` +
    `${coolingTxt} → 투입 후 2h 최저 노면 ${minTrAfter2h ?? '—'}°C (${after2h?.ss || '확인중'})`;

  return {
    matched: true,
    event,
    stationId: targetStnId,
    stationName: cleanStn,
    before2h,
    atSpray,
    after2h,
    minTrAfter2h,
    coolingDelta2h,
    rationaleSummary
  };
}

/**
 * 엑셀/한셀에서 한글 깨짐 없이 바로 열리는 UTF-8 BOM CSV 문자열 생성 순수 함수
 */
export function buildHistoryCsvContent({ merged, scope = 'branch', sprayEvents = [] } = {}) {
  const order = scope === 'all11' ? ALL11_STN_ORDER : BRANCH_STN_ORDER;
  const stnIds = order.filter(id => merged?.stations?.[id]);
  const extraIds = Object.keys(merged?.stations || {}).filter(id => scope === 'all11' && !stnIds.includes(id));
  const targetIds = [...stnIds, ...extraIds];

  // 각 살포 이벤트를 가장 가까운 슬롯 인덱스에 매핑
  const sprayBySlot = new Map();
  for (const ev of sprayEvents || []) {
    const ms = parseKstInputToMs(ev.timeIso);
    if (!Number.isFinite(ms) || !merged?.times?.length) continue;
    const idx = findNearestSlotIdx(merged.times, ms, 35 * 60000);
    if (idx >= 0) {
      if (!sprayBySlot.has(idx)) sprayBySlot.set(idx, []);
      sprayBySlot.get(idx).push(ev);
    }
  }

  const csvCell = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    '관측일시(KST)',
    'KMA시각코드',
    '이정(km)',
    '관측소ID',
    '관측소명',
    '구분',
    '고도(m)',
    '대기온도(℃)',
    '노면온도_TR1(℃)',
    '상대습도(%)',
    '노면상태',
    '일강수량(mm)',
    '적설(cm)',
    '풍속(m/s)',
    '가시거리(m)',
    '예비살포조건판정',
    '근무매칭(예비/본살포)',
    '근무메모'
  ];
  const lines = [header.join(',')];

  const slotLen = merged?.times?.length || 0;
  for (let i = 0; i < slotLen; i++) {
    const kstStr = fmtKstShort(merged.times[i]);
    const tm1 = merged.tm1s?.[i] || '';
    const slotSprays = sprayBySlot.get(i) || [];

    for (const stnId of targetIds) {
      const s = merged.stations[stnId];
      if (!s) continue;
      const matchedEvs = slotSprays.filter(ev => !ev.stnId || ev.stnId === 'all' || String(ev.stnId) === stnId);
      const sprayLabel = matchedEvs.map(e => e.kind).join(' / ');
      const sprayMemo = matchedEvs.map(e => e.memo).filter(Boolean).join(' | ');

      lines.push([
        kstStr,
        tm1,
        s.km ?? '',
        stnId,
        s.name || stnId,
        s.stationType || '',
        s.elevation ?? '',
        s.ta[i] ?? '',
        s.tr[i] ?? '',
        s.rh[i] ?? '',
        s.ss[i] ?? '',
        s.rn[i] ?? '',
        s.sd[i] ?? '',
        s.ws[i] ?? '',
        s.vis[i] ?? '',
        s.presalt[i] ?? '',
        sprayLabel,
        sprayMemo
      ].map(csvCell).join(','));
    }
  }

  return '\uFEFF' + lines.join('\r\n');
}

/* ───────────────────── 브라우저 UI 바인딩 (수동 작동 전용) ───────────────────── */
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);

  const state = {
    merged: null,
    selectedStnId: 'coldest',
    sprays: loadSprays()
  };

  function loadSprays() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SPRAY_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSprays() {
    try {
      localStorage.setItem(SPRAY_STORAGE_KEY, JSON.stringify(state.sprays));
    } catch {}
  }

  function resetTimeInputsToNow() {
    const rounded = Math.floor((Date.now() - 3 * 60000) / (30 * 60000)) * (30 * 60000);
    if ($('histEndInput')) $('histEndInput').value = toKstInputValue(rounded);
    if ($('sprayTimeInput') && !$('sprayTimeInput').value) {
      $('sprayTimeInput').value = toKstInputValue(rounded - 2 * 3600000);
    }
  }

  async function fetchManualHistory() {
    const endMs = parseKstInputToMs($('histEndInput').value) || Date.now();
    const totalHours = Number($('histHoursSelect').value) || 72;
    const stepMin = Number($('histStepSelect').value) || 30;
    const chunkHours = stepMin === 10 ? 6 : 12;
    const numChunks = Math.ceil(totalHours / chunkHours);

    const btn = $('btnFetch72h');
    const csvBtn = $('btnDownloadCsv');
    const progBox = $('histProgressBox');
    const progLbl = $('histProgressLabel');
    const progPct = $('histProgressPct');
    const progFill = $('histProgressFill');

    btn.disabled = true;
    csvBtn.disabled = true;
    progBox.hidden = false;

    const chunks = [];
    try {
      for (let idx = 0; idx < numChunks; idx++) {
        const hrs = Math.min(chunkHours, totalHours - idx * chunkHours);
        const chunkEndMs = endMs - idx * chunkHours * 3600000;
        const pct = Math.round((idx / numChunks) * 100);
        progLbl.textContent = `기상청 API허브 과거 도로기상관측 수신 중… (${idx + 1} / ${numChunks} 구간)`;
        progPct.textContent = `${pct}%`;
        progFill.style.width = `${pct}%`;

        const url = apiUrl(`/api/road-obs-history?line=14&endMs=${chunkEndMs}&hours=${hrs}&stepMin=${stepMin}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.ok) chunks.push(data);
      }

      progPct.textContent = '100%';
      progFill.style.width = '100%';
      state.merged = mergeHistoryChunks(chunks);
      progLbl.textContent = `✅ 수신 완료 — 총 ${state.merged.slotCount}개 시각 슬롯 × ${Object.keys(state.merged.stations).length}개 관측소 병합됨`;
      csvBtn.disabled = state.merged.slotCount === 0;
      renderAll();
    } catch (err) {
      progLbl.textContent = `🚨 조회 실패: ${err?.message || err}`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderStationTabs() {
    const box = $('histStnTabs');
    if (!box || !state.merged?.slotCount) {
      if (box) box.innerHTML = '';
      return;
    }
    const scope = $('histScopeSelect').value;
    const ids = (scope === 'all11' ? ALL11_STN_ORDER : BRANCH_STN_ORDER).filter(id => state.merged.stations[id]);
    const items = [
      { id: 'coldest', label: '❄ 관할 최저 노면온도' },
      ...ids.map(id => {
        const s = state.merged.stations[id];
        return { id, label: `${String(s.name).replace(/\(도\)$/, '')} (${s.km ?? ''}k)` };
      })
    ];
    box.innerHTML = items.map(it =>
      `<button type="button" class="ops-stn-tab" data-stn="${esc(it.id)}" aria-pressed="${state.selectedStnId === it.id}">${esc(it.label)}</button>`
    ).join('');
    box.querySelectorAll('.ops-stn-tab').forEach(b => {
      b.addEventListener('click', () => {
        state.selectedStnId = b.dataset.stn;
        renderStationTabs();
        renderChart();
      });
    });
  }

  function renderChart() {
    const stage = $('histChartStage');
    const badge = $('histSummaryBadge');
    const m = state.merged;
    if (!m?.slotCount) return;

    const times = m.times;
    const trSeries = [];
    const taSeries = [];
    const wetFlags = [];
    const isMoistSfs = sc => [2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15].includes(Number(sc));

    for (let i = 0; i < times.length; i++) {
      if (state.selectedStnId === 'coldest') {
        let minTr = null;
        let pairTa = null;
        let anyWet = false;
        for (const id of BRANCH_STN_ORDER) {
          const s = m.stations[id];
          if (!s) continue;
          if (isMoistSfs(s.sc[i])) anyWet = true;
          if (Number.isFinite(s.tr[i]) && (minTr === null || s.tr[i] < minTr)) {
            minTr = s.tr[i];
            pairTa = s.ta[i];
          }
        }
        trSeries.push(minTr);
        taSeries.push(pairTa);
        wetFlags.push(anyWet);
      } else {
        const s = m.stations[state.selectedStnId];
        trSeries.push(s?.tr?.[i] ?? null);
        taSeries.push(s?.ta?.[i] ?? null);
        wetFlags.push(isMoistSfs(s?.sc?.[i]));
      }
    }

    const allVals = [...trSeries, ...taSeries, 0, 2].filter(v => Number.isFinite(v));
    const minV = Math.floor(Math.min(...allVals) - 2);
    const maxV = Math.ceil(Math.max(...allVals) + 2);
    const W = 1280, H = 310, padL = 52, padR = 24, padT = 26, padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const xOf = idx => padL + (times.length <= 1 ? plotW / 2 : (idx / (times.length - 1)) * plotW);
    const yOf = val => padT + ((maxV - val) / Math.max(1, maxV - minV)) * plotH;

    const buildPath = arr => {
      const segs = [];
      let open = false;
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) { open = false; continue; }
        segs.push(`${open ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(arr[i]).toFixed(1)}`);
        open = true;
      }
      return segs.join('');
    };

    const validTr = trSeries.filter(v => Number.isFinite(v));
    const lowestTr = validTr.length ? Math.min(...validTr).toFixed(1) : '—';
    badge.textContent = `${times.length}개 시점 · 최저 노면 ${lowestTr}°C`;

    const out = [];
    out.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="72시간 노면온도 및 대기온도 시계열 차트">`);
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#071322"/>`);

    // 노면 습윤/강수 구간 음영
    for (let i = 0; i < times.length; i++) {
      if (!wetFlags[i]) continue;
      const bw = Math.max(4, plotW / Math.max(1, times.length));
      out.push(`<rect x="${(xOf(i) - bw / 2).toFixed(1)}" y="${padT}" width="${bw.toFixed(1)}" height="${plotH}" fill="#38bdf8" fill-opacity="0.11"/>`);
    }

    // Y축 눈금 + 2°C 예비살포선 + 0°C 결빙선
    const stepY = (maxV - minV) > 22 ? 5 : 2;
    for (let v = Math.ceil(minV / stepY) * stepY; v <= maxV; v += stepY) {
      const y = yOf(v).toFixed(1);
      out.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#17304d" stroke-width="1"/>`);
      out.push(`<text x="${padL - 8}" y="${(Number(y) + 4).toFixed(1)}" text-anchor="end" fill="#7da0c4" font-size="11.5" font-weight="700">${v}°</text>`);
    }
    if (minV <= 2 && maxV >= 2) {
      const y2 = yOf(2).toFixed(1);
      out.push(`<line x1="${padL}" y1="${y2}" x2="${W - padR}" y2="${y2}" stroke="#fb923c" stroke-width="1.2" stroke-dasharray="5 4"/>`);
      out.push(`<text x="${W - padR - 4}" y="${(Number(y2) - 4).toFixed(1)}" text-anchor="end" fill="#fdba74" font-size="11" font-weight="800">예비살포 기준 2°C</text>`);
    }
    if (minV <= 0 && maxV >= 0) {
      const y0 = yOf(0).toFixed(1);
      out.push(`<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      out.push(`<text x="${W - padR - 4}" y="${(Number(y0) - 4).toFixed(1)}" text-anchor="end" fill="#fda4af" font-size="11" font-weight="800">결빙선 0°C</text>`);
    }

    // X축 시간 라벨
    const labelEvery = Math.max(1, Math.floor(times.length / 8));
    for (let i = 0; i < times.length; i += labelEvery) {
      const x = xOf(i).toFixed(1);
      const lbl = fmtKstShort(times[i]).slice(5);
      out.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#12263e" stroke-width="1"/>`);
      out.push(`<text x="${x}" y="${H - 14}" text-anchor="middle" fill="#8fb2d4" font-size="11.5" font-weight="700">${esc(lbl)}</text>`);
    }

    // 대기온도(점선) & 노면온도(실선)
    out.push(`<path d="${buildPath(taSeries)}" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="4 3"/>`);
    out.push(`<path d="${buildPath(trSeries)}" fill="none" stroke="#38dbf8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`);

    // 등록된 예비살포·본살포 수직 마커 표시
    const startMs = Date.parse(times[0]);
    const endMs = Date.parse(times[times.length - 1]);
    for (const ev of state.sprays) {
      const ms = parseKstInputToMs(ev.timeIso);
      if (!Number.isFinite(ms) || ms < startMs - 1800000 || ms > endMs + 1800000) continue;
      const ratio = Math.max(0, Math.min(1, (ms - startMs) / Math.max(1, endMs - startMs)));
      const sx = (padL + ratio * plotW).toFixed(1);
      const col = ev.kind === '본살포' ? '#f43f5e' : ev.kind === '예비살포' ? '#fb923c' : '#34d399';
      out.push(`<line x1="${sx}" y1="${padT}" x2="${sx}" y2="${padT + plotH}" stroke="${col}" stroke-width="2"/>`);
      out.push(`<rect x="${(Number(sx) - 52).toFixed(1)}" y="${padT + 2}" width="104" height="20" rx="5" fill="${col}"/>`);
      out.push(`<text x="${sx}" y="${padT + 16}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="850">${esc(ev.kind)} ${esc(fmtKstShort(ms).slice(11))}</text>`);
    }

    // 범례
    out.push(`<text x="${padL}" y="16" fill="#38dbf8" font-size="12" font-weight="800">━ 노면온도(TR1)</text>`);
    out.push(`<text x="${padL + 125}" y="16" fill="#cbd5e1" font-size="12" font-weight="750">┄ 대기온도(TA)</text>`);
    out.push(`<text x="${padL + 245}" y="16" fill="#7dd3fc" font-size="12" font-weight="750">▮ 하늘색 배경: 노면 습윤·젖음 구간</text>`);

    out.push('</svg>');
    stage.innerHTML = out.join('');
  }

  function renderSprayAnalysis() {
    const grid = $('sprayAnalysisGrid');
    const copyBtn = $('btnCopyReport');
    if (!grid) return;
    if (!state.sprays.length) {
      grid.innerHTML = '<div style="color:#7da0c4;font-size:13px;">등록된 예비살포·본살포 시각이 없습니다. 근무표의 출동·살포 시각을 추가하면 살포 전 2h → 살포 시점 → 살포 후 2h 기상 변화가 자동 매칭됩니다.</div>';
      if (copyBtn) copyBtn.disabled = true;
      return;
    }

    const analyses = state.sprays.map(ev => analyzeSprayEventWindow({ merged: state.merged, event: ev }));
    if (copyBtn) copyBtn.disabled = !analyses.some(a => a.matched);

    grid.innerHTML = analyses.map(a => {
      const ev = a.event;
      const cls = ev.kind === '본살포' ? 'is-main' : ev.kind === '예비살포' ? 'is-pre' : 'is-patrol';
      if (!a.matched) {
        return `
          <div class="ops-spray-card ${cls}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${esc(ev.kind)} · ${esc(fmtKstShort(parseKstInputToMs(ev.timeIso)))}</strong>
              <button type="button" class="ops-btn" data-del-spray="${esc(ev.id)}" style="padding:3px 8px;font-size:11.5px;">삭제</button>
            </div>
            <small style="color:#94a3b8;">${state.merged ? '조회된 시간 범위 밖의 기록입니다. 기준 종료일시를 조정해 조회해 주세요.' : '상단 [기상정보 수동 조회하기]를 실행하면 전·후 기상 상황이 자동 분석됩니다.'}</small>
          </div>
        `;
      }
      const b = a.before2h;
      const c = a.atSpray;
      const af = a.after2h;
      return `
        <div class="ops-spray-card ${cls}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${esc(ev.kind)} · ${esc(fmtKstShort(c.time))} (${esc(a.stationName)} 기준)</strong>
            <button type="button" class="ops-btn" data-del-spray="${esc(ev.id)}" style="padding:3px 8px;font-size:11.5px;">삭제</button>
          </div>
          <div class="ops-kv-list" style="font-size:12.5px;">
            <div class="ops-kv"><span>투입 2h 전</span><b>${b ? `대기 ${b.ta ?? '—'}°C · 노면 ${b.tr ?? '—'}°C (${b.ss})` : '범위 밖'}</b></div>
            <div class="ops-kv"><span>투입 시점 (T=0)</span><b style="color:#fde047;">대기 ${c.ta ?? '—'}°C · 노면 ${c.tr ?? '—'}°C · ${esc(c.ss)} (${esc(c.presalt)})</b></div>
            <div class="ops-kv"><span>투입 2h 후 / 최저</span><b>${af ? `대기 ${af.ta ?? '—'}°C · 노면 ${af.tr ?? '—'}°C (${af.ss})` : '확인중'} · 최저 ${a.minTrAfter2h ?? '—'}°C</b></div>
            ${ev.memo ? `<div class="ops-kv"><span>근무 메모</span><b>${esc(ev.memo)}</b></div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('[data-del-spray]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sprays = state.sprays.filter(s => s.id !== btn.dataset.delSpray);
        saveSprays();
        renderAll();
      });
    });
  }

  function renderTable() {
    const wrap = $('histTableWrap');
    const m = state.merged;
    if (!wrap || !m?.slotCount) return;

    const scope = $('histScopeSelect').value;
    const onlyPresalt = Boolean($('chkOnlyPresalt')?.checked);
    const order = (scope === 'all11' ? ALL11_STN_ORDER : BRANCH_STN_ORDER).filter(id => m.stations[id]);

    const sprayBySlot = new Map();
    for (const ev of state.sprays) {
      const idx = findNearestSlotIdx(m.times, parseKstInputToMs(ev.timeIso), 35 * 60000);
      if (idx >= 0) {
        if (!sprayBySlot.has(idx)) sprayBySlot.set(idx, []);
        sprayBySlot.get(idx).push(ev);
      }
    }

    const rows = [];
    for (let i = m.times.length - 1; i >= 0; i--) {
      const tTxt = fmtKstShort(m.times[i]);
      const slotSprays = sprayBySlot.get(i) || [];
      for (const stnId of order) {
        const s = m.stations[stnId];
        const matchedEvs = slotSprays.filter(ev => !ev.stnId || ev.stnId === 'all' || String(ev.stnId) === stnId);
        const presaltLbl = s.presalt[i] || '정상';
        const isPresalt = presaltLbl !== '정상';
        const isMatched = matchedEvs.length > 0;
        if (onlyPresalt && !isPresalt && !isMatched && !(Number.isFinite(s.tr[i]) && s.tr[i] <= 0)) continue;

        const rowCls = isMatched ? 'is-spray-matched' : isPresalt ? 'is-presalt-row' : '';
        const sprayTxt = matchedEvs.map(e => `${e.kind}${e.memo ? `(${e.memo})` : ''}`).join(', ');
        rows.push(`
          <tr class="${rowCls}">
            <td>${esc(tTxt)}</td>
            <td>${esc(String(s.name).replace(/\(도\)$/, ''))} <small style="color:#7da0c4;">${s.km ?? ''}k</small></td>
            <td>${s.ta[i] != null ? `${s.ta[i].toFixed(1)}°C` : '—'}</td>
            <td><b>${s.tr[i] != null ? `${s.tr[i].toFixed(1)}°C` : '—'}</b></td>
            <td>${s.rh[i] != null ? `${s.rh[i]}%` : '—'}</td>
            <td>${esc(s.ss[i] || '—')}</td>
            <td>${s.rn[i] != null ? `${s.rn[i]}mm` : '—'}</td>
            <td>${esc(presaltLbl)}</td>
            <td>${esc(sprayTxt || '—')}</td>
          </tr>
        `);
      }
    }

    if (!rows.length) {
      wrap.innerHTML = '<div class="ops-empty">조건에 해당하는 행이 없습니다.</div>';
      return;
    }

    wrap.innerHTML = `
      <table class="ops-table">
        <thead>
          <tr>
            <th>관측일시(KST)</th>
            <th>관측소(이정)</th>
            <th>대기온도</th>
            <th>노면온도(TR1)</th>
            <th>습도</th>
            <th>노면상태</th>
            <th>일강수</th>
            <th>판정</th>
            <th>근무표 매칭</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  function renderAll() {
    renderSprayAnalysis();
    if (state.merged?.slotCount) {
      renderStationTabs();
      renderChart();
      renderTable();
    }
  }

  resetTimeInputsToNow();
  renderSprayAnalysis();

  $('btnSetNow')?.addEventListener('click', resetTimeInputsToNow);
  $('btnFetch72h')?.addEventListener('click', fetchManualHistory);
  $('histScopeSelect')?.addEventListener('change', () => {
    if (state.merged?.slotCount) renderAll();
  });
  $('chkOnlyPresalt')?.addEventListener('change', () => {
    if (state.merged?.slotCount) renderTable();
  });

  $('btnAddSpray')?.addEventListener('click', () => {
    const timeVal = $('sprayTimeInput').value;
    if (!timeVal) return;
    state.sprays.push({
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: $('sprayKindSelect').value,
      timeIso: timeVal,
      stnId: $('sprayStnSelect').value,
      memo: $('sprayMemoInput').value.trim()
    });
    state.sprays.sort((a, b) => parseKstInputToMs(a.timeIso) - parseKstInputToMs(b.timeIso));
    $('sprayMemoInput').value = '';
    saveSprays();
    renderAll();
  });

  $('btnCopyReport')?.addEventListener('click', async () => {
    const lines = state.sprays
      .map(ev => analyzeSprayEventWindow({ merged: state.merged, event: ev }))
      .filter(a => a.matched)
      .map(a => a.rationaleSummary);
    if (!lines.length) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      $('btnCopyReport').textContent = '✅ 복사 완료!';
      setTimeout(() => { $('btnCopyReport').textContent = '📋 전·후 분석 요약 복사'; }, 2000);
    } catch {}
  });

  $('btnDownloadCsv')?.addEventListener('click', () => {
    if (!state.merged?.slotCount) return;
    const csv = buildHistoryCsvContent({
      merged: state.merged,
      scope: $('histScopeSelect').value,
      sprayEvents: state.sprays
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = fmtKstShort(Date.now()).replace(/[: ]/g, '-');
    a.href = url;
    a.download = `bionda-road-weather-history-${stamp}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
}
