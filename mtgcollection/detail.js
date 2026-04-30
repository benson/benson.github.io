import { state } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  normalizeFinish,
  normalizeCondition,
  normalizeLanguage,
  normalizeLocation,
  normalizeTag,
  allCollectionTags,
} from './collection.js';
import { commitCollectionChange } from './persistence.js';
import { snapshotCollection } from './bulk.js';
import { hideCardPreview, showImageLightbox, hideImageLightbox, isLightboxVisible } from './view.js';
import { populateMultiselect } from './multiselect.js';

let drawerBackdrop;
let detailDrawer;
let detailForm;
let drawerTags = [];

// ---- Filters (set/location dropdown population) ----
export function populateFilters() {
  const sets = [...new Set(state.collection.map(c => c.setCode).filter(Boolean))].sort();
  populateMultiselect(document.getElementById('filterSet'),
    sets.map(s => ({ value: s, label: s.toUpperCase() })),
    { defaultLabel: 'all sets', noun: 'sets' });

  populateMultiselect(document.getElementById('filterRarity'),
    ['common', 'uncommon', 'rare', 'mythic'],
    { defaultLabel: 'all rarity', noun: 'rarity' });

  populateMultiselect(document.getElementById('filterFoil'),
    ['normal', 'foil', 'etched'],
    { defaultLabel: 'all finishes', noun: 'finishes' });

  const locations = [...new Set(state.collection.map(c => normalizeLocation(c.location)).filter(Boolean))].sort();
  populateMultiselect(document.getElementById('filterLocation'),
    locations,
    { defaultLabel: 'all locations', noun: 'locations' });
  document.getElementById('locationOptions').innerHTML =
    locations.map(l => '<option value="' + esc(l) + '"></option>').join('');

  const tags = allCollectionTags();
  populateMultiselect(document.getElementById('filterTag'),
    tags,
    { defaultLabel: 'filter by tag', noun: 'tags' });
}

// ---- Language options (drawer) ----
function collectionLanguages(extra = '') {
  const langs = new Set(['en']);
  state.collection.forEach(c => langs.add(normalizeLanguage(c.language)));
  if (extra) langs.add(normalizeLanguage(extra));
  return [...langs].filter(Boolean).sort((a, b) => {
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
  });
}

// ---- Tag chips (drawer) ----
function renderTagChips() {
  const wrap = document.getElementById('detailTagChips');
  wrap.innerHTML = drawerTags.map(t =>
    `<span class="tag-chip">${esc(t)}<button class="tag-chip-remove" type="button" data-tag="${esc(t)}" aria-label="remove ${esc(t)}">×</button></span>`
  ).join('');
  updateTagSuggestions();
}

function updateTagSuggestions() {
  const datalist = document.getElementById('detailTagSuggestions');
  const have = new Set(drawerTags);
  const options = allCollectionTags().filter(t => !have.has(t));
  datalist.innerHTML = options.map(t => `<option value="${esc(t)}"></option>`).join('');
}

function commitTagInput() {
  const input = document.getElementById('detailTagInput');
  const raw = input.value;
  if (!raw.trim()) { input.value = ''; return; }
  const t = normalizeTag(raw);
  if (t && !drawerTags.includes(t)) {
    drawerTags.push(t);
    renderTagChips();
  }
  input.value = '';
}

function renderLanguageOptions(selected) {
  const lang = normalizeLanguage(selected);
  const options = collectionLanguages(lang);
  document.getElementById('detailLanguageOptions').innerHTML = options.map(code =>
    `<label><input type="radio" name="detailLanguage" value="${esc(code)}"${code === lang ? ' checked' : ''}><span>${esc(code)}</span></label>`
  ).join('');
  const other = document.getElementById('detailLanguageOther');
  other.value = '';
  other.classList.remove('visible');
}

// ---- Legality chip ----
const LEGALITY_LABELS = {
  legal: 'legal',
  not_legal: 'not legal',
  banned: 'banned',
  restricted: 'restricted',
};

export function renderDetailLegality() {
  const c = state.collection[state.detailIndex];
  const chip = document.getElementById('detailLegality');
  if (!state.selectedFormat || !c || !c.legalities || !c.legalities[state.selectedFormat]) {
    chip.className = 'legality-chip hidden';
    chip.textContent = '';
    return;
  }
  const status = c.legalities[state.selectedFormat];
  const label = LEGALITY_LABELS[status] || status.replace(/_/g, ' ');
  chip.textContent = state.selectedFormat + ': ' + label;
  chip.className = 'legality-chip ' + status;
}

// ---- Drawer open/close/save/delete ----
export function openDetail(index) {
  const c = state.collection[index];
  if (!c) return;
  state.detailIndex = index;
  hideCardPreview();

  const name = c.resolvedName || c.name || '(unknown)';
  document.getElementById('detailTitle').textContent = name;
  document.getElementById('detailSubtitle').textContent =
    [c.setCode ? c.setCode.toUpperCase() : '', c.cn ? '#' + c.cn : '', c.rarity || ''].filter(Boolean).join(' · ');
  renderDetailLegality();

  const imageWrap = document.getElementById('detailImageWrap');
  const flipRow = c.backImageUrl
    ? `<div class="drawer-flip-row"><button type="button" class="flip-btn" id="drawerFlipBtn">flip card</button></div>`
    : '';
  imageWrap.innerHTML = c.imageUrl
    ? `<img class="drawer-image" src="${esc(c.imageUrl)}" alt="${esc(name)}" data-front="${esc(c.imageUrl)}"${c.backImageUrl ? ` data-back="${esc(c.backImageUrl)}"` : ''} style="cursor:zoom-in;">${flipRow}`
    : `<div class="drawer-placeholder">${esc(name)}</div>`;
  const drawerImg = imageWrap.querySelector('.drawer-image');
  if (drawerImg) {
    drawerImg.addEventListener('click', () => {
      const cur = drawerImg.dataset.current === 'back' ? c.backImageUrl : c.imageUrl;
      showImageLightbox(cur || c.imageUrl, c.backImageUrl || null);
    });
  }
  const drawerFlip = document.getElementById('drawerFlipBtn');
  if (drawerFlip && drawerImg) {
    drawerFlip.addEventListener('click', () => {
      const showingBack = drawerImg.dataset.current === 'back';
      drawerImg.dataset.current = showingBack ? 'front' : 'back';
      drawerImg.src = showingBack ? c.imageUrl : c.backImageUrl;
    });
  }

  document.getElementById('detailQty').value = c.qty || 1;
  document.getElementById('detailFinish').value = c.finish || 'normal';
  const conditionValue = c.condition || 'near_mint';
  const conditionInput = detailForm.querySelector(`input[name="detailCondition"][value="${CSS.escape(conditionValue)}"]`)
    || detailForm.querySelector('input[name="detailCondition"][value="near_mint"]');
  if (conditionInput) conditionInput.checked = true;
  renderLanguageOptions(c.language || 'en');
  drawerTags = Array.isArray(c.tags) ? [...c.tags] : [];
  renderTagChips();
  document.getElementById('detailTagInput').value = '';
  document.getElementById('detailLocation').value = c.location || '';
  document.getElementById('detailPriceText').textContent = c.price ? '$' + c.price.toFixed(2) : 'no price';
  document.getElementById('detailPriceMark').textContent = c.priceFallback ? '*' : '';
  const priceLink = document.getElementById('detailPriceLink');
  priceLink.href = c.scryfallUri || '#';
  priceLink.classList.toggle('hidden', !c.scryfallUri);

  drawerBackdrop.classList.add('visible');
  detailDrawer.classList.add('visible');
  detailDrawer.setAttribute('aria-hidden', 'false');
  document.getElementById('detailQty').focus();
}

function closeDetail() {
  state.detailIndex = -1;
  detailDrawer.classList.remove('visible');
  drawerBackdrop.classList.remove('visible');
  detailDrawer.setAttribute('aria-hidden', 'true');
}

function saveDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;

  // Commit any pending text in the tag input before snapshotting diffs
  commitTagInput();

  const before = {
    qty: c.qty,
    finish: c.finish,
    condition: c.condition,
    language: c.language,
    location: c.location || '',
    tags: Array.isArray(c.tags) ? [...c.tags] : [],
  };

  snapshotCollection();
  c.qty = Math.max(1, parseInt(document.getElementById('detailQty').value, 10) || 1);
  c.finish = normalizeFinish(document.getElementById('detailFinish').value);
  c.condition = normalizeCondition(detailForm.querySelector('input[name="detailCondition"]:checked')?.value || 'near_mint');
  c.language = normalizeLanguage(document.getElementById('detailLanguageOther').value
    || detailForm.querySelector('input[name="detailLanguage"]:checked')?.value
    || 'en');
  c.location = normalizeLocation(document.getElementById('detailLocation').value);
  c.tags = [...drawerTags];

  const after = {
    qty: c.qty,
    finish: c.finish,
    condition: c.condition,
    language: c.language,
    location: c.location || '',
    tags: [...c.tags],
  };
  const diffs = [];
  if (after.qty !== before.qty) diffs.push('qty ' + before.qty + ' → ' + after.qty);
  if (after.finish !== before.finish) diffs.push(before.finish + ' → ' + after.finish);
  if (after.condition !== before.condition) {
    diffs.push(before.condition.replace(/_/g, ' ') + ' → ' + after.condition.replace(/_/g, ' '));
  }
  if (after.language !== before.language) diffs.push(before.language + ' → ' + after.language);
  if (after.location !== before.location) {
    diffs.push('location: ' + (before.location || '—') + ' → ' + (after.location || '—'));
  }
  const beforeTagsKey = [...before.tags].sort().join(',');
  const afterTagsKey = [...after.tags].sort().join(',');
  if (beforeTagsKey !== afterTagsKey) {
    const fmt = arr => '[' + arr.join(', ') + ']';
    diffs.push('tags: ' + fmt(before.tags) + ' → ' + fmt(after.tags));
  }

  commitCollectionChange({ coalesce: true });
  closeDetail();
  const name = c.resolvedName || c.name || 'card';
  if (diffs.length === 0) {
    showFeedback('saved ' + esc(name) + ' (no changes)', 'success');
  } else {
    showFeedback('saved ' + esc(name) + ' (' + esc(diffs.join(', ')) + ') <button class="undo-btn" type="button">undo</button>', 'success');
  }
}

function deleteDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;
  const name = c.resolvedName || c.name || 'this row';
  snapshotCollection();
  state.collection.splice(state.detailIndex, 1);
  commitCollectionChange();
  closeDetail();
  showFeedback('deleted ' + esc(name) + ' <button class="undo-btn" type="button">undo</button>', 'success');
}

export function initDetail() {
  drawerBackdrop = document.getElementById('drawerBackdrop');
  detailDrawer = document.getElementById('detailDrawer');
  detailForm = document.getElementById('detailForm');

  detailForm.addEventListener('submit', e => {
    e.preventDefault();
    saveDetail();
  });
  document.getElementById('detailCancel').addEventListener('click', closeDetail);
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  drawerBackdrop.addEventListener('click', closeDetail);
  document.getElementById('detailDelete').addEventListener('click', deleteDetail);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isLightboxVisible()) { hideImageLightbox(); return; }
    if (detailDrawer.classList.contains('visible')) closeDetail();
  });
  document.getElementById('detailLanguageAdd').addEventListener('click', () => {
    const other = document.getElementById('detailLanguageOther');
    other.classList.add('visible');
    other.focus();
  });
  document.getElementById('detailLanguageOther').addEventListener('input', e => {
    if (!e.target.value.trim()) return;
    detailForm.querySelectorAll('input[name="detailLanguage"]').forEach(input => { input.checked = false; });
  });

  const tagInput = document.getElementById('detailTagInput');
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTagInput();
    }
  });
  tagInput.addEventListener('blur', () => {
    if (tagInput.value.trim()) commitTagInput();
  });
  document.getElementById('detailTagChips').addEventListener('click', e => {
    const btn = e.target.closest('.tag-chip-remove');
    if (!btn) return;
    e.preventDefault();
    const tag = btn.dataset.tag;
    drawerTags = drawerTags.filter(t => t !== tag);
    renderTagChips();
  });
}
