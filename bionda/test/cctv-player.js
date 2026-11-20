import { apiUrl } from './config.js';

// Both the map panel and the standalone page consume the same /api/cctv response.
function cameraId(camera) {
  return String(camera.id || [camera.name, camera.y, camera.x].join('|'));
}

function cameraTitle(camera) {
  // The 광주대구선 야로대교1 video overlay identifies the camera at 144.4 km.
  const label = camera.name.trim();
  if (/^(?:\[광주대구선\]\s*)?야로대교1$/.test(label)) return label + ' · 144.4k';
  return label;
}

export function mountCctv(root, query) {
  const request = new AbortController();
  const title = document.createElement('h2');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'CCTV 선택');
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
  root.replaceChildren(title, status, select, video, actions);
  let hls;
  let cameras = [];

  function stop() {
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  function play() {
    stop();
    const camera = cameras[select.selectedIndex];
    if (!camera) return;
    select.hidden = video.hidden = link.hidden = false;
    const url = new URL('cctv.html', location.href);
    url.searchParams.set('id', cameraId(camera));
    link.href = url.href;
    status.textContent = '';
    video.setAttribute('aria-label', cameraTitle(camera) + ' 영상');
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
    const previousId = select.value;
    stop();
    retry.disabled = true;
    select.hidden = video.hidden = link.hidden = true;
    status.textContent = 'CCTV 목록을 불러오는 중…';
    try {
      const endpoint = apiUrl('/api/cctv');
      const response = await fetch(endpoint + (refresh ? '?refresh=1' : ''), { signal: request.signal });
      if (!response.ok) throw new Error('CCTV 목록 조회 실패 (HTTP ' + response.status + ')');
      const payload = await response.json();
      cameras = payload.cctvs || [];
      if (query.has('id')) {
        cameras = cameras.filter(c => cameraId(c) === query.get('id'));
      } else if (query.has('site')) {
        const site = payload.sites?.find(s => s.id === query.get('site'));
        cameras = [site?.nearest, ...(site?.aux || [])].flatMap(entry => entry?.items || []);
        cameras = [...new Map(cameras.map(c => [c.url, c])).values()];
        if (site) title.textContent = site.name + ' · 노면 살얼음 CCTV';
      } else if (query.has('lat') && query.has('lon')) {
        const lat = Number(query.get('lat'));
        const lon = Number(query.get('lon'));
        const distance = c => (c.y - lat) ** 2 + ((c.x - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
        cameras = cameras.filter(c => Number.isFinite(c.y) && Number.isFinite(c.x)).sort((a, b) => distance(a) - distance(b));
        title.textContent = '가까운 광주대구선 CCTV';
      }
      if (!cameras.length) throw new Error('이 위치에 연결된 CCTV가 없습니다.');
      if (!video.canPlayType('application/vnd.apple.mpegurl')) await import('./vendor/hls.min.js');
      if (request.signal.aborted) return;
      select.replaceChildren(...cameras.map(c => new Option(cameraTitle(c), cameraId(c))));
      select.selectedIndex = Math.max(0, cameras.findIndex(camera => cameraId(camera) === previousId));
      play();
    } catch (err) {
      if (!request.signal.aborted) status.textContent = err.message;
    } finally {
      retry.disabled = false;
    }
  }
  video.onerror = () => { if (video.error) status.textContent = '영상을 재생할 수 없습니다. 다시 불러오세요.'; };
  select.onchange = play;
  retry.onclick = () => load(true);
  load(false);
  return () => { request.abort(); stop(); root.replaceChildren(); };
}

const standalone = document.querySelector('#standaloneCctv');
if (standalone) mountCctv(standalone, new URLSearchParams(location.search));
