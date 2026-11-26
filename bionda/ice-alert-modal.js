/**
 * 한국도로공사 「기상청 도로살얼음 위험정보 대응방법 변경알림」 ('26.11.21 / 팝업 '26.11.26 반영) 공식 대응 모듈
 * - 감시 대상: 고령지사 관할 구간 (함양IC 95.0k ~ 옥포JC 176.0k · 8개 콘존 / 7개 도로기상관측소)
 * - 주의(2단계) 격상: "도로살얼음 위험정보 주의 격상 알림 / 온도, 노면상태 확인 후 예비살포" + 고정식 기상정보(대기·노면·노면상태) 즉시 병기
 * - 위험(3단계) 격상: "도로살얼음 위험정보 위험 격상 알림 / 예비살포 실시" (선예비살포, 후상황판단회의)
 * - 상향(주의·위험) 구간 점멸 표시용 ID 집합 산출 및 탭 간 확인(Ack) 동기화 지원
 */

export const ICE_ALERT_ACK_KEY = 'weather-watch:ice-alert-ack:v1';
const ACK_TTL_MS = 3 * 3600 * 1000; // 3시간 유지 (등급 해제 시 즉시 초기화, 2->3 추가 격상 시 즉시 재알림)

export function normalizeIceGrade(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : null;
  }
  const s = String(raw).trim();
  return /^[0-3]$/.test(s) ? Number(s) : null;
}

export function formatAlertRefTime(tmInput, nowMs = Date.now()) {
  if (tmInput) {
    const digits = String(tmInput).replace(/\D/g, '');
    if (digits.length >= 12 && String(tmInput).includes('+09:00')) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
    }
    if (/^\d{12}$/.test(String(tmInput).trim())) {
      const d = String(tmInput).trim();
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}`;
    }
    const ms = Date.parse(tmInput);
    if (Number.isFinite(ms)) {
      const k = new Date(ms + 9 * 3600000);
      const p = n => String(n).padStart(2, '0');
      return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
    }
  }
  const k = new Date(nowMs + 9 * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

function summarizeStationWeather(stnIds = [], roadStations = []) {
  const stnMap = new Map((roadStations || []).map(s => [String(s?.stnId || ''), s]));
  const matched = (stnIds || []).map(id => stnMap.get(String(id))).filter(Boolean);
  if (!matched.length) {
    return {
      stationName: '',
      airTemp: null,
      roadTemp: null,
      surfaceState: '확인 필요',
      tempCheckNote: '고정식 기상관측소 온도·노면상태 확인 요망',
      isColdCondition: null
    };
  }
  // 가장 낮은 노면온도 관측소 우선 선택 (보수적 안전 기준)
  const sorted = [...matched].sort((a, b) => (a.roadTemp ?? 99) - (b.roadTemp ?? 99));
  const primary = sorted[0];
  const withAir = matched.find(s => Number.isFinite(s.temp)) || primary;
  const airTemp = Number.isFinite(withAir?.temp) ? withAir.temp : null;
  const roadTemp = Number.isFinite(primary?.roadTemp) ? primary.roadTemp : null;
  const surfaceState = (primary?.surfaceState && primary.surfaceState !== '관측중')
    ? primary.surfaceState
    : '건조';
  const cleanName = String(primary?.name || '').replace(/\(도\)$/, '');

  const isCold = (airTemp !== null && airTemp <= 4.0) || (roadTemp !== null && roadTemp <= 2.0);
  const isWarmAboveThreshold = airTemp !== null && airTemp > 4.0 && roadTemp !== null && roadTemp > 2.0;

  let tempCheckNote = '온도·노면상태 확인 후 예비살포 판단';
  if (isCold) {
    tempCheckNote = '저온 기준 해당(대기≤4°C 또는 노면≤2°C) · 예비살포 적극 검토';
  } else if (isWarmAboveThreshold) {
    tempCheckNote = '대기 4°C·노면 2°C 초과 영상 구간 · 습윤 오탐 여부 현장 확인';
  }

  return {
    stationName: cleanName,
    airTemp,
    roadTemp,
    surfaceState,
    tempCheckNote,
    isColdCondition: isCold
  };
}

/**
 * 감시 구간(고령지사 95.0~176.0k) 도로살얼음 주의(2)·위험(3) 격상 및 점멸 상태 판정 순수 함수
 */
export function evaluateBranchIceEscalations({
  prevLevels = {},
  ackMap = {},
  initialized = false,
  items = [],
  roadStations = [],
  tmKst = '',
  nowMs = Date.now()
} = {}) {
  const nextLevels = { ...prevLevels };
  const nextAckMap = { ...ackMap };
  const activeAlertIds = [];
  const escalatedIds = [];
  const triggeredItems = [];

  // 만료된 Ack 정리
  for (const [k, v] of Object.entries(nextAckMap)) {
    if (!v || !Number.isFinite(v.atMs) || (nowMs - v.atMs) > ACK_TTL_MS) {
      delete nextAckMap[k];
    }
  }

  for (const item of items || []) {
    if (!item?.id || item.inBranch === false) continue;
    const id = String(item.id);
    const currLv = normalizeIceGrade(item.iceLevel);
    if (currLv === null) continue; // 결측 시 이전 등급 유지·오경보 방지

    const prevLv = normalizeIceGrade(prevLevels[id]);
    nextLevels[id] = currLv;

    // 0 또는 1단계로 하강/해제되면 기존 확인(Ack) 기록을 초기화해 향후 재격상 시 즉시 다시 팝업!
    if (currLv <= 1) {
      delete nextAckMap[id];
      continue;
    }

    // 현재 주의(2) 또는 위험(3) 발효 구간 -> 지도·카드 점멸 표시 대상
    activeAlertIds.push(id);

    const jumpedUp = initialized && prevLv !== null && currLv > prevLv && currLv >= 2;
    const unackedActive = (nextAckMap[id]?.level || 0) < currLv;

    if (jumpedUp) {
      escalatedIds.push(id);
    }

    if (jumpedUp || (!initialized && unackedActive) || (initialized && prevLv === null && unackedActive)) {
      if (!escalatedIds.includes(id)) escalatedIds.push(id);
      const weather = summarizeStationWeather(item.stnIds || [], roadStations);
      triggeredItems.push({
        id,
        label: item.label || id,
        kmLabel: item.kmLabel || '',
        fromLevel: prevLv,
        toLevel: currLv,
        toLabel: currLv === 3 ? '위험' : '주의',
        ...weather
      });
    }
  }

  triggeredItems.sort((a, b) => (b.toLevel - a.toLevel) || ((a.roadTemp ?? 99) - (b.roadTemp ?? 99)));
  const popupLevel = triggeredItems.length
    ? Math.max(...triggeredItems.map(t => t.toLevel))
    : 0;

  return {
    initialized: true,
    nextLevels,
    nextAckMap,
    activeAlertIds,
    escalatedIds,
    shouldPopup: triggeredItems.length > 0,
    popupLevel,
    refTimeText: formatAlertRefTime(tmKst, nowMs),
    headline: popupLevel === 3
      ? '도로살얼음 위험정보 위험 격상 알림'
      : popupLevel === 2
        ? '도로살얼음 위험정보 주의 격상 알림'
        : '',
    directive: popupLevel === 3
      ? '예비살포 실시'
      : popupLevel === 2
        ? '온도, 노면상태 확인 후 예비살포'
        : '',
    subDirective: popupLevel === 3
      ? '선(先)예비살포, 후(後)상황판단회의 (제설작업 지속 여부 판단)'
      : popupLevel === 2
        ? '고정식 기상정보(대기온도, 노면온도, 노면상태) 확인 후 예비살포 실시'
        : '',
    triggeredItems
  };
}

function readAckStorage() {
  try {
    return JSON.parse(localStorage.getItem(ICE_ALERT_ACK_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAckStorage(map) {
  try {
    localStorage.setItem(ICE_ALERT_ACK_KEY, JSON.stringify(map || {}));
  } catch {}
}

function injectModalStylesOnce() {
  if (typeof document === 'undefined' || document.getElementById('bionda-ice-alert-style')) return;
  const style = document.createElement('style');
  style.id = 'bionda-ice-alert-style';
  style.textContent = `
    @keyframes biondaIceBlink {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 8px rgba(251, 146, 60, 0.72)); }
      50% { opacity: 0.42; filter: drop-shadow(0 0 2px rgba(251, 146, 60, 0.2)); }
    }
    @keyframes biondaIceDangerBlink {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 11px rgba(244, 63, 94, 0.88)); }
      50% { opacity: 0.36; filter: drop-shadow(0 0 2px rgba(244, 63, 94, 0.25)); }
    }
    @keyframes biondaIceCardPulse {
      0%, 100% { box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.88), 0 0 18px rgba(251, 146, 60, 0.34); }
      50% { box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.28), 0 0 4px rgba(251, 146, 60, 0.08); }
    }
    @keyframes biondaIceCardDangerPulse {
      0%, 100% { box-shadow: 0 0 0 2.5px rgba(244, 63, 94, 0.95), 0 0 22px rgba(244, 63, 94, 0.46); }
      50% { box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.3), 0 0 5px rgba(244, 63, 94, 0.1); }
    }
    .rwis-zone-blink-caution { animation: biondaIceBlink 1.15s ease-in-out infinite; }
    .rwis-zone-blink-danger { animation: biondaIceDangerBlink 0.9s ease-in-out infinite; }
    .is-ice-alert-caution { animation: biondaIceCardPulse 1.35s ease-in-out infinite !important; border-color: #fb923c !important; }
    .is-ice-alert-danger { animation: biondaIceCardDangerPulse 1.0s ease-in-out infinite !important; border-color: #f43f5e !important; }

    .kec-ice-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10500;
      background: rgba(3, 10, 22, 0.72);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .kec-ice-backdrop[hidden] { display: none !important; }
    .kec-ice-modal {
      width: min(560px, 95vw);
      background: #ffffff;
      color: #1e293b;
      border-radius: 12px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 2px rgba(255, 255, 255, 0.14);
      overflow: hidden;
      font-family: 'Pretendard', 'Noto Sans KR', system-ui, sans-serif;
    }
    .kec-ice-modal.is-level-3 { box-shadow: 0 24px 60px rgba(0, 0, 0, 0.62), 0 0 0 3px #f43f5e; }
    .kec-ice-modal.is-level-2 { box-shadow: 0 24px 60px rgba(0, 0, 0, 0.58), 0 0 0 3px #f97316; }
    .kec-ice-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 18px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .kec-ice-head strong {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
    }
    .kec-ice-close {
      background: transparent;
      border: 0;
      font-size: 20px;
      line-height: 1;
      color: #64748b;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .kec-ice-close:hover { background: #e2e8f0; color: #0f172a; }
    .kec-ice-body { padding: 16px 20px 14px; }
    .kec-ice-reftime {
      font-size: 13.5px;
      font-weight: 650;
      color: #475569;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .kec-ice-banner {
      border-radius: 8px;
      padding: 15px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }
    .kec-ice-modal.is-level-2 .kec-ice-banner {
      background: #fff7ed;
      border: 1.5px solid #fdba74;
    }
    .kec-ice-modal.is-level-3 .kec-ice-banner {
      background: #fff1f2;
      border: 1.5px solid #fda4af;
    }
    .kec-ice-arrow {
      font-size: 24px;
      font-weight: 900;
      line-height: 1.1;
      flex-shrink: 0;
    }
    .kec-ice-modal.is-level-2 .kec-ice-arrow,
    .kec-ice-modal.is-level-2 .kec-ice-banner-txt strong,
    .kec-ice-modal.is-level-2 .kec-ice-banner-txt em {
      color: #ea580c;
    }
    .kec-ice-modal.is-level-3 .kec-ice-arrow,
    .kec-ice-modal.is-level-3 .kec-ice-banner-txt strong,
    .kec-ice-modal.is-level-3 .kec-ice-banner-txt em {
      color: #e11d48;
    }
    .kec-ice-banner-txt { display: flex; flex-direction: column; gap: 5px; }
    .kec-ice-banner-txt strong { font-size: 18px; font-weight: 850; letter-spacing: -0.3px; }
    .kec-ice-banner-txt em { font-style: normal; font-size: 16.5px; font-weight: 800; }
    .kec-ice-banner-txt small { font-size: 12.5px; font-weight: 600; color: #475569; margin-top: 2px; }

    .kec-ice-stn-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 11px 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 210px;
      overflow-y: auto;
    }
    .kec-ice-stn-head {
      font-size: 12.5px;
      font-weight: 800;
      color: #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kec-ice-stn-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kec-ice-stn-row1 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 800;
      color: #0f172a;
    }
    .kec-ice-lv-pill {
      font-size: 12px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .kec-ice-lv-pill.lv-2 { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
    .kec-ice-lv-pill.lv-3 { background: #ffe4e6; color: #be123c; border: 1px solid #fda4af; }
    .kec-ice-stn-metrics {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }
    .kec-ice-stn-note {
      font-size: 12px;
      font-weight: 650;
      color: #64748b;
    }
    .kec-ice-stn-note.is-cold { color: #b91c1c; font-weight: 750; }
    .kec-ice-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 20px 15px;
      gap: 12px;
    }
    .kec-ice-scope-note {
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
    }
    .kec-ice-confirm {
      background: #1d6ce0;
      color: #ffffff;
      border: 0;
      border-radius: 6px;
      padding: 8px 24px;
      font-size: 14.5px;
      font-weight: 800;
      cursor: pointer;
    }
    .kec-ice-confirm:hover { background: #1557b8; }
  `;
  document.head.appendChild(style);
}

function playIceEscalationChime(level = 2) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const notes = level >= 3
      ? [587.33, 783.99, 987.77, 1174.66]
      : [523.25, 659.25, 880.0];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = level >= 3 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.13);
      gain.gain.setValueAtTime(0.001, now + idx * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.13 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.13 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.13);
      osc.stop(now + idx * 0.13 + 0.31);
    });
  } catch {}
}

export function mountIceAlertModal({ soundEnabled = () => true, onAcknowledge = null } = {}) {
  if (typeof document === 'undefined') {
    return { update: () => ({ activeAlertIds: [], escalatedIds: [] }), close: () => {} };
  }
  injectModalStylesOnce();

  let prevLevels = {};
  let initialized = false;
  let activeEvaluation = null;

  let backdrop = document.getElementById('kecIceAlertBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'kecIceAlertBackdrop';
    backdrop.className = 'kec-ice-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="kec-ice-modal is-level-2" role="alertdialog" aria-modal="true" aria-labelledby="kecIceAlertHeadline">
        <div class="kec-ice-head">
          <strong>[알림]</strong>
          <button type="button" class="kec-ice-close" id="kecIceCloseBtn" aria-label="알림 닫기">✕</button>
        </div>
        <div class="kec-ice-body">
          <div class="kec-ice-reftime">🕒 기준시간 : <span id="kecIceRefTime">—</span></div>
          <div class="kec-ice-banner">
            <span class="kec-ice-arrow" aria-hidden="true">⬆</span>
            <div class="kec-ice-banner-txt">
              <strong id="kecIceAlertHeadline">도로살얼음 위험정보 주의 격상 알림</strong>
              <em id="kecIceAlertDirective">온도, 노면상태 확인 후 예비살포</em>
              <small id="kecIceAlertSub"></small>
            </div>
          </div>
          <div class="kec-ice-stn-box">
            <div class="kec-ice-stn-head">
              <span>📍 고령지사 감시구간 고정식 기상정보 확인 (95.0~176.0k)</span>
              <span id="kecIceCountBadge">1구간</span>
            </div>
            <div id="kecIceStnList"></div>
          </div>
        </div>
        <div class="kec-ice-foot">
          <span class="kec-ice-scope-note">* 기상청 API허브(5분 주기) · 고령지사 관할 구간 알림</span>
          <button type="button" class="kec-ice-confirm" id="kecIceConfirmBtn">확인</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  const modalEl = backdrop.querySelector('.kec-ice-modal');
  const acknowledgeAndClose = () => {
    if (activeEvaluation?.triggeredItems?.length) {
      const ack = readAckStorage();
      const nowMs = Date.now();
      for (const t of activeEvaluation.triggeredItems) {
        ack[t.id] = { level: t.toLevel, atMs: nowMs };
      }
      writeAckStorage(ack);
    }
    backdrop.hidden = true;
    onAcknowledge?.();
  };

  backdrop.querySelector('#kecIceCloseBtn')?.addEventListener('click', acknowledgeAndClose);
  backdrop.querySelector('#kecIceConfirmBtn')?.addEventListener('click', acknowledgeAndClose);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) acknowledgeAndClose();
  });
  document.addEventListener('keydown', e => {
    if (!backdrop.hidden && e.key === 'Escape') acknowledgeAndClose();
  });

  // 타 탭에서 [확인]을 눌렀으면 동시에 팝업 닫기
  window.addEventListener('storage', e => {
    if (e.key === ICE_ALERT_ACK_KEY && !backdrop.hidden && activeEvaluation?.triggeredItems?.length) {
      const ack = readAckStorage();
      const allAcked = activeEvaluation.triggeredItems.every(t => (ack[t.id]?.level || 0) >= t.toLevel);
      if (allAcked) backdrop.hidden = true;
    }
  });

  function renderPopup(ev, { silent = false } = {}) {
    activeEvaluation = ev;
    modalEl.classList.toggle('is-level-3', ev.popupLevel >= 3);
    modalEl.classList.toggle('is-level-2', ev.popupLevel === 2);
    backdrop.querySelector('#kecIceRefTime').textContent = ev.refTimeText;
    backdrop.querySelector('#kecIceAlertHeadline').textContent = ev.headline;
    backdrop.querySelector('#kecIceAlertDirective').textContent = ev.directive;
    backdrop.querySelector('#kecIceAlertSub').textContent = ev.subDirective;
    backdrop.querySelector('#kecIceCountBadge').textContent = `${ev.triggeredItems.length}구간`;

    const listEl = backdrop.querySelector('#kecIceStnList');
    listEl.replaceChildren(
      ...ev.triggeredItems.map(item => {
        const box = document.createElement('div');
        box.className = 'kec-ice-stn-item';

        const r1 = document.createElement('div');
        r1.className = 'kec-ice-stn-row1';
        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${item.label}${item.kmLabel ? ` (${item.kmLabel})` : ''}`;
        const pill = document.createElement('span');
        pill.className = `kec-ice-lv-pill lv-${item.toLevel}`;
        const fromPart = item.fromLevel !== null ? `${item.fromLevel}→` : '';
        pill.textContent = `⬆ ${fromPart}${item.toLevel}단계 (${item.toLabel})`;
        r1.append(titleSpan, pill);

        const r2 = document.createElement('div');
        r2.className = 'kec-ice-stn-metrics';
        const taTxt = item.airTemp !== null ? `${item.airTemp.toFixed(1)}°C` : '미측정(교량)';
        const trTxt = item.roadTemp !== null ? `${item.roadTemp.toFixed(1)}°C` : '확인중';
        const stnPrefix = item.stationName ? `[${item.stationName}] ` : '';
        r2.textContent = `${stnPrefix}대기온도 ${taTxt} · 노면온도 ${trTxt} · 노면상태 ${item.surfaceState}`;

        const r3 = document.createElement('div');
        r3.className = 'kec-ice-stn-note' + (item.isColdCondition ? ' is-cold' : '');
        r3.textContent = item.toLevel >= 3
          ? '🚨 위험단계 — 즉시 예비살포 실시 후 상황판단회의 진행'
          : item.tempCheckNote;

        box.append(r1, r2, r3);
        return box;
      })
    );

    backdrop.hidden = false;
    if (!silent) {
      backdrop.querySelector('#kecIceConfirmBtn')?.focus({ preventScroll: true });
      if (soundEnabled()) playIceEscalationChime(ev.popupLevel);
    }
  }

  return {
    update({ items = [], roadStations = [], tmKst = '' } = {}) {
      const ackMap = readAckStorage();
      const ev = evaluateBranchIceEscalations({
        prevLevels,
        ackMap,
        initialized,
        items,
        roadStations,
        tmKst
      });
      prevLevels = ev.nextLevels;
      initialized = ev.initialized;
      writeAckStorage(ev.nextAckMap);
      if (ev.shouldPopup) {
        renderPopup(ev, { silent: false });
      } else if (!backdrop.hidden && activeEvaluation?.triggeredItems?.length && roadStations?.length) {
        const itemById = new Map(items.map(it => [String(it?.id || ''), it]));
        const needsHydration = activeEvaluation.triggeredItems.some(t => t.roadTemp === null);
        if (needsHydration) {
          const refreshed = activeEvaluation.triggeredItems.map(t => {
            const src = itemById.get(String(t.id));
            return src ? { ...t, ...summarizeStationWeather(src.stnIds || [], roadStations) } : t;
          });
          renderPopup({ ...activeEvaluation, triggeredItems: refreshed }, { silent: true });
        }
      }
      return ev;
    },
    showPreview(ev) {
      if (ev && ev.popupLevel >= 2) renderPopup(ev);
    },
    close: acknowledgeAndClose
  };
}
