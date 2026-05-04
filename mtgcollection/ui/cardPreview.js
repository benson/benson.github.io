import { biggerImageUrl } from '../collection.js';

let cardPreviewEl = null;
let cardPreviewImg = null;
let lightboxEl = null;
let lightboxImg = null;
let lightboxFlipBtn = null;
let lightboxFront = null;
let lightboxBack = null;
let lightboxShowingBack = false;
let pendingPreviewUrl = null;
let boundDocument = null;
let boundLightboxEl = null;
let boundFlipBtn = null;
const SCRYFALL_API = 'https://api.scryfall.com';
const previewLookupCache = new Map();

function getWindowFor(el) {
  return el?.ownerDocument?.defaultView || window;
}

export function showCardPreview(link) {
  if (!cardPreviewEl || !cardPreviewImg) return;
  const url = link.dataset.previewUrl;
  if (!url) {
    resolvePreviewUrl(link).then(resolved => {
      if (resolved && link.dataset.previewActive === 'true') showCardPreview(link);
    });
    return;
  }

  const win = getWindowFor(link);
  const rect = link.getBoundingClientRect();
  const previewWidth = 300;
  const previewHeight = 418;
  const padding = 20;
  const linkCenterX = rect.left + rect.width / 2;
  const windowCenterX = win.innerWidth / 2;

  let left = linkCenterX < windowCenterX
    ? rect.right + padding
    : rect.left - previewWidth - padding;
  let top = rect.top - previewHeight / 2 + rect.height / 2;

  top = Math.max(padding, Math.min(top, win.innerHeight - previewHeight - padding));
  left = Math.max(padding, Math.min(left, win.innerWidth - previewWidth - padding));

  cardPreviewEl.style.left = left + 'px';
  cardPreviewEl.style.top = top + 'px';
  cardPreviewEl.classList.add('visible');

  const finish = link.dataset.previewFinish || 'normal';
  cardPreviewEl.classList.toggle('is-foil', finish === 'foil');
  cardPreviewEl.classList.toggle('is-etched', finish === 'etched');

  pendingPreviewUrl = url;

  if (cardPreviewImg.src === url && cardPreviewImg.complete && cardPreviewImg.naturalWidth > 0) {
    cardPreviewImg.style.visibility = 'visible';
    return;
  }

  cardPreviewImg.style.visibility = 'hidden';
  cardPreviewImg.onload = () => {
    if (pendingPreviewUrl === url) cardPreviewImg.style.visibility = 'visible';
  };
  cardPreviewImg.src = url;
}

export function hideCardPreview() {
  if (!cardPreviewEl) return;
  cardPreviewEl.classList.remove('visible');
  pendingPreviewUrl = null;
}

function scryfallImageUrl(card) {
  if (!card) return '';
  if (card.image_uris) return card.image_uris.normal || card.image_uris.small || '';
  const face = Array.isArray(card.card_faces) ? card.card_faces[0] : null;
  return face?.image_uris?.normal || face?.image_uris?.small || '';
}

function previewLookupKey(link) {
  const id = String(link.dataset.previewId || '').trim();
  if (id) return 'id:' + id;
  const setCode = String(link.dataset.previewSet || '').trim().toLowerCase();
  const cn = String(link.dataset.previewCn || '').trim();
  const name = String(link.dataset.previewName || '').trim();
  if (setCode && cn) return 'printing:' + setCode + ':' + cn + ':' + name.toLowerCase();
  if (name) return 'name:' + name.toLowerCase();
  return '';
}

function previewLookupUrls(link) {
  const urls = [];
  const id = String(link.dataset.previewId || '').trim();
  const setCode = String(link.dataset.previewSet || '').trim().toLowerCase();
  const cn = String(link.dataset.previewCn || '').trim();
  const name = String(link.dataset.previewName || '').trim();
  if (id) urls.push(SCRYFALL_API + '/cards/' + encodeURIComponent(id));
  if (setCode && cn) urls.push(SCRYFALL_API + '/cards/' + encodeURIComponent(setCode) + '/' + encodeURIComponent(cn));
  if (name) urls.push(SCRYFALL_API + '/cards/named?exact=' + encodeURIComponent(name));
  return urls;
}

async function fetchPreviewUrl(link) {
  for (const url of previewLookupUrls(link)) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const imageUrl = scryfallImageUrl(data);
    if (imageUrl) return imageUrl;
  }
  return '';
}

async function resolvePreviewUrl(link) {
  if (link.dataset.previewUrl) return link.dataset.previewUrl;
  if (typeof fetch !== 'function') return '';
  const key = previewLookupKey(link);
  if (!key) return '';
  if (!previewLookupCache.has(key)) {
    previewLookupCache.set(key, fetchPreviewUrl(link).catch(() => ''));
  }
  const url = await previewLookupCache.get(key);
  if (url) link.dataset.previewUrl = url;
  return url;
}

export function showImageLightbox(frontUrl, backUrl) {
  if (!frontUrl || !lightboxEl || !lightboxImg || !lightboxFlipBtn) return;
  lightboxFront = frontUrl;
  lightboxBack = backUrl;
  lightboxShowingBack = false;
  lightboxImg.src = biggerImageUrl(frontUrl);
  lightboxImg.alt = '';
  lightboxFlipBtn.classList.toggle('hidden', !backUrl);
  lightboxFlipBtn.textContent = 'flip card';
  lightboxEl.classList.add('visible');
  lightboxEl.setAttribute('aria-hidden', 'false');
  hideCardPreview();
}

export function hideImageLightbox() {
  if (!lightboxEl || !lightboxImg) return;
  lightboxEl.classList.remove('visible');
  lightboxEl.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
}

export function isLightboxVisible() {
  return !!lightboxEl?.classList.contains('visible');
}

function flipImageLightbox() {
  if (!lightboxBack || !lightboxImg) return;
  lightboxShowingBack = !lightboxShowingBack;
  const url = lightboxShowingBack ? lightboxBack : lightboxFront;
  lightboxImg.src = biggerImageUrl(url);
}

function bindDocumentEvents(doc) {
  if (boundDocument === doc) return;
  doc.addEventListener('mouseover', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link) return;
    link.dataset.previewActive = 'true';
    showCardPreview(link);
  });

  doc.addEventListener('mouseout', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link || link.contains(e.relatedTarget)) return;
    delete link.dataset.previewActive;
    hideCardPreview();
  });
  boundDocument = doc;
}

function bindLightboxEvents() {
  if (lightboxEl && boundLightboxEl !== lightboxEl) {
    lightboxEl.addEventListener('click', e => {
      if (e.target.closest('.lightbox-flip')) return;
      hideImageLightbox();
    });
    boundLightboxEl = lightboxEl;
  }

  if (lightboxFlipBtn && boundFlipBtn !== lightboxFlipBtn) {
    lightboxFlipBtn.addEventListener('click', flipImageLightbox);
    boundFlipBtn = lightboxFlipBtn;
  }
}

export function initCardPreview(doc = document) {
  cardPreviewEl = doc.getElementById('cardPreview');
  cardPreviewImg = cardPreviewEl?.querySelector('img') || null;
  lightboxEl = doc.getElementById('imageLightbox');
  lightboxImg = doc.getElementById('imageLightboxImg');
  lightboxFlipBtn = doc.getElementById('lightboxFlip');

  if (!cardPreviewEl || !cardPreviewImg || !lightboxEl || !lightboxImg || !lightboxFlipBtn) {
    return false;
  }

  bindDocumentEvents(doc);
  bindLightboxEvents();
  return true;
}
