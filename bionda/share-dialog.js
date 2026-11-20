// The PNG is ready before a copy/share gesture (required by mobile Web Share and Clipboard).
let dialog;
let previewUrl;
let currentFile;
let revision = 0;

function createDialog() {
  const panel = document.createElement('dialog');
  panel.className = 'png-share';
  panel.setAttribute('aria-labelledby', 'pngShareTitle');
  panel.innerHTML = `<header><h2 id="pngShareTitle"></h2><button type="button" data-close aria-label="닫기">×</button></header>
    <div class="png-preview"><img alt="공유할 브리핑 미리보기" hidden></div>
    <p role="status" aria-live="polite"></p>
    <div class="png-actions"><a download>PNG 저장</a><button type="button" data-copy>복사</button><button type="button" data-share>기기 공유</button></div>`;
  document.body.appendChild(panel);
  const select = selector => panel.querySelector(selector);
  const status = text => { select('p').textContent = text; };
  select('[data-close]').onclick = () => panel.close();
  panel.addEventListener('close', () => {
    if (panel.open) return;
    revision++;
    currentFile = null;
    select('img').removeAttribute('src');
    select('a').removeAttribute('href');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  });
  select('[data-copy]').onclick = async () => {
    const file = currentFile;
    if (!file) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
      if (file === currentFile) status('이미지를 복사했습니다.');
    } catch {
      if (file === currentFile) status('복사할 수 없습니다. PNG 저장을 이용하세요.');
    }
  };
  select('[data-share]').onclick = async () => {
    const file = currentFile;
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== 'AbortError' && file === currentFile) status('기기 공유를 열 수 없습니다. PNG 저장을 이용하세요.');
    }
  };
  return panel;
}

async function compactPng(canvas) {
  // The reports contain text and flat fills. Reduce imperceptible shade variations before
  // scaling so letter edges and table columns can retain their original resolution.
  let image = canvas;
  for (;;) {
    const ctx = image.getContext('2d');
    const pixels = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[i + channel] = Math.round(pixels.data[i + channel] / 17) * 17;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => image.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 생성 실패');
    if (blob.size <= 200 * 1024) return blob;
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.floor(image.width * 0.85));
    smaller.height = Math.round(canvas.height * smaller.width / canvas.width);
    const scaled = smaller.getContext('2d');
    scaled.imageSmoothingQuality = 'high';
    scaled.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    image = smaller;
  }
}

export async function openPngShare(title, render) {
  dialog ??= createDialog();
  if (dialog.open) return;
  const version = ++revision;
  const img = dialog.querySelector('img');
  const status = dialog.querySelector('p');
  const save = dialog.querySelector('a');
  const copy = dialog.querySelector('[data-copy]');
  const share = dialog.querySelector('[data-share]');
  dialog.querySelector('h2').textContent = title;
  copy.hidden = !window.ClipboardItem || !navigator.clipboard?.write;
  share.hidden = !navigator.canShare || !navigator.share;
  currentFile = null;
  save.removeAttribute('href');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  copy.disabled = share.disabled = true;
  img.hidden = true;
  status.textContent = '이미지를 만드는 중…';
  dialog.showModal();
  try {
    await document.fonts.ready;
    const blob = await compactPng(await render());
    if (revision !== version || !dialog.open) return;
    currentFile = new File([blob], title + '.png', { type: 'image/png' });
    previewUrl = URL.createObjectURL(blob);
    img.src = save.href = previewUrl;
    save.download = currentFile.name;
    img.hidden = false;
    copy.disabled = share.disabled = false;
    share.hidden = !navigator.canShare?.({ files: [currentFile] });
    status.textContent = `PNG · ${Math.ceil(blob.size / 1024)} KB`;
  } catch (err) {
    if (version === revision) status.textContent = err.message || '이미지를 만들 수 없습니다.';
  }
}
