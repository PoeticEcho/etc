/* ═══════════════════════════════════════════════════════════
   19개 지점 정의 (lib/cctv-its.js 의 CCTV_SITES와 동일)
   ═══════════════════════════════════════════════════════════ */
const SITES = [
  { id: 'dalseong-nambu', group: 'interest', name: '대구 달성군남부', sub: '현풍읍',
    nearest: { label: '논공교2', km: 8.09, note: '종점부' },
    aux: [{ label: '논공교3' }, { label: '논공휴게소' }] },
  { id: 'hamyang-jungbu', group: 'interest', name: '함양중부', sub: '지곡면',
    nearest: { label: '우명교', km: 2.68 },
    aux: [{ label: '원평교' }, { label: '죽산천교1' }] },
  { id: 'geochang-nambu', group: 'interest', name: '거창군남부', sub: '남상면',
    nearest: { label: '무촌2교', km: 0.56 },
    aux: [{ label: '송변교' }, { label: '오계교' }] },
  { id: 'hapcheon-seobuk', group: 'interest', name: '합천군서북부', sub: '야로면',
    nearest: { label: '야로대교1', km: 1.46 },
    aux: [{ label: '야로대교2' }, { label: '해인사' }] },
  { id: 'goryeong', group: 'interest', name: '고령군', sub: '대가야읍',
    nearest: { label: '안림천교', km: 2.29 },
    aux: [{ label: '회천대교' }, { label: '양전교' }] },
  { id: 'namwon', group: 'interest', name: '남원', sub: '남원시청',
    nearest: { label: '남원', km: 1.59 },
    aux: [{ label: '산곡' }, { label: '남원휴게소' }] },
  { id: 'hamyang-eup', group: 'interest', name: '함양', sub: '함양읍',
    nearest: { label: '교산', km: 1.80 },
    aux: [{ label: '두산' }, { label: '함양' }] },
  { id: 'geochang-eup', group: 'interest', name: '거창', sub: '거창읍',
    nearest: { label: '정장교', km: 2.29 },
    aux: [{ label: '거창' }, { label: '무촌2교' }] },

  { id: '14205', group: 'observatory', code: '14205', name: '남원주차장(도)', sub: '50.8k',
    nearest: { label: '남원휴게소', km: 0.13 },
    aux: [{ label: '생태터널' }, { label: '남원' }] },
  { id: '14407', group: 'observatory', code: '14407', name: '번암교(도)', sub: '72.9k', tag: '목표·결빙',
    nearest: { label: '번암교', km: 0.04 },
    aux: [{ label: '번암1터널' }, { label: '지리산휴게소' }] },
  { id: '14102', group: 'observatory', code: '14102', name: '지리산휴(도)', sub: '75.4k', tag: '거점',
    nearest: { label: '지리산휴게소', km: 0.50 },
    aux: [{ label: '당동' }, { label: '번암교' }] },
  { id: '14408', group: 'observatory', code: '14408', name: '옥계1교(도)', sub: '86.2k', tag: '목표·결빙',
    nearest: { label: '옥계1교', km: 0.04 },
    aux: [{ label: '백전교' }] },
  { id: '14206', group: 'observatory', code: '14206', name: '함양(도)', sub: '95.0k',
    nearest: { label: '함양', km: 0.08 },
    aux: [{ label: '두산' }, { label: '교산' }] },
  { id: '14409', group: 'observatory', code: '14409', name: '죽산천교(도)', sub: '102.9k', tag: '목표·결빙',
    nearest: { label: '죽산천교1', km: 0.13 },
    aux: [{ label: '죽산교' }] },
  { id: '14207', group: 'observatory', code: '14207', name: '남상졸음(도)', sub: '115.3k',
    nearest: { label: '오계교', km: 0.75 },
    aux: [{ label: '무촌2교' }] },
  { id: '14208', group: 'observatory', code: '14208', name: '거창휴(도)', sub: '134.1k',
    nearest: { label: '거창휴게소', km: 0.19 },
    aux: [{ label: '가조터널', note: '외부대구' }] },
  { id: '14209', group: 'observatory', code: '14209', name: '양전교(도)', sub: '158.2k',
    nearest: { label: '양전교', km: 0.32 },
    aux: [{ label: '양전리2' }, { label: '안림천교' }] },
  { id: '14103', group: 'observatory', code: '14103', name: '논공휴(도)', sub: '169.2k', tag: '거점',
    nearest: { label: '논공휴게소', km: 0.16 },
    aux: [{ label: '논공휴게소2' }] },
  { id: '14410', group: 'observatory', code: '14410', name: '논공교(도)', sub: '171.3k', tag: '목표·결빙',
    nearest: { label: '논공교2', km: 0.30 },
    aux: [{ label: '논공교3' }, { label: '논공휴게소' }] }
];

const STORAGE_KEY = 'bionda_review_cctv_worker_url_v1';
const DEFAULT_URL = /github\.io$/i.test(window.location.hostname)
  ? 'https://bionda.pages.dev/api/cctv'
  : '/api/cctv';

const state = {
  cctvs: [],
  fetchedAt: null,
  cache: null,
  viewer: null, // { siteId, kind, label, items, index }
  hls: null,
  lastError: null
};

/* ── DOM ─────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const el = {
  workerUrl: $('workerUrl'),
  saveUrl: $('saveUrl'),
  loadData: $('loadData'),
  refreshData: $('refreshData'),
  status: $('status'),
  statusText: $('statusText'),
  statusMeta: $('statusMeta'),
  filter: $('filter'),
  tbodyInterest: $('tbodyInterest'),
  tbodyObservatory: $('tbodyObservatory'),
  backdrop: $('backdrop'),
  modalEyebrow: $('modalEyebrow'),
  modalTitle: $('modalTitle'),
  tabs: $('tabs'),
  video: $('video'),
  overlay: $('overlay'),
  overlayIcon: $('overlayIcon'),
  overlayTitle: $('overlayTitle'),
  overlayText: $('overlayText'),
  overlayActions: $('overlayActions'),
  suggestions: $('suggestions'),
  metaLine: $('metaLine'),
  retryBtn: $('retryBtn'),
  openTabBtn: $('openTabBtn'),
  closeModal: $('closeModal'),
  toast: $('toast')
};

/* ── 작은 도구들 ──────────────────────────────────────── */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function norm(value) {
  return String(value || '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '').toLowerCase();
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtKm(km) {
  return typeof km === 'number' ? km.toFixed(2) + ' km' : '';
}
let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

/* ── 표 렌더 ─────────────────────────────────────────── */
function chipHtml(site, entry, kind) {
  const meta = [kind === 'nearest' ? fmtKm(entry.km) : '', entry.note || ''].filter(Boolean).join(' · ');
  return `
    <button type="button" class="chip chip--${kind} is-pending"
            data-site-id="${esc(site.id)}" data-kind="${kind}" data-label="${esc(entry.label)}"
            title="${esc(entry.label)}${meta ? ' · ' + esc(meta) : ''}">
      <span class="chip-name">${esc(entry.label)}</span>
      ${meta ? `<span class="chip-meta">${esc(meta)}</span>` : ''}
      <span class="chip-count" hidden></span>
    </button>`;
}

function rowHtml(site) {
  return `
    <tr data-site-id="${esc(site.id)}">
      <td class="col-site">
        <div class="site-name">
          ${site.code ? `<span class="code">${esc(site.code)}</span>` : ''}
          <span>${esc(site.name)}</span>
        </div>
        <div class="site-sub">
          ${site.sub ? `<span>${esc(site.sub)}</span>` : ''}
          ${site.tag ? `<span class="tag">${esc(site.tag)}</span>` : ''}
        </div>
      </td>
      <td class="col-nearest" data-label="최인접 CCTV">${chipHtml(site, site.nearest, 'nearest')}</td>
      <td class="col-aux" data-label="보조 CCTV">
        <div class="chips">${site.aux.map((entry) => chipHtml(site, entry, 'aux')).join('')}</div>
      </td>
    </tr>`;
}

function renderTables() {
  el.tbodyInterest.innerHTML = SITES.filter((s) => s.group === 'interest').map(rowHtml).join('');
  el.tbodyObservatory.innerHTML = SITES.filter((s) => s.group === 'observatory').map(rowHtml).join('');
  $('countInterest').textContent = String(SITES.filter((s) => s.group === 'interest').length);
  $('countObservatory').textContent = String(SITES.filter((s) => s.group === 'observatory').length);
}

/* ── 이름 매칭 ───────────────────────────────────────── */
function findCandidates(label) {
  const target = norm(label);
  if (!target) return { mode: 'none', items: [] };

  const exact = state.cctvs.filter((c) => norm(c.name) === target);
  if (exact.length) return { mode: 'exact', items: exact };

  const contains = state.cctvs.filter((c) => norm(c.name).includes(target));
  if (contains.length) return { mode: 'partial', items: contains };

  const reverse = state.cctvs.filter((c) => {
    const name = norm(c.name);
    return name.length >= 2 && target.includes(name);
  });
  if (reverse.length) return { mode: 'partial', items: reverse };

  return { mode: 'none', items: [] };
}

function updateChips() {
  document.querySelectorAll('.chip[data-label]').forEach((chip) => {
    chip.classList.remove('is-pending', 'is-missing');
    const badge = chip.querySelector('.chip-count');
    if (!state.cctvs.length) {
      chip.classList.add('is-pending');
      badge.hidden = true;
      return;
    }
    const { items } = findCandidates(chip.dataset.label);
    if (!items.length) {
      chip.classList.add('is-missing');
      badge.hidden = true;
      chip.title = chip.dataset.label + ' · 조회된 CCTV 목록에 없음';
    } else {
      badge.hidden = items.length < 2;
      badge.textContent = '×' + items.length;
      chip.title = chip.dataset.label + (items.length > 1 ? ` · 방향/후보 ${items.length}개` : '');
    }
  });
}

/* ── Worker 호출 ─────────────────────────────────────── */
function savedUrl() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}
function currentUrl() {
  return (el.workerUrl.value || '').trim();
}
function apiUrl(refresh) {
  const base = currentUrl();
  if (!base) throw new Error('Worker 주소가 비어 있습니다.');
  const url = new URL(base, window.location.href);
  if (refresh) url.searchParams.set('refresh', '1');
  return url.toString();
}
function extractCctvs(payload) {
  let raw = payload && payload.cctvs;
  if (!Array.isArray(raw)) {
    const r = payload && payload.response;
    if (r && Array.isArray(r.data)) raw = r.data;
    else if (r && r.body && r.body.items) raw = r.body.items.item || r.body.items;
    else if (Array.isArray(r)) raw = r;
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    id: item.id || item.cctvid || item.cctvId,
    name: String(item.name || item.cctvname || item.cctvName || '').trim(),
    url: item.url || item.cctvurl || item.cctvUrl || '',
    format: item.format || item.cctvformat || item.cctvFormat || 'HLS',
    x: item.x != null ? item.x : item.coordx,
    y: item.y != null ? item.y : item.coordy
  })).filter((c) => c.url);
}

function setStatus(stateName, text, meta) {
  el.status.dataset.state = stateName;
  el.statusText.innerHTML = text;
  el.statusMeta.textContent = meta || '';
}

async function loadData(options) {
  const opts = options || {};
  const buttons = [el.loadData, el.refreshData];
  buttons.forEach((b) => { b.disabled = true; });
  if (!state.cctvs.length) setStatus('loading', opts.refresh ? '캐시를 새로고침하는 중…' : 'CCTV 목록을 불러오는 중…');

  try {
    const url = apiUrl(!!opts.refresh);
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload || payload.ok === false) {
      const code = (payload && (payload.error || payload.message)) || 'HTTP ' + res.status;
      const hint = payload && payload.hint ? ' — ' + payload.hint : '';
      throw new Error(code + hint);
    }

    const list = extractCctvs(payload);
    if (!list.length) throw new Error('CCTV 목록이 비어 있습니다. 좌표 범위·API 키·업스트림 상태를 확인해 주세요.');

    state.cctvs = list;
    state.fetchedAt = payload.fetchedAt || new Date().toISOString();
    state.cache = payload.cache || (opts.refresh ? 'REFRESH' : 'MISS');
    state.lastError = null;

    updateChips();
    const unmatched = payload.stats && payload.stats.unmatchedLabels ? payload.stats.unmatchedLabels.length : 0;
    setStatus(
      'ok',
      `CCTV <b>${list.length}</b>개 불러옴 · 19개 지점 매핑 완료` + (unmatched ? ` · 이름 미확인 ${unmatched}개` : ''),
      `${fmtTime(state.fetchedAt)} · ${state.cache}`
    );
    if (!opts.silent) toast(opts.refresh ? '캐시를 새로고침했어요.' : 'CCTV 목록을 불러왔어요.');
    return list;
  } catch (err) {
    state.lastError = err;
    setStatus('error', '목록을 불러오지 못했습니다: ' + esc(err.message || err), explain(err));
    if (!opts.silent) toast('불러오기 실패 — ' + (err.message || '알 수 없는 오류'));
    return null;
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function explain(err) {
  const msg = String((err && err.message) || err || '');
  if (window.location.protocol === 'file:' && /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return '파일로 열면 Worker 주소(https://…workers.dev/api/cctv)를 직접 입력해야 합니다.';
  }
  if (/ITS_API_KEY_MISSING/.test(msg)) return 'Worker에 ITS_API_KEY 시크릿을 설정해 주세요.';
  if (/UPSTREAM_(UNREACHABLE|TIMEOUT)/.test(msg)) return '업스트림(9443) 연결 실패 — README_cctv.md의 CCTV_SOURCE_URL 대안을 참고하세요.';
  return '';
}

/* ── 팝업 ─────────────────────────────────────────────── */
function siteById(id) {
  return SITES.find((s) => s.id === id) || null;
}
function entryOf(site, kind, label) {
  if (!site) return null;
  if (kind === 'nearest') return site.nearest;
  return site.aux.find((a) => a.label === label) || null;
}
function directionOf(name) {
  const m = String(name).match(/\((상행|하행|상선|하선|내선|외선|동행|서행)\)/);
  return m ? m[1] : '';
}
function duplicateNames(items) {
  const counts = new Map();
  items.forEach((i) => counts.set(i.name, (counts.get(i.name) || 0) + 1));
  return counts;
}

function openViewer(siteId, kind, label, index) {
  const site = siteById(siteId);
  const entry = entryOf(site, kind, label);
  if (!site || !entry) return;

  const { mode, items } = findCandidates(label);
  state.viewer = { siteId, kind, label, items, index: Math.min(index || 0, Math.max(items.length - 1, 0)), mode };

  el.modalEyebrow.textContent = [
    site.code ? '관측소 ' + site.code : '관심지역',
    site.name,
    site.sub
  ].filter(Boolean).join(' · ');
  el.modalTitle.innerHTML = `${esc(label)} ${kind === 'nearest' ? '<span class="badge">최인접</span>' : ''}`;

  el.backdrop.hidden = false;
  document.body.classList.add('modal-open');
  el.closeModal.focus({ preventScroll: true });

  renderTabs();
  renderStage();
}

function renderTabs() {
  const v = state.viewer;
  if (!v) return;
  const items = v.items || [];

  if (items.length <= 1) {
    el.tabs.hidden = true;
    el.tabs.innerHTML = '';
    return;
  }
  el.tabs.hidden = false;
  const dup = duplicateNames(items);
  el.tabs.innerHTML = items.map((item, i) => {
    const dir = directionOf(item.name);
    const label = dir || item.name;
    const idx = (dup.get(item.name) || 0) > 1 ? `<span class="tab-idx">#${i + 1}</span>` : '';
    return `<button type="button" class="tab" role="tab" data-index="${i}" aria-selected="${i === v.index}">${esc(label)}${idx}</button>`;
  }).join('');
  el.tabs.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const i = Number(tab.dataset.index);
      state.viewer.index = i;
      renderTabs();
      renderStage();
    });
  });
}

function safePlay() {
  try {
    const result = el.video.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}
}

function clearPlayer() {
  if (state.hls) {
    try { state.hls.destroy(); } catch {}
    state.hls = null;
  }
  try {
    el.video.pause();
    el.video.removeAttribute('src');
    el.video.load();
  } catch {}
}

function showOverlay(opts) {
  el.overlay.hidden = false;
  el.video.classList.add('is-hidden');
  el.video.controls = false;
  el.retryBtn.classList.add('hidden');
  el.overlayIcon.textContent = opts.icon || '📡';
  el.overlayTitle.textContent = opts.title || '';
  el.overlayText.textContent = opts.text || '';
  el.overlayActions.innerHTML = '';
  el.suggestions.innerHTML = '';

  if (opts.retry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sm btn--primary';
    btn.textContent = '캐시 새로고침 후 다시 시도';
    btn.addEventListener('click', () => retryPlayback());
    el.overlayActions.appendChild(btn);
  }
  if (opts.spinner) {
    const sp = document.createElement('div');
    sp.className = 'spinner';
    el.overlayActions.appendChild(sp);
  }
  if (Array.isArray(opts.suggestions) && opts.suggestions.length) {
    opts.suggestions.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip chip--aux';
      btn.innerHTML = `<span class="chip-name">${esc(item.name)}</span>`;
      btn.addEventListener('click', () => {
        state.viewer.items = [item];
        state.viewer.index = 0;
        state.viewer.label = item.name;
        el.modalTitle.innerHTML = `${esc(item.name)} <span class="badge">대체</span>`;
        renderTabs();
        renderStage();
      });
      el.suggestions.appendChild(btn);
    });
  }
}

function hideOverlay() {
  el.overlay.hidden = true;
  el.video.classList.remove('is-hidden');
  el.video.controls = true;
  el.retryBtn.classList.remove('hidden');
  el.overlayActions.innerHTML = '';
  el.suggestions.innerHTML = '';
}

function normalizePlaybackUrl(url) {
  const raw = String(url || '').trim();
  if (window.location.protocol === 'https:') {
    return raw.replace(/^http:\/\/(cctvsec\.ktict\.co\.kr\/)/i, 'https://$1');
  }
  return raw;
}

function renderStage() {
  const v = state.viewer;
  if (!v) return;
  clearPlayer();

  const item = (v.items || [])[v.index];
  if (!item) {
    renderEmpty(v.label);
    return;
  }

  const playUrl = normalizePlaybackUrl(item.url);
  const effectiveItem = { ...item, url: playUrl };
  hideOverlay();
  playStream(effectiveItem);
  const insecure = window.location.protocol === 'https:' && /^http:\/\//i.test(playUrl);
  el.metaLine.innerHTML =
    (insecure ? '<span class="warn-inline">⚠ HTTP 스트림</span>' : '') +
    `<b>${esc(item.format || 'HLS')}</b>` +
    (item.x != null && item.y != null ? ` · ${esc(item.y)}, ${esc(item.x)}` : '') +
    ` · <span class="mono">${esc(playUrl)}</span>`;
  const pageLink = $('cameraPageLink');
  pageLink.href = './cctv.html?' + new URLSearchParams({ id: item.id || [item.name, item.y, item.x].join('|') });
  pageLink.hidden = false;
  el.openTabBtn.disabled = false;
}

function renderEmpty(label) {
  clearPlayer();
  const suggestions = suggestCandidates(label);
  const text = state.lastError
    ? 'Worker에서 목록을 받지 못한 상태입니다. 캐시 새로고침으로 다시 시도해 보세요.'
    : `조회된 CCTV 목록에 "${label}" 이름이 없습니다. 이름이 바뀌었거나 폐쇄된 CCTV일 수 있어요.`;
  showOverlay({
    icon: '🔍',
    title: '일치하는 CCTV를 찾지 못했습니다',
    text,
    retry: true,
    suggestions
  });
  el.metaLine.textContent = '매칭 실패 · ' + label;
  $('cameraPageLink').hidden = true;
  el.openTabBtn.disabled = true;
}

function lcsLen(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = new Array(n + 1).fill(0);
  let cur = new Array(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      } else {
        cur[j] = 0;
      }
    }
    const tmp = prev; prev = cur; cur = tmp;
    cur.fill(0);
  }
  return best;
}

function suggestCandidates(label) {
  const target = norm(label);
  if (!target || !state.cctvs.length) return [];
  return state.cctvs
    .map((item) => {
      const name = norm(item.name);
      const score = lcsLen(target, name) / Math.max(target.length, name.length, 1);
      return { item, score };
    })
    .filter((row) => row.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((row) => row.item);
}

function isHlsStream(item) {
  const url = String(item?.url || '');
  const fmt = String(item?.format || '').toUpperCase();
  return fmt === 'HLS' || /\.m3u8(\?|$)/i.test(url) || /playlist/i.test(url);
}

function playStream(item) {
  const url = item.url;
  const nativeHls = el.video.canPlayType('application/vnd.apple.mpegurl');

  if (isHlsStream(item)) {
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        lowLatencyMode: true,
        maxBufferLength: 12,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 2
      });
      state.hls = hls;
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { safePlay(); });
      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (!data || !data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); return; } catch {}
        }
        playbackFailed(item, describeHlsError(data));
      });
      hls.loadSource(url);
      hls.attachMedia(el.video);
      return;
    }
    if (nativeHls) {
      el.video.src = url;
      safePlay();
      return;
    }
    playbackFailed(item, '이 브라우저는 HLS 재생을 지원하지 않습니다. Safari나 Chrome 최신 버전에서 열어 주세요.');
    return;
  }

  el.video.src = url;
  safePlay();
}

function describeHlsError(data) {
  const details = data && data.details ? String(data.details) : '';
  if (/manifestLoadError|manifestParsingError/i.test(details)) return '스트림 주소(manifest)를 받지 못했습니다. 방송이 잠시 끊겼거나 주소가 만료됐을 수 있습니다.';
  if (/levelLoadError|fragLoadError/i.test(details)) return '영상 조각을 받지 못했습니다. 잠시 후 다시 시도해 주세요.';
  if (/timeout/i.test(details)) return '스트림 응답이 없습니다(타임아웃).';
  return '영상을 재생하지 못했습니다. (' + (details || '알 수 없는 오류') + ')';
}

function playbackFailed(item, message) {
  clearPlayer();
  const insecure = window.location.protocol === 'https:' && /^http:\/\//i.test((item && item.url) || '');
  const extra = insecure
    ? ' 스트림 주소가 http:// 라서 https 페이지에서 차단됐을 수 있습니다 — 이 HTML을 파일로 열거나 http 환경에서 확인해 보세요.'
    : ' 캐시를 새로고침해 최신 스트림 주소를 다시 받아 보세요.';
  showOverlay({
    icon: '🚫',
    title: '영상을 불러오지 못했습니다',
    text: message + extra,
    retry: true
  });
}

async function retryPlayback() {
  const v = state.viewer;
  if (!v) return;
  hideOverlay();
  showOverlay({ icon: '🔄', title: '캐시를 새로고침하는 중…', text: 'Worker에 ?refresh=1 로 최신 목록을 요청합니다.', spinner: true });

  const list = await loadData({ refresh: true, silent: true });
  if (!list) {
    showOverlay({
      icon: '⚠️',
      title: '새로고침에 실패했습니다',
      text: state.lastError ? String(state.lastError.message) : 'Worker 응답을 받지 못했습니다.',
      retry: true
    });
    return;
  }

  const fresh = findCandidates(v.label);
  if (!fresh.items.length) {
    state.viewer.items = [];
    renderEmpty(v.label);
    return;
  }
  state.viewer.items = fresh.items;
  state.viewer.index = Math.min(v.index, fresh.items.length - 1);
  state.viewer.mode = fresh.mode;
  renderTabs();
  renderStage();
  toast('새 목록으로 다시 연결했습니다.');
}

function closeViewer() {
  clearPlayer();
  el.backdrop.hidden = true;
  document.body.classList.remove('modal-open');
  state.viewer = null;
}

/* ── 이벤트 ──────────────────────────────────────────── */
document.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip[data-label]');
  if (!chip) return;
  if (!state.cctvs.length) {
    toast('먼저 목록을 불러와 주세요.');
    return;
  }
  openViewer(chip.dataset.siteId, chip.dataset.kind, chip.dataset.label, 0);
});

el.closeModal.addEventListener('click', closeViewer);
el.backdrop.addEventListener('click', (event) => { if (event.target === el.backdrop) closeViewer(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.backdrop.hidden) closeViewer();
});

el.video.addEventListener('error', () => {
  const v = state.viewer;
  if (!v) return;
  const item = (v.items || [])[v.index];
  if (item) playbackFailed(item, '영상 요소가 스트림을 재생하지 못했습니다.');
});

el.openTabBtn.addEventListener('click', () => {
  const v = state.viewer;
  const item = v && (v.items || [])[v.index];
  if (!item) return;
  window.open(normalizePlaybackUrl(item.url), '_blank', 'noopener,noreferrer');
});

el.retryBtn.addEventListener('click', () => {
  const v = state.viewer;
  if (!v) return;
  retryPlayback();
});

el.saveUrl.addEventListener('click', () => {
  const value = currentUrl();
  if (!value) { toast('저장할 Worker 주소를 입력해 주세요.'); return; }
  try {
    localStorage.setItem(STORAGE_KEY, value);
    toast('Worker 주소를 저장했어요.');
  } catch {
    toast('이 브라우저에서는 저장할 수 없습니다.');
  }
});

el.workerUrl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadData({});
});

el.loadData.addEventListener('click', () => loadData({}));
el.refreshData.addEventListener('click', () => loadData({ refresh: true }));

el.filter.addEventListener('input', () => {
  const q = norm(el.filter.value);
  document.querySelectorAll('table.sites tbody tr').forEach((row) => {
    if (!q) { row.classList.remove('hidden'); return; }
    const text = norm(row.textContent);
    row.classList.toggle('hidden', !text.includes(q));
  });
});

/* ── 시작 ────────────────────────────────────────────── */
(function init() {
  renderTables();
  updateChips();

  const stored = savedUrl();
  const isFile = window.location.protocol === 'file:';
  el.workerUrl.value = stored || (isFile ? '' : DEFAULT_URL);

  if (isFile && !stored) {
    setStatus('idle', 'Worker 주소를 입력해 주세요.',
      '파일로 열었을 때는 https://…workers.dev/api/cctv 주소가 필요합니다.');
    return;
  }
  if (stored || !isFile) loadData({ silent: true });
})();
