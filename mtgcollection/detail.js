import { state } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  allCollectionTags,
  allCollectionLocations,
  allContainers,
  LOCATION_TYPES,
  collectionKey,
  getCardBackImageUrl,
  getCardImageUrl,
  getUsdPrice,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { captureBefore, recordEvent, locationDiffSummary, qtyDiffSummary } from './changelog.js';
import { hideCardPreview, showImageLightbox, hideImageLightbox, isLightboxVisible } from './ui/cardPreview.js';
import { getMultiselectValue, populateMultiselect } from './multiselect.js';
import { getActiveLocation, syncActiveLocationFromFilter } from './routeState.js';
import {
  applyDetailFormValues,
  detailFieldDiffs,
  readDetailForm,
  snapshotDetailFields,
  writeDetailForm,
} from './detailFormModel.js';
import { FORMAT_PRESETS } from './views/deckHeaderView.js';
import {
  applyPrintingToEntry,
  createAddLocationPicker,
  createAddPrintingPicker,
  createTagChipEditor,
  renderFinishRadios,
} from './cardEditor.js';

let drawerBackdrop;
let detailDrawer;
let detailForm;
let detailTagEditor = null;
let detailLocationPicker = null;
let detailPrintingPicker = null;
let detailSelectedPrinting = null;
let detailPreviewCard = null;

function currentFilterLocation() {
  const active = getActiveLocation();
  if (active) return active;
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return null;
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return null;
  const idx = values[0].indexOf(':');
  if (idx === -1) return null;
  return { type: values[0].slice(0, idx), name: values[0].slice(idx + 1) };
}

// ---- Filters (set/location dropdown population) ----
export function populateFilters() {
  const sets = [...new Set(state.collection.map(c => c.setCode).filter(Boolean))].sort();
  populateMultiselect(document.getElementById('filterSet'),
    sets.map(s => ({ value: s, label: s.toUpperCase() })),
    { defaultLabel: 'All sets', noun: 'sets' });

  populateMultiselect(document.getElementById('filterRarity'),
    ['common', 'uncommon', 'rare', 'mythic'],
    { defaultLabel: 'All rarity', noun: 'rarity' });

  populateMultiselect(document.getElementById('filterFoil'),
    ['normal', 'foil', 'etched'],
    { defaultLabel: 'All finishes', noun: 'finishes' });

  // Use BOTH inventory locations and container registry — a deck container
  // with no physical cards (decklist-only) needs to appear in the filter so
  // entering it doesn't get reset on every commit.
  const fromInventory = allCollectionLocations();
  const fromContainers = allContainers().map(c => ({ type: c.type, name: c.name }));
  const seen = new Set();
  const locations = [];
  for (const loc of [...fromInventory, ...fromContainers]) {
    const k = loc.type + ':' + loc.name;
    if (seen.has(k)) continue;
    seen.add(k);
    locations.push(loc);
  }
  locations.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  // Group dropdown options by type with a section header — flat list gets
  // unwieldy fast as more decks/binders/boxes pile up.
  const TYPE_HEADERS = { deck: 'decks', binder: 'binders', box: 'boxes' };
  const groupedLocOptions = [];
  for (const type of LOCATION_TYPES) {
    const ofType = locations.filter(l => l.type === type);
    if (ofType.length === 0) continue;
    groupedLocOptions.push({ header: TYPE_HEADERS[type] });
    for (const loc of ofType) {
      groupedLocOptions.push({ value: loc.type + ':' + loc.name, label: loc.name });
    }
  }
  const locationFilterEl = document.getElementById('filterLocation');
  populateMultiselect(locationFilterEl,
    groupedLocOptions,
    { defaultLabel: 'All locations', noun: 'locations' });
  if (!state.shareSnapshot) syncActiveLocationFromFilter(locationFilterEl);
  // Datalist for the drawer/bulk/add name fields — just names, no type prefix.
  const uniqueNames = [...new Set(locations.map(loc => loc.name))].sort();
  document.getElementById('locationOptions').innerHTML =
    uniqueNames.map(n => '<option value="' + esc(n) + '"></option>').join('');

  const tags = allCollectionTags();
  populateMultiselect(document.getElementById('filterTag'),
    tags,
    { defaultLabel: 'Filter by tag', noun: 'tags' });
  populateMultiselect(document.getElementById('filterDeckFormat'),
    [...FORMAT_PRESETS, { value: 'unspecified', label: 'unspecified' }],
    { defaultLabel: 'All deck formats', noun: 'formats' });
  populateMultiselect(document.getElementById('filterStorageType'),
    [
      { value: 'binder', label: 'binders' },
      { value: 'box', label: 'boxes' },
    ],
    { defaultLabel: 'All container types', noun: 'types' });
  document.getElementById('rowTagOptions').innerHTML =
    tags.map(t => '<option value="' + esc(t) + '"></option>').join('');
}


// ---- Legality chip ----
const LEGALITY_LABELS = {
  legal: 'legal',
  not_legal: 'not legal',
  banned: 'banned',
  restricted: 'restricted',
};

function detailDisplayName(card) {
  return card?.resolvedName || card?.name || '(unknown)';
}

function detailSetCode(card) {
  return card?.setCode || card?.set || '';
}

function detailCollectorNumber(card) {
  return card?.cn || card?.collector_number || '';
}

function detailImageUrl(card) {
  return card?.imageUrl || getCardImageUrl(card) || '';
}

function detailBackImageUrl(card) {
  return card?.backImageUrl || getCardBackImageUrl(card) || '';
}

function detailScryfallUri(card) {
  return card?.scryfallUri || card?.scryfall_uri || '';
}

function detailFinishClass(finish) {
  if (finish === 'foil') return 'is-foil';
  if (finish === 'etched') return 'is-etched';
  return '';
}

function syncDetailImageFinish(finish) {
  const frame = document.querySelector('#detailImageWrap .drawer-image-frame');
  if (!frame) return;
  frame.classList.toggle('is-foil', finish === 'foil');
  frame.classList.toggle('is-etched', finish === 'etched');
}

function renderDetailIdentity(card, finish = 'normal') {
  const name = detailDisplayName(card);
  const setCode = detailSetCode(card);
  const cn = detailCollectorNumber(card);
  document.getElementById('detailTitle').textContent = name;
  document.getElementById('detailSubtitle').textContent =
    [setCode ? setCode.toUpperCase() : '', cn ? '#' + cn : '', card?.rarity || ''].filter(Boolean).join(' - ');

  const frontUrl = detailImageUrl(card);
  const backUrl = detailBackImageUrl(card);
  const imageWrap = document.getElementById('detailImageWrap');
  const flipRow = backUrl
    ? `<div class="drawer-flip-row"><button type="button" class="flip-btn" id="drawerFlipBtn">flip card</button></div>`
    : '';
  const frameClass = ['drawer-image-frame', detailFinishClass(finish)].filter(Boolean).join(' ');
  imageWrap.innerHTML = frontUrl
    ? `<div class="${frameClass}"><img class="drawer-image" src="${esc(frontUrl)}" alt="${esc(name)}" data-front="${esc(frontUrl)}"${backUrl ? ` data-back="${esc(backUrl)}"` : ''} style="cursor:zoom-in;"></div>${flipRow}`
    : `<div class="drawer-placeholder">${esc(name)}</div>`;
  const drawerImg = imageWrap.querySelector('.drawer-image');
  if (drawerImg) {
    drawerImg.addEventListener('click', () => {
      const cur = drawerImg.dataset.current === 'back' ? backUrl : frontUrl;
      showImageLightbox(cur || frontUrl, backUrl || null);
    });
  }
  const drawerFlip = document.getElementById('drawerFlipBtn');
  if (drawerFlip && drawerImg) {
    drawerFlip.addEventListener('click', () => {
      const showingBack = drawerImg.dataset.current === 'back';
      drawerImg.dataset.current = showingBack ? 'front' : 'back';
      drawerImg.src = showingBack ? frontUrl : backUrl;
    });
  }
  renderDetailLegality(card);
}

function renderDetailPrice(card, finish) {
  const priced = card?.prices
    ? getUsdPrice(card, finish)
    : { price: card?.price || null, fallback: Boolean(card?.priceFallback) };
  document.getElementById('detailPriceText').textContent = priced.price ? '$' + priced.price.toFixed(2) : 'no price';
  const priceMark = document.getElementById('detailPriceMark');
  priceMark.textContent = priced.fallback ? '*' : '';
  if (priced.fallback) priceMark.title = 'regular usd shown when exact finish price is unavailable';
  else priceMark.removeAttribute('title');
  const priceLink = document.getElementById('detailPriceLink');
  const uri = detailScryfallUri(card);
  priceLink.href = uri || '#';
  priceLink.classList.toggle('hidden', !uri);
}

function updateDetailFinishPreview() {
  const card = detailPreviewCard || state.collection[state.detailIndex];
  if (!card) return;
  const finish = readDetailForm({ form: detailForm, location: detailLocationPicker?.readLocation() }).finish;
  syncDetailImageFinish(finish);
  renderDetailPrice(card, finish);
}

export function renderDetailLegality(card = state.collection[state.detailIndex]) {
  const chip = document.getElementById('detailLegality');
  if (!state.selectedFormat || !card || !card.legalities || !card.legalities[state.selectedFormat]) {
    chip.className = 'legality-chip hidden';
    chip.textContent = '';
    return;
  }
  const status = card.legalities[state.selectedFormat];
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

  detailPreviewCard = c;
  renderDetailIdentity(c, c.finish);

  detailSelectedPrinting = null;
  writeDetailForm({ form: detailForm, collection: state.collection, card: c });
  detailTagEditor?.setTags(Array.isArray(c.tags) ? c.tags : []);
  detailLocationPicker?.seed(c.location || currentFilterLocation());
  detailPrintingPicker?.load(c.resolvedName || c.name || '');
  renderDetailPrice(c, c.finish);

  drawerBackdrop.classList.add('visible');
  detailDrawer.classList.add('visible');
  detailDrawer.setAttribute('aria-hidden', 'false');
  document.getElementById('detailQty').focus();
}

function closeDetail() {
  state.detailIndex = -1;
  detailPreviewCard = null;
  detailPrintingPicker?.hide();
  detailDrawer.classList.remove('visible');
  drawerBackdrop.classList.remove('visible');
  detailDrawer.setAttribute('aria-hidden', 'true');
}

function saveDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;

  // Commit any pending text in the tag input before snapshotting diffs
  detailTagEditor?.commitInput();

  const before = snapshotDetailFields(c);
  const beforeScryfallId = c.scryfallId || '';

  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);

  applyDetailFormValues(c, readDetailForm({
    form: detailForm,
    tags: detailTagEditor?.getTags() || [],
    location: detailLocationPicker?.readLocation(),
  }));
  const printingChanged = !!(detailSelectedPrinting && detailSelectedPrinting.id && detailSelectedPrinting.id !== beforeScryfallId);
  if (printingChanged) {
    applyPrintingToEntry(c, detailSelectedPrinting);
  }
  const after = snapshotDetailFields(c);
  const { diffs, locationChanged } = detailFieldDiffs(before, after);
  if (printingChanged) {
    diffs.push('printing: ' + [c.setCode ? c.setCode.toUpperCase() : '', c.cn ? '#' + c.cn : ''].filter(Boolean).join(' '));
  }

  commitCollectionChange({ coalesce: true });
  closeDetail();
  const name = c.resolvedName || c.name || 'card';
  if (diffs.length === 0) {
    showFeedback('saved ' + esc(name) + ' (no changes)', 'success');
  } else {
    let summary;
    if (diffs.length === 1 && after.qty !== before.qty) {
      summary = qtyDiffSummary(before.qty, after.qty);
    } else if (diffs.length === 1 && locationChanged) {
      summary = locationDiffSummary(before.location, after.location);
    } else {
      summary = 'Edited (' + diffs.join(', ') + ') - {card}';
    }
    recordEvent({
      type: 'edit',
      summary,
      before: beforeSnap,
      affectedKeys: [beforeKey],
      cards: [{
        name,
        imageUrl: c.imageUrl || '',
        backImageUrl: c.backImageUrl || '',
      }],
    });
  }
}

function deleteDetail() {
  const c = state.collection[state.detailIndex];
  if (!c) return;
  const name = c.resolvedName || c.name || 'this row';
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  const cardSnapshot = {
    name,
    imageUrl: c.imageUrl || '',
    backImageUrl: c.backImageUrl || '',
  };
  state.collection.splice(state.detailIndex, 1);
  commitCollectionChange();
  closeDetail();
  recordEvent({
    type: 'delete',
    summary: 'Deleted card',
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [cardSnapshot],
  });
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

  detailTagEditor = createTagChipEditor({
    chipsEl: document.getElementById('detailTagChips'),
    inputEl: document.getElementById('detailTagInput'),
    datalistEl: document.getElementById('detailTagSuggestions'),
    getSuggestions: allCollectionTags,
  });
  detailTagEditor.bind();
  detailLocationPicker = createAddLocationPicker({
    getNameInput: () => document.getElementById('detailLocationName'),
    pillsId: 'detailLocationPills',
    newBoxId: 'detailLocationNewBox',
    newBtnId: 'detailLocationNewBtn',
    typeRadiosId: 'detailLocationTypeRadios',
    typeRadioName: 'detailLocationType',
  });
  detailLocationPicker.buildTypeRadios();
  detailLocationPicker.bindPills();
  detailLocationPicker.render();
  detailPrintingPicker = createAddPrintingPicker({
    pickerEl: document.getElementById('detailPrintingPicker'),
    listEl: document.getElementById('detailPrintingList'),
    captionEl: document.getElementById('detailPrintingCaption'),
    searchEl: document.getElementById('detailPrintingSearch'),
    getPreferredScryfallId: () => state.collection[state.detailIndex]?.scryfallId || '',
    getCollection: () => state.collection,
    shouldPreserveFields: () => true,
    onSelect: (card, meta = {}) => {
      const currentFinish = readDetailForm({ form: detailForm, location: detailLocationPicker?.readLocation() }).finish;
      const selectedFinish = renderFinishRadios({
        card,
        targetId: 'detailFinish',
        name: 'detailFinish',
        selected: currentFinish,
        hintEl: document.getElementById('detailFinishHint'),
      });
      const currentId = state.collection[state.detailIndex]?.scryfallId || '';
      const isCurrentPrinting = !!card?.id && card.id === currentId;
      if (meta.userSelected) detailSelectedPrinting = card;
      if (meta.userSelected || isCurrentPrinting) {
        detailPreviewCard = card;
        renderDetailIdentity(card, selectedFinish);
        renderDetailPrice(card, selectedFinish);
      }
    },
  });
  detailPrintingPicker.bind();
  document.getElementById('detailFinish')?.addEventListener('change', updateDetailFinishPreview);
}
