import { apiUrl } from './config.js';

import { cameraDirectory, cameraId } from './cctv-order.js';

export function mountCctv(root, query) {
  const request = new AbortController();
  const title = document.createElement('h2');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const picker = document.createElement('details');
  picker.className = 'camera-picker';
  const summary = document.createElement('summary');
  const list = document.createElement('div');
  list.className = 'camera-list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'CCTV 목록');
  picker.append(summary, list);
  const video = document.createElement('video');
  video.controls = video.muted = video.playsInline = video.autoplay = true;
  const link = document.createElement('a');
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '새 창에서 보기 ↗';
  const retry = document.createElement('button');
  retry.textContent = '다시 불러오기';
  title.textContent = '노면 살얼음 CCTV';
  const actions = document.createElement('div');
  actions.className = 'cctv-tools';
  actions.append(link, retry);
  root.replaceChildren(title, status, picker, video, actions);
  let hls;
  let entries = [];
  let selected = -1;

  function stop() {
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function play() {
    stop();
    const entry = entries[selected];
    if (!entry) return;
    const camera = entry.camera;
    summary.textContent = camera.name + ' · ' + entry.position;
    summary.setAttribute('aria-label', summary.textContent + ' · CCTV 전체 목록');
    for (const [index, row] of Array.from(list.children).entries()) {
      row.setAttribute('aria-pressed', String(index === selected));
    }
    picker.hidden = video.hidden = link.hidden = false;
    const url = new URL('cctv.html', location.href);
    url.searchParams.set('id', cameraId(camera));
    link.href = url.href;
    status.textContent = '';
    video.setAttribute('aria-label', summary.textContent + ' 영상');
    if (!camera.url) {
      video.hidden = true;
      status.textContent = '목록에 등록된 지점입니다. 현재 연결 가능한 영상이 없습니다.';
      return;
    }
    if (!/^https?:\/\//i.test(camera.url)) {
      status.textContent = '재생 가능한 영상 주소가 없습니다.';
      return;
    }
    if (/hls|m3u8/i.test(camera.format + ' ' + camera.url) && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls?.isSupported()) {
      hls = new window.Hls();
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) status.textContent = '영상 연결에 실패했습니다. 다시 불러오세요.';
      });
      hls.loadSource(camera.url);
      hls.attachMedia(video);
    } else {
      video.src = camera.url;
    }
  }

  async function load(refresh) {
    const previous = entries[selected]?.camera;
    picker.open = false;
    stop();
    retry.disabled = true;
    picker.hidden = video.hidden = link.hidden = true;
    status.textContent = 'CCTV 목록을 불러오는 중…';
    try {
      const endpoint = apiUrl('/api/cctv');
      const response = await fetch(endpoint + (refresh ? '?refresh=1' : ''), { signal: request.signal });
      if (!response.ok) throw new Error('CCTV 목록 조회 실패 (HTTP ' + response.status + ')');
      const payload = await response.json();
      entries = cameraDirectory(payload);
      let initial;
      if (query.has('id')) {
        const match = entries.find(e => cameraId(e.camera) === query.get('id')) || entries.find(e => e.record?.id === query.get('id'));
        if (!match) throw new Error('요청한 CCTV를 찾을 수 없습니다.');
        initial = match.camera;
        if (match.corridor) entries = entries.filter(e => e.corridor);
      } else if (query.has('site')) {
        const site = payload.sites?.find(s => s.id === query.get('site'));
        if (!site) throw new Error('요청한 지점을 찾을 수 없습니다.');
        entries = entries.filter(e => e.corridor);
        const available = new Set(entries.map(e => cameraId(e.camera)));
        initial = [site.nearest, ...(site.aux || [])].flatMap(e => e?.items || []).find(c => available.has(cameraId(c)));
        if (!initial) initial = entries.find(e => e.record?.name === site.nearest?.label)?.camera;
        if (!initial) throw new Error('이 지점에 연결된 CCTV가 없습니다.');
        title.textContent = site.name + ' · 노면 살얼음 CCTV';
      } else if (query.has('lat') && query.has('lon')) {
        const lat = Number(query.get('lat')), lon = Number(query.get('lon'));
        const distance = c => (c.y - lat) ** 2 + ((c.x - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
        initial = entries.map(e => e.camera).filter(c => Number.isFinite(c.y) && Number.isFinite(c.x))
          .sort((a, b) => distance(a) - distance(b))[0];
        title.textContent = '가까운 CCTV';
      } else {
        entries = entries.filter(e => e.corridor);
      }
      if (!entries.length) throw new Error('연결된 CCTV가 없습니다.');
      if (!video.canPlayType('application/vnd.apple.mpegurl')) await import('./vendor/hls.min.js');
      if (request.signal.aborted) return;
      const indexOf = c => c ? entries.findIndex(e => cameraId(e.camera) === cameraId(c)) : -1;
      selected = indexOf(previous);
      if (selected < 0) selected = indexOf(initial);
      if (selected < 0) selected = Math.max(0, entries.findIndex(e => e.camera.url));
      list.replaceChildren(...entries.map((entry, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        const mark = document.createElement('small');
        const directions = entry.record ? entry.record.directions + ' 등록' : '';
        mark.textContent = [directions, entry.position, entry.camera.url ? '' : '영상 미연결'].filter(Boolean).join(' · ');
        if (entry.record?.name === '야로대교1') row.title = '시설 등록 144.58k · 영상 자막 144.4k';
        row.append(document.createTextNode(entry.camera.name), mark);
        row.onclick = () => {
          picker.open = false;
          if (index !== selected) { selected = index; play(); }
          summary.focus({ preventScroll: true });
        };
        return row;
      }));
      play();
    } catch (err) {
      if (!request.signal.aborted) status.textContent = err.message;
    } finally {
      retry.disabled = false;
    }
  }
  video.onerror = () => { if (video.error) status.textContent = '영상을 재생할 수 없습니다. 다시 불러오세요.'; };
  picker.ontoggle = () => {
    if (!picker.open) return;
    const row = list.children[selected];
    if (row) {
      list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
      row.focus({ preventScroll: true });
    }
  };
  picker.onkeydown = event => {
    if (!picker.open) return;
    if (event.key === 'Escape') {
      picker.open = false;
      summary.focus();
    } else if (event.target.matches('button')) {
      const next = { ArrowDown: event.target.nextElementSibling, ArrowUp: event.target.previousElementSibling,
        Home: list.firstElementChild, End: list.lastElementChild }[event.key];
      if (next) { event.preventDefault(); next.focus(); }
    }
  };
  retry.onclick = () => load(true);
  load(false);
  return () => { request.abort(); stop(); root.replaceChildren(); };
}

const standalone = document.querySelector('#standaloneCctv');
if (standalone) mountCctv(standalone, new URLSearchParams(location.search));
