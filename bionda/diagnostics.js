import { apiUrl } from './config.js';
import { mountIceAlertModal } from './ice-alert-modal.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const modal = mountIceAlertModal();

function fmtTime(raw) {
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

function pillHtml(status) {
  const label = status === 'healthy' ? '정상' : status === 'degraded' ? '지연·보완' : '확인 필요';
  return `<span class="ops-pill st-${esc(status || 'degraded')}">${label}</span>`;
}

function kvRow(k, v) {
  return `<div class="ops-kv"><span>${esc(k)}</span><b>${esc(v ?? '—')}</b></div>`;
}

async function runDiagnostics(force = false) {
  const btn = $('btnDiagRefresh');
  const forceBtn = $('btnDiagForce');
  btn.disabled = true;
  forceBtn.disabled = true;
  $('diagOverallText').textContent = force ? '⚡ 캐시를 우회하여 기상청 원천 파이프라인을 직접 점검하는 중…' : '파이프라인 건전성을 조회하는 중…';

  try {
    const [healthRes, shareRes] = await Promise.allSettled([
      fetch(apiUrl(`/api/data-health${force ? '?force=1' : ''}`), { cache: 'no-store', signal: AbortSignal.timeout(25000) }).then(r => r.json()),
      fetch('/share/status.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then(async r => ({ httpStatus: r.status, body: await r.json() }))
    ]);

    if (healthRes.status !== 'fulfilled' || !healthRes.value?.ok) {
      throw new Error(healthRes.reason?.message || healthRes.value?.error || '진단 API 응답 실패');
    }

    const d = healthRes.value;
    const share = shareRes.status === 'fulfilled' ? shareRes.value : null;
    const p = d.pipelines || {};

    const banner = $('diagOverallBanner');
    banner.className = `ops-banner is-${d.overallStatus || 'degraded'}`;
    $('diagOverallText').textContent =
      d.overallStatus === 'healthy'
        ? '✅ 전 데이터 파이프라인 정상 — 시각 정합성·불변식·캐시 상태 양호'
        : d.overallStatus === 'degraded'
          ? '⚠️ 일부 파이프라인 지연 또는 직전 회차 보완 동작 중 — 아래 상세 카드를 확인하세요'
          : '🚨 핵심 기상청 파이프라인 수신 지연 — API 키 또는 상류 응답을 확인하세요';
    $('diagCheckedAt').textContent = `점검 시각: ${fmtTime(d.checkedKst || d.checkedAt)}`;

    const ro = p.roadObs || {};
    const rr = p.roadRisk012 || {};
    const rw = p.rwis || {};
    const s13 = p.shortTerm13 || {};
    const wrn = p.warnings || {};
    const br = p.briefing || {};
    const shareSt = share?.body?.status === 'ready' ? 'healthy' : 'degraded';

    const cards = [
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🛣️ 도로기상관측 (1분 실측)</h2>${pillHtml(ro.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('최신 관측슬롯 (tm1)', fmtTime(ro.tm1))}
            ${kvRow('현재 시각 대비 지연', ro.ageMinutes != null ? `${ro.ageMinutes}분` : '—')}
            ${kvRow('고령지사 관할 관측소', ro.branchStationsActive != null ? `${ro.branchStationsActive} / ${ro.branchStationsExpected}개소` : (ro.error || '—'))}
            ${kvRow('14번 노선 전체 수신', ro.totalStations != null ? `${ro.totalStations}개소` : '—')}
            ${kvRow('폴백(Stale) 여부', ro.stale ? '직전 정상본 유지 중' : '실시간 정상')}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>❄️ 012선 도로살얼음 (5분 ZIP)</h2>${pillHtml(rr.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('관할 범위', rr.branchRange || '함양IC(95.0k)~옥포JC(176.0k)')}
            ${kvRow('살얼음(FRG) 기준시각', fmtTime(rr.frgTmKst))}
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
            ${kvRow('살얼음(FR) 기준시각', fmtTime(rw.frTm))}
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
            ${kvRow('단기예보 발표 (shortBase)', fmtTime(s13.shortBase))}
            ${kvRow('초단기 발표 (ultraBase)', fmtTime(s13.ultraBase))}
            ${kvRow('수신 완비 지역', s13.completeRegions != null ? `${s13.completeRegions} / ${s13.expectedRegions}곳` : (s13.error || '—'))}
            ${kvRow('세대 무결성', s13.mixedGeneration ? '⚠ 세대 혼재 감지' : (s13.isFallback ? '직전 검증회차 보존' : '✓ 단일 최신 세대'))}
            ${kvRow('배치 스냅샷 ID', s13.snapshotId || '—')}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🚨 기상특보 · 백엔드 설정</h2>${pillHtml(wrn.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('특보 조회 상태', wrn.confirmed ? '✓ 실시간 확인됨' : (wrn.error || '보조 캐시'))}
            ${kvRow('전국 발효 특보 행수', wrn.nationalActiveCount != null ? `${wrn.nationalActiveCount}건` : '—')}
            ${kvRow('예보/도로/CCTV 키 구성', `${d.runtime?.forecastConfigured ? '예보✓' : '예보✗'} · ${d.runtime?.roadConfigured ? '도로✓' : '도로✗'} · ${d.runtime?.cctvConfigured ? 'CCTV✓' : 'CCTV✗'}`)}
          </div>
        </article>
      `,
      `
        <article class="ops-card">
          <div class="ops-card-head"><h2>🤖 일 2회(08·18시) 브리핑 채널</h2>${pillHtml(share ? shareSt : br.status)}</div>
          <div class="ops-kv-list">
            ${kvRow('현재 적용 회차', share?.body?.edition_id || br.editionId || '—')}
            ${kvRow('/share/status.json 상태', share ? `HTTP ${share.httpStatus} · ${share.body?.status}` : '확인 대기')}
            ${kvRow('PNG 생성 시각', fmtTime(share?.body?.generated_at))}
            ${kvRow('다음 회차 예정', fmtTime(share?.body?.next_edition_at || br.nextEditionAt))}
          </div>
        </article>
      `
    ];

    $('diagCardsGrid').innerHTML = cards.join('');
  } catch (err) {
    $('diagOverallBanner').className = 'ops-banner is-critical';
    $('diagOverallText').textContent = `🚨 진단 조회 오류: ${err?.message || err}`;
  } finally {
    btn.disabled = false;
    forceBtn.disabled = false;
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
