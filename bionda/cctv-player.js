import { apiUrl } from './config.js';
import { ROUTE12_PLACE_KM } from './route12.js';
import { cameraDirectory, cameraId } from './cctv-order.js';

export function mountCctv(root, query, title) {
  const request = new AbortController();
  const previousTitle = title.textContent;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const picker = document.createElement('details');
  picker.className = 'camera-picker';
  const summary = document.createElement('summary');
  const name = document.createElement('strong');
  const mileage = document.createElement('span');
  mileage.className = 'camera-mileage';
  summary.append(name, mileage);
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
  retry.textContent = '↻ 새로고침';
  title.textContent = '노면 살얼음 CCTV';
  const actions = document.createElement('div');
  actions.className = 'cctv-tools';
  actions.append(link, retry);
  root.replaceChildren(status, picker, video, actions);
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
    name.textContent = entry.displayName;
    mileage.textContent = entry.position;
    const label = entry.displayName + ' · ' + entry.position;
    summary.setAttribute('aria-label', label + ' · CCTV 전체 목록');
    for (const [index, row] of Array.from(list.children).entries()) {
      row.setAttribute('aria-pressed', String(index === selected));
    }
    picker.hidden = video.hidden = link.hidden = false;
    const url = new URL('cctv.html', location.href);
    url.searchParams.set('id', cameraId(camera));
    link.href = url.href;
    status.textContent = '';
    video.setAttribute('aria-label', label + ' 영상');
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
      if (request.signal.aborted) return;
      entries = cameraDirectory(payload);
      let initial;
      if (query.has('id')) {
        const match = entries.find(e => cameraId(e.camera) === query.get('id')) || entries.find(e => e.record?.id === query.get('id'));
        if (!match) throw new Error('요청한 CCTV를 찾을 수 없습니다.');
        initial = match.camera;
      } else if (query.has('site')) {
        const site = payload.sites?.find(s => s.id === query.get('site'));
        if (!site) throw new Error('요청한 지점을 찾을 수 없습니다.');
        const available = new Set(entries.map(e => cameraId(e.camera)));
        initial = [site.nearest, ...(site.aux || [])].flatMap(e => e?.items || []).find(c => available.has(cameraId(c)));
        if (!initial) initial = entries.find(e => e.record?.name === site.nearest?.label)?.camera;
        title.textContent = site.name + ' · 노면 살얼음 CCTV';
        if (!initial && entries.length) {
          const siteKm = site.group === 'observatory' ? parseFloat(site.sub) : ROUTE12_PLACE_KM[site.name];
          if (Number.isFinite(siteKm)) {
            const nearest = entries.reduce((best, e) => Math.abs(e.km - siteKm) < Math.abs(best.km - siteKm) ? e : best);
            initial = nearest.camera;
          }
          title.textContent = '노선 CCTV';
        }
      } else if (query.has('lat') && query.has('lon')) {
        const lat = Number(query.get('lat')), lon = Number(query.get('lon'));
        const distance = c => (c.y - lat) ** 2 + ((c.x - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
        initial = entries.map(e => e.camera).filter(c => Number.isFinite(c.y) && Number.isFinite(c.x))
          .sort((a, b) => distance(a) - distance(b))[0];
        title.textContent = '가까운 CCTV';
      }
      if (!entries.length) throw new Error('연결된 CCTV가 없습니다.');
      if (!video.canPlayType('application/vnd.apple.mpegurl')) await import('./vendor/hls.min.js');
      if (request.signal.aborted) return;
      const indexOf = c => c ? entries.findIndex(e => cameraId(e.camera) === cameraId(c)) : -1;
      selected = indexOf(previous);
      if (selected < 0) selected = indexOf(initial);
      if (selected < 0) selected = 0;
      list.replaceChildren(...entries.map((entry, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        const mark = document.createElement('small');
        mark.className = 'camera-mileage';
        mark.textContent = entry.position;
        row.append(document.createTextNode(entry.displayName), mark);
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
  return () => { request.abort(); stop(); root.replaceChildren(); title.textContent = previousTitle; };
}

const standalone = document.querySelector('#standaloneCctv');
if (standalone) mountCctv(standalone, new URLSearchParams(location.search), document.querySelector('#cameraPageTitle'));
