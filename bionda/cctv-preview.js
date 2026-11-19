const ROADPLUS_URL = 'https://www.roadplus.co.kr/main';

// 8개 관심지역 (광주대구선 관리구간) + 공식 로드플러스 광주대구선 최인접 CCTV 매칭
const WATCHED_PLACES = [
  {
    id: 'place-dalseong',
    kind: 'place',
    name: '대구 달성군남부',
    sub: '현풍읍 · 종점부 구간',
    lat: 35.697,
    lon: 128.447,
    nearestStnId: '14410',
    nearestStnLabel: '논공교(도) 171.3k',
    cctvs: [
      { name: '논공교2', distKm: 8.09, note: '광주대구선 종점부' },
      { name: '논공교3', distKm: 8.14, note: '논공교 인근' },
      { name: '논공휴게소', distKm: 8.65, note: '거점 관측소 인접' }
    ]
  },
  {
    id: 'place-hamyang-mid',
    kind: 'place',
    name: '함양중부',
    sub: '지곡면 · 함양~거창 경계',
    lat: 35.566,
    lon: 127.774,
    nearestStnId: '14409',
    nearestStnLabel: '죽산천교(도) 102.9k',
    cctvs: [
      { name: '우명교', distKm: 2.68, note: '지곡면 최인접' },
      { name: '원평교', distKm: 3.04, note: '인근 교량' },
      { name: '죽산천교1', distKm: 5.32, note: '결빙취약 관측소' }
    ]
  },
  {
    id: 'place-geochang-south',
    kind: 'place',
    name: '거창군남부',
    sub: '남상면 · 남상졸음 구간',
    lat: 35.644,
    lon: 127.910,
    nearestStnId: '14207',
    nearestStnLabel: '남상졸음(도) 115.3k',
    cctvs: [
      { name: '무촌2교', distKm: 0.56, note: '남상면 최인접' },
      { name: '송변교', distKm: 1.42, note: '인근 교량' },
      { name: '오계교', distKm: 1.54, note: '남상졸음 인근' }
    ]
  },
  {
    id: 'place-hapcheon-nw',
    kind: 'place',
    name: '합천군서북부',
    sub: '야로면 · 해인사·야로 구간',
    lat: 35.706,
    lon: 128.168,
    nearestStnId: '14208',
    nearestStnLabel: '거창휴(도) 134.1k',
    cctvs: [
      { name: '야로대교1', distKm: 1.46, note: '야로면 최인접' },
      { name: '야로대교2', distKm: 1.46, note: '야로대교 반대편' },
      { name: '해인사', distKm: 4.10, note: '해인사IC 부근' }
    ]
  },
  {
    id: 'place-goryeong',
    kind: 'place',
    name: '고령군',
    sub: '대가야읍 · 고령IC·양전 구간',
    lat: 35.728,
    lon: 128.263,
    nearestStnId: '14209',
    nearestStnLabel: '양전교(도) 158.2k',
    cctvs: [
      { name: '안림천교', distKm: 2.29, note: '대가야읍 최인접' },
      { name: '회천대교', distKm: 2.74, note: '고령 교량 구간' },
      { name: '양전교', distKm: 3.16, note: '양전교 관측소' }
    ]
  },
  {
    id: 'place-namwon',
    kind: 'place',
    name: '남원',
    sub: '남원시청 · 서부 시점 구간',
    lat: 35.416,
    lon: 127.390,
    nearestStnId: '14205',
    nearestStnLabel: '남원주차장(도) 50.8k',
    cctvs: [
      { name: '남원', distKm: 1.59, note: '남원IC 최인접' },
      { name: '산곡', distKm: 1.79, note: '인근 본선' },
      { name: '남원휴게소', distKm: 4.03, note: '관측소 인접' }
    ]
  },
  {
    id: 'place-hamyang',
    kind: 'place',
    name: '함양',
    sub: '함양읍 · 함양IC·분기점 구간',
    lat: 35.520,
    lon: 127.725,
    nearestStnId: '14206',
    nearestStnLabel: '함양(도) 95.0k',
    cctvs: [
      { name: '교산', distKm: 1.80, note: '함양읍 최인접' },
      { name: '두산', distKm: 2.24, note: '인근 본선' },
      { name: '함양', distKm: 2.63, note: '함양 관측소' }
    ]
  },
  {
    id: 'place-geochang',
    kind: 'place',
    name: '거창',
    sub: '거창읍 · 거창IC 구간',
    lat: 35.687,
    lon: 127.910,
    nearestStnId: '14207',
    nearestStnLabel: '남상졸음(도) 115.3k',
    cctvs: [
      { name: '정장교', distKm: 2.29, note: '거창읍 최인접' },
      { name: '거창', distKm: 2.44, note: '거창IC 부근' },
      { name: '무촌2교', distKm: 4.50, note: '남상 방면 본선' }
    ]
  }
];

// 11개 도로기상관측소 (고속국도 12호선 광주대구선 · 이정순) + 공식 로드플러스 최인접 CCTV 매칭
const ROAD_STATIONS = [
  {
    id: 'stn-14205',
    kind: 'station',
    stnId: '14205',
    name: '남원주차장(도)',
    stationType: '기본',
    km: 50.8,
    lat: 35.4162,
    lon: 127.3446,
    cctvs: [
      { name: '남원휴게소', distKm: 0.13, note: '관측소 바로 앞' },
      { name: '생태터널', distKm: 1.60, note: '대구방향 인접' },
      { name: '남원', distKm: 4.55, note: '남원IC 부근' }
    ]
  },
  {
    id: 'stn-14407',
    kind: 'station',
    stnId: '14407',
    name: '번암교(도)',
    stationType: '목표(결빙)',
    km: 72.9,
    lat: 35.4748,
    lon: 127.5443,
    cctvs: [
      { name: '번암교', distKm: 0.04, note: '결빙취약 교량 직결' },
      { name: '번암1터널', distKm: 1.68, note: '인접 터널 입출구' },
      { name: '지리산휴게소', distKm: 2.40, note: '인근 거점' }
    ]
  },
  {
    id: 'stn-14102',
    kind: 'station',
    stnId: '14102',
    name: '지리산휴(도)',
    stationType: '거점',
    km: 75.4,
    lat: 35.4826,
    lon: 127.5692,
    cctvs: [
      { name: '지리산휴게소', distKm: 0.50, note: '거점 휴게소 본선' },
      { name: '당동', distKm: 0.41, note: '최인접 본선' },
      { name: '번암교', distKm: 2.42, note: '결빙취약 교량' }
    ]
  },
  {
    id: 'stn-14408',
    kind: 'station',
    stnId: '14408',
    name: '옥계1교(도)',
    stationType: '목표(결빙)',
    km: 86.2,
    lat: 35.5384,
    lon: 127.6553,
    cctvs: [
      { name: '옥계1교', distKm: 0.04, note: '결빙취약 교량 직결' },
      { name: '백전교', distKm: 1.42, note: '인접 교량' }
    ]
  },
  {
    id: 'stn-14206',
    kind: 'station',
    stnId: '14206',
    name: '함양(도)',
    stationType: '기본',
    km: 95.0,
    lat: 35.5327,
    lon: 127.7495,
    cctvs: [
      { name: '함양', distKm: 0.08, note: '관측소 바로 앞' },
      { name: '두산', distKm: 0.09, note: '인접 본선' },
      { name: '교산', distKm: 2.15, note: '함양읍 방면' }
    ]
  },
  {
    id: 'stn-14409',
    kind: 'station',
    stnId: '14409',
    name: '죽산천교(도)',
    stationType: '목표(결빙)',
    km: 102.9,
    lat: 35.5486,
    lon: 127.8289,
    cctvs: [
      { name: '죽산천교1', distKm: 0.13, note: '결빙취약 교량 직결' },
      { name: '죽산교', distKm: 0.80, note: '인접 교량' }
    ]
  },
  {
    id: 'stn-14207',
    kind: 'station',
    stnId: '14207',
    name: '남상졸음(도)',
    stationType: '기본',
    km: 115.3,
    lat: 35.6366,
    lon: 127.9066,
    cctvs: [
      { name: '오계교', distKm: 0.75, note: '남상졸음 최인접' },
      { name: '무촌2교', distKm: 1.00, note: '남상면 방면' }
    ]
  },
  {
    id: 'stn-14208',
    kind: 'station',
    stnId: '14208',
    name: '거창휴(도)',
    stationType: '기본',
    km: 134.1,
    lat: 35.7074,
    lon: 128.0541,
    cctvs: [
      { name: '거창휴게소', distKm: 0.19, note: '관측소 바로 앞' },
      { name: '가조터널(외부대구)', distKm: 0.90, note: '터널 입출구 결빙 감시' }
    ]
  },
  {
    id: 'stn-14209',
    kind: 'station',
    stnId: '14209',
    name: '양전교(도)',
    stationType: '기본',
    km: 158.2,
    lat: 35.7247,
    lon: 128.2979,
    cctvs: [
      { name: '양전교', distKm: 0.32, note: '관측소 바로 앞' },
      { name: '양전리2', distKm: 0.63, note: '인접 본선' },
      { name: '안림천교', distKm: 3.15, note: '고령 방면' }
    ]
  },
  {
    id: 'stn-14103',
    kind: 'station',
    stnId: '14103',
    name: '논공휴(도)',
    stationType: '거점',
    km: 169.2,
    lat: 35.7653,
    lon: 128.4015,
    cctvs: [
      { name: '논공휴게소', distKm: 0.16, note: '거점 휴게소 직결' },
      { name: '논공휴게소2', distKm: 0.30, note: '휴게소 진출입로' }
    ]
  },
  {
    id: 'stn-14410',
    kind: 'station',
    stnId: '14410',
    name: '논공교(도)',
    stationType: '목표(결빙)',
    km: 171.3,
    lat: 35.7681,
    lon: 128.4230,
    cctvs: [
      { name: '논공교2', distKm: 0.30, note: '결빙취약 교량 직결' },
      { name: '논공교3', distKm: 0.50, note: '인접 교량 구간' },
      { name: '논공휴게소', distKm: 1.96, note: '거점 관측소 인접' }
    ]
  }
];

const ALL_ITEMS = [...WATCHED_PLACES, ...ROAD_STATIONS];

const state = {
  tab: 'places',
  query: '',
  selectedId: WATCHED_PLACES[0].id,
  wide: false,
  dark: false,
  roadObsByStnId: new Map(),
  obsUpdatedAt: null
};

const els = {
  layout: document.getElementById('cctvLayout'),
  tabs: Array.from(document.querySelectorAll('.cctv-tab')),
  search: document.getElementById('pointSearch'),
  clearSearch: document.getElementById('btnClearSearch'),
  list: document.getElementById('pointList'),
  targetTitle: document.getElementById('targetTitle'),
  targetMeta: document.getElementById('targetMeta'),
  targetChips: document.getElementById('targetCctvChips'),
  copyFeedback: document.getElementById('copyFeedback'),
  btnCopyPrimary: document.getElementById('btnCopyPrimary'),
  btnOpenRoadplus: document.getElementById('btnOpenRoadplus'),
  btnOpenKakao: document.getElementById('btnOpenKakao'),
  btnReloadViewer: document.getElementById('btnReloadViewer'),
  btnExpandViewer: document.getElementById('btnExpandViewer'),
  btnDarkToggle: document.getElementById('btnDarkToggle'),
  iframe: document.getElementById('roadplusFrame'),
  liveStatus: document.getElementById('liveRoadStatus'),
  toast: document.getElementById('cctvToast')
};

let toastTimer = null;
let feedbackTimer = null;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function showInlineFeedback(msg) {
  els.copyFeedback.textContent = msg;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    els.copyFeedback.textContent = '';
  }, 3200);
}

async function copyText(text, labelPrefix = '') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showInlineFeedback(`✓ '${text}' 복사됨`);
    showToast(`📋 ${labelPrefix}'${text}' 복사 완료 — 로드플러스 [CCTV검색]에 붙여넣기하세요`);
    return true;
  } catch {
    showInlineFeedback(`검색어: ${text}`);
    showToast(`검색어 '${text}'를 로드플러스 [CCTV검색]에 입력해 주세요`);
    return false;
  }
}

function getTagInfo(item) {
  if (item.kind === 'place') return { cls: 'place', text: '관심지역' };
  if (item.stationType.includes('결빙')) return { cls: 'ice', text: '목표(결빙)' };
  if (item.stationType === '거점') return { cls: 'hub', text: '거점' };
  return { cls: 'base', text: '기본' };
}

function getLiveObsForItem(item) {
  const stnId = item.kind === 'station' ? item.stnId : item.nearestStnId;
  return stnId ? state.roadObsByStnId.get(stnId) || null : null;
}

function formatObsBadge(obs) {
  if (!obs) return '';
  const parts = [];
  if (Number.isFinite(obs.roadTemp)) parts.push(`노면 ${obs.roadTemp.toFixed(1)}°C`);
  if (Number.isFinite(obs.temp)) parts.push(`기온 ${obs.temp.toFixed(1)}°C`);
  if (obs.surfaceState && obs.surfaceState !== '관측중') parts.push(obs.surfaceState);
  if (!parts.length) return '';
  const isCold = (Number.isFinite(obs.roadTemp) && obs.roadTemp <= 1.5) || (Number.isFinite(obs.temp) && obs.temp <= 1.0);
  return `<span class="cctv-live-chip${isCold ? ' cold' : ''}">${isCold ? '❄️ ' : '🌡️ '}${esc(parts.join(' · '))}</span>`;
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = [
    item.name,
    item.sub || '',
    item.stnId || '',
    item.km != null ? `${item.km}k` : '',
    item.stationType || '',
    item.nearestStnLabel || '',
    ...item.cctvs.map(c => c.name)
  ].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function getVisibleItems() {
  const q = state.query.trim();
  const base = state.tab === 'places'
    ? WATCHED_PLACES
    : state.tab === 'stations'
      ? ROAD_STATIONS
      : ALL_ITEMS;
  return base.filter(item => matchesQuery(item, q));
}

function renderCardHtml(item) {
  const active = item.id === state.selectedId;
  const tag = getTagInfo(item);
  const primary = item.cctvs[0];
  const obs = getLiveObsForItem(item);
  const subtitle = item.kind === 'station'
    ? `${item.km.toFixed(1)}k · 관측소 ${item.stnId}`
    : `${item.sub}`;
  return `
    <button type="button" class="cctv-item${active ? ' is-active' : ''}" data-id="${esc(item.id)}" role="option" aria-selected="${active ? 'true' : 'false'}">
      <div class="cctv-item-top">
        <span class="cctv-item-name">
          <span>${esc(item.name)}</span>
          <span class="cctv-item-sub">${esc(subtitle)}</span>
        </span>
        <span class="cctv-tag ${tag.cls}">${esc(tag.text)}</span>
      </div>
      <div class="cctv-item-meta">
        <span class="cctv-match-pill">📹 ${esc(primary.name)} <span class="cctv-dist">${primary.distKm.toFixed(2)}km</span></span>
        ${formatObsBadge(obs)}
      </div>
    </button>
  `;
}

function renderList() {
  const items = getVisibleItems();
  if (!items.length) {
    els.list.innerHTML = `<div class="cctv-empty">검색 조건과 일치하는 지점이 없습니다.</div>`;
    return;
  }

  if (state.tab === 'all') {
    const places = items.filter(i => i.kind === 'place');
    const stations = items.filter(i => i.kind === 'station');
    let html = '';
    if (places.length) {
      html += `<div class="cctv-group-heading"><span>📍 광주대구선 관심지역</span><span>${places.length}개소</span></div>`;
      html += places.map(renderCardHtml).join('');
    }
    if (stations.length) {
      html += `<div class="cctv-group-heading" style="margin-top:6px;"><span>🛣️ 도로기상관측소 (이정순)</span><span>${stations.length}개소</span></div>`;
      html += stations.map(renderCardHtml).join('');
    }
    els.list.innerHTML = html;
  } else {
    els.list.innerHTML = items.map(renderCardHtml).join('');
  }
}

function renderTarget() {
  const item = ALL_ITEMS.find(i => i.id === state.selectedId) || WATCHED_PLACES[0];
  const tag = getTagInfo(item);
  const primary = item.cctvs[0];
  const obs = getLiveObsForItem(item);

  els.targetTitle.innerHTML = `
    <span>${esc(item.name)}</span>
    <span class="cctv-tag ${tag.cls}">${esc(tag.text)}</span>
    ${item.kind === 'station' ? `<span class="cctv-item-sub">고속국도 12호선 ${item.km.toFixed(1)}k</span>` : `<span class="cctv-item-sub">${esc(item.sub)}</span>`}
  `;

  const metaParts = [
    `좌표 ${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`
  ];
  if (item.kind === 'place' && item.nearestStnLabel) {
    metaParts.push(`인근 관측소: ${item.nearestStnLabel}`);
  }
  if (item.kind === 'station') {
    metaParts.push(`관측소 코드: ${item.stnId}`);
  }
  if (obs) {
    const obsSummary = [];
    if (Number.isFinite(obs.roadTemp)) obsSummary.push(`노면 ${obs.roadTemp.toFixed(1)}°C`);
    if (Number.isFinite(obs.temp)) obsSummary.push(`기온 ${obs.temp.toFixed(1)}°C`);
    if (obs.surfaceState && obs.surfaceState !== '관측중') obsSummary.push(obs.surfaceState);
    if (obsSummary.length) metaParts.push(`실시간 ${obsSummary.join(' · ')}`);
  }
  els.targetMeta.textContent = metaParts.join(' · ');

  // Primary copy button & external links
  els.btnCopyPrimary.textContent = `📋 '${primary.name}' 복사`;
  els.btnOpenRoadplus.href = ROADPLUS_URL;
  els.btnOpenKakao.href = `https://map.kakao.com/link/map/${encodeURIComponent(`광주대구선 ${item.name}`)},${item.lat},${item.lon}`;

  // CCTV quick-copy chips
  const chipsHtml = item.cctvs.map((c, idx) => `
    <button type="button" class="cctv-copy-chip${idx === 0 ? ' primary' : ''}" data-copy="${esc(c.name)}" title="${esc(c.note)} — 클릭 시 클립보드 복사">
      <span>${idx === 0 ? '📹' : '🎥'} ${esc(c.name)}</span>
      <span style="font-size:11px;opacity:.75;">${c.distKm.toFixed(2)}km</span>
    </button>
  `).join('') + `
    <button type="button" class="cctv-copy-chip" data-copy="광주대구" title="노선 전체 CCTV 검색어 복사">
      <span>🛣️ 광주대구 (전체)</span>
    </button>
  `;
  els.targetChips.innerHTML = chipsHtml;
}

function selectItem(id, shouldCopy = true) {
  const item = ALL_ITEMS.find(i => i.id === id);
  if (!item) return;
  state.selectedId = item.id;
  renderList();
  renderTarget();
  if (shouldCopy) {
    copyText(item.cctvs[0].name, `${item.name} 최인접 CCTV `);
  }
}

function setTab(tabName) {
  state.tab = tabName;
  els.tabs.forEach(btn => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tabName ? 'true' : 'false');
  });
  const visible = getVisibleItems();
  if (visible.length && !visible.some(i => i.id === state.selectedId)) {
    state.selectedId = visible[0].id;
    renderTarget();
  }
  renderList();
}

function applyDarkMode(on) {
  state.dark = Boolean(on);
  document.body.classList.toggle('dark-mode', state.dark);
  els.btnDarkToggle.setAttribute('aria-pressed', state.dark ? 'true' : 'false');
  els.btnDarkToggle.textContent = state.dark ? '☀️ 주간' : '🌙 야간';
}

async function loadOptionalRoadObs() {
  try {
    const res = await fetch('./api/road-obs?line=14', { signal: AbortSignal.timeout(5500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const stations = Array.isArray(data) ? data : (Array.isArray(data?.stations) ? data.stations : []);
    if (!stations.length) throw new Error('empty');
    state.roadObsByStnId.clear();
    for (const s of stations) {
      if (s && s.stnId) state.roadObsByStnId.set(String(s.stnId), s);
    }
    state.obsUpdatedAt = data?.updatedAt || new Date().toISOString();
    els.liveStatus.textContent = `📡 실시간 노면관측 ${state.roadObsByStnId.size}개소 연동`;
    els.liveStatus.classList.add('live');
    renderList();
    renderTarget();
  } catch {
    els.liveStatus.textContent = '✅ 정적 바로가기 모드 · 자원 소모 0';
  }
}

// Event bindings
els.tabs.forEach(btn => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  els.clearSearch.hidden = !state.query;
  renderList();
});

els.clearSearch.addEventListener('click', () => {
  state.query = '';
  els.search.value = '';
  els.clearSearch.hidden = true;
  renderList();
  els.search.focus();
});

els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('.cctv-item');
  if (!btn) return;
  selectItem(btn.dataset.id, true);
});

els.targetChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.cctv-copy-chip');
  if (!chip) return;
  copyText(chip.dataset.copy, 'CCTV 검색어 ');
});

els.btnCopyPrimary.addEventListener('click', () => {
  const item = ALL_ITEMS.find(i => i.id === state.selectedId) || WATCHED_PLACES[0];
  copyText(item.cctvs[0].name, `${item.name} 최인접 CCTV `);
});

els.btnReloadViewer.addEventListener('click', () => {
  els.iframe.src = ROADPLUS_URL;
  showToast('↻ 로드플러스 웹뷰어를 새로고침했습니다');
});

els.btnExpandViewer.addEventListener('click', () => {
  state.wide = !state.wide;
  els.layout.classList.toggle('is-wide', state.wide);
  els.btnExpandViewer.textContent = state.wide ? '⤡ 기본 크기' : '⤢ 크게 보기';
});

els.btnDarkToggle.addEventListener('click', () => {
  applyDarkMode(!state.dark);
});

// Initial render
applyDarkMode(false);
renderList();
renderTarget();
loadOptionalRoadObs();
