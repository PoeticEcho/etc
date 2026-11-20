// 1:1 정방형(1080×1080) 고해상도 JPG 브리핑 이미지 로컬 Canvas 생성 모듈 (서버 부하 0)
import { classifySeverityTier } from './ice.js';

const FONT = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const fmtNum = (v, d = 1) => (Number.isFinite(v) ? (v === 0 ? '0' : v.toFixed(d)) : '—');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function fitEllipsis(ctx, str, maxW) {
  const s = String(str ?? '');
  if (ctx.measureText(s).width <= maxW) return s;
  let cut = s.length;
  while (cut > 1 && ctx.measureText(s.slice(0, cut) + '…').width > maxW) {
    cut--;
  }
  return s.slice(0, Math.max(1, cut)) + '…';
}

function wrapCanvasText(ctx, str, maxW, maxLines = 2) {
  const text = String(str ?? '').trim();
  if (!text) return [];
  const lines = [];
  let remaining = text;
  while (remaining.length > 0 && lines.length < maxLines) {
    if (ctx.measureText(remaining).width <= maxW) {
      lines.push(remaining);
      remaining = '';
      break;
    }
    let idx = remaining.length;
    while (idx > 1 && ctx.measureText(remaining.slice(0, idx)).width > maxW) {
      idx--;
    }
    // Prefer breaking on space or middle dot when possible near the end
    let breakAt = idx;
    const minSearch = Math.max(4, Math.floor(idx * 0.6));
    for (let k = idx; k >= minSearch; k--) {
      if (remaining[k] === ' ' || remaining[k] === '·') {
        breakAt = k + (remaining[k] === '·' ? 1 : 0);
        break;
      }
    }
    const chunk = remaining.slice(0, breakAt).trim();
    const rest = remaining.slice(breakAt).trim();
    if (lines.length === maxLines - 1 && rest.length > 0) {
      lines.push(fitEllipsis(ctx, remaining, maxW));
      remaining = '';
      break;
    }
    lines.push(chunk);
    remaining = rest;
  }
  return lines;
}

function drawBadge(ctx, x, y, text, bg, fg, fontSize = 13, padX = 9, height = 24, maxW = 360) {
  ctx.font = `700 ${fontSize}px ${FONT}`;
  const clipped = fitEllipsis(ctx, text, Math.max(20, maxW - padX * 2));
  const tw = ctx.measureText(clipped).width;
  const bw = tw + padX * 2;
  fillRoundRect(ctx, x, y, bw, height, 6, bg);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(clipped, x + padX, y + height / 2 + 1);
  return bw;
}

const TIER_CARD_STYLE = {
  0: { border: '#d2ded8', bg: '#ffffff', width: 1.2 },
  1: { border: '#eab308', bg: '#fefce8', width: 2.3 },
  2: { border: '#f97316', bg: '#fff7ed', width: 2.5 },
  3: { border: '#d9381e', bg: '#fff5f5', width: 2.6 }
};

export function renderOverviewCanvas(places, getRecord, stampStr, summaryFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f2f6f4';
  ctx.fillRect(0, 0, 1080, 1080);

  const grad = ctx.createLinearGradient(0, 0, 1080, 130);
  grad.addColorStop(0, '#0f393b');
  grad.addColorStop(1, '#1c5758');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 130);

  fillRoundRect(ctx, 36, 32, 38, 38, 9, '#c7ed94');
  ctx.fillStyle = '#103b3d';
  ctx.font = `800 26px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('≋', 45, 51);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 31px ${FONT}`;
  ctx.fillText('관심지역 기상·도로살얼음 종합 브리핑', 88, 51);

  ctx.fillStyle = '#bdd9d5';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('고속국도 제12호선(광주대구선 · KMA 14번) 8개소 실황 · 강수 전망 · 도로 살얼음 및 특보 현황', 36, 94);

  let riskCount = 0;
  for (const p of places.slice(0, 8)) {
    if (classifySeverityTier(getRecord(p)).tier >= 1) riskCount++;
  }
  const calmCount = Math.max(0, places.slice(0, 8).length - riskCount);

  fillRoundRect(ctx, 745, 26, 300, 76, 12, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.22)', 1);
  ctx.fillStyle = '#d3f2a8';
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`기준: ${stampStr} KST`, 1028, 50);
  ctx.fillStyle = '#e5f2f0';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`주의·관심 ${riskCount}개소 / 평온 ${calmCount}개소`, 1028, 79);
  ctx.textAlign = 'left';

  const cols = 2, cardW = 492, cardH = 198, startX = 36, startY = 152, gapX = 24, gapY = 18;

  places.slice(0, 8).forEach((p, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    const r = getRecord(p);
    const w = r.w, o = r.o, wrn = r.wrn;
    const iceRank = w?.ice?.rank || 0;
    const floodRank = w?.ice?.flood?.rank || 0;
    const hasWarning = (wrn?.count || 0) > 0;
    const sev = classifySeverityTier(r);
    const stStyle = TIER_CARD_STYLE[sev.tier] || TIER_CARD_STYLE[0];

    fillRoundRect(ctx, x, y, cardW, cardH, 14, stStyle.bg, stStyle.border, stStyle.width);

    // Pure informational layout (no interactive directive dismiss chips needed in share image)
    ctx.fillStyle = '#153436';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, p.name, 310), x + 20, y + 28);

    ctx.fillStyle = '#5a7471';
    ctx.font = `600 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(p.site || '', x + cardW - 20, y + 28);
    ctx.textAlign = 'left';

    let bx = x + 20;
    const by = y + 46;
    if (iceRank > 0) {
      const causeTxt = w?.ice?.shortCause ? ` (${w.ice.shortCause})` : '';
      const txt = `❄ 살얼음 ${w.ice.level}${causeTxt}`;
      const bg = iceRank === 2 ? '#fde8e4' : '#ffedd5';
      const fg = iceRank === 2 ? '#b82e16' : '#c2410c';
      bx += drawBadge(ctx, bx, by, txt, bg, fg, 12.5, 9, 23, 250) + 8;
    } else if (floodRank > 0) {
      bx += drawBadge(ctx, bx, by, w.ice.flood.badge, '#e3f2fd', '#0d47a1', 12.5, 9, 23, 250) + 8;
    }
    if (hasWarning) {
      const bg = wrn.top.level === '경보' ? '#d9381e' : '#d99b00';
      const remW = Math.max(90, x + cardW - 20 - bx);
      bx += drawBadge(ctx, bx, by, wrn.badgeText, bg, '#ffffff', 12.5, 9, 23, remW) + 8;
    }
    if (bx === x + 20) {
      const roadStr = Number.isFinite(o?.roadTemp) ? ` · 노면 ${o.roadTemp.toFixed(1)}°C(${o.surfaceState || '건조'})` : '';
      ctx.fillStyle = '#68827e';
      ctx.font = `500 13.5px ${FONT}`;
      ctx.fillText(fitEllipsis(ctx, `특보 및 살얼음 위험 신호 없음${roadStr}`, cardW - 40), x + 20, by + 12);
    }

    const tempVal = o?.temp ?? w?.current?.temp;
    const humVal = o?.humidity ?? w?.current?.humidity;
    const condText = o?.description || summaryFn(w?.current?.code);
    const snowStr = Number.isFinite(o?.snowDepth) && o.snowDepth > 0 ? ` (적설 ${o.snowDepth.toFixed(1)}cm)` : '';

    ctx.fillStyle = '#122c2e';
    ctx.font = `800 35px ${FONT}`;
    const tempStr = `${fmtNum(tempVal, 1)}°`;
    ctx.fillText(tempStr, x + 20, y + 96);
    const tempW = ctx.measureText(tempStr).width;

    ctx.fillStyle = '#2d4b4d';
    ctx.font = `700 16.5px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, `${condText}${snowStr}`, cardW - tempW - 135), x + 28 + tempW, y + 100);

    ctx.fillStyle = '#5c7673';
    ctx.font = `600 14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`습도 ${fmtNum(humVal, 0)}%`, x + cardW - 20, y + 100);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#e6eeea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 120);
    ctx.lineTo(x + cardW - 20, y + 120);
    ctx.stroke();

    const dayP = o?.dayPrecip ?? w?.today?.precip ?? 0;
    const maxPop = w?.rows?.length ? Math.max(...w.rows.map(rw => Number.isFinite(rw.pop) ? rw.pop : 0)) : 0;
    const kmaA = w?.kma?.analysis;
    const kmaStart = kmaA?.start?.time ? kmaA.start.time.slice(11, 16) : null;
    const kmaEnd = kmaA?.end?.time ? kmaA.end.time.slice(11, 16) : null;
    const kmaWinEnd = (kmaA?.lastWetTime || kmaA?.windowEndTime)?.slice(11, 16);
    const popSuffix = kmaA?.now?.wet
      ? (kmaEnd ? ` (현재~${kmaEnd})` : ` (현재~${kmaWinEnd || '12h'}+)`)
      : kmaStart
      ? (kmaEnd ? ` (${kmaStart}~${kmaEnd} 강수)` : ` (${kmaStart}~${kmaWinEnd || '12h'}+ 계속)`)
      : '';

    ctx.fillStyle = '#647d7a';
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillText('오늘 누적 강수', x + 20, y + 137);
    ctx.fillText('6시간 최대 강수확률', x + 195, y + 137);

    ctx.fillStyle = '#183638';
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(`${fmtNum(dayP, 1)} mm`, x + 20, y + 157);
    ctx.fillText(fitEllipsis(ctx, `${fmtNum(maxPop, 0)}%${popSuffix}`, cardW - 215), x + 195, y + 157);

    if (hasWarning || w?.ice?.shortReason) {
      const stripBg = sev.tier === 3 ? '#fdf0ee' : sev.tier === 2 ? '#ffedd5' : sev.tier === 1 ? '#fef9c3' : '#f1f5f3';
      const stripFg = sev.tier === 3 ? '#9e2612' : sev.tier === 2 ? '#9a3412' : sev.tier === 1 ? '#713f12' : '#4b6663';
      fillRoundRect(ctx, x + 14, y + 167, cardW - 28, 23, 5, stripBg);
      ctx.fillStyle = stripFg;
      ctx.font = `600 12px ${FONT}`;
      const summaryLine = hasWarning
        ? '• ' + wrn.tooltipLines.slice(0, 2).map(t => `${t.title}(${t.effectiveLabel}·${t.expiresLabel})`).join(' · ')
        : w.ice.shortReason;
      ctx.fillText(fitEllipsis(ctx, summaryLine, cardW - 44), x + 22, y + 179);
    }
  });

  ctx.fillStyle = '#e5ece9';
  ctx.fillRect(0, 1028, 1080, 52);
  ctx.fillStyle = '#385754';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText('🌐 비온다? × 날씨봇 · 고속국도 12호선(광주대구선 · KMA 14번) 모니터', 36, 1054);
  ctx.textAlign = 'right';
  ctx.fillText('자료 제공: 기상청(도로기상관측·단기예보·CAP 특보) · Open-Meteo(단기예보·앙상블)', 1044, 1054);
  ctx.textAlign = 'left';

  return canvas;
}

export function renderDetailCanvas(place, rec, stampStr, summaryFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const w = rec.w, o = rec.o, wrn = rec.wrn;

  ctx.fillStyle = '#f2f6f4';
  ctx.fillRect(0, 0, 1080, 1080);

  // Hero Header
  const grad = ctx.createLinearGradient(0, 0, 1080, 175);
  grad.addColorStop(0, '#0f393b');
  grad.addColorStop(1, '#23645f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 175);

  ctx.fillStyle = '#c4e899';
  ctx.font = `700 14px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('LOCAL WEATHER BRIEFING · 정방형 상세 브리핑', 42, 42);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 40px ${FONT}`;
  const titleStr = fitEllipsis(ctx, place.name, 390);
  ctx.fillText(titleStr, 42, 92);
  const titleW = ctx.measureText(titleStr).width;

  if (place.site) {
    ctx.fillStyle = '#b9e3a0';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, `(${place.site})`, 210), 54 + titleW, 95);
  }

  const stnInfo = o?.name ? `기상청 ${o.name} 실황 연동` : '기상청 격자 실황 연동';
  ctx.fillStyle = '#cbe0dd';
  ctx.font = `500 14.5px ${FONT}`;
  ctx.fillText(
    fitEllipsis(ctx, `${stnInfo} · 위도 ${place.lat.toFixed(3)}, 경도 ${place.lon.toFixed(3)} · 기준 시각: ${stampStr} KST`, 585),
    42,
    138
  );

  // Right Hero Temp Box
  fillRoundRect(ctx, 645, 32, 395, 112, 16, 'rgba(12, 42, 44, 0.42)', 'rgba(255,255,255,0.2)', 1);
  const tempVal = o?.temp ?? w?.current?.temp;
  const humVal = o?.humidity ?? w?.current?.humidity;
  const windVal = o?.windSpeed ?? w?.current?.wind;
  const condText = o?.description || summaryFn(w?.current?.code);
  const roadOrSnow = Number.isFinite(o?.snowDepth) && o.snowDepth > 0 && !condText.includes('적설')
    ? ` (적설 ${o.snowDepth.toFixed(1)}cm)`
    : Number.isFinite(o?.roadTemp)
    ? ` (노면 ${o.roadTemp.toFixed(1)}°C)`
    : '';

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 50px ${FONT}`;
  const heroTemp = `${fmtNum(tempVal, 1)}°`;
  ctx.fillText(heroTemp, 665, 88);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 18.5px ${FONT}`;
  ctx.fillText(fitEllipsis(ctx, `${condText}${roadOrSnow}`, 225), 805, 72);

  ctx.fillStyle = '#bfe0da';
  ctx.font = `500 14.5px ${FONT}`;
  ctx.fillText(`상대습도 ${fmtNum(humVal, 0)}% · 풍속 ${fmtNum(windVal, 1)} m/s`, 805, 106);

  // Left Card 1: Cumulative Precip & Start/End + 3 Non-overlapping Horizons
  fillRoundRect(ctx, 36, 198, 504, 240, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 19.5px ${FONT}`;
  ctx.fillText('🌧️ 누적 강수 및 비·눈 시작/종료 전망', 56, 232);
  ctx.fillStyle = '#627d79';
  ctx.font = `600 12.5px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('관측+12h 예보', 520, 232);
  ctx.textAlign = 'left';

  const metrics = [
    ['총강수량', `${fmtNum(o?.dayPrecip ?? w?.today?.precip ?? 0, 1)} mm`, '기상청 도로/실황'],
    ['강우량 (액체)', `${fmtNum(w?.today?.rain ?? 0, 1)} mm`, 'Open-Meteo 모델'],
    ['신적설 (눈)', `${fmtNum(w?.today?.snow ?? 0, 1)} cm`, 'Open-Meteo 모델']
  ];
  metrics.forEach(([lbl, valStr, src], i) => {
    const mx = 54 + i * 158;
    const my = 252;
    fillRoundRect(ctx, mx, my, 146, 86, 10, '#f3f7f5');
    ctx.fillStyle = '#56706d';
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillText(lbl, mx + 12, my + 21);
    ctx.fillStyle = '#133032';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(valStr, mx + 12, my + 50);
    ctx.fillStyle = '#738c88';
    ctx.font = `500 11.5px ${FONT}`;
    ctx.fillText(src, mx + 12, my + 73);
  });

  const a = w?.kma?.analysis;
  const st = a?.start?.time ? a.start.time.slice(11, 16) : null;
  const ed = a?.end?.time ? a.end.time.slice(11, 16) : null;
  const winEnd = (a?.lastWetTime || a?.windowEndTime)?.slice(11, 16);
  const startTxt = a?.now?.wet
    ? (ed ? `현재 ~ ${ed} ${a.now.type}중` : `현재 ~ ${winEnd || '12h'}+ 계속`)
    : st
    ? (ed ? `${st} ~ ${ed} 강수예상` : `${st} ~ ${winEnd || '12h'}+ 계속`)
    : '12h 강수 신호 없음';
  const endTxt = ed ? `${ed}경 종료` : st ? `${winEnd || '12h'}+ 계속` : '무강수';
  fillRoundRect(ctx, 54, 348, 468, 32, 8, '#eaf4f8');
  ctx.fillStyle = '#184d68';
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText(fitEllipsis(ctx, `☔ ${startTxt}  |  ☀ 종료: ${endTxt}`, 446), 66, 365);

  const horizonSrc = Array.isArray(a?.horizonRanges) && a.horizonRanges.length === 3
    ? a.horizonRanges
    : [
        { label: '향후 3시간', hasPrecipitation: false, hasRisk: false, kinds: [] },
        { label: '3~6시간', hasPrecipitation: false, hasRisk: false, kinds: [] },
        { label: '향후 6~12시간', hasPrecipitation: false, hasRisk: false, kinds: [] }
      ];
  horizonSrc.forEach((hr, i) => {
    const hx = 54 + i * 158;
    const hy = 388;
    const clsBg = hr.hasPrecipitation ? '#e8f2fc' : hr.hasRisk ? '#fdf5df' : '#edf4f0';
    const clsFg = hr.hasPrecipitation ? '#1971b8' : hr.hasRisk ? '#9c640c' : '#1c7c5c';
    const valTxt = hr.hasPrecipitation ? `${(hr.kinds || []).join('·') || '강수'} 예상` : hr.hasRisk ? '강수 가능성' : '신호 없음';
    fillRoundRect(ctx, hx, hy, 146, 36, 7, clsBg);
    ctx.fillStyle = '#536e6b';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(hr.label, hx + 10, hy + 12);
    ctx.fillStyle = clsFg;
    ctx.font = `800 12.5px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, valTxt, 126), hx + 10, hy + 27);
  });

  // Left Card 2: 6-Hour Forecast Table
  fillRoundRect(ctx, 36, 454, 504, 542, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 19.5px ${FONT}`;
  ctx.fillText('⏱️ 시간별 강수·기온 전망 (앞으로 6시간)', 56, 490);
  drawBadge(ctx, 412, 476, 'ICON 앙상블 반영', '#e8f2ec', '#2c5e4f', 12, 10, 26, 120);

  const headers = ['시각', '기온', '강수확률', '비/눈 확률', '강수량', '강설량'];
  const colX = [58, 142, 222, 312, 408, 478];
  fillRoundRect(ctx, 54, 514, 468, 36, 6, '#f1f6f3');
  ctx.fillStyle = '#536f68';
  ctx.font = `700 13px ${FONT}`;
  headers.forEach((h, i) => ctx.fillText(h, colX[i], 533));

  (w?.rows || []).slice(0, 6).forEach((r, idx) => {
    const ry = 580 + idx * 66;
    ctx.fillStyle = '#163537';
    ctx.font = `700 15.5px ${FONT}`;
    ctx.fillText((r.time || '').slice(11, 16), colX[0], ry);
    ctx.font = `600 15.5px ${FONT}`;
    ctx.fillText(`${fmtNum(r.temp, 1)}°`, colX[1], ry);
    ctx.fillText(`${fmtNum(r.pop, 0)}%`, colX[2], ry);
    ctx.fillText(`${fmtNum(r.rainPop, 0)} / ${fmtNum(r.snowPop, 0)}%`, colX[3], ry);
    ctx.fillText(`${fmtNum(r.precip, 1)} mm`, colX[4], ry);
    ctx.fillText(`${fmtNum(r.snow, 1)} cm`, colX[5], ry);

    if (idx < 5) {
      ctx.strokeStyle = '#e8efec';
      ctx.beginPath();
      ctx.moveTo(54, ry + 33);
      ctx.lineTo(522, ry + 33);
      ctx.stroke();
    }
  });

  // Right Card 1: Road Icing Outlook — Strict Box Wrapping (ZERO overflow!)
  const iceRank = w?.ice?.rank || 0;
  const iceBorder = iceRank === 2 ? '#d9381e' : iceRank === 1 ? '#ea580c' : '#d8e3de';
  fillRoundRect(ctx, 560, 198, 484, 466, 16, '#ffffff', iceBorder, iceRank ? 2.2 : 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 19.5px ${FONT}`;
  ctx.fillText('❄️ 도로 살얼음 전망', 584, 232);

  const iceBadgeTxt = iceRank === 2 ? '주의 (최고단계)' : iceRank === 1 ? '관심 단계' : '뚜렷한 신호 없음';
  const iceBadgeBg = iceRank === 2 ? '#fde8e4' : iceRank === 1 ? '#ffedd5' : '#eaf2ee';
  const iceBadgeFg = iceRank === 2 ? '#b82e16' : iceRank === 1 ? '#c2410c' : '#2f5c4e';
  drawBadge(ctx, 898, 219, iceBadgeTxt, iceBadgeBg, iceBadgeFg, 12.5, 11, 26, 126);

  ctx.fillStyle = iceRank === 2 ? '#a62613' : iceRank === 1 ? '#9a3412' : '#2b4c49';
  ctx.font = `700 13.5px ${FONT}`;
  const rawReason = w?.ice?.shortReason || w?.ice?.reason || '향후 6시간 결빙 위험 조건 감시 중';
  const reasonLines = wrapCanvasText(ctx, `판정: ${rawReason}`, 436, 2);
  reasonLines.forEach((line, li) => {
    ctx.fillText(line, 584, 264 + li * 18);
  });

  // 6 Condition Metric Boxes (3x2 grid)
  const cMetrics = (w?.ice?.conditionMetrics || [
    { label: '최저기온(6h)', value: Number.isFinite(w?.ice?.minTemp) ? `${w.ice.minTemp.toFixed(1)}°C` : '—' },
    { label: '현재기온', value: Number.isFinite(tempVal) ? `${fmtNum(tempVal, 1)}°C` : '—' },
    { label: '교량·노면', value: Number.isFinite(o?.roadTemp ?? w?.ice?.bridgeTemp) ? `${fmtNum(o?.roadTemp ?? w?.ice?.bridgeTemp, 1)}°C` : '—' },
    { label: '이슬점(Td)', value: Number.isFinite(w?.ice?.dewPoint) ? `${w.ice.dewPoint.toFixed(1)}°C` : '—' },
    { label: '상대습도', value: Number.isFinite(humVal) ? `${fmtNum(humVal, 0)}%` : '—' },
    { label: '현재풍속', value: Number.isFinite(windVal) ? `${fmtNum(windVal, 1)} m/s` : '—' }
  ]).slice(0, 6);

  const mTopY = reasonLines.length > 1 ? 302 : 292;
  cMetrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const mx = 584 + col * 147;
    const my = mTopY + row * 48;
    fillRoundRect(ctx, mx, my, 141, 42, 7, m.warn ? '#fff7ed' : '#f4f7f5', m.warn ? '#fdba74' : '#e2ece8', 1);
    ctx.fillStyle = '#5d7774';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(m.label, mx + 9, my + 14);
    ctx.fillStyle = m.warn ? '#c2410c' : '#143335';
    ctx.font = `800 14.5px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, m.value, 122), mx + 9, my + 31);
  });

  // 7 hourly boxes (현재 + 6h)
  const samplesY = mTopY + 104;
  const samples = (w?.ice?.samples || []).slice(0, 7);
  samples.forEach((s, i) => {
    const sx = 584 + i * 63;
    const sBg = s.rank === 2 ? '#ffeadf' : s.rank === 1 ? '#ffedd5' : '#f4f7f5';
    const sTop = s.rank === 2 ? '#d9381e' : s.rank === 1 ? '#ea580c' : '#9baca5';
    fillRoundRect(ctx, sx, samplesY, 57, 58, 6, sBg);
    ctx.fillStyle = sTop;
    ctx.fillRect(sx, samplesY, 57, 4);
    ctx.fillStyle = '#536e6b';
    ctx.font = `600 11.5px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? '현재' : (s.time || '').slice(11, 13) + '시', sx + 28.5, samplesY + 21);
    ctx.fillStyle = s.rank === 2 ? '#a12512' : s.rank === 1 ? '#9a3412' : '#1d3b38';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(fitEllipsis(ctx, s.level || '정상', 52), sx + 28.5, samplesY + 42);
    ctx.textAlign = 'left';
  });

  // Wrapped Road Surface Note + Pure Informational Decision Criteria Box
  const noteY = samplesY + 72;
  ctx.fillStyle = '#657e7a';
  ctx.font = `500 12px ${FONT}`;
  const roadTempNote = Number.isFinite(o?.roadTemp)
    ? `* 실측 노면(${o.roadStationName || o.name}): ${o.roadTemp.toFixed(1)}°C(${o.surfaceState || '건조'}) · 교량·응달 2~4°C 낮아 결빙 주의`
    : '* 교량·응달·터널 출입구는 대기보다 노면 온도가 2~4°C 낮아 결빙 위험';
  const noteLines = wrapCanvasText(ctx, roadTempNote, 436, 2);
  noteLines.forEach((ln, li) => ctx.fillText(ln, 584, noteY + li * 16));

  const guideBoxY = noteY + noteLines.length * 16 + 8;
  const guideBoxH = Math.max(76, 650 - guideBoxY);
  fillRoundRect(ctx, 584, guideBoxY, 436, guideBoxH, 10, '#fdf8ec', '#e5cfa3', 1);
  ctx.fillStyle = '#6e470b';
  ctx.font = `650 12.5px ${FONT}`;
  const guides = [];
  if (w?.ice?.snowActions?.length) {
    for (const sa of w.ice.snowActions) guides.push(sa.text);
  } else {
    guides.push('🔑 제설차 예열: 결빙·강설 3시간 전(예비살포 1시간 전) 유압 예열 기준');
    guides.push('🚜 사전 제설: 강설·결빙 1~2시간 전 습염 사전 살포 / -6°C 이하 CaCl₂ 상향');
  }
  if (w?.ice?.flood?.guide) guides.push(w.ice.flood.guide);
  if (w?.ice?.windAlert?.guide) guides.push(w.ice.windAlert.guide);

  let curGY = guideBoxY + 18;
  for (const g of guides.slice(0, 3)) {
    if (curGY > guideBoxY + guideBoxH - 12) break;
    const gLines = wrapCanvasText(ctx, g, 410, 2);
    for (const gl of gLines) {
      if (curGY > guideBoxY + guideBoxH - 10) break;
      ctx.fillText(gl, 597, curGY);
      curGY += 17;
    }
    curGY += 5;
  }

  // Right Card 2: Weather Warnings
  fillRoundRect(ctx, 560, 680, 484, 316, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 19.5px ${FONT}`;
  ctx.fillText('🚨 기상특보 발효 및 해제 예정 현황', 584, 716);

  const wrnCount = wrn?.count || 0;
  drawBadge(
    ctx,
    935,
    703,
    wrnCount ? `${wrnCount}건 발효중` : '특보 없음',
    wrnCount ? '#d9381e' : '#e8f2ec',
    wrnCount ? '#ffffff' : '#2c5e4f',
    12.5,
    12,
    26,
    94
  );

  fillRoundRect(ctx, 584, 740, 436, 236, 10, wrnCount ? '#fff6f5' : '#f5f8f6', wrnCount ? '#f1d0cc' : '#e1eae5', 1);
  if (wrnCount) {
    wrn.tooltipLines.slice(0, 3).forEach((item, i) => {
      const wy = 770 + i * 74;
      ctx.fillStyle = item.level === '경보' ? '#b32412' : '#9c5700';
      ctx.font = `800 15px ${FONT}`;
      const areaSuffix = item.areaName ? ` · ${item.areaName}` : '';
      ctx.fillText(fitEllipsis(ctx, `[${item.rank}순위] ${item.title}${areaSuffix}`, 398), 604, wy);
      ctx.fillStyle = '#2d4745';
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText(fitEllipsis(ctx, `• ${item.effectiveLabel} · ${item.expiresLabel}`, 398), 604, wy + 24);
    });
  } else {
    ctx.fillStyle = '#526e6a';
    ctx.font = `600 14.5px ${FONT}`;
    ctx.fillText('현재 해당 지점에 발효 중인 기상특보가 없습니다.', 604, 788);
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText('• 대설·호우·태풍·한파·강풍·안개 등 전종 특보 상시 감시 중', 604, 822);
    ctx.fillText('• 세부 특보구역은 공식 폴리곤 좌표 기준으로 정밀 판정합니다', 604, 850);
  }

  // Footer
  ctx.fillStyle = '#e5ece9';
  ctx.fillRect(0, 1028, 1080, 52);
  ctx.fillStyle = '#385754';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText('🌐 비온다? × 날씨봇 · 고속국도 12호선(광주대구선 · KMA 14번) 상세 브리핑', 36, 1054);
  ctx.textAlign = 'right';
  ctx.fillText('자료 제공: 기상청(도로기상관측·단기예보·CAP 특보) · Open-Meteo(예보·앙상블)', 1044, 1054);
  ctx.textAlign = 'left';

  return canvas;
}

export async function canvasToJpgBlob(canvas, quality = 0.92) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}
