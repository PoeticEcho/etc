/**
 * 고속국도 제12호선(광주대구선 · KMA 14번) 노선 미니맵 SVG 및 전구간 도로기상관측소 스트립 렌더 모듈
 * - public/app.js에서 분리된 독립 ES 모듈
 */
import { ROUTE12_POLYLINE_KM, ROUTE12_PLACE_KM } from './route12.js';
import { classifySeverityTier } from './ice.js';

export const ROUTE12_ICS = [
  ['남원56k', 35.430, 127.394, -10],
  ['지리산77k', 35.487, 127.589, 12],
  ['함양95k', 35.535, 127.752, 12],
  ['거창121k', 35.678, 127.934, -9],
  ['해인사146k', 35.696, 128.183, 12],
  ['고령153k', 35.702, 128.252, -9],
  ['옥포176k', 35.792, 128.463, -8]
];

export const ROUTE12_STN_KM_FALLBACK = [
  ['남원주차장', 50.8], ['번암교', 72.9], ['지리산휴', 75.4], ['옥계1교', 86.2],
  ['함양', 95.0], ['죽산천교', 102.9], ['남상졸음', 115.3], ['거창휴', 134.1],
  ['양전교', 158.2], ['논공휴', 169.2], ['논공교', 171.3]
];

const PLACE_SLOT_MAP = {
  '함양중부': { cx: 69, cy: 53, anchorY: 72 },
  '거창': { cx: 203, cy: 53, anchorY: 72 },
  '합천군서북부': { cx: 337, cy: 53, anchorY: 72 },
  '고령군': { cx: 471, cy: 53, anchorY: 72 },
  '남원': { cx: 69, cy: 210, anchorY: 191 },
  '함양': { cx: 203, cy: 210, anchorY: 191 },
  '거창군남부': { cx: 337, cy: 210, anchorY: 191 },
  '대구 달성군남부': { cx: 471, cy: 210, anchorY: 191 }
};

export function resolveStationKm(s) {
  if (Number.isFinite(s?.milepostKm)) return s.milepostKm;
  const match = ROUTE12_STN_KM_FALLBACK.find(([key]) => (s?.name || '').includes(key));
  return match ? match[1] : null;
}

/**
 * 미니맵 SVG 및 하단 도로기상관측소 목록·012선 위험요약 바를 렌더링한다.
 */
export function renderCorridorMiniMap({
  container,
  strip,
  riskSummaryEl,
  places = [],
  presets = [],
  roadStations = [],
  roadRiskData = null,
  recentEscalations = [],
  selectedWindyKey = '',
  coordOf,
  getEffectiveRecord,
  findStationRoadRisk,
  rainTimingSummary,
  onSelectTarget,
  fmt,
  n,
  el,
  escHtml
} = {}) {
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

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="고속국도 제12호선 광주대구선 실시간 노면·기상 미니맵">
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

  for (const [label, ila, ilo, dy] of ROUTE12_ICS) {
    const [ix, iy] = project(ila, ilo);
    svg += `<g class="ic-tick">
      <circle cx="${ix}" cy="${iy}" r="2.1" fill="#ecfdf5" opacity="0.82"/>
      <text x="${ix}" y="${(iy + dy).toFixed(1)}" text-anchor="middle" fill="#9dd5cd" font-size="7.8" font-weight="700" opacity="0.9">${label}</text>
    </g>`;
  }

  places.forEach((p) => {
    const isCorridorPreset = presets.some(q => coordOf(q) === coordOf(p));
    const slot = isCorridorPreset ? PLACE_SLOT_MAP[p.name] : null;
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
    const isPlaceSelected = selectedWindyKey === `place:${coordOf(p)}`;

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

    svg += `<g class="map-node" role="button" tabindex="0" aria-label="${escHtml(p.name)} 영상 선택" data-coord="${escHtml(coordOf(p))}" style="cursor:pointer">
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
    return '#38dbf8';
  };

  for (const stn of corridorStns) {
    const [sx, sy] = project(stn.lat, stn.lon);
    const kmTxt = stn.resolvedKm !== null ? `${stn.resolvedKm.toFixed(1)}k ` : '';
    const trTxt = stn.roadTemp !== null ? `노면 ${stn.roadTemp.toFixed(1)}°C` : '';
    const stnRisk = findStationRoadRisk(stn);
    const stnIceLv = Number.isInteger(stnRisk?.iceLevel) ? stnRisk.iceLevel : null;
    const riskTxt = stnIceLv ? ` · 012선 살얼음 ${stnIceLv}단계(${stnRisk.iceLabel})` : '';
    const dotCol = classifyStnCol(stn);
    const isSel = selectedWindyKey === `stn:${stn.stnId}`;
    const blinkCls = stnIceLv >= 3 ? ' rwis-zone-blink-danger' : stnIceLv === 2 ? ' rwis-zone-blink-caution' : '';
    svg += `<g class="stn-dot${blinkCls}" data-stnid="${escHtml(stn.stnId)}" role="button" tabindex="0" transform="translate(${sx},${sy})" style="cursor:pointer">
      <title>[도로기상 ${escHtml(kmTxt)}] ${escHtml(stn.name)} (${escHtml(stn.stationType)}, 고도 ${escHtml(stn.elevation ?? '—')}m) ${escHtml(trTxt)}${escHtml(riskTxt)} · 윈디 또는 CCTV 선택</title>
      <circle cx="0" cy="0" r="10.5" fill="transparent"/>
      ${(isSel || stnIceLv >= 2) ? `<circle cx="0" cy="0" r="${stnIceLv >= 2 ? 11.5 : 9.5}" fill="${stnIceLv >= 3 ? 'rgba(244,63,94,0.32)' : stnIceLv === 2 ? 'rgba(251,146,60,0.30)' : 'rgba(56,189,248,0.28)'}" stroke="${stnIceLv >= 3 ? '#f43f5e' : stnIceLv === 2 ? '#fb923c' : '#38bdf8'}" stroke-width="1.5"/>` : ''}
      <circle class="stn-marker-core" cx="0" cy="0" r="4.3" fill="${dotCol}" stroke="#041418" stroke-width="1.4"/>
    </g>`;
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  container.querySelectorAll('.map-node, .stn-dot').forEach(node => {
    const activate = () => {
      const target = node.dataset.coord
        ? places.find(p => coordOf(p) === node.dataset.coord)
        : corridorStns.find(s => String(s.stnId) === node.dataset.stnid);
      if (target && onSelectTarget) onSelectTarget(target, node);
    };
    node.setAttribute('aria-haspopup', 'dialog');
    node.onclick = activate;
    node.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    };
  });

  if (riskSummaryEl) {
    if (roadRiskData?.ok) {
      const sum = roadRiskData.branchSummary || roadRiskData.corridorSummary || {};
      const cnt = sum.iceCounts || [0, 0, 0, 0];
      const fogCnt = sum.fogCounts || [0, 0, 0, 0];
      const frgTmLabel = roadRiskData.sources?.frgTmKst ? fmt(roadRiskData.sources.frgTmKst) : (roadRiskData.tmKst ? fmt(roadRiskData.tmKst) : roadRiskData.tmUtc || '');
      const fogTmLabel = roadRiskData.sources?.fogTmKst ? fmt(roadRiskData.sources.fogTmKst) : '';
      const fogDiff = fogTmLabel && fogTmLabel !== frgTmLabel ? ` · 안개기준 ${fogTmLabel}` : '';
      const areaTitle = roadRiskData.branchSummary?.rangeLabel
        ? `🛣️ 고령지사[${roadRiskData.branchSummary.rangeLabel}]`
        : '🛣️ 012선 도로살얼음';
      const statusTxt = sum.dataStatus === 'missing'
        ? `${areaTitle}: 위험정보 수신 대기`
        : `${areaTitle}(${frgTmLabel}${fogDiff} · 5분갱신): 위험 ${cnt[3] || 0} · 주의 ${cnt[2] || 0} · 관심 ${cnt[1] || 0} · 안전 ${cnt[0] || 0}` +
          (fogCnt[1] + fogCnt[2] + fogCnt[3] > 0 ? ` | 🌫️ 안개 위험 ${fogCnt[3] || 0} · 주의 ${fogCnt[2] || 0} · 관심 ${fogCnt[1] || 0}` : '');
      const infoSpan = el('span', statusTxt);
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

  if (strip) {
    strip.replaceChildren();
    for (const s of corridorStns) {
      const stnKey = `stn:${s.stnId}`;
      const stnRisk = findStationRoadRisk(s);
      const stnIceLv = Number.isInteger(stnRisk?.iceLevel) ? stnRisk.iceLevel : null;
      const alertCls = stnIceLv >= 3 ? ' is-ice-alert-danger' : stnIceLv === 2 ? ' is-ice-alert-caution' : '';
      const chip = el('button', '', 'road-stn-chip' + (selectedWindyKey === stnKey ? ' is-selected' : '') + alertCls);
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
      if (stnRisk && ((stnIceLv ?? 0) >= 1 || (stnRisk.fogLevel ?? 0) >= 1)) {
        const riskRow = el('div', '', 'road-stn-risk-row');
        if ((stnIceLv ?? 0) >= 1) {
          riskRow.append(el('span', `${stnIceLv === 3 ? '🚨' : stnIceLv === 2 ? '⬆' : '❄'} 살얼음 ${stnRisk.iceLabel}`, `badge-ice rank-${stnIceLv}`));
        }
        if ((stnRisk.fogLevel ?? 0) >= 1) {
          riskRow.append(el('span', `🌫️ 안개 ${stnRisk.fogLabel}`, `badge-ice rank-${stnRisk.fogLevel}`));
        }
        chip.append(riskRow);
      }
      chip.setAttribute('aria-haspopup', 'dialog');
      chip.onclick = () => onSelectTarget && onSelectTarget(s, chip);
      strip.append(chip);
    }
  }
}
