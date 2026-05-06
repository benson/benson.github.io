export function writeAddPreviewElements({
  model,
  imgEl,
  nameEl,
  metaEl,
  existingEl = null,
  flipBtn = null,
  existingText = '',
} = {}) {
  const preview = model || {};
  const imageUrl = preview.imageUrl || '';
  const backUrl = preview.backUrl || '';
  const name = preview.name || '';

  if (imgEl) {
    imgEl.src = imageUrl;
    imgEl.alt = name;
    imgEl.style.cursor = imageUrl ? 'zoom-in' : '';
    imgEl.dataset.front = imageUrl;
    imgEl.dataset.back = backUrl;
    imgEl.dataset.current = 'front';
  }
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = preview.meta || '';
  if (flipBtn) flipBtn.classList.toggle('hidden', !backUrl);
  if (existingEl) {
    if (existingText) {
      existingEl.textContent = existingText;
      existingEl.classList.remove('hidden');
    } else {
      existingEl.textContent = '';
      existingEl.classList.add('hidden');
    }
  }
}

export function createAddPreviewElement({
  documentObj = document,
  model,
  existingText = '',
  extraClass = '',
} = {}) {
  const root = documentObj.createElement('div');
  root.className = ['add-preview', 'active', extraClass].filter(Boolean).join(' ');

  const imageWrap = documentObj.createElement('div');
  imageWrap.className = 'add-preview-img-wrap';
  const img = documentObj.createElement('img');
  img.className = 'add-preview-img';
  imageWrap.appendChild(img);

  const info = documentObj.createElement('div');
  info.className = 'add-preview-info';
  const name = documentObj.createElement('div');
  name.className = 'add-preview-name';
  const meta = documentObj.createElement('div');
  meta.className = 'add-preview-meta';
  const existing = documentObj.createElement('div');
  existing.className = 'add-preview-existing hidden';
  info.append(name, meta, existing);

  root.append(imageWrap, info);
  writeAddPreviewElements({ model, imgEl: img, nameEl: name, metaEl: meta, existingEl: existing, existingText });
  return root;
}
