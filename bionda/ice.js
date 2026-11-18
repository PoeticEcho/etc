// 도로관리청 실무 맞춤형 도로 살얼음·제설·수방·강풍 의사결정 엔진 (요구사항 4)
// 모든 시각은 KST(Asia/Seoul), 단위는 °C, %, mm, cm, m/s 기준.

export function calcDewPoint(tempC, rh) {
  if (!Number.isFinite(tempC) || !Number.isFinite(rh) || rh <= 0) return null;
  const a = 17.625, b = 243.04;
  const alpha = Math.log(Math.max(1, Math.min(100, rh)) / 100) + (a * tempC) / (b + tempC);
  return Number(((b * alpha) / (a - alpha)).toFixed(1));
}

function addHoursClock(clockStr, deltaHours) {
  const m = String(clockStr || '').match(/^(\d{2}):(\d{2})/);
  if (!m) return clockStr;
  const h = (Number(m[1]) + deltaHours + 24) % 24;
  return String(h).padStart(2, '0') + ':' + m[2];
}

export function iceOutlook(current, history = [], forecast = [], obs = null, kmaHours = []) {
  const previous = Array.isArray(history) ? history.slice() : [];
  const hadSnow24h = previous.some(x => Number.isFinite(x?.snow) && x.snow > 0) || (Number.isFinite(obs?.snowDepth) && obs.snowDepth > 0);
  const kmaByClock = new Map();
  for (const kh of kmaHours || []) {
    if (kh?.time) kmaByClock.set(kh.time.slice(0, 16), kh);
  }

  const samples = [current, ...(forecast || []).slice(0, 6)].map((rawRow, index) => {
    const r = { ...rawRow };
    const kmaMatch = r.time ? kmaByClock.get(r.time.slice(0, 16)) : null;

    // 1. 실측 기온·습도 우선 반영 (현재 시각 index === 0 시 보수적 값 적용)
    if (index === 0 && obs) {
      if (Number.isFinite(obs.temp)) {
        r.temp = Number.isFinite(r.temp) ? Math.min(r.temp, obs.temp) : obs.temp;
      }
      if (Number.isFinite(obs.humidity)) {
        r.humidity = Number.isFinite(r.humidity) ? Math.max(r.humidity, obs.humidity) : obs.humidity;
      }
      if (Number.isFinite(obs.windSpeed)) {
        r.wind = Number.isFinite(r.wind) ? Math.max(r.wind, obs.windSpeed) : obs.windSpeed;
      }
    }
    if (kmaMatch) {
      const kTemp = Number(kmaMatch.temp);
      if (!Number.isFinite(r.temp) && Number.isFinite(kTemp)) r.temp = kTemp;
      const kHum = Number(kmaMatch.humidity);
      if (!Number.isFinite(r.humidity) && Number.isFinite(kHum)) r.humidity = kHum;
      if (kmaMatch.wet && !(r.precip > 0)) r.precip = Math.max(0.1, kmaMatch.rainMm || 0.1);
      if (kmaMatch.snowCm > 0 && !(r.snow > 0)) r.snow = kmaMatch.snowCm;
    }

    const clock = (r.time || '').slice(11, 16);
    const night = clock >= '21:00' || clock <= '08:00';
    const deepNight = clock >= '23:00' || clock <= '07:00';
    const validTemp = Number.isFinite(r.temp);
    const dewPoint = calcDewPoint(r.temp, r.humidity);
    const dewSpread = validTemp && Number.isFinite(dewPoint) ? Number((r.temp - dewPoint).toFixed(1)) : null;

    // 교량·응달 추정 노면온도 (실측 광학 노면온도가 있으면 현재 시각에 함께 반영)
    const estBridgeTemp = validTemp ? Number((r.temp - (night ? 3.0 : 1.5)).toFixed(1)) : null;
    const measuredRoadTemp = index === 0 ? (obs?.bridgeRoadTemp ?? obs?.roadTemp ?? null) : null;
    const effectiveRoadTemp = Number.isFinite(measuredRoadTemp) && Number.isFinite(estBridgeTemp)
      ? Math.min(measuredRoadTemp, estBridgeTemp)
      : (measuredRoadTemp ?? estBridgeTemp);

    const recent = previous.filter(x => x && x.time < r.time).slice(-6);
    const wet = (r.precip > 0) || (current?.precip > 0) || recent.some(x => x.precip > 0) || (index === 0 && (obs?.dayPrecip > 0 || (obs?.surfaceCode >= 2 && obs?.surfaceCode <= 6)));
    const snowNow = (r.snow >= 0.1) || (r.snowPop >= 50) || (kmaMatch?.type?.includes('눈'));
    const fog = r.code === 45 || (index === 0 && Number.isFinite(obs?.visibility) && obs.visibility < 1000);
    const humid = Number.isFinite(r.humidity) && r.humidity >= 90;
    const freezing = [48, 56, 57, 66, 67].includes(r.code) || (index === 0 && obs?.surfaceCode === 5);
    const cold = validTemp && r.temp <= 4.0;
    const cautionTempLimit = night ? 1.5 : 0.5;
    const frostWatch = deepNight && validTemp && r.temp <= 3.0 && Number.isFinite(r.humidity) && r.humidity >= 80 && Number.isFinite(r.wind) && r.wind <= 3.0;
    const dewFrostIce = validTemp && r.temp <= 0.0 && dewSpread !== null && dewSpread <= 1.5;
    const refreeze = hadSnow24h && validTemp && r.temp <= 0.5;

    let level = '신호 없음', rank = 0, cause = '', shortCause = '';
    if (freezing) {
      rank = 2;
      cause = obs?.surfaceCode === 5 ? '도로기상관측 결빙 감지' : r.code === 48 ? '착빙성 안개 예보' : r.code >= 66 ? '어는 비 예보' : '어는 이슬비 예보';
      shortCause = '착빙·어는비';
    } else if (validTemp && r.temp <= cautionTempLimit && (wet || fog || snowNow)) {
      rank = 2;
      cause = snowNow ? '강설·영하권 교량 결빙 위험' : fog ? '야간·새벽 영하권 안개 결빙' : (night ? '강수 흔적 및 야간 교량 복사냉각 결빙' : '강수 흔적과 저온 결빙');
      shortCause = snowNow ? '강설·결빙' : night ? '야간 영하·강수' : `${r.temp.toFixed(1)}°C·강수`;
    } else if (refreeze) {
      rank = 2;
      cause = '직전 강설·잔설 해빙 후 재결빙 주의';
      shortCause = '잔설 재결빙';
    } else if (dewFrostIce && Number.isFinite(r.humidity) && r.humidity >= 85) {
      rank = 2;
      cause = `영하권 이슬점 근접(T-Td ${dewSpread}°C) 노면 서리·블랙아이스 주의`;
      shortCause = '서리·블랙아이스';
    } else if (cold && (wet || fog || humid || frostWatch || dewFrostIce || (Number.isFinite(effectiveRoadTemp) && effectiveRoadTemp <= 0.5 && r.humidity >= 75))) {
      rank = 1;
      cause = wet ? '최근 강수와 저온(교량 결빙 관심)' : fog ? '저온·안개' : dewFrostIce ? `이슬점 근접(T-Td ${dewSpread}°C) 서리 관심` : humid ? '저온·고습' : '야간 교량 복사냉각·고습';
      shortCause = wet ? '저온·강수흔적' : '야간 교량 냉각';
    }

    const missing = !validTemp || (!Number.isFinite(r.code) && !kmaMatch) || (cold && (
      !Number.isFinite(r.humidity) || !Number.isFinite(r.precip) || (recent.length < 6 && !kmaHours?.length)
    ));
    if (rank) level = rank === 2 ? '주의' : '관심';
    else if (missing) level = '자료 부족';
    if (index > 0) previous.push(r);
    return { ...r, level, rank, cause, shortCause, missing, dewPoint, dewSpread, estBridgeTemp, effectiveRoadTemp, snowNow };
  });

  const peak = samples.reduce((a, b) => (b.rank > a.rank ? b : a), samples[0] || { rank: 0, level: '신호 없음' });
  const temps = samples.map(x => x.temp).filter(Number.isFinite);
  const minTempVal = temps.length ? Math.min(...temps) : null;
  const low = minTempVal !== null ? minTempVal.toFixed(1) + '°C' : '—';
  const incomplete = samples.some(x => x.missing);
  const level = peak.rank ? peak.level : incomplete ? '판단 보류' : '뚜렷한 신호 없음';

  const curTemp = samples[0]?.temp;
  const curHum = samples[0]?.humidity;
  const curWind = samples[0]?.wind;
  const curDew = samples[0]?.dewPoint;
  const curDewSpread = samples[0]?.dewSpread;
  const curBridge = samples[0]?.effectiveRoadTemp;
  const evidence = [
    Number.isFinite(peak.temp) ? '기온 ' + peak.temp.toFixed(1) + '°C' : '',
    Number.isFinite(curDew) ? '이슬점 ' + curDew.toFixed(1) + '°C' : '',
    Number.isFinite(curBridge) ? '교량·노면 ' + curBridge.toFixed(1) + '°C' : '',
    Number.isFinite(peak.humidity) ? '습도 ' + Math.round(peak.humidity) + '%' : '',
    Number.isFinite(peak.wind) ? '풍속 ' + peak.wind.toFixed(1) + ' m/s' : ''
  ].filter(Boolean).join(' · ');

  const shortReason = peak.rank
    ? `${(peak.time || '').slice(11, 16) || '현재'} ${peak.cause}`
    : incomplete
    ? '일부 시간대 자료 부족'
    : '향후 6시간 결빙 위험 조건 없음 (정상)';

  const reason = peak.rank
    ? `${(peak.time || '').slice(11, 16) || '현재'} ${peak.cause} (최저 ${low}) · ${evidence}`
    : incomplete
    ? '일부 시간대에 필요한 모델값이 빠져 있습니다.'
    : `현재부터 6시간 뒤까지 최저 기온 ${low} (${evidence || '기상 정상'}). 검토한 시간대에서 결빙 관심 조건이 나타나지 않았습니다.`;

  const conditionMetrics = [
    { label: '최저기온(6h)', value: Number.isFinite(minTempVal) ? `${minTempVal.toFixed(1)}°C` : '—', warn: minTempVal !== null && minTempVal <= 1.5 },
    { label: '현재기온', value: Number.isFinite(curTemp) ? `${curTemp.toFixed(1)}°C` : '—', warn: Number.isFinite(curTemp) && curTemp <= 1.5 },
    { label: '교량·노면', value: Number.isFinite(curBridge) ? `${curBridge.toFixed(1)}°C` : '—', warn: Number.isFinite(curBridge) && curBridge <= 0.5 },
    { label: '이슬점(Td)', value: Number.isFinite(curDew) ? `${curDew.toFixed(1)}°C` : '—', sub: Number.isFinite(curDewSpread) ? `편차 ${curDewSpread}°` : '', warn: Number.isFinite(curTemp) && curTemp <= 0 && curDewSpread !== null && curDewSpread <= 1.5 },
    { label: '상대습도', value: Number.isFinite(curHum) ? `${Math.round(curHum)}%` : '—', warn: Number.isFinite(curHum) && curHum >= 90 },
    { label: '현재풍속', value: Number.isFinite(curWind) ? `${curWind.toFixed(1)} m/s` : '—', warn: Number.isFinite(curWind) && curWind >= 10 }
  ];

  // 2. 제설차 시동(살포기 예열) → 사전 제설제(예비 살포) → 본 제설 3단계 역산 타임라인 (6시간 기준, 요구사항 4.2)
  const snowActions = [];
  const firstCriticalIdx = samples.findIndex(s => s.rank === 2 || s.snowNow);
  let preheatCard = { stageId: 'preheat', title: '제설차 시동 ON', subtitle: '(살포기 유압 예열)', status: '대기', detail: '결빙·강설 신호 없음', state: 'idle', pcChip: null, mobChip: null };
  let presaltCard = { stageId: 'presalt', title: '예비살포', subtitle: '(습염 사전 살포)', status: '대기', detail: '노면 결빙 위험 없음', state: 'idle', pcChip: null, mobChip: null };
  let mainPlowCard = { stageId: 'mainplow', title: '본살포', subtitle: '(제설삽날·연속 살포)', status: '대기', detail: '강설 1.0cm/h 이상 시', state: 'idle', pcChip: null, mobChip: null };

  if (firstCriticalIdx >= 0) {
    const targetSample = samples[firstCriticalIdx];
    const targetClock = (targetSample.time || '').slice(11, 16) || '곧';
    if (firstCriticalIdx <= 2) {
      const presaltClk = addHoursClock(targetClock, -1);
      const presaltHr = presaltClk.slice(0, 2) + '시';
      const presaltHrsLeft = Math.max(0, firstCriticalIdx - 1);
      snowActions.push({
        stage: 'immediate',
        rank: 2,
        text: `🚨 [즉시 제설차 시동·살포기 예열 및 살포 준비] 현재 또는 2시간 내(${targetClock}) 결빙·강설 진행 중 — 즉시 유압 예열 및 습염 살포 출동`
      });
      preheatCard = {
        stageId: 'preheat',
        title: '제설차 시동 ON',
        subtitle: '(살포기 유압 예열)',
        status: '즉시 시동',
        detail: `${targetClock} 결빙·강설 임박`,
        state: 'urgent',
        hoursLeft: 0,
        pcChip: '🚨 시동ON · 즉시',
        mobChip: '🚨 즉시'
      };
      presaltCard = {
        stageId: 'presalt',
        title: '예비살포',
        subtitle: '(습염 사전 살포)',
        status: presaltHrsLeft === 0 ? '즉시 출동' : `${presaltHrsLeft}h내(${presaltHr})`,
        detail: '고속도로·교량 즉시 살포',
        state: 'urgent',
        hoursLeft: presaltHrsLeft,
        pcChip: presaltHrsLeft === 0 ? '🚜 예비살포 · 즉시' : `🚜 예비살포 · ${presaltHrsLeft}h내(${presaltHr})`,
        mobChip: presaltHrsLeft === 0 ? '🚜 즉시' : `🚜 ${presaltHrsLeft}h·${presaltHr}`
      };
    } else {
      const preheatClock = addHoursClock(targetClock, -3);
      const presaltStart = addHoursClock(targetClock, -2);
      const presaltEnd = addHoursClock(targetClock, -1);
      const preheatHrs = firstCriticalIdx - 3;
      const presaltHrs = firstCriticalIdx - 2;
      const preheatHr = preheatClock.slice(0, 2) + '시';
      const presaltHr = presaltStart.slice(0, 2) + '시';
      snowActions.push({
        stage: 'preheat',
        rank: 2,
        text: `🔑 [제설차 시동·살포기 예열] ${preheatClock} 시동 권장 (살포기 유압 예열 → ${presaltStart} 예비살포 → ${targetClock} 결빙·강설 예상)`
      });
      snowActions.push({
        stage: 'presalt',
        rank: 2,
        text: `🚜 [사전 제설(예비살포) 권장] ${presaltStart}~${presaltEnd} 이전 습염 사전 살포 출동 (${targetClock} 결빙·강설 예상)`
      });
      preheatCard = {
        stageId: 'preheat',
        title: '제설차 시동 ON',
        subtitle: '(살포기 유압 예열)',
        status: preheatHrs === 0 ? `즉시(${preheatHr})` : `${preheatHrs}h내(${preheatHr})`,
        detail: `예상(${targetClock}) 3시간 전`,
        state: preheatHrs === 0 ? 'urgent' : 'watch',
        hoursLeft: preheatHrs,
        pcChip: preheatHrs === 0 ? `🔑 시동ON · 즉시(${preheatHr})` : `🔑 시동ON · ${preheatHrs}h내(${preheatHr})`,
        mobChip: preheatHrs === 0 ? `🔑 즉시` : `🔑 ${preheatHrs}h·${preheatHr}`
      };
      presaltCard = {
        stageId: 'presalt',
        title: '예비살포',
        subtitle: '(습염 사전 살포)',
        status: `${presaltHrs}h내(${presaltStart}~${presaltEnd})`,
        detail: '결빙 1~2시간 전 살포',
        state: 'urgent',
        hoursLeft: presaltHrs,
        pcChip: `🚜 예비살포 · ${presaltHrs}h내(${presaltHr})`,
        mobChip: `🚜 ${presaltHrs}h·${presaltHr}`
      };
    }
  } else if (peak.rank === 1) {
    const watchIdx = Math.max(0, samples.findIndex(s => s.rank === 1));
    const watchClock = (peak.time || '').slice(11, 16) || '야간';
    const preheatClock = addHoursClock(watchClock, -3);
    const watchHrs = Math.max(0, watchIdx - 3);
    const preheatHr = preheatClock.slice(0, 2) + '시';
    snowActions.push({
      stage: 'watch',
      rank: 1,
      text: `🔑 [교량·응달 순찰 및 살포기 점검] ${watchClock}경 살얼음 관심 (${preheatClock}경 제설차 예열 대기 권장)`
    });
    preheatCard = {
      stageId: 'preheat',
      title: '제설차 시동 ON',
      subtitle: '(살포기 유압 예열)',
      status: watchHrs === 0 ? `점검(${preheatHr})` : `${watchHrs}h내(${preheatHr})`,
      detail: `${watchClock}경 살얼음 관심`,
      state: 'watch',
      hoursLeft: watchHrs,
      pcChip: watchHrs === 0 ? `🔑 예열점검 · 즉시` : `🔑 예열점검 · ${watchHrs}h내(${preheatHr})`,
      mobChip: watchHrs === 0 ? '🔑 점검' : `🔑 ${watchHrs}h·${preheatHr}`
    };
    presaltCard = {
      stageId: 'presalt',
      title: '예비살포',
      subtitle: '(습염 사전 살포)',
      status: '순찰 대기',
      detail: '교량·응달 노면 점검',
      state: 'watch',
      hoursLeft: Math.max(0, watchIdx - 1),
      pcChip: null,
      mobChip: null
    };
  }

  const maxSnowHourly = Math.max(0, ...samples.map(s => Number.isFinite(s.snow) ? s.snow : 0));
  const totalSnow6h = samples.slice(1).reduce((sum, s) => sum + (Number.isFinite(s.snow) ? s.snow : 0), 0);
  if (maxSnowHourly >= 1.0 || totalSnow6h >= 3.0) {
    const snowIdx = Math.max(0, samples.findIndex(s => Number.isFinite(s.snow) && s.snow >= 1.0));
    const snowHr = (samples[snowIdx]?.time || '').slice(11, 13) + '시';
    snowActions.push({
      stage: 'mainplow',
      rank: 2,
      text: `🚨 [본 제설 준비] 예상 강설 최대 ${maxSnowHourly.toFixed(1)} cm/h (누적 ${totalSnow6h.toFixed(1)} cm) · 제설삽날 장착 및 연속 제설 대비`
    });
    mainPlowCard = {
      stageId: 'mainplow',
      title: '본살포',
      subtitle: '(제설삽날·연속 살포)',
      status: snowIdx <= 0 ? '즉시 투입' : `${snowIdx}h내(${snowHr})`,
      detail: `최대 ${maxSnowHourly.toFixed(1)}cm/h · 누적 ${totalSnow6h.toFixed(1)}cm`,
      state: 'urgent',
      hoursLeft: snowIdx,
      pcChip: snowIdx <= 0 ? '🚨 본살포 · 즉시' : `🚨 본살포 · ${snowIdx}h내(${snowHr})`,
      mobChip: snowIdx <= 0 ? '🚨 본살포' : `🚨 ${snowIdx}h·${snowHr}`
    };
  }
  if (minTempVal !== null && minTempVal <= -6.0) {
    snowActions.push({
      stage: 'chemical',
      rank: 2,
      text: `⚠️ [저온 결빙 주의] 최저 ${minTempVal.toFixed(1)}°C (-6°C 이하 소금 NaCl 융빙력 급감 · 염화칼슘 CaCl₂ 배합 상향 필요)`
    });
    mainPlowCard = {
      stageId: 'mainplow',
      title: '본살포',
      subtitle: '(CaCl₂ 저온 배합 상향)',
      status: `${minTempVal.toFixed(1)}°C 저온`,
      detail: '염화칼슘 배합 상향 필요',
      state: mainPlowCard.state === 'urgent' ? 'urgent' : 'watch',
      hoursLeft: mainPlowCard.hoursLeft ?? 0,
      pcChip: mainPlowCard.pcChip || '⚠️ 본살포 · CaCl₂배합',
      mobChip: mainPlowCard.mobChip || '⚠️ CaCl₂'
    };
  }

  // 3. 하절기·우기 홍수 예방 — 시간당 강우강도(mm/h) 및 선행강수 기반 도로 수방 경보 (요구사항 4.3)
  const maxRainHourly = Math.max(
    0,
    ...samples.map(s => Number.isFinite(s.precip) ? s.precip : 0),
    ...(kmaHours || []).slice(0, 6).map(h => Number.isFinite(h.rainMm) ? h.rainMm : 0)
  );
  const past24Precip = previous.reduce((sum, r) => sum + (Number.isFinite(r?.precip) ? r.precip : 0), 0);
  const todayPrecip = Number.isFinite(obs?.dayPrecip) ? obs.dayPrecip : past24Precip;
  const next6Precip = samples.slice(1).reduce((sum, r) => sum + (Number.isFinite(r?.precip) ? r.precip : 0), 0);
  const combinedWater = past24Precip + next6Precip;

  let flood = { rank: 0, badge: null, shortBadge: null, guide: null };
  if (maxRainHourly >= 50 || combinedWater >= 120) {
    flood = {
      rank: 2,
      badge: '🚨 극한호우·도로통제 검토',
      shortBadge: '🚨극한호우',
      guide: `🚨 [극한호우·도로통제 검토] 시간당 최대 ${maxRainHourly.toFixed(1)} mm/h · 누적 ${combinedWater.toFixed(1)} mm — 지하차도·세월교 즉시 통제 검토`
    };
  } else if (maxRainHourly >= 30 || combinedWater >= 80) {
    flood = {
      rank: 2,
      badge: '🌊 집중호우·지하차도/사면 주의',
      shortBadge: '🌊호우주의',
      guide: `🌊 [집중호우·지하차도/사면 주의] 시간당 ${maxRainHourly.toFixed(1)} mm/h · 선행+예상 ${combinedWater.toFixed(1)} mm — 지하차도 침수 감시 및 절토사면 낙석 순찰 강화`
    };
  } else if (maxRainHourly >= 10 || todayPrecip >= 30) {
    flood = {
      rank: 1,
      badge: '🌧️ 배수로·집수정 점검',
      shortBadge: '🌧️배수점검',
      guide: `🌧️ [배수로·집수정 점검] 시간당 ${maxRainHourly.toFixed(1)} mm/h · 오늘 누적 ${todayPrecip.toFixed(1)} mm — 노면 수막현상 및 배수구 막힘 주의`
    };
  }

  // 4. 교량·고가도로 강풍(횡풍) 주의 표시 (요구사항 4.4)
  const maxWind = Math.max(
    0,
    Number.isFinite(obs?.gustSpeed) ? obs.gustSpeed : 0,
    Number.isFinite(obs?.windSpeed) ? obs.windSpeed : 0,
    ...samples.map(s => Number.isFinite(s.wind) ? s.wind : 0),
    ...(kmaHours || []).slice(0, 6).map(h => Number.isFinite(h.wind) ? h.wind : 0)
  );
  const windAlert = maxWind >= 10.0 ? {
    active: true,
    maxWind: Number(maxWind.toFixed(1)),
    badge: `💨 강풍 주의 (최대 ${maxWind.toFixed(1)} m/s)`,
    shortBadge: `💨강풍 ${maxWind.toFixed(0)}m/s`,
    guide: `💨 [교량 횡풍 주의] 최대 풍속 ${maxWind.toFixed(1)} m/s — 고가교량(죽산천교·옥계1교·논공교 등) 화물차 횡풍 위험 및 도로 표지판·가시설물 점검`
  } : { active: false, maxWind: Number(maxWind.toFixed(1)), badge: null, shortBadge: null, guide: null };

  const rainIdx = samples.findIndex(s => Number.isFinite(s.precip) && s.precip >= 10);
  const rainHr = rainIdx > 0 && samples[rainIdx]?.time ? samples[rainIdx].time.slice(11, 13) + '시' : '';
  const floodWindCard = flood.rank === 2
    ? {
        stageId: 'floodwind',
        title: '수방 · 통제',
        subtitle: '(지하차도·사면·배수)',
        status: flood.shortBadge,
        detail: `최대 ${maxRainHourly.toFixed(1)}mm/h · 누적 ${combinedWater.toFixed(1)}mm`,
        state: 'urgent',
        hoursLeft: Math.max(0, rainIdx),
        pcChip: rainIdx > 0 ? `🌊 수방주의 · ${rainIdx}h내(${rainHr})` : '🌊 수방통제 · 즉시',
        mobChip: rainIdx > 0 ? `🌊 ${rainIdx}h·${rainHr}` : '🌊 즉시'
      }
    : flood.rank === 1
    ? {
        stageId: 'floodwind',
        title: '수방 · 배수점검',
        subtitle: '(배수로·집수정)',
        status: rainIdx > 0 ? `${rainIdx}h내(${rainHr})` : '배수 점검',
        detail: `시간당 ${maxRainHourly.toFixed(1)}mm/h · 오늘 ${todayPrecip.toFixed(1)}mm`,
        state: 'watch',
        hoursLeft: Math.max(0, rainIdx),
        pcChip: rainIdx > 0 ? `🌧️ 배수점검 · ${rainIdx}h내(${rainHr})` : '🌧️ 배수점검 · 즉시',
        mobChip: rainIdx > 0 ? `🌧️ ${rainIdx}h·${rainHr}` : '🌧️ 점검'
      }
    : windAlert.active
    ? {
        stageId: 'floodwind',
        title: '교량 횡풍 주의',
        subtitle: '(고가교·표지판)',
        status: `최대 ${windAlert.maxWind}m/s`,
        detail: '화물차 횡풍 주의',
        state: 'watch',
        hoursLeft: 0,
        pcChip: `💨 횡풍주의 · ${windAlert.maxWind}m/s`,
        mobChip: `💨 ${windAlert.maxWind}m`
      }
    : {
        stageId: 'floodwind',
        title: '수방 · 횡풍',
        subtitle: '(배수로·교량 안전)',
        status: '정상',
        detail: `강수 ${maxRainHourly.toFixed(1)}mm/h · 풍속 ${windAlert.maxWind}m/s`,
        state: 'idle',
        pcChip: null,
        mobChip: null
      };

  return {
    level,
    rank: peak.rank,
    shortCause: peak.shortCause || '',
    shortReason,
    conditionMetrics,
    decisionCards: [preheatCard, presaltCard, mainPlowCard, floodWindCard],
    minTemp: minTempVal,
    dewPoint: curDew,
    bridgeTemp: curBridge,
    reason: reason + (peak.rank && incomplete ? ' 일부 시간대 자료가 부족합니다.' : ''),
    samples,
    snowActions,
    flood,
    windAlert
  };
}

export const ROAD_RISK_LABELS = ['정보없음', '관심', '주의', '위험'];
export const FOG_RISK_LABELS = ['안개없음', '관심', '주의', '위험'];

/**
 * 기상청 도로 위험기상정보(0~3단계) 격상 판정: 0→2, 0→3, 1→2, 1→3, 2→3
 */
export function isRoadRiskEscalated(prevLv, currLv) {
  if (!Number.isFinite(prevLv) || !Number.isFinite(currLv)) return false;
  return (prevLv <= 1 && currLv >= 2) || (prevLv === 2 && currLv === 3);
}

/**
 * 4단계 통합 색상 등급 분류 (0: 회색/평온 -> 1: 노랑/관심 -> 2: 주황/제설·수방지시 -> 3: 빨강/눈·심한비·긴급·경보)
 */
export function classifySeverityTier({ w = null, o = null, wrn = null, roadRisk = null } = {}) {
  const iceRank = w?.ice?.rank || 0;
  const roadIce = roadRisk?.iceLevel || 0;
  const roadFog = roadRisk?.fogLevel || 0;
  const floodRank = w?.ice?.flood?.rank || 0;
  const windActive = !!w?.ice?.windAlert?.active;
  const cards = w?.ice?.decisionCards || [];
  const hasUrgentCard = cards.some(c => c?.state === 'urgent');
  const hasWatchCard = cards.some(c => c?.state === 'watch');

  const nowWet = !!w?.kma?.analysis?.now?.wet;
  const nowType = String(w?.kma?.analysis?.now?.type || '');
  const curCode = o?.code ?? w?.current?.code;
  const surfaceCode = o?.surfaceCode;

  const isSnowingNow =
    (Number.isFinite(o?.snowDepth) && o.snowDepth > 0) ||
    nowType.includes('눈') ||
    nowType.includes('진눈') ||
    [66, 67, 71, 73, 75, 77, 85, 86].includes(curCode) ||
    [4, 5, 6].includes(surfaceCode);

  const curRainRate = Math.max(
    Number.isFinite(o?.precip) ? o.precip : 0,
    Number.isFinite(w?.current?.precip) ? w.current.precip : 0,
    nowWet && Number.isFinite(w?.kma?.hours?.[0]?.rainMm) ? w.kma.hours[0].rainMm : 0
  );
  const isHeavyRainNow =
    (nowWet || (Number.isFinite(o?.precip) && o.precip > 0)) &&
    (curRainRate >= 10.0 || [65, 81, 82, 95, 96, 99].includes(curCode));

  const topWrn = wrn?.top;
  const isSevereWrn =
    (wrn?.count || 0) > 0 &&
    (topWrn?.level === '경보' || ['대설', '호우', '태풍'].includes(topWrn?.kind));

  if (isSnowingNow || isHeavyRainNow || iceRank === 2 || roadIce >= 3 || roadFog >= 3 || floodRank === 2 || hasUrgentCard || isSevereWrn) {
    return { tier: 3, key: 'danger', cls: 'tier-danger', pinColor: '#ef4444', ringColor: 'rgba(239,68,68,0.38)', label: '긴급·경고' };
  }
  if (hasWatchCard || iceRank === 1 || roadIce === 2 || roadFog === 2 || floodRank === 1 || windActive) {
    return { tier: 2, key: 'directive', cls: 'tier-directive', pinColor: '#f97316', ringColor: 'rgba(249,115,22,0.36)', label: '지시·주의' };
  }
  if ((wrn?.count || 0) > 0 || nowWet || surfaceCode === 2 || surfaceCode === 3 || roadIce === 1 || roadFog === 1) {
    return { tier: 1, key: 'watch', cls: 'tier-watch', pinColor: '#eab308', ringColor: 'rgba(234,179,8,0.34)', label: '관심' };
  }
  return { tier: 0, key: 'calm', cls: 'tier-calm', pinColor: '#10b981', ringColor: 'rgba(16,185,129,0.28)', label: '평온' };
}
