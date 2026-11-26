import { apiUrl } from './config.js';
import { mountIceAlertModal } from './ice-alert-modal.js';

const BRANCH_STN_IDS = new Set(['14206', '14409', '14207', '14208', '14209', '14103', '14410']);

export function parseDiagTimeMs(raw) {
  if (!raw) return NaN;
  const s = String(raw).trim();
  if (/^\d{12}$/.test(s)) {
    return Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`);
  }
  return Date.parse(s);
}

export function fmtTime(raw) {
  if (!raw) return '—';
  const s = String(raw).trim();
  if (/^\d{12}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)} KST`;
  }
  if (s.includes('+09:00')) {
    return s.slice(0, 16).replace('T', ' ') + ' KST';
  }
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  const k = new Date(ms + 9 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}

function ageMinFrom(raw, nowMs = Date.now()) {
  const ms = parseDiagTimeMs(raw);
  return Number.isFinite(ms) ? Math.max(0, Math.round((nowMs - ms) / 60000)) : null;
}

export function computeBriefingEditionClient(nowMs = Date.now()) {
  const k = new Date(nowMs + 9 * 3600000);
  const p = n => String(n).padStart(2, '0');
  const h = k.getUTCHours();
  let editionDate = new Date(k.getTime());
  let slot = 'morning';
  let nextKst;
  if (h < 8) {
    editionDate = new Date(k.getTime() - 24 * 3600000);
    slot = 'night';
    nextKst = `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T08:00:00+09:00`;
  } else if (h < 18) {
    slot = 'morning';
    nextKst = `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T18:00:00+09:00`;
  } else {
    slot = 'night';
    const tmr = new Date(k.getTime() + 24 * 3600000);
    nextKst = `${tmr.getUTCFullYear()}-${p(tmr.getUTCMonth() + 1)}-${p(tmr.getUTCDate())}T08:00:00+09:00`;
  }
  const ds = `${editionDate.getUTCFullYear()}-${p(editionDate.getUTCMonth() + 1)}-${p(editionDate.getUTCDate())}`;
  return {
    editionId: `${ds}-${slot}`,
    nextEditionAt: nextKst
  };
}

export function evaluateRoadObsHealth(ro, nowMs = Date.now()) {
  const list = Array.isArray(ro) ? ro : (Array.isArray(ro?.stations) ? ro.stations : []);
  if (!list.length) {
    return { status: 'critical', error: ro?.error || '도로관측 미수신' };
  }
  const tm1 = ro?.tm1 || list.find(s => s?.tm || s?.tm1)?.tm || list.find(s => s?.tm1)?.tm1 || null;
  const ageMinutes = ageMinFrom(tm1, nowMs);
  const branchStationsActive = list.filter(
    s => BRANCH_STN_IDS.has(String(s?.stnId)) && (s.roadTemp !== null || s.temp !== null)
  ).length;
  const stale = Boolean(ro?.stale);
  const status = (stale || (ageMinutes !== null && ageMinutes > 12)) ? 'degraded' : 'healthy';
  return {
    status,
    tm1,
    ageMinutes,
    totalStations: list.length,
    branchStationsActive,
    branchStationsExpected: 7,
    stale
  };
}

export function evaluateRoadRiskHealth(rr, nowMs = Date.now()) {
  if (!rr?.ok) {
    return { status: 'critical', error: rr?.error || '012선 위험정보 미수신' };
  }
  const br = rr.branchSummary || {};
  const frgTm = rr.sources?.frgTmKst || rr.tmKst || null;
  const fogTm = rr.sources?.fogTmKst || null;
  const frgMs = parseDiagTimeMs(frgTm);
  const fogMs = parseDiagTimeMs(fogTm);
  const fogLagMinutes = (Number.isFinite(frgMs) && Number.isFinite(fogMs)) ? Math.round((frgMs - fogMs) / 60000) : 0;
  const ageMinutes = ageMinFrom(frgTm, nowMs);
  const sumCnt = Array.isArray(br.iceCounts) ? br.iceCounts.reduce((a, b) => a + b, 0) : 0;
  const invariantOk = br.total1km === (sumCnt + (br.missingIceCount || 0));
  const stale = Boolean(rr.stale);
  const status = (stale || !invariantOk || (ageMinutes !== null && ageMinutes > 20)) ? 'degraded' : 'healthy';
  return {
    status,
    frgTmKst: frgTm,
    fogTmKst: fogTm,
    fogLagMinutes,
    ageMinutes,
    branchRange: br.rangeLabel || '함양IC(95.0k)~옥포JC(176.0k)',
    branchMaxIce: br.maxIce,
    branchIceLabel: br.iceLabel,
    total1km: br.total1km ?? 0,
    missingIceCount: br.missingIceCount ?? 0,
    invariantOk,
    stale
  };
}

export function evaluateRwisHealth(raw, nowMs = Date.now()) {
  const rw = raw?.rwis || raw;
  if (!raw?.ok || !rw) {
    return { status: 'degraded', error: raw?.error || 'RWIS 지연' };
  }
  const frTm = rw?.tm?.FR || (typeof rw?.tm === 'string' ? rw.tm : null);
  const vrTm = rw?.tm?.VR || null;
  const frMs = parseDiagTimeMs(frTm);
  const vrMs = parseDiagTimeMs(vrTm);
  const vrLagMinutes = (Number.isFinite(frMs) && Number.isFinite(vrMs)) ? Math.round((frMs - vrMs) / 60000) : null;
  const ageMinutes = ageMinFrom(frTm, nowMs);
  const zoneCount = Array.isArray(rw?.zones) ? rw.zones.length : 0;
  const status = (zoneCount < 16 || (ageMinutes !== null && ageMinutes > 25)) ? 'degraded' : 'healthy';
  return {
    status,
    frTm,
    vrTm,
    vrLagMinutes,
    ageMinutes,
    zoneCount,
    expectedZoneCount: 16
  };
}

export function evaluateShort13Health(s12, nowMs = Date.now()) {
  if (!s12?.ok || !Array.isArray(s12?.regions)) {
    return { status: 'critical', error: s12?.error || '13개소 단기예보 미수신' };
  }
  const completeRegions = s12.regions.filter(r => Array.isArray(r.hours) && r.hours.length > 0).length;
  const mixedGeneration = Boolean(s12.sources?.mixedGeneration);
  const isFallback = Boolean(s12.sources?.isFallback);
  const status = (completeRegions < 13 || mixedGeneration || isFallback) ? 'degraded' : 'healthy';
  return {
    status,
    shortBase: s12.sources?.shortBase || null,
    ultraBase: s12.sources?.ultraBase || null,
    shortAgeMinutes: ageMinFrom(s12.sources?.shortBase, nowMs),
    ultraAgeMinutes: ageMinFrom(s12.sources?.ultraBase, nowMs),
    completeRegions,
    expectedRegions: 13,
    mixedGeneration,
    isFallback,
    snapshotId: s12.sources?.snapshotId || null
  };
}

export function evaluateWarningsHealth(healthPayload, wrnPayload) {
  const runtime = {
    forecastConfigured: Boolean(healthPayload?.forecastConfigured),
    roadConfigured: Boolean(healthPayload?.roadConfigured),
    radarConfigured: Boolean(healthPayload?.radarConfigured),
    cctvConfigured: Boolean(healthPayload?.cctvConfigured)
  };
  if (!wrnPayload?.ok) {
    return {
      status: 'degraded',
      confirmed: false,
      error: wrnPayload?.error || '특보 조회 지연',
      runtime
    };
  }
  const stale = Boolean(wrnPayload.stale);
  const count = typeof wrnPayload.totalNational === 'number'
    ? wrnPayload.totalNational
    : (Array.isArray(wrnPayload.warnings) ? wrnPayload.warnings.length : 0);
  return {
    status: stale ? 'degraded' : 'healthy',
    confirmed: !stale,
    nationalActiveCount: count,
    stale,
    runtime
  };
}

async function fetchJsonDiag(url, { timeoutMs = 16000, retries = 1, force = false } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: force ? 'no-store' : 'default',
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }
      return data;
    } catch (e) {
      const isAbort = e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('timed out') || String(e?.message || '').toLowerCase().includes('aborted');
      lastErr = isAbort
        ? new Error(`응답 시간 초과 (${Math.round(timeoutMs / 1000)}초)`)
        : e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 450));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('네트워크 요청 실패');
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const modal = mountIceAlertModal();

  function pillHtml(status) {
    const label = status === 'healthy'
      ? '정상'
      : status === 'checking'
        ? '점검 중…'
        : status === 'degraded'
          ? '지연·보완'
          : '확인 필요';
    return `<span class="ops-pill st-${esc(status || 'degraded')}">${label}</span>`;
  }

  function kvRow(k, v) {
    return `<div class="ops-kv"><span>${esc(k)}</span><b>${esc(v ?? '—')}</b></div>`;
  }

  function renderCards(state) {
    const ro = state.roadObs || { status: 'checking' };
    const rr = state.roadRisk012 || { status: 'checking' };
    const rw = state.rwis || { status: 'checking' };
    const s13 = state.shortTerm13 || { status: 'checking' };
    const wrn = state.warnings || { status: 'checking' };
    const br = state.briefing || { status: 'checking' };
    const share = state.share;
    const shareSt = br.status === 'checking'
      ? 'checking'
      : (share?.body?.status === 'ready' ? 'healthy' : 'degraded');

    const cards = [
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🛣️ 도로기상관측 (1분 실측)</h2>${pillHtml(ro.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('최신 관측슬롯 (tm1)', ro.status === 'checking' ? '조회 중…' : fmtTime(ro.tm1))}
            ${kvRow('현재 시각 대비 지연', ro.ageMinutes != null ? `${ro.ageMinutes}분` : '—')}
            ${kvRow('고령지사 관할 관측소', ro.branchStationsActive != null ? `${ro.branchStationsActive} / ${ro.branchStationsExpected}개소` : (ro.error || '—'))}
            ${kvRow('14번 노선 전체 수신', ro.totalStations != null ? `${ro.totalStations}개소` : '—')}
            ${kvRow('폴백(Stale) 여부', ro.status === 'checking' ? '—' : (ro.stale ? '직전 정상본 유지 중' : (ro.error ? '수신 지연' : '실시간 정상')))}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>❄️ 012선 도로살얼음 (5분 ZIP)</h2>${pillHtml(rr.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('관할 범위', rr.branchRange || '함양IC(95.0k)~옥포JC(176.0k)')}
            ${kvRow('살얼음(FRG) 기준시각', rr.status === 'checking' ? '조회 중…' : fmtTime(rr.frgTmKst))}
            ${kvRow('안개(FOG) 기준시각', fmtTime(rr.fogTmKst))}
            ${kvRow('현재 관할 최고등급', rr.branchIceLabel != null ? `${rr.branchIceLabel} (${rr.branchMaxIce ?? '결측'})` : (rr.error || '—'))}
            ${kvRow('결측 분리 / 불변식', rr.invariantOk != null ? `결측 ${rr.missingIceCount}건 · ${rr.invariantOk ? '✓ 불변식 일치' : '✗ 불일치'}` : '—')}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🗺️ 기상청 RWIS (FR · VR)</h2>${pillHtml(rw.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('살얼음(FR) 기준시각', rw.status === 'checking' ? '조회 중…' : fmtTime(rw.frTm))}
            ${kvRow('가시거리(VR) 기준시각', fmtTime(rw.vrTm))}
            ${kvRow('FR 대비 VR 시차', rw.vrLagMinutes != null ? `${rw.vrLagMinutes}분` : '—')}
            ${kvRow('양방향 콘존 수신', rw.zoneCount != null ? `${rw.zoneCount} / ${rw.expectedZoneCount || 16}개` : (rw.note || rw.error || '—'))}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🕒 13개소 단기·초단기예보</h2>${pillHtml(s13.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('단기예보 발표 (shortBase)', s13.status === 'checking' ? '조회 중…' : fmtTime(s13.shortBase))}
            ${kvRow('초단기 발표 (ultraBase)', fmtTime(s13.ultraBase))}
            ${kvRow('수신 완비 지역', s13.completeRegions != null ? `${s13.completeRegions} / ${s13.expectedRegions}곳` : (s13.error || '—'))}
            ${kvRow('세대 무결성', s13.status === 'checking' ? '—' : (s13.error ? s13.error : s13.mixedGeneration ? '⚠ 세대 혼재 감지' : (s13.isFallback ? '직전 검증회차 보존' : '✓ 단일 최신 세대')))}
            ${kvRow('배치 스냅샷 ID', s13.snapshotId || '—')}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🚨 기상특보 · 백엔드 설정</h2>${pillHtml(wrn.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('특보 조회 상태', wrn.status === 'checking' ? '조회 중…' : (wrn.confirmed ? '✓ 실시간 확인됨' : (wrn.error || '보조 캐시')))}
            ${kvRow('전국 발효 특보 행수', wrn.nationalActiveCount != null ? `${wrn.nationalActiveCount}건` : '—')}
            ${kvRow('예보/도로/CCTV 키 구성', wrn.runtime ? `${wrn.runtime.forecastConfigured ? '예보✓' : '예보✗'} · ${wrn.runtime.roadConfigured ? '도로✓' : '도로✗'} · ${wrn.runtime.cctvConfigured ? 'CCTV✓' : 'CCTV✗'}` : '—')}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🤖 일 2회(08·18시) 브리핑 채널</h2>${pillHtml(shareSt)}</div>
          <div class="ops-kv-list">
            ${kvRow('현재 적용 회차', share?.body?.edition_id || br.editionId || '—')}
            ${kvRow('/share/status.json 상태', br.status === 'checking' ? '조회 중…' : (share ? `HTTP ${share.httpStatus} · ${share.body?.status}` : '확인 대기'))}
            ${kvRow('PNG 생성 시각', fmtTime(share?.body?.generated_at))}
            ${kvRow('다음 회차 예정', fmtTime(share?.body?.next_edition_at || br.nextEditionAt))}
          </div>
        </article>
      `
    ];
    $('diagCardsGrid').innerHTML = cards.join('');
  }

  let activeRunGen = 0;

  async function runDiagnostics(force = false) {
    const gen = ++activeRunGen;
    const btn = $('btnDiagRefresh');
    const forceBtn = $('btnDiagForce');
    btn.disabled = true;
    forceBtn.disabled = true;

    const edition = computeBriefingEditionClient(Date.now());
    const state = {
      roadObs: { status: 'checking' },
      roadRisk012: { status: 'checking' },
      rwis: { status: 'checking' },
      shortTerm13: { status: 'checking' },
      warnings: { status: 'checking' },
      briefing: { status: 'checking', ...edition },
      share: null
    };

    const banner = $('diagOverallBanner');
    banner.className = 'ops-banner';
    $('diagOverallText').textContent = force
      ? '⚡ 캐시를 우회하여 6개 파이프라인을 개별 병렬 점검하는 중… (0/6)'
      : '파이프라인별 건전성을 실시간 병렬 점검하는 중… (0/6)';
    $('diagCheckedAt').textContent = `점검 시작: ${fmtTime(new Date().toISOString())}`;
    renderCards(state);

    let doneCount = 0;
    const stepDone = () => {
      if (gen !== activeRunGen) return;
      doneCount++;
      if (doneCount < 6) {
        $('diagOverallText').textContent = force
          ? `⚡ 원천 강제 점검 진행 중… (${doneCount}/6 완료)`
          : `파이프라인 건전성 점검 진행 중… (${doneCount}/6 완료)`;
      }
      renderCards(state);
    };

    const forceQs = force ? '&force=1' : '';
    const tasks = [
      // 1) 도로기상관측 (1분)
      fetchJsonDiag(apiUrl(`/api/road-obs?line=14${forceQs}`), { timeoutMs: 16000, retries: 1, force })
        .then(v => { state.roadObs = evaluateRoadObsHealth(v, Date.now()); })
        .catch(e => { state.roadObs = { status: 'critical', error: e?.message || '도로관측 지연' }; })
        .finally(stepDone),

      // 2) 012선 도로살얼음 위험정보 (5분 ZIP)
      fetchJsonDiag(apiUrl(`/api/road-risk?roadNum=012${forceQs}`), { timeoutMs: 18000, retries: 1, force })
        .then(v => { state.roadRisk012 = evaluateRoadRiskHealth(v, Date.now()); })
        .catch(e => { state.roadRisk012 = { status: 'critical', error: e?.message || '012선 위험정보 지연' }; })
        .finally(stepDone),

      // 3) 기상청 RWIS (FR/VR) — rwis.html과 동일한 경량 Edge 캐시 경로 공유
      fetchJsonDiag(apiUrl(`/api/rwis/api/rwis${force ? '?refresh=1' : ''}`), { timeoutMs: 18000, retries: 1, force })
        .then(v => { state.rwis = evaluateRwisHealth(v, Date.now()); })
        .catch(e => { state.rwis = { status: 'degraded', error: e?.message || 'RWIS 조회 지연' }; })
        .finally(stepDone),

      // 4) 13개소 단기·초단기예보 — 전용 요청으로 분리해 단일 Worker 소켓 경합 원천 차단
      fetchJsonDiag(
        apiUrl(`/api/short-term-12?roster=13${force ? '&force=1&refreshUltra=1' : ''}`),
        { timeoutMs: 34000, retries: 1, force }
      )
        .then(v => { state.shortTerm13 = evaluateShort13Health(v, Date.now()); })
        .catch(e => { state.shortTerm13 = { status: 'critical', error: e?.message || '13개소 예보 조회 지연' }; })
        .finally(stepDone),

      // 5) 기상특보 + 백엔드 환경설정
      Promise.allSettled([
        fetchJsonDiag(apiUrl('/api/health'), { timeoutMs: 10000, retries: 1, force: true }),
        fetchJsonDiag(apiUrl(`/api/warnings${force ? '?force=1' : ''}`), { timeoutMs: 16000, retries: 1, force })
      ])
        .then(([hRes, wRes]) => {
          const hVal = hRes.status === 'fulfilled' ? hRes.value : null;
          const wVal = wRes.status === 'fulfilled' ? wRes.value : { ok: false, error: wRes.reason?.message || '특보 지연' };
          state.warnings = evaluateWarningsHealth(hVal, wVal);
        })
        .finally(stepDone),

      // 6) 일 2회(08·18시) 브리핑 스냅샷 채널
      (async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          try {
            const r = await fetch('/share/status.json', { cache: 'no-store', signal: ctrl.signal });
            const body = await r.json().catch(() => ({}));
            state.share = { httpStatus: r.status, body };
          } finally {
            clearTimeout(t);
          }
        } catch {
          state.share = null;
        }
        state.briefing = {
          status: state.share?.body?.status === 'ready' ? 'healthy' : 'degraded',
          ...edition
        };
      })().finally(stepDone)
    ];

    try {
      await Promise.allSettled(tasks);
      if (gen !== activeRunGen) return;

      const coreStatuses = [
        state.roadObs.status,
        state.roadRisk012.status,
        state.rwis.status,
        state.shortTerm13.status,
        state.warnings.status
      ];
      const overallStatus = coreStatuses.includes('critical')
        ? 'critical'
        : coreStatuses.includes('degraded')
          ? 'degraded'
          : 'healthy';

      banner.className = `ops-banner is-${overallStatus}`;
      $('diagOverallText').textContent =
        overallStatus === 'healthy'
          ? '✅ 전 데이터 파이프라인 정상 — 시각 정합성·불변식·캐시 상태 양호'
          : overallStatus === 'degraded'
            ? '⚠️ 일부 파이프라인 지연 또는 직전 회차 보완 동작 중 — 아래 상세 카드를 확인하세요'
            : '🚨 일부 핵심 파이프라인 응답 지연 — 아래 확인 필요 카드의 상세 사유를 확인하세요';
      $('diagCheckedAt').textContent = `점검 완료: ${fmtTime(new Date().toISOString())}`;
      renderCards(state);
    } finally {
      if (gen === activeRunGen) {
        btn.disabled = false;
        forceBtn.disabled = false;
      }
    }
  }

  $('btnDiagRefresh')?.addEventListener('click', () => runDiagnostics(false));
  $('btnDiagForce')?.addEventListener('click', () => runDiagnostics(true));

  $('btnTestCautionModal')?.addEventListener('click', () => {
    modal.showPreview({
      popupLevel: 2,
      refTimeText: fmtTime(new Date().toISOString()).replace(' KST', ''),
      headline: '도로살얼음 위험정보 주의 격상 알림',
      directive: '온도, 노면상태 확인 후 예비살포',
      subDirective: '[사전 점검 시뮬레이션] 고정식 기상정보(대기온도, 노면온도, 노면상태) 확인 후 예비살포 실시',
      triggeredItems: [
        {
          id: 'test:210',
          label: '고령IC ↔ 동고령IC (테스트)',
          kmLabel: '152.9~165.5k',
          fromLevel: 0,
          toLevel: 2,
          toLabel: '주의',
          stationName: '양전교',
          airTemp: 1.8,
          roadTemp: 1.1,
          surfaceState: '습윤',
          tempCheckNote: '저온 기준 해당(대기≤4°C 또는 노면≤2°C) · 예비살포 적극 검토',
          isColdCondition: true
        }
      ]
    });
  });

  $('btnTestDangerModal')?.addEventListener('click', () => {
    modal.showPreview({
      popupLevel: 3,
      refTimeText: fmtTime(new Date().toISOString()).replace(' KST', ''),
      headline: '도로살얼음 위험정보 위험 격상 알림',
      directive: '예비살포 실시',
      subDirective: '[사전 점검 시뮬레이션] 선(先)예비살포, 후(後)상황판단회의 (제설작업 지속 여부 판단)',
      triggeredItems: [
        {
          id: 'test:210',
          label: '고령IC ↔ 동고령IC (테스트)',
          kmLabel: '152.9~165.5k',
          fromLevel: 2,
          toLevel: 3,
          toLabel: '위험',
          stationName: '양전교',
          airTemp: -0.5,
          roadTemp: -0.8,
          surfaceState: '습윤',
          tempCheckNote: '🚨 위험단계 — 즉시 예비살포 실시 후 상황판단회의 진행',
          isColdCondition: true
        }
      ]
    });
  });

  runDiagnostics(false);
}
