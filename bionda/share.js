// 1:1 정방형(1080×1080) 고해상도 JPG 브리핑 이미지 생성 및 공유 모듈 (요구사항 6)

const FONT = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

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

function drawBadge(ctx, x, y, text, bg, fg, fontSize = 13, padX = 9, height = 24) {
  ctx.font = `700 ${fontSize}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  fillRoundRect(ctx, x, y, bw, height, 6, bg);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + height / 2 + 1);
  return bw;
}

const fmtNum = (v, d = 1) => (Number.isFinite(v) ? (v === 0 ? '0' : v.toFixed(d)) : '—');

export function renderOverviewCanvas(places, getRecord, stampStr, summaryFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#f2f6f4';
  ctx.fillRect(0, 0, 1080, 1080);

  // Header gradient
  const grad = ctx.createLinearGradient(0, 0, 1080, 130);
  grad.addColorStop(0, '#0f393b');
  grad.addColorStop(1, '#1c5758');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 130);

  // Brand icon
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
  ctx.fillText('관심지역 8곳 실시간 도로기상 실황 · 비/눈 시작·종료 · 향후 6시간 강수 전망 · 도로 살얼음 및 기상특보 현황', 36, 94);

  // Header right pill
  let riskCount = 0;
  for (const p of places.slice(0, 8)) {
    const r = getRecord(p);
    const iceRank = r.w?.ice?.rank || 0;
    const floodRank = r.w?.ice?.flood?.rank || 0;
    const wrnCount = r.wrn?.count || 0;
    if (iceRank > 0 || floodRank > 0 || wrnCount > 0) riskCount++;
  }
  const calmCount = Math.max(0, places.slice(0, 8).length - riskCount);

  fillRoundRect(ctx, 745, 26, 300, 76, 12, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.22)', 1);
  ctx.fillStyle = '#d3f2a8';
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`기준: ${stampStr} KST`, 1028, 50);
  ctx.fillStyle = '#e5f2f0';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`특보·살얼음 주의 ${riskCount}개소 / 평온 ${calmCount}개소`, 1028, 79);
  ctx.textAlign = 'left';

  // 2x4 Grid of 8 cards
  const cols = 2;
  const cardW = 492;
  const cardH = 198;
  const startX = 36;
  const startY = 152;
  const gapX = 24;
  const gapY = 18;

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
    const isDanger = iceRank === 2 || floodRank === 2 || wrn?.top?.level === '경보';
    const isWatch = !isDanger && (iceRank === 1 || floodRank === 1 || hasWarning || w?.kma?.analysis?.now?.wet || w?.kma?.analysis?.start);

    const borderCol = isDanger ? '#d9381e' : isWatch ? '#e08b00' : '#d2ded8';
    const borderW = isDanger || isWatch ? 2.5 : 1.2;
    fillRoundRect(ctx, x, y, cardW, cardH, 14, '#ffffff', borderCol, borderW);

    // Row 1: Name & Site
    ctx.fillStyle = '#153436';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(p.name, x + 20, y + 28);

    ctx.fillStyle = '#5a7471';
    ctx.font = `600 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(p.site || '', x + cardW - 20, y + 28);
    ctx.textAlign = 'left';

    // Row 2: Badges
    let bx = x + 20;
    const by = y + 46;
    if (iceRank > 0) {
      const causeTxt = w?.ice?.shortCause ? ` (${w.ice.shortCause})` : '';
      const txt = `❄ 살얼음 ${w.ice.level}${causeTxt}`;
      const bg = iceRank === 2 ? '#fde8e4' : '#fff3d6';
      const fg = iceRank === 2 ? '#b82e16' : '#8f5800';
      bx += drawBadge(ctx, bx, by, txt, bg, fg, 12.5, 9, 23) + 8;
    } else if (floodRank > 0) {
      bx += drawBadge(ctx, bx, by, w.ice.flood.badge, '#e3f2fd', '#0d47a1', 12.5, 9, 23) + 8;
    }
    if (hasWarning) {
      const bg = wrn.top.level === '경보' ? '#d9381e' : '#e08b00';
      bx += drawBadge(ctx, bx, by, wrn.badgeText, bg, '#ffffff', 12.5, 9, 23) + 8;
    }
    if (bx === x + 20) {
      const roadStr = Number.isFinite(o?.roadTemp) ? ` · 노면 ${o.roadTemp.toFixed(1)}°C(${o.surfaceState || '건조'})` : '';
      ctx.fillStyle = '#68827e';
      ctx.font = `500 13.5px ${FONT}`;
      ctx.fillText(`특보 및 살얼음 위험 신호 없음${roadStr}`, x + 20, by + 12);
    }

    // Row 3: Temp, Condition, Humidity
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
    ctx.fillText(`${condText}${snowStr}`, x + 28 + tempW, y + 100);

    ctx.fillStyle = '#5c7673';
    ctx.font = `600 14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`습도 ${fmtNum(humVal, 0)}%`, x + cardW - 20, y + 100);
    ctx.textAlign = 'left';

    // Divider
    ctx.strokeStyle = '#e6eeea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 120);
    ctx.lineTo(x + cardW - 20, y + 120);
    ctx.stroke();

    // Row 4: Today Precip & 6h Max POP + Intuitive Rain Start~End
    const dayP = o?.dayPrecip ?? w?.today?.precip ?? 0;
    const maxPop = w?.rows?.length ? Math.max(...w.rows.map(r => Number.isFinite(r.pop) ? r.pop : 0)) : 0;
    const kmaStart = w?.kma?.analysis?.start?.time ? w.kma.analysis.start.time.slice(11, 16) : null;
    const kmaEnd = w?.kma?.analysis?.end?.time ? w.kma.analysis.end.time.slice(11, 16) : null;
    const popSuffix = w?.kma?.analysis?.now?.wet
      ? (kmaEnd ? ` (현재~${kmaEnd} 강수중)` : ' (강수중)')
      : kmaStart
      ? ` (${kmaStart}~${kmaEnd || '지속'} 강수예상)`
      : '';

    ctx.fillStyle = '#647d7a';
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillText('오늘 누적 강수', x + 20, y + 137);
    ctx.fillText('6시간 최대 강수확률', x + 195, y + 137);

    ctx.fillStyle = '#183638';
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(`${fmtNum(dayP, 1)} mm`, x + 20, y + 157);
    ctx.fillText(`${fmtNum(maxPop, 0)}%${popSuffix}`, x + 195, y + 157);

    // Row 5: Bottom summary strip if warnings or snowplow action exist
    if (hasWarning || w?.ice?.snowActions?.length) {
      const stripBg = isDanger ? '#fdf0ee' : '#fff8e8';
      const stripFg = isDanger ? '#9e2612' : '#7d4d00';
      fillRoundRect(ctx, x + 14, y + 167, cardW - 28, 23, 5, stripBg);
      ctx.fillStyle = stripFg;
      ctx.font = `600 12px ${FONT}`;
      let summaryLine = '';
      if (hasWarning) {
        summaryLine = '• ' + wrn.tooltipLines.slice(0, 2).map(t => `${t.title}(${t.effectiveLabel}·${t.expiresLabel})`).join(' · ');
      } else if (w?.ice?.snowActions?.[0]) {
        summaryLine = w.ice.snowActions[0].text;
      }
      ctx.fillText(summaryLine.slice(0, 58), x + 22, y + 179);
    }
  });

  // Footer
  ctx.fillStyle = '#e5ece9';
  ctx.fillRect(0, 1028, 1080, 52);
  ctx.fillStyle = '#385754';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText('🌐 비온다? × 날씨봇 · 관심지역 기상·도로관리 모니터 (광주대구선 14번)', 36, 1054);
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

  // Background
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
  ctx.fillText('LOCAL WEATHER BRIEFING · 정방형 상세 브리핑', 42, 42);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 42px ${FONT}`;
  const titleStr = place.name;
  ctx.fillText(titleStr, 42, 92);
  const titleW = ctx.measureText(titleStr).width;

  if (place.site) {
    ctx.fillStyle = '#b9e3a0';
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(`(${place.site})`, 54 + titleW, 95);
  }

  const stnInfo = o?.name ? `기상청 ${o.name} 실황 연동` : '기상청 격자 실황 연동';
  ctx.fillStyle = '#cbe0dd';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`${stnInfo} · 위도 ${place.lat.toFixed(3)}, 경도 ${place.lon.toFixed(3)} · 기준 시각: ${stampStr} KST`, 42, 138);

  // Right Hero Temp Box
  fillRoundRect(ctx, 645, 32, 395, 112, 16, 'rgba(12, 42, 44, 0.42)', 'rgba(255,255,255,0.2)', 1);
  const tempVal = o?.temp ?? w?.current?.temp;
  const humVal = o?.humidity ?? w?.current?.humidity;
  const windVal = o?.windSpeed ?? w?.current?.wind;
  const condText = o?.description || summaryFn(w?.current?.code);
  const roadOrSnow = Number.isFinite(o?.snowDepth) && o.snowDepth > 0
    ? ` (현재 적설 ${o.snowDepth.toFixed(1)} cm)`
    : Number.isFinite(o?.roadTemp)
    ? ` (노면 ${o.roadTemp.toFixed(1)}°C)`
    : '';

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 54px ${FONT}`;
  ctx.fillText(`${fmtNum(tempVal, 1)}°`, 668, 92);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`${condText}${roadOrSnow}`, 810, 74);

  ctx.fillStyle = '#bfe0da';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`상대습도 ${fmtNum(humVal, 0)}% · 풍속 ${fmtNum(windVal, 1)} m/s`, 810, 106);

  // Left Column Card 1: Cumulative Precipitation & Rain Start/End
  fillRoundRect(ctx, 36, 200, 504, 210, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('🌧️ 누적 강수 및 비·눈 시작/종료 전망', 58, 236);
  ctx.fillStyle = '#627d79';
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('관측+모델 병합', 518, 236);
  ctx.textAlign = 'left';

  const metrics = [
    ['총강수량', `${fmtNum(o?.dayPrecip ?? w?.today?.precip ?? 0, 1)} mm`, '기상청 도로/실황'],
    ['강우량 (액체)', `${fmtNum(w?.today?.rain ?? 0, 1)} mm`, 'Open-Meteo 모델'],
    ['신적설 (눈)', `${fmtNum(w?.today?.snow ?? 0, 1)} cm`, 'Open-Meteo 모델']
  ];
  metrics.forEach(([lbl, valStr, src], i) => {
    const mx = 56 + i * 158;
    const my = 258;
    fillRoundRect(ctx, mx, my, 146, 94, 10, '#f3f7f5');
    ctx.fillStyle = '#56706d';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(lbl, mx + 14, my + 24);
    ctx.fillStyle = '#133032';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(valStr, mx + 14, my + 56);
    ctx.fillStyle = '#738c88';
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText(src, mx + 14, my + 80);
  });

  // Start ~ End timing strip inside Card 1
  const a = w?.kma?.analysis;
  const st = a?.start?.time ? a.start.time.slice(11, 16) : null;
  const ed = a?.end?.time ? a.end.time.slice(11, 16) : null;
  const startTxt = a?.now?.wet
    ? (ed ? `현재 ~ ${ed} 강수 관측중` : '현재 강수 관측중(지속)')
    : st
    ? `${st} ~ ${ed || '지속'} 강수예상`
    : '12시간 내 강수 신호 없음';
  const endTxt = ed ? `${ed}경 종료 추정(2시간 무강수)` : st ? '12시간 이후 지속 가능' : '해당 없음';
  fillRoundRect(ctx, 56, 362, 464, 34, 8, '#eaf4f8');
  ctx.fillStyle = '#184d68';
  ctx.font = `700 13.5px ${FONT}`;
  ctx.fillText(`☔ 강수시간: ${startTxt}   |   ☀ 종료: ${endTxt}`, 70, 380);

  // Left Column Card 2: 6-Hour Forecast Table
  fillRoundRect(ctx, 36, 428, 504, 566, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('⏱️ 시간별 강수·기온 전망 (앞으로 6시간)', 58, 466);
  drawBadge(ctx, 412, 452, 'ICON 앙상블 반영', '#e8f2ec', '#2c5e4f', 12, 10, 26);

  const headers = ['시각', '기온', '강수확률', '비/눈 확률', '강수량', '강설량'];
  const colX = [60, 145, 225, 315, 410, 480];
  fillRoundRect(ctx, 54, 492, 468, 38, 6, '#f1f6f3');
  ctx.fillStyle = '#536f68';
  ctx.font = `700 13.5px ${FONT}`;
  headers.forEach((h, i) => ctx.fillText(h, colX[i], 512));

  (w?.rows || []).slice(0, 6).forEach((r, idx) => {
    const ry = 558 + idx * 68;
    ctx.fillStyle = '#163537';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText((r.time || '').slice(11, 16), colX[0], ry);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText(`${fmtNum(r.temp, 1)}°`, colX[1], ry);
    ctx.fillText(`${fmtNum(r.pop, 0)}%`, colX[2], ry);
    ctx.fillText(`${fmtNum(r.rainPop, 0)} / ${fmtNum(r.snowPop, 0)}%`, colX[3], ry);
    ctx.fillText(`${fmtNum(r.precip, 1)} mm`, colX[4], ry);
    ctx.fillText(`${fmtNum(r.snow, 1)} cm`, colX[5], ry);

    if (idx < 5) {
      ctx.strokeStyle = '#e8efec';
      ctx.beginPath();
      ctx.moveTo(54, ry + 34);
      ctx.lineTo(522, ry + 34);
      ctx.stroke();
    }
  });

  // Right Column Card 1: Road Icing Outlook & Snowplow 3-Stage Action Guide
  const iceRank = w?.ice?.rank || 0;
  const iceBorder = iceRank === 2 ? '#d9381e' : iceRank === 1 ? '#e08b00' : '#d8e3de';
  fillRoundRect(ctx, 560, 200, 484, 450, 16, '#ffffff', iceBorder, iceRank ? 2.2 : 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('❄️ 도로 살얼음 전망', 584, 236);

  const iceBadgeTxt = iceRank === 2 ? '주의 (최고단계)' : iceRank === 1 ? '관심 단계' : '뚜렷한 신호 없음';
  const iceBadgeBg = iceRank === 2 ? '#fde8e4' : iceRank === 1 ? '#fff3d6' : '#eaf2ee';
  const iceBadgeFg = iceRank === 2 ? '#b82e16' : iceRank === 1 ? '#8f5800' : '#2f5c4e';
  drawBadge(ctx, 905, 222, iceBadgeTxt, iceBadgeBg, iceBadgeFg, 13, 12, 28);

  ctx.fillStyle = iceRank === 2 ? '#a62613' : '#2b4c49';
  ctx.font = `700 14.5px ${FONT}`;
  const reasonLine = (w?.ice?.reason || '현재부터 6시간 뒤까지 결빙 위험 조건을 감시합니다.').slice(0, 62);
  ctx.fillText(`원인: ${reasonLine}`, 584, 274);

  // 7 hourly boxes
  const samples = (w?.ice?.samples || []).slice(0, 7);
  samples.forEach((s, i) => {
    const sx = 584 + i * 63;
    const sy = 304;
    const sBg = s.rank === 2 ? '#ffeadf' : s.rank === 1 ? '#fff4d8' : '#f4f7f5';
    const sTop = s.rank === 2 ? '#be522b' : s.rank === 1 ? '#bb861e' : '#9baca5';
    fillRoundRect(ctx, sx, sy, 57, 68, 6, sBg);
    ctx.fillStyle = sTop;
    ctx.fillRect(sx, sy, 57, 5);
    ctx.fillStyle = '#536e6b';
    ctx.font = `600 12.5px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? '현재' : (s.time || '').slice(11, 13) + '시', sx + 28.5, sy + 26);
    ctx.fillStyle = s.rank === 2 ? '#a12512' : '#1d3b38';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText(s.level || '정상', sx + 28.5, sy + 50);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#657e7a';
  ctx.font = `500 12.5px ${FONT}`;
  const roadTempNote = Number.isFinite(o?.roadTemp)
    ? `* 실측 노면온도(${o.roadStationName || o.name}): ${o.roadTemp.toFixed(1)}°C (${o.surfaceState || '건조'}) · 교량·응달은 대기보다 2~4°C 낮아 결빙 주의`
    : '* 교량·응달·터널 출입구는 대기 기온보다 노면 온도가 2~4°C 낮아 즉각 결빙 위험';
  ctx.fillText(roadTempNote, 584, 398);

  // Snowplow / Flood Action Box
  fillRoundRect(ctx, 584, 420, 436, 206, 10, '#fdf8ec', '#e5cfa3', 1);
  ctx.fillStyle = '#6e470b';
  ctx.font = `700 13.5px ${FONT}`;
  const guides = [];
  if (w?.ice?.snowActions?.length) {
    for (const sa of w.ice.snowActions) guides.push(sa.text);
  } else {
    guides.push('🔑 [제설차 시동·살포기 예열] 결빙·강설 3시간 전(예비살포 1시간 전) 시동·유압 예열 필수');
    guides.push('🚜 [사전 제설 기준] 강설·결빙 1~2시간 전 습염 사전 살포 / -6°C 이하 염화칼슘 배합 상향');
  }
  if (w?.ice?.flood?.guide) guides.push(w.ice.flood.guide);
  if (w?.ice?.windAlert?.guide) guides.push(w.ice.windAlert.guide);

  guides.slice(0, 4).forEach((g, idx) => {
    const line1 = g.slice(0, 42);
    const line2 = g.slice(42, 84);
    ctx.fillText(line1, 600, 448 + idx * 46);
    if (line2) ctx.fillText('   ' + line2, 600, 468 + idx * 46);
  });

  // Right Column Card 2: Weather Warnings
  fillRoundRect(ctx, 560, 668, 484, 326, 16, '#ffffff', '#d8e3de', 1.2);
  ctx.fillStyle = '#163638';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('🚨 기상특보 발효 및 해제 예정 현황', 584, 706);

  const wrnCount = wrn?.count || 0;
  drawBadge(
    ctx,
    935,
    692,
    wrnCount ? `${wrnCount}건 발효중` : '특보 없음',
    wrnCount ? '#d9381e' : '#e8f2ec',
    wrnCount ? '#ffffff' : '#2c5e4f',
    12.5,
    12,
    26
  );

  fillRoundRect(ctx, 584, 730, 436, 240, 10, wrnCount ? '#fff6f5' : '#f5f8f6', wrnCount ? '#f1d0cc' : '#e1eae5', 1);
  if (wrnCount) {
    wrn.tooltipLines.slice(0, 3).forEach((item, i) => {
      const wy = 762 + i * 74;
      ctx.fillStyle = item.level === '경보' ? '#b32412' : '#9c5700';
      ctx.font = `800 15.5px ${FONT}`;
      ctx.fillText(`[${item.rank}순위] ${item.title}`, 604, wy);
      ctx.fillStyle = '#2d4745';
      ctx.font = `600 13.5px ${FONT}`;
      ctx.fillText(`• ${item.effectiveLabel} · ${item.expiresLabel}`, 604, wy + 25);
    });
  } else {
    ctx.fillStyle = '#526e6a';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('현재 해당 지역에 발효 중인 기상특보가 없습니다.', 604, 780);
    ctx.font = `500 13.5px ${FONT}`;
    ctx.fillText('• 대설·호우·태풍·한파·강풍·안개 등 전종 특보 상시 감시 중', 604, 814);
    ctx.fillText('• 특보 발표 시 우선순위 배지 및 인앱 알림음 자동 작동', 604, 842);
  }

  // Footer
  ctx.fillStyle = '#e5ece9';
  ctx.fillRect(0, 1028, 1080, 52);
  ctx.fillStyle = '#385754';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText('🌐 비온다? × 날씨봇 · 관심지역 기상 모니터 (개별 상세 브리핑)', 36, 1054);
  ctx.textAlign = 'right';
  ctx.fillText('자료 제공: 기상청(도로기상관측·단기예보·CAP 특보) · Open-Meteo(예보·앙상블)', 1044, 1054);
  ctx.textAlign = 'left';

  return canvas;
}

export async function canvasToJpgBlob(canvas, quality = 0.92) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}
