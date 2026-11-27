/**
 * 한국도로공사 「기상청 도로살얼음 위험정보 대응방법 변경알림」 ('26.11.21 / 팝업 '26.11.26 반영) 공식 대응 모듈
 * - 감시 대상: 고령지사 관할 구간 (함양IC 95.0k ~ 옥포JC 176.0k · 8개 콘존 / 7개 도로기상관측소)
 * - 50인치 상황실 TV 무조작 환경 최적화:
 *   1) 1분(60초) 팝업 자동 닫힘 + 확인 버튼 실시간 카운트다운 (확인 (60초) → 59초 → ... → 0초 자동 닫힘)
 *   2) 고령지사 8개 전 구간(함양IC~옥포JC) 한눈에 보기 상단 노선 현황 바 (무스크롤)
 *   3) 4칸(4열) 그리드 분할 + 동일 격상 시각(예: 10:35 동시 격상) 자동 그룹 묶음 및 격상 시각 명시
 */

export const ICE_ALERT_ACK_KEY = 'weather-watch:ice-alert-ack:v1';
export const ICE_ALERT_STATE_KEY = 'weather-watch:ice-alert-state:v1';
export const POPUP_AUTO_CLOSE_SEC = 60; // 1분(60초) 카운트다운 후 자동 닫힘

const ACK_TTL_MS = 3 * 3600 * 1000;   // 3시간 유지 (등급 해제 시 즉시 초기화, 2->3 추가 격상 시 즉시 재알림)
const STATE_TTL_MS = 6 * 3600 * 1000; // 격상 시각 이력 6시간 유지 (등급 해제 시 즉시 초기화)
const GRADE_LABELS = ['안전', '관심', '주의', '위험'];

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
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(String(tmInput).trim())) {
      return String(tmInput).trim();
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

export function extractHmFromRefTime(refTimeText) {
  const s = String(refTimeText || '').trim();
  const m = s.match(/(\d{2}:\d{2})$/);
  return m ? m[1] : s;
}

export function formatConfirmCountdownText(remainSec) {
  const safe = Math.max(0, Math.ceil(Number(remainSec) || 0));
  return `확인 (${safe}초)`;
}

function compactCorridorLabel(label = '') {
  return String(label || '')
    .replace(/\s*↔\s*/g, '↔')
    .replace(/\s*–\s*/g, '↔')
    .replace(/분기점/g, 'JC')
    .trim();
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
      shortNote: '관측소 온도·노면상태 확인 요망',
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
  let shortNote = '온도·노면 확인 후 예비살포 판단';
  if (isCold) {
    tempCheckNote = '저온 기준 해당(대기≤4°C 또는 노면≤2°C) · 예비살포 적극 검토';
    shortNote = '저온 구간(대기≤4°·노면≤2°) · 예비살포 검토';
  } else if (isWarmAboveThreshold) {
    tempCheckNote = '대기 4°C·노면 2°C 초과 영상 구간 · 습윤 오탐 여부 현장 확인';
    shortNote = '영상 구간(대기>4°·노면>2°) · 습윤 오탐 확인';
  }

  return {
    stationName: cleanName,
    airTemp,
    roadTemp,
    surfaceState,
    tempCheckNote,
    shortNote,
    isColdCondition: isCold
  };
}

/**
 * 발효 중인 주의·위험 구간들을 격상 시각(escalatedAt) 기준으로 묶고 4칸(4열) TV 그리드 스팬을 산출하는 순수 함수
 */
export function groupEscalatedItemsByTime(items = [], fallbackRefTime = '') {
  const byTime = new Map();
  (items || []).forEach((raw, idx) => {
    const escalatedAt = String(raw.escalatedAt || fallbackRefTime || '').trim() || '시각 확인중';
    if (!byTime.has(escalatedAt)) {
      byTime.set(escalatedAt, []);
    }
    byTime.get(escalatedAt).push({
      ...raw,
      escalatedAt,
      escalatedHm: raw.escalatedHm || extractHmFromRefTime(escalatedAt),
      sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : idx
    });
  });

  const groups = [];
  for (const [escalatedAt, list] of byTime.entries()) {
    // 같은 격상 시각 그룹 내부는 위험(3단계) 우선 -> 서(함양IC 95k)~동(옥포JC 176k) 노선 순 정렬
    list.sort((a, b) => (b.toLevel - a.toLevel) || (a.sortOrder - b.sortOrder));
    const hasNew = list.some(it => it.isNewlyTriggered !== false);
    const maxLevel = list.reduce((m, it) => Math.max(m, it.toLevel || 2), 2);
    groups.push({
      escalatedAt,
      escalatedHm: extractHmFromRefTime(escalatedAt),
      hasNew,
      maxLevel,
      count: list.length,
      items: list,
      spanCols: 4,
      innerCols: 4
    });
  }

  // 신규 격상 그룹 최우선 -> 최신 격상 시각 순 정렬
  groups.sort((a, b) => {
    if (a.hasNew !== b.hasNew) return a.hasNew ? -1 : 1;
    if (b.maxLevel !== a.maxLevel) return b.maxLevel - a.maxLevel;
    return b.escalatedAt.localeCompare(a.escalatedAt);
  });

  // 4칸(4열) 그리드 스팬 배분:
  // - 단일 시간 그룹이면 4칸 전체 폭을 쓰되 내부를 4칸(repeat(4, 1fr))으로 분할 (4개=1줄, 8개=2줄 무스크롤!)
  // - 복수 시간 그룹이면 그룹별 구간 수(1~4칸)만큼 나란히 배치 (예: 10:35 신규 2구간[2칸] + 10:20 유지 2구간[2칸] = 1줄 4칸!)
  if (groups.length === 1) {
    groups[0].spanCols = 4;
    groups[0].innerCols = 4;
  } else {
    for (const g of groups) {
      const cols = Math.min(4, Math.max(1, g.items.length));
      g.spanCols = cols;
      g.innerCols = cols;
    }
  }

  return groups;
}

/**
 * 감시 구간(고령지사 95.0~176.0k) 도로살얼음 주의(2)·위험(3) 격상 및 점멸·시간그룹 판정 순수 함수
 */
export function evaluateBranchIceEscalations({
  prevLevels = {},
  ackMap = {},
  stateMap = {},
  initialized = false,
  items = [],
  roadStations = [],
  tmKst = '',
  nowMs = Date.now()
} = {}) {
  const nextLevels = { ...prevLevels };
  const nextAckMap = { ...ackMap };
  const nextStateMap = { ...stateMap };
  const activeAlertIds = [];
  const escalatedIds = [];
  const triggeredItems = [];
  const activeItems = [];
  const corridorOverview = [];

  const refTimeText = formatAlertRefTime(tmKst, nowMs);

  // 만료된 Ack 및 격상 시각 이력 정리
  for (const [k, v] of Object.entries(nextAckMap)) {
    if (!v || !Number.isFinite(v.atMs) || (nowMs - v.atMs) > ACK_TTL_MS) {
      delete nextAckMap[k];
    }
  }
  for (const [k, v] of Object.entries(nextStateMap)) {
    if (!v || !Number.isFinite(v.updatedAtMs) || (nowMs - v.updatedAtMs) > STATE_TTL_MS) {
      delete nextStateMap[k];
    }
  }

  const branchList = (items || []).filter(it => it?.id && it.inBranch !== false);

  branchList.forEach((item, idx) => {
    const id = String(item.id);
    const sortOrder = Number.isFinite(item.sortOrder) ? item.sortOrder : idx;
    const currLv = normalizeIceGrade(item.iceLevel);
    const prevLv = normalizeIceGrade(prevLevels[id]);

    if (currLv === null) {
      corridorOverview.push({
        id,
        sortOrder,
        label: item.label || id,
        shortLabel: item.shortLabel || compactCorridorLabel(item.label || id),
        kmLabel: item.kmLabel || '',
        level: null,
        levelName: '정보없음',
        escalatedAt: nextStateMap[id]?.escalatedAt || '',
        escalatedHm: extractHmFromRefTime(nextStateMap[id]?.escalatedAt || ''),
        isNew: false
      });
      return; // 결측 시 이전 등급 유지·오경보 방지
    }

    nextLevels[id] = currLv;

    // 0 또는 1단계로 하강/해제되면 기존 확인(Ack) 및 격상 시각 기록을 즉시 초기화해 재격상 시 새 시각으로 알림!
    if (currLv <= 1) {
      delete nextAckMap[id];
      delete nextStateMap[id];
      corridorOverview.push({
        id,
        sortOrder,
        label: item.label || id,
        shortLabel: item.shortLabel || compactCorridorLabel(item.label || id),
        kmLabel: item.kmLabel || '',
        level: currLv,
        levelName: GRADE_LABELS[currLv] || '안전',
        escalatedAt: '',
        escalatedHm: '',
        isNew: false
      });
      return;
    }

    // 현재 주의(2) 또는 위험(3) 발효 구간 -> 지도·카드 점멸 표시 대상
    activeAlertIds.push(id);

    const saved = nextStateMap[id];
    if (!saved || !Number.isFinite(saved.level) || currLv > saved.level) {
      const inferredFrom = prevLv !== null && prevLv < currLv
        ? prevLv
        : (saved && Number.isFinite(saved.level) && saved.level < currLv ? saved.level : prevLv);
      nextStateMap[id] = {
        level: currLv,
        fromLevel: inferredFrom ?? null,
        escalatedAt: item.escalatedAt || refTimeText,
        updatedAtMs: nowMs
      };
    } else if (currLv === saved.level) {
      nextStateMap[id] = {
        ...saved,
        level: currLv,
        updatedAtMs: nowMs
      };
    } else {
      nextStateMap[id] = {
        level: currLv,
        fromLevel: saved.level,
        escalatedAt: item.escalatedAt || refTimeText,
        updatedAtMs: nowMs
      };
    }

    const activeMeta = nextStateMap[id];
    const jumpedUp = initialized && prevLv !== null && currLv > prevLv && currLv >= 2;
    const unackedActive = (nextAckMap[id]?.level || 0) < currLv;
    const isTriggered = Boolean(
      jumpedUp || (!initialized && unackedActive) || (initialized && prevLv === null && unackedActive)
    );

    if (jumpedUp) {
      escalatedIds.push(id);
    }
    if (isTriggered && !escalatedIds.includes(id)) {
      escalatedIds.push(id);
    }

    const weather = summarizeStationWeather(item.stnIds || [], roadStations);
    const enrichedItem = {
      id,
      sortOrder,
      label: item.label || id,
      shortLabel: item.shortLabel || compactCorridorLabel(item.label || id),
      kmLabel: item.kmLabel || '',
      fromLevel: activeMeta.fromLevel,
      toLevel: currLv,
      toLabel: currLv === 3 ? '위험' : '주의',
      escalatedAt: activeMeta.escalatedAt,
      escalatedHm: extractHmFromRefTime(activeMeta.escalatedAt),
      isNewlyTriggered: isTriggered,
      ...weather
    };

    activeItems.push(enrichedItem);
    if (isTriggered) {
      triggeredItems.push(enrichedItem);
    }

    corridorOverview.push({
      id,
      sortOrder,
      label: item.label || id,
      shortLabel: item.shortLabel || compactCorridorLabel(item.label || id),
      kmLabel: item.kmLabel || '',
      level: currLv,
      levelName: GRADE_LABELS[currLv],
      escalatedAt: activeMeta.escalatedAt,
      escalatedHm: extractHmFromRefTime(activeMeta.escalatedAt),
      isNew: isTriggered
    });
  });

  corridorOverview.sort((a, b) => a.sortOrder - b.sortOrder);
  triggeredItems.sort((a, b) => (b.toLevel - a.toLevel) || ((a.roadTemp ?? 99) - (b.roadTemp ?? 99)));
  activeItems.sort((a, b) => (b.toLevel - a.toLevel) || (a.sortOrder - b.sortOrder));

  const shouldPopup = triggeredItems.length > 0;
  const displayItems = shouldPopup ? activeItems : [];
  const escalationGroups = shouldPopup ? groupEscalatedItemsByTime(displayItems, refTimeText) : [];
  const popupLevel = shouldPopup
    ? Math.max(...displayItems.map(t => t.toLevel))
    : 0;

  return {
    initialized: true,
    nextLevels,
    nextAckMap,
    nextStateMap,
    activeAlertIds,
    escalatedIds,
    shouldPopup,
    popupLevel,
    refTimeText,
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
    triggeredItems,
    activeItems,
    escalationGroups,
    corridorOverview
  };
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function writeJsonStorage(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(map || {}));
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
      background: rgba(3, 10, 22, 0.76);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 18px;
    }
    .kec-ice-backdrop[hidden] { display: none !important; }
    .kec-ice-modal {
      width: min(1240px, 96vw);
      max-height: 95vh;
      background: #ffffff;
      color: #0f172a;
      border-radius: 14px;
      box-shadow: 0 28px 72px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(255, 255, 255, 0.16);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-family: 'Pretendard', 'Noto Sans KR', system-ui, sans-serif;
    }
    .kec-ice-modal.is-level-3 { box-shadow: 0 28px 72px rgba(0, 0, 0, 0.68), 0 0 0 3.5px #e11d48; }
    .kec-ice-modal.is-level-2 { box-shadow: 0 28px 72px rgba(0, 0, 0, 0.62), 0 0 0 3.5px #f97316; }

    .kec-ice-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 20px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-shrink: 0;
    }
    .kec-ice-head-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .kec-ice-head strong {
      font-size: 16.5px;
      font-weight: 850;
      color: #0f172a;
      letter-spacing: -0.2px;
    }
    .kec-ice-reftime-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 999px;
      background: #eef2f6;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
      font-variant-numeric: tabular-nums;
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

    .kec-ice-body {
      padding: 14px 20px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }

    .kec-ice-banner {
      border-radius: 10px;
      padding: 13px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }
    .kec-ice-modal.is-level-2 .kec-ice-banner {
      background: linear-gradient(90deg, #fff7ed 0%, #ffedd5 100%);
      border: 1.5px solid #fdba74;
    }
    .kec-ice-modal.is-level-3 .kec-ice-banner {
      background: linear-gradient(90deg, #fff1f2 0%, #ffe4e6 100%);
      border: 1.5px solid #fda4af;
    }
    .kec-ice-banner-main {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .kec-ice-arrow {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 23px;
      font-weight: 900;
      flex-shrink: 0;
    }
    .kec-ice-modal.is-level-2 .kec-ice-arrow {
      background: #ea580c;
      color: #ffffff;
    }
    .kec-ice-modal.is-level-3 .kec-ice-arrow {
      background: #e11d48;
      color: #ffffff;
    }
    .kec-ice-modal.is-level-2 .kec-ice-banner-txt strong,
    .kec-ice-modal.is-level-2 .kec-ice-banner-txt em {
      color: #c2410c;
    }
    .kec-ice-modal.is-level-3 .kec-ice-arrow-txt strong,
    .kec-ice-modal.is-level-3 .kec-ice-banner-txt strong,
    .kec-ice-modal.is-level-3 .kec-ice-banner-txt em {
      color: #be123c;
    }
    .kec-ice-banner-txt {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .kec-ice-banner-txt strong {
      font-size: 19px;
      font-weight: 900;
      letter-spacing: -0.35px;
      line-height: 1.2;
    }
    .kec-ice-banner-txt em {
      font-style: normal;
      font-size: 16.5px;
      font-weight: 850;
      line-height: 1.25;
    }
    .kec-ice-banner-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }
    .kec-ice-sub-pill {
      font-size: 12.5px;
      font-weight: 750;
      color: #334155;
      background: rgba(255, 255, 255, 0.86);
      border: 1px solid rgba(148, 163, 184, 0.45);
      padding: 4px 11px;
      border-radius: 999px;
    }
    .kec-ice-summary-stat {
      font-size: 12.5px;
      font-weight: 800;
      color: #475569;
    }

    /* 8개 전 구간(함양IC~옥포JC) 한눈에 보기 상단 노선 바 */
    .kec-ice-corridor-strip {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 9px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .kec-ice-corridor-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12.5px;
      font-weight: 800;
      color: #334155;
    }
    .kec-ice-corridor-legend {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 11.5px;
      font-weight: 750;
      color: #475569;
    }
    .kec-ice-corridor-legend i {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 2px;
      margin-right: 3px;
      vertical-align: -1px;
    }
    .kec-ice-corridor-cells {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 6px;
    }
    .kec-cor-cell {
      border-radius: 7px;
      padding: 6px 7px 5px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-top-width: 3.5px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .kec-cor-cell.lv-0 { border-top-color: #0ea5e9; background: #f8fafc; }
    .kec-cor-cell.lv-1 { border-top-color: #eab308; background: #fefce8; border-color: #fde047; }
    .kec-cor-cell.lv-2 { border-top-color: #f97316; background: #fff7ed; border-color: #fb923c; }
    .kec-cor-cell.lv-3 { border-top-color: #e11d48; background: #fff1f2; border-color: #fb7185; }
    .kec-cor-cell.lv-null { border-top-color: #94a3b8; background: #f1f5f9; }
    .kec-cor-cell.is-new.lv-2 { box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.35); }
    .kec-cor-cell.is-new.lv-3 { box-shadow: 0 0 0 2px rgba(225, 29, 72, 0.42); }
    .kec-cor-name {
      font-size: 11.5px;
      font-weight: 800;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.3px;
    }
    .kec-cor-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 3px;
      font-size: 11px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .kec-cor-cell.lv-0 .kec-cor-meta { color: #0369a1; }
    .kec-cor-cell.lv-1 .kec-cor-meta { color: #a16207; }
    .kec-cor-cell.lv-2 .kec-cor-meta { color: #c2410c; }
    .kec-cor-cell.lv-3 .kec-cor-meta { color: #be123c; }
    .kec-cor-cell.lv-null .kec-cor-meta { color: #64748b; }

    /* 4칸(4열) 시간그룹 묶음 그리드 — TV 무스크롤 한눈에 보기 */
    .kec-ice-groups-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-auto-flow: dense;
      gap: 10px;
      align-items: stretch;
    }
    .kec-ice-time-group {
      border-radius: 10px;
      padding: 9px 10px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #f8fafc;
      border: 1.5px solid #cbd5e1;
      min-width: 0;
    }
    .kec-ice-time-group.is-new-group.lv-2 {
      background: #fffaf5;
      border-color: #fb923c;
    }
    .kec-ice-time-group.is-new-group.lv-3 {
      background: #fff5f6;
      border-color: #fb7185;
    }
    .kec-ice-time-group.span-1 { grid-column: span 1; }
    .kec-ice-time-group.span-2 { grid-column: span 2; }
    .kec-ice-time-group.span-3 { grid-column: span 3; }
    .kec-ice-time-group.span-4 { grid-column: span 4; }

    .kec-ice-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
      padding-bottom: 5px;
      border-bottom: 1px dashed #cbd5e1;
    }
    .kec-ice-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      font-weight: 850;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.2px;
    }
    .kec-ice-time-group.is-new-group.lv-2 .kec-ice-time-badge { color: #9a3412; }
    .kec-ice-time-group.is-new-group.lv-3 .kec-ice-time-badge { color: #9f1239; }
    .kec-ice-group-tag {
      font-size: 11.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #334155;
      white-space: nowrap;
    }
    .kec-ice-time-group.is-new-group.lv-2 .kec-ice-group-tag {
      background: #ffedd5;
      color: #c2410c;
      border: 1px solid #fdba74;
    }
    .kec-ice-time-group.is-new-group.lv-3 .kec-ice-group-tag {
      background: #ffe4e6;
      color: #be123c;
      border: 1px solid #fda4af;
    }

    .kec-ice-group-cards {
      display: grid;
      gap: 8px;
      flex: 1;
    }
    .kec-ice-group-cards.cols-1 { grid-template-columns: minmax(0, 1fr); }
    .kec-ice-group-cards.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kec-ice-group-cards.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .kec-ice-group-cards.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

    .kec-ice-stn-item {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-left-width: 4px;
      border-radius: 8px;
      padding: 9px 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    .kec-ice-stn-item.lv-2 { border-left-color: #f97316; }
    .kec-ice-stn-item.lv-3 { border-left-color: #e11d48; background: #fffafb; }

    .kec-ice-stn-row1 {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
    }
    .kec-ice-stn-title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .kec-ice-stn-title {
      font-size: 14px;
      font-weight: 850;
      color: #0f172a;
      letter-spacing: -0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kec-ice-stn-submeta {
      font-size: 11.5px;
      font-weight: 700;
      color: #64748b;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kec-ice-lv-pill {
      font-size: 11.5px;
      font-weight: 850;
      padding: 2px 7px;
      border-radius: 999px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .kec-ice-lv-pill.lv-2 { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
    .kec-ice-lv-pill.lv-3 { background: #ffe4e6; color: #be123c; border: 1px solid #fda4af; }

    .kec-ice-chip-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 4px;
      align-items: center;
    }
    .kec-ice-chip {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 12px;
      font-weight: 800;
      color: #1e293b;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      text-align: center;
    }
    .kec-ice-chip small {
      font-size: 10.5px;
      font-weight: 700;
      color: #64748b;
      margin-right: 3px;
    }
    .kec-ice-chip.is-cold {
      background: #fff1f2;
      border-color: #fda4af;
      color: #be123c;
    }
    .kec-ice-chip.is-wet {
      background: #e0f2fe;
      border-color: #7dd3fc;
      color: #0369a1;
    }

    .kec-ice-stn-note {
      font-size: 11.5px;
      font-weight: 700;
      color: #475569;
      line-height: 1.3;
      letter-spacing: -0.2px;
    }
    .kec-ice-stn-note.is-cold { color: #b91c1c; font-weight: 800; }

    .kec-ice-foot-wrap {
      flex-shrink: 0;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .kec-ice-timer-track {
      width: 100%;
      height: 3.5px;
      background: #e2e8f0;
      overflow: hidden;
    }
    .kec-ice-timer-fill {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #f97316, #2563eb);
      transition: width 0.25s linear;
    }
    .kec-ice-modal.is-level-3 .kec-ice-timer-fill {
      background: linear-gradient(90deg, #e11d48, #f97316);
    }
    .kec-ice-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px 12px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .kec-ice-scope-note {
      font-size: 12.5px;
      color: #475569;
      font-weight: 650;
    }
    .kec-ice-confirm {
      background: #1d6ce0;
      color: #ffffff;
      border: 0;
      border-radius: 8px;
      padding: 9px 22px;
      min-width: 136px;
      font-size: 14.5px;
      font-weight: 850;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(29, 108, 224, 0.28);
    }
    .kec-ice-confirm:hover { background: #1557b8; }

    @media (max-width: 1120px) {
      .kec-ice-corridor-cells {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .kec-ice-groups-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .kec-ice-time-group.span-1,
      .kec-ice-time-group.span-2,
      .kec-ice-time-group.span-3,
      .kec-ice-time-group.span-4 {
        grid-column: span 2;
      }
      .kec-ice-group-cards.cols-3,
      .kec-ice-group-cards.cols-4 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 680px) {
      .kec-ice-backdrop { padding: 10px; }
      .kec-ice-head { padding: 10px 14px; }
      .kec-ice-body { padding: 12px 14px; gap: 10px; }
      .kec-ice-banner { padding: 11px 13px; }
      .kec-ice-banner-side { align-items: flex-start; }
      .kec-ice-corridor-cells {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .kec-ice-groups-grid {
        grid-template-columns: 1fr;
      }
      .kec-ice-time-group.span-1,
      .kec-ice-time-group.span-2,
      .kec-ice-time-group.span-3,
      .kec-ice-time-group.span-4 {
        grid-column: span 1;
      }
      .kec-ice-group-cards.cols-2,
      .kec-ice-group-cards.cols-3,
      .kec-ice-group-cards.cols-4 {
        grid-template-columns: 1fr;
      }
      .kec-ice-foot { padding: 10px 14px; }
      .kec-ice-confirm { width: 100%; }
    }
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

export function mountIceAlertModal({
  soundEnabled = () => true,
  onAcknowledge = null,
  autoCloseSec = POPUP_AUTO_CLOSE_SEC
} = {}) {
  if (typeof document === 'undefined') {
    return { update: () => ({ activeAlertIds: [], escalatedIds: [] }), showPreview: () => {}, close: () => {} };
  }
  injectModalStylesOnce();

  let prevLevels = {};
  let initialized = false;
  let activeEvaluation = null;
  let countdownTimer = null;
  let countdownDeadlineMs = 0;

  let backdrop = document.getElementById('kecIceAlertBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'kecIceAlertBackdrop';
    backdrop.className = 'kec-ice-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="kec-ice-modal is-level-2" role="alertdialog" aria-modal="true" aria-labelledby="kecIceAlertHeadline">
        <div class="kec-ice-head">
          <div class="kec-ice-head-left">
            <strong>[알림] 고령지사 도로살얼음 위험정보</strong>
            <span class="kec-ice-reftime-pill">🕒 최신 발표 : <span id="kecIceRefTime">—</span></span>
          </div>
          <button type="button" class="kec-ice-close" id="kecIceCloseBtn" aria-label="알림 닫기">✕</button>
        </div>
        <div class="kec-ice-body">
          <div class="kec-ice-banner">
            <div class="kec-ice-banner-main">
              <span class="kec-ice-arrow" aria-hidden="true">⬆</span>
              <div class="kec-ice-banner-txt">
                <strong id="kecIceAlertHeadline">도로살얼음 위험정보 주의 격상 알림</strong>
                <em id="kecIceAlertDirective">온도, 노면상태 확인 후 예비살포</em>
              </div>
            </div>
            <div class="kec-ice-banner-side">
              <span class="kec-ice-sub-pill" id="kecIceAlertSub">고정식 기상정보 확인 후 예비살포 실시</span>
              <span class="kec-ice-summary-stat" id="kecIceCountBadge">—</span>
            </div>
          </div>

          <section class="kec-ice-corridor-strip" id="kecIceCorridorStrip" aria-label="고령지사 감시 전 구간 현황">
            <div class="kec-ice-corridor-head">
              <span id="kecIceCorridorTitle">🛣️ 고령지사 감시 8개 전 구간 한눈에 보기 (함양IC 95.0k → 옥포JC 176.0k)</span>
              <span class="kec-ice-corridor-legend">
                <span><i style="background:#0ea5e9"></i>안전</span>
                <span><i style="background:#eab308"></i>관심</span>
                <span><i style="background:#f97316"></i>주의</span>
                <span><i style="background:#e11d48"></i>위험</span>
              </span>
            </div>
            <div class="kec-ice-corridor-cells" id="kecIceCorridorCells"></div>
          </section>

          <div class="kec-ice-groups-grid" id="kecIceStnList"></div>
        </div>
        <div class="kec-ice-foot-wrap">
          <div class="kec-ice-timer-track" aria-hidden="true">
            <div class="kec-ice-timer-fill" id="kecIceTimerFill"></div>
          </div>
          <div class="kec-ice-foot">
            <span class="kec-ice-scope-note">* 기상청 API허브(5분 주기) · 고령지사 관할 알림 · 1분 후 자동 닫힘 (지도·카드 점멸은 유지)</span>
            <button type="button" class="kec-ice-confirm" id="kecIceConfirmBtn">확인 (60초)</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
  }

  const modalEl = backdrop.querySelector('.kec-ice-modal');
  const confirmBtn = backdrop.querySelector('#kecIceConfirmBtn');
  const timerFill = backdrop.querySelector('#kecIceTimerFill');

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function syncCountdownUI(remainMs, totalMs) {
    const remainSec = Math.max(0, Math.ceil(remainMs / 1000));
    if (confirmBtn) {
      confirmBtn.textContent = formatConfirmCountdownText(remainSec);
    }
    if (timerFill && totalMs > 0) {
      const pct = Math.max(0, Math.min(100, (remainMs / totalMs) * 100));
      timerFill.style.width = `${pct.toFixed(1)}%`;
    }
  }

  const acknowledgeAndClose = () => {
    stopCountdown();
    const itemsToAck = activeEvaluation?.activeItems?.length
      ? activeEvaluation.activeItems
      : (activeEvaluation?.triggeredItems || []);
    if (itemsToAck.length) {
      const ack = readJsonStorage(ICE_ALERT_ACK_KEY);
      const nowMs = Date.now();
      for (const t of itemsToAck) {
        ack[t.id] = { level: t.toLevel, atMs: nowMs };
      }
      writeJsonStorage(ICE_ALERT_ACK_KEY, ack);
    }
    backdrop.hidden = true;
    onAcknowledge?.();
  };

  function startCountdown(seconds = autoCloseSec) {
    stopCountdown();
    const totalMs = Math.max(1, Number(seconds) || POPUP_AUTO_CLOSE_SEC) * 1000;
    countdownDeadlineMs = Date.now() + totalMs;
    syncCountdownUI(totalMs, totalMs);

    countdownTimer = setInterval(() => {
      if (backdrop.hidden) {
        stopCountdown();
        return;
      }
      const remainMs = countdownDeadlineMs - Date.now();
      if (remainMs <= 0) {
        syncCountdownUI(0, totalMs);
        stopCountdown();
        acknowledgeAndClose();
        return;
      }
      syncCountdownUI(remainMs, totalMs);
    }, 250);
  }

  backdrop.querySelector('#kecIceCloseBtn')?.addEventListener('click', acknowledgeAndClose);
  confirmBtn?.addEventListener('click', acknowledgeAndClose);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) acknowledgeAndClose();
  });
  document.addEventListener('keydown', e => {
    if (!backdrop.hidden && e.key === 'Escape') acknowledgeAndClose();
  });

  // 타 탭에서 [확인]을 눌렀으면 동시에 팝업 닫기
  window.addEventListener('storage', e => {
    if (e.key === ICE_ALERT_ACK_KEY && !backdrop.hidden && activeEvaluation?.triggeredItems?.length) {
      const ack = readJsonStorage(ICE_ALERT_ACK_KEY);
      const allAcked = activeEvaluation.triggeredItems.every(t => (ack[t.id]?.level || 0) >= t.toLevel);
      if (allAcked) {
        stopCountdown();
        backdrop.hidden = true;
      }
    }
  });

  function buildStnCardNode(item) {
    const box = document.createElement('div');
    box.className = `kec-ice-stn-item lv-${item.toLevel}`;

    // Row 1: 구간명 + 이정/기준관측소 + 등급 상승 배지
    const r1 = document.createElement('div');
    r1.className = 'kec-ice-stn-row1';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'kec-ice-stn-title-wrap';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'kec-ice-stn-title';
    titleSpan.textContent = item.label;
    const subMeta = document.createElement('span');
    subMeta.className = 'kec-ice-stn-submeta';
    const metaParts = [];
    if (item.kmLabel) metaParts.push(item.kmLabel);
    if (item.stationName) metaParts.push(`${item.stationName} 기준`);
    if (item.escalatedHm) metaParts.push(`${item.escalatedHm} 격상`);
    subMeta.textContent = metaParts.join(' · ') || '고정식 기상관측 확인';
    titleWrap.append(titleSpan, subMeta);

    const pill = document.createElement('span');
    pill.className = `kec-ice-lv-pill lv-${item.toLevel}`;
    const fromPart = item.fromLevel !== null && item.fromLevel !== undefined ? `${item.fromLevel}→` : '';
    pill.textContent = `⬆ ${fromPart}${item.toLevel}단계 (${item.toLabel})`;
    r1.append(titleWrap, pill);

    // Row 2: 3칸 센서 칩 (대기온도 | 노면온도 | 노면상태)
    const chips = document.createElement('div');
    chips.className = 'kec-ice-chip-row';

    const airChip = document.createElement('span');
    airChip.className = 'kec-ice-chip' + (item.airTemp !== null && item.airTemp <= 4.0 ? ' is-cold' : '');
    const airSmall = document.createElement('small');
    airSmall.textContent = '대기';
    airChip.append(airSmall, document.createTextNode(item.airTemp !== null ? `${item.airTemp.toFixed(1)}°C` : '교량'));

    const roadChip = document.createElement('span');
    roadChip.className = 'kec-ice-chip' + (item.roadTemp !== null && item.roadTemp <= 2.0 ? ' is-cold' : '');
    const roadSmall = document.createElement('small');
    roadSmall.textContent = '노면';
    roadChip.append(roadSmall, document.createTextNode(item.roadTemp !== null ? `${item.roadTemp.toFixed(1)}°C` : '확인중'));

    const surfChip = document.createElement('span');
    const isWet = item.surfaceState && item.surfaceState !== '건조' && item.surfaceState !== '확인 필요';
    surfChip.className = 'kec-ice-chip' + (isWet ? ' is-wet' : '');
    surfChip.textContent = item.surfaceState || '확인 필요';

    chips.append(airChip, roadChip, surfChip);

    // Row 3: 의사결정 요약 문구
    const r3 = document.createElement('div');
    r3.className = 'kec-ice-stn-note' + ((item.isColdCondition || item.toLevel >= 3) ? ' is-cold' : '');
    r3.textContent = item.toLevel >= 3
      ? '🚨 위험단계 · 즉시 예비살포 실시 → 상황판단회의'
      : (item.shortNote || item.tempCheckNote || '온도·노면 확인 후 예비살포 판단');

    box.append(r1, chips, r3);
    return box;
  }

  function renderPopup(ev, { silent = false } = {}) {
    activeEvaluation = ev;
    modalEl.classList.toggle('is-level-3', ev.popupLevel >= 3);
    modalEl.classList.toggle('is-level-2', ev.popupLevel === 2);
    backdrop.querySelector('#kecIceRefTime').textContent = ev.refTimeText || '—';
    backdrop.querySelector('#kecIceAlertHeadline').textContent = ev.headline || '';
    backdrop.querySelector('#kecIceAlertDirective').textContent = ev.directive || '';
    backdrop.querySelector('#kecIceAlertSub').textContent = ev.subDirective || '';

    const displayItems = ev.activeItems?.length ? ev.activeItems : (ev.triggeredItems || []);
    const newCount = (ev.triggeredItems || []).length;
    const corridor = ev.corridorOverview || [];
    const totalMonitored = corridor.length || 8;
    backdrop.querySelector('#kecIceCountBadge').textContent =
      newCount > 0 && displayItems.length > newCount
        ? `신규 격상 ${newCount}구간 · 현재 발효 총 ${displayItems.length}/${totalMonitored}구간`
        : `현재 주의·위험 발효 ${displayItems.length} / 전체 ${totalMonitored}구간`;

    // 1) 상단 8개 전 구간(함양IC~옥포JC) 한눈에 보기 바 렌더링
    const stripSec = backdrop.querySelector('#kecIceCorridorStrip');
    const stripCells = backdrop.querySelector('#kecIceCorridorCells');
    const stripTitle = backdrop.querySelector('#kecIceCorridorTitle');
    if (corridor.length > 0) {
      stripSec.hidden = false;
      stripTitle.textContent = `🛣️ 고령지사 감시 ${corridor.length}개 전 구간 현황 (함양IC 95.0k → 옥포JC 176.0k)`;
      stripCells.style.gridTemplateColumns = `repeat(${Math.min(8, corridor.length)}, minmax(0, 1fr))`;
      stripCells.replaceChildren(
        ...corridor.map(c => {
          const cell = document.createElement('div');
          const lvKey = c.level === null || c.level === undefined ? 'null' : String(c.level);
          cell.className = `kec-cor-cell lv-${lvKey}${c.isNew ? ' is-new' : ''}`;
          const nm = document.createElement('div');
          nm.className = 'kec-cor-name';
          nm.textContent = c.shortLabel || compactCorridorLabel(c.label);
          const mt = document.createElement('div');
          mt.className = 'kec-cor-meta';
          const lvSpan = document.createElement('span');
          lvSpan.textContent = c.levelName || '안전';
          const tmSpan = document.createElement('span');
          tmSpan.textContent = c.level >= 2 && c.escalatedHm ? `${c.escalatedHm}↑` : '';
          mt.append(lvSpan, tmSpan);
          cell.append(nm, mt);
          return cell;
        })
      );
    } else {
      stripSec.hidden = true;
    }

    // 2) 격상 시각(escalatedAt) 기준 묶음 + 4칸(4열) 그리드 렌더링
    const groups = ev.escalationGroups?.length
      ? ev.escalationGroups
      : groupEscalatedItemsByTime(displayItems, ev.refTimeText);

    const listEl = backdrop.querySelector('#kecIceStnList');
    listEl.replaceChildren(
      ...groups.map(grp => {
        const gBox = document.createElement('section');
        gBox.className = `kec-ice-time-group span-${grp.spanCols} lv-${grp.maxLevel}${grp.hasNew ? ' is-new-group' : ''}`;

        const gHead = document.createElement('div');
        gHead.className = 'kec-ice-group-head';
        const tBadge = document.createElement('span');
        tBadge.className = 'kec-ice-time-badge';
        tBadge.textContent = `${grp.hasNew ? '🔔' : '⏱'} 격상 시각 : ${grp.escalatedAt}`;

        const gTag = document.createElement('span');
        gTag.className = 'kec-ice-group-tag';
        if (grp.hasNew) {
          gTag.textContent = grp.count >= 2 ? `신규 동시 격상 · ${grp.count}구간` : `신규 격상 · 1구간`;
        } else {
          gTag.textContent = `기존 발효 유지 · ${grp.count}구간`;
        }
        gHead.append(tBadge, gTag);

        const cardsWrap = document.createElement('div');
        cardsWrap.className = `kec-ice-group-cards cols-${grp.innerCols}`;
        cardsWrap.append(...grp.items.map(buildStnCardNode));

        gBox.append(gHead, cardsWrap);
        return gBox;
      })
    );

    backdrop.hidden = false;
    if (!silent) {
      startCountdown(autoCloseSec);
      confirmBtn?.focus({ preventScroll: true });
      if (soundEnabled()) playIceEscalationChime(ev.popupLevel);
    }
  }

  return {
    update({ items = [], roadStations = [], tmKst = '' } = {}) {
      const ackMap = readJsonStorage(ICE_ALERT_ACK_KEY);
      const stateMap = readJsonStorage(ICE_ALERT_STATE_KEY);
      const ev = evaluateBranchIceEscalations({
        prevLevels,
        ackMap,
        stateMap,
        initialized,
        items,
        roadStations,
        tmKst
      });
      prevLevels = ev.nextLevels;
      initialized = ev.initialized;
      writeJsonStorage(ICE_ALERT_ACK_KEY, ev.nextAckMap);
      writeJsonStorage(ICE_ALERT_STATE_KEY, ev.nextStateMap);

      if (ev.shouldPopup) {
        renderPopup(ev, { silent: false });
      } else if (!backdrop.hidden && activeEvaluation && roadStations?.length) {
        const curList = activeEvaluation.activeItems?.length
          ? activeEvaluation.activeItems
          : (activeEvaluation.triggeredItems || []);
        const needsHydration = curList.some(t => t.roadTemp === null);
        if (needsHydration) {
          const itemById = new Map(items.map(it => [String(it?.id || ''), it]));
          const refreshOne = t => {
            const src = itemById.get(String(t.id));
            return src ? { ...t, ...summarizeStationWeather(src.stnIds || [], roadStations) } : t;
          };
          const refreshedActive = (activeEvaluation.activeItems || []).map(refreshOne);
          const refreshedTrig = (activeEvaluation.triggeredItems || []).map(refreshOne);
          const refreshedGroups = groupEscalatedItemsByTime(
            refreshedActive.length ? refreshedActive : refreshedTrig,
            activeEvaluation.refTimeText
          );
          renderPopup({
            ...activeEvaluation,
            activeItems: refreshedActive,
            triggeredItems: refreshedTrig,
            escalationGroups: refreshedGroups
          }, { silent: true });
        }
      }
      return ev;
    },
    showPreview(ev) {
      if (ev && ev.popupLevel >= 2) renderPopup(ev, { silent: false });
    },
    close: acknowledgeAndClose
  };
}
