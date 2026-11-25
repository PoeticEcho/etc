/**
 * 제설 지시카드 · 살포시각 타이머 · 대설/한파 특보 해제 추적 · 지시 확인(ACK) 상태 관리 모듈
 * - public/app.js에서 분리된 독립 ES 모듈 (Node 단위 테스트 및 브라우저 공용)
 */
import { evaluateResaltCard, isSnowRelatedWarning } from './ice.js';

export const ACTION_STAGE_META = [
  { id: 'preheat', icon: '🔑', label: '시동ON' },
  { id: 'presalt', icon: '🚜', label: '예비살포' },
  { id: 'mainplow', icon: '❄', label: '본살포' },
  { id: 'floodwind', icon: '🌊', label: '수방·횡풍' }
];

export const ACTION_STAGE_ORDER = { preheat: 0, presalt: 1, mainplow: 2, floodwind: 3 };

export const ACK_KEY = 'weather-watch:ack:v1';
export const SPREAD_LOG_KEY = 'weather-watch:spread-log:v1';
export const SPREAD_MAX_AGE_MS = 24 * 3600000;
export const SNOW_WRN_HIST_KEY = 'weather-watch:snow-wrn-hist:v1';
export const SNOW_WRN_CLEARED_TTL_MS = 6 * 3600000;

export function formatKstClock(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

export function parseKstHhmmToMs(hhmm, nowMs = Date.now()) {
  const m = String(hhmm || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  const kstNow = new Date(nowMs + 9 * 3600000);
  const y = kstNow.getUTCFullYear();
  const mo = String(kstNow.getUTCMonth() + 1).padStart(2, '0');
  const da = String(kstNow.getUTCDate()).padStart(2, '0');
  let epoch = Date.parse(`${y}-${mo}-${da}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
  if (!Number.isFinite(epoch)) return null;
  // 입력 시각이 현재보다 10분 이상 미래면 자정 이전(전일) 살포 시각으로 해석
  if (epoch - nowMs > 10 * 60000) epoch -= 24 * 3600000;
  return epoch;
}

export function extractSnowWarnings(wrn) {
  const list = Array.isArray(wrn?.raw) && wrn.raw.length
    ? wrn.raw
    : (Array.isArray(wrn?.tooltipLines) ? wrn.tooltipLines : []);
  return list.filter(isSnowRelatedWarning);
}

export function getActionSignature(cards = []) {
  return (cards || []).map(c => `${c.stageId}:${c.state}:${c.pcChip}`).join('|');
}

function defaultCoordOf(p) {
  return `${Number(p?.lat).toFixed(3)},${Number(p?.lon).toFixed(3)}`;
}

function readJsonStore(storage, key) {
  try {
    return JSON.parse(storage?.getItem?.(key) || '{}') || {};
  } catch {
    return {};
  }
}

function writeJsonStore(storage, key, val) {
  try {
    storage?.setItem?.(key, JSON.stringify(val));
  } catch {}
}

export function createSnowDirectiveStore({ storage = globalThis.localStorage, coordOf = defaultCoordOf } = {}) {
  let acknowledgedActions = readJsonStore(storage, ACK_KEY);
  let spreadLogs = readJsonStore(storage, SPREAD_LOG_KEY);
  let snowWrnHistory = readJsonStore(storage, SNOW_WRN_HIST_KEY);

  const persistAck = () => writeJsonStore(storage, ACK_KEY, acknowledgedActions);
  const persistSpreadLogs = () => writeJsonStore(storage, SPREAD_LOG_KEY, spreadLogs);
  const persistSnowWrnHistory = () => writeJsonStore(storage, SNOW_WRN_HIST_KEY, snowWrnHistory);

  function getSpreadEntry(place, stageId, nowMs = Date.now()) {
    if (!place || !stageId) return null;
    const id = coordOf(place);
    const entry = spreadLogs[id]?.[stageId];
    if (!entry || !Number.isFinite(entry.atMs)) return null;
    if (nowMs - entry.atMs > SPREAD_MAX_AGE_MS) {
      delete spreadLogs[id][stageId];
      persistSpreadLogs();
      return null;
    }
    return entry;
  }

  function setSpreadTime(place, stageId, atMs) {
    const id = coordOf(place);
    if (!spreadLogs[id]) spreadLogs[id] = {};
    spreadLogs[id][stageId] = { atMs };
    persistSpreadLogs();
  }

  function clearSpreadTime(place, stageId) {
    const id = coordOf(place);
    if (spreadLogs[id]) {
      delete spreadLogs[id][stageId];
      if (!Object.keys(spreadLogs[id]).length) delete spreadLogs[id];
      persistSpreadLogs();
    }
  }

  function syncSnowWarningHistory(place, wrn, nowMs = Date.now()) {
    if (!place || !wrn) return;
    const id = coordOf(place);
    const snowWrns = extractSnowWarnings(wrn);
    const prev = snowWrnHistory[id];
    if (snowWrns.length > 0) {
      const titles = [...new Set(snowWrns.map(w => w.title || w.kind).filter(Boolean))];
      snowWrnHistory[id] = { active: true, titles, lastSeenMs: nowMs, clearedAtMs: null, dismissed: false };
      persistSnowWrnHistory();
    } else if (prev?.active) {
      snowWrnHistory[id] = {
        active: false,
        lastTitles: prev.titles || ['제설 관련 특보'],
        clearedAtMs: nowMs,
        dismissed: false
      };
      persistSnowWrnHistory();
    } else if (prev && !prev.active && prev.clearedAtMs && nowMs - prev.clearedAtMs > SNOW_WRN_CLEARED_TTL_MS) {
      delete snowWrnHistory[id];
      persistSnowWrnHistory();
    }
  }

  function getSnowWarningClearedState(place, wrn, nowMs = Date.now()) {
    const id = coordOf(place);
    const hasActiveSnowWrn = extractSnowWarnings(wrn).length > 0;
    const entry = snowWrnHistory[id];
    if (!entry || entry.active || entry.dismissed || !entry.clearedAtMs) {
      return { recentlyCleared: false, clearedTitles: [], hasActiveSnowWrn };
    }
    if (nowMs - entry.clearedAtMs > SNOW_WRN_CLEARED_TTL_MS) {
      delete snowWrnHistory[id];
      persistSnowWrnHistory();
      return { recentlyCleared: false, clearedTitles: [], hasActiveSnowWrn };
    }
    return {
      recentlyCleared: true,
      clearedTitles: entry.lastTitles || ['제설 관련 특보'],
      hasActiveSnowWrn
    };
  }

  function dismissSnowWarningCleared(placeKey) {
    if (snowWrnHistory[placeKey]) {
      snowWrnHistory[placeKey].dismissed = true;
      persistSnowWrnHistory();
    }
  }

  function resolveDecisionCardsForPlace(place, rec, nowMs = Date.now()) {
    const baseCards = rec?.w?.ice?.decisionCards || [
      { stageId: 'preheat', title: '제설차 시동 ON', subtitle: '(살포기 유압 예열)', status: '대기', detail: '결빙·강설 신호 없음', state: 'idle' },
      { stageId: 'presalt', title: '예비살포', subtitle: '(습염 사전 살포)', status: '대기', detail: '노면 결빙 위험 없음', state: 'idle' },
      { stageId: 'mainplow', title: '본살포', subtitle: '(제설삽날·연속 살포)', status: '대기', detail: '강설 1.0cm/h 이상 시', state: 'idle' },
      { stageId: 'floodwind', title: '수방 · 횡풍', subtitle: '(배수로·교량 안전)', status: '정상', detail: '강수·강풍 특이사항 없음', state: 'idle' }
    ];
    if (!place) return baseCards;
    const ice = rec?.w?.ice;
    const obs = rec?.o;
    const airTemp = Number.isFinite(obs?.temp) ? obs.temp : (Number.isFinite(ice?.curTemp) ? ice.curTemp : rec?.w?.current?.temp ?? null);
    const roadTemp = Number.isFinite(obs?.bridgeRoadTemp)
      ? obs.bridgeRoadTemp
      : Number.isFinite(obs?.roadTemp)
        ? obs.roadTemp
        : (Number.isFinite(ice?.bridgeTemp) ? ice.bridgeTemp : null);
    const surfaceWet = Number.isFinite(obs?.surfaceCode)
      ? [2, 3, 6].includes(obs.surfaceCode)
      : ice?.curSurfaceWet ?? (rec?.w?.current?.precip > 0);
    const surfaceState = obs?.surfaceState || ice?.curSurfaceState || (surfaceWet ? '습윤' : '건조');

    return baseCards.map(card => {
      if (!card || (card.stageId !== 'presalt' && card.stageId !== 'mainplow')) return card;
      const logged = getSpreadEntry(place, card.stageId, nowMs);
      if (!logged) return card;
      return evaluateResaltCard(card, logged.atMs, {
        nowMs,
        airTemp,
        roadTemp,
        surfaceWet,
        surfaceState,
        stageLabel: card.stageId === 'mainplow' ? '본살포' : '예비살포'
      });
    });
  }

  function getActiveActionCards(rec, place = null, nowMs = Date.now()) {
    const cards = place ? resolveDecisionCardsForPlace(place, rec, nowMs) : (rec?.w?.ice?.decisionCards || []);
    return cards
      .filter(c => c && c.pcChip && (c.state === 'urgent' || c.state === 'watch'))
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === 'urgent' ? -1 : 1;
        const ha = Number.isFinite(a.hoursLeft) ? a.hoursLeft : 9;
        const hb = Number.isFinite(b.hoursLeft) ? b.hoursLeft : 9;
        if (ha !== hb) return ha - hb;
        return (ACTION_STAGE_ORDER[a.stageId] ?? 9) - (ACTION_STAGE_ORDER[b.stageId] ?? 9);
      });
  }

  function getUnackedActionCards(place, rec, nowMs = Date.now()) {
    const active = getActiveActionCards(rec, place, nowMs);
    if (!active.length) return [];
    const sig = getActionSignature(active);
    const id = coordOf(place);
    // 단계 격상·시각 변동 시 시그니처가 바뀌어 숨긴 지시가 자동 재노출됨
    return acknowledgedActions[id] === sig ? [] : active;
  }

  function acknowledgeActionCards(place, activeCards) {
    acknowledgedActions[coordOf(place)] = getActionSignature(activeCards);
    persistAck();
  }

  function clearAllAcknowledged() {
    acknowledgedActions = {};
    persistAck();
  }

  return {
    getSpreadEntry,
    setSpreadTime,
    clearSpreadTime,
    syncSnowWarningHistory,
    getSnowWarningClearedState,
    dismissSnowWarningCleared,
    resolveDecisionCardsForPlace,
    getActiveActionCards,
    getUnackedActionCards,
    acknowledgeActionCards,
    clearAllAcknowledged
  };
}
