import { state, DECK_GROUP_KEY, BINDER_SIZE_KEY } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  normalizeTag,
  biggerImageUrl,
  allCollectionLocations,
  quoteLocationForSearch,
  formatLocationLabel,
  LOCATION_TYPES,
  DEFAULT_LOCATION_TYPE,
} from './collection.js';
import { save, commitCollectionChange } from './persistence.js';
import { openDetail } from './detail.js';
import { filteredSorted, syncClearFiltersBtn } from './search.js';
import { renderStatsPanel, groupDeck, firstCardForPanel } from './stats.js';
import { updateBulkBar } from './bulk.js';
import { paginateForBinder, sortForBinder, BINDER_SIZES, binderSlotCount } from './binder.js';
import { getSetIconUrl } from './setIcons.js';
import { recordEvent, captureBefore, locationDiffSummary } from './changelog.js';

const VALID_DECK_GROUPS = ['type', 'cmc', 'color', 'rarity'];
const VALID_BINDER_SIZES = Object.keys(BINDER_SIZES);
const RARITY_ABBR = { common: 'c', uncommon: 'u', rare: 'r', mythic: 'm', special: 's', bonus: 'b' };
const CONDITION_ABBR = { near_mint: 'nm', lightly_played: 'lp', moderately_played: 'mp', heavily_played: 'hp', damaged: 'dmg' };

const LOC_ICONS = {
  deck: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="3.5" width="6.5" height="8.5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="5" y="1.5" width="6.5" height="8.5" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  binder: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1"/><line x1="5" y1="2" x2="5" y2="12" stroke="currentColor" stroke-width="1"/><circle cx="5" cy="5" r="0.7" fill="currentColor"/><circle cx="5" cy="7" r="0.7" fill="currentColor"/><circle cx="5" cy="9" r="0.7" fill="currentColor"/></svg>',
  box: '<svg class="loc-icon" viewBox="0 0 14 14" aria-hidden="true"><polygon points="2,4 7,1.5 12,4 12,11.5 2,11.5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="2" y1="4" x2="12" y2="4" stroke="currentColor" stroke-width="1"/><line x1="7" y1="1.5" x2="7" y2="4" stroke="currentColor" stroke-width="1"/></svg>',
};

export function locationPillHtml(loc, { withRemove = false, index = -1 } = {}) {
  const n = normalizeLocation(loc);
  if (!n) return '';
  const icon = LOC_ICONS[n.type] || LOC_ICONS.box;
  const removeBtn = withRemove
    ? '<button class="loc-pill-remove" type="button" data-index="' + index + '" aria-label="remove location">×</button>'
    : '';
  return '<span class="loc-pill loc-pill-' + esc(n.type) + '" data-loc-type="' + esc(n.type) + '" data-loc-name="' + esc(n.name) + '">' +
    icon +
    '<span class="loc-pill-name">' + esc(n.name) + '</span>' +
    removeBtn +
  '</span>';
}

function locationCellHtml(c, index) {
  const loc = normalizeLocation(c.location);
  if (loc) {
    return locationPillHtml(loc, { withRemove: true, index });
  }
  // Inline picker for empty cells.
  const typeOptions = LOCATION_TYPES.map(t =>
    '<option value="' + t + '"' + (t === DEFAULT_LOCATION_TYPE ? ' selected' : '') + '>' + t + '</option>'
  ).join('');
  return '<span class="loc-picker" data-index="' + index + '">' +
    '<select class="loc-picker-type" data-index="' + index + '" aria-label="location type">' + typeOptions + '</select>' +
    '<input class="loc-picker-name" data-index="' + index + '" type="text" list="locationOptions" placeholder="+ loc" autocomplete="off">' +
  '</span>';
}

function commitRowLocationFromPicker(input) {
  const index = parseInt(input.dataset.index, 10);
  const c = state.collection[index];
  if (!c) return;
  const row = input.closest('tr');
  const typeSel = row && row.querySelector('.loc-picker-type');
  const type = typeSel ? typeSel.value : DEFAULT_LOCATION_TYPE;
  const name = input.value;
  const newLoc = normalizeLocation({ type, name });
  if (!newLoc) { input.value = ''; return; }
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.location = newLoc;
  const cardName = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: locationDiffSummary(null, newLoc),
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name: cardName, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function clearRowLocation(index) {
  const c = state.collection[index];
  if (!c || !c.location) return;
  const beforeLoc = c.location;
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.location = null;
  const cardName = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: locationDiffSummary(beforeLoc, null),
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name: cardName, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function commitRowTag(input) {
  const index = parseInt(input.dataset.index, 10);
  const c = state.collection[index];
  if (!c) return;
  const tag = normalizeTag(input.value);
  if (!tag) { input.value = ''; return; }
  if (!Array.isArray(c.tags)) c.tags = [];
  if (c.tags.includes(tag)) {
    showFeedback('already tagged ' + tag, 'info');
    input.value = '';
    return;
  }
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.tags.push(tag);
  const name = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: 'tagged {card} +' + tag,
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function removeRowTag(index, tag) {
  const c = state.collection[index];
  if (!c || !Array.isArray(c.tags) || !c.tags.includes(tag)) return;
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.tags = c.tags.filter(t => t !== tag);
  const name = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: 'tagged {card} -' + tag,
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

let gridEl, listBodyEl, collectionSection, emptyState;
let cardPreviewEl, cardPreviewImg;
let lightboxEl, lightboxImg, lightboxFlipBtn;
let lightboxFront = null;
let lightboxBack = null;
let lightboxShowingBack = false;

export function render() {
  document.querySelectorAll('.app-header-views .toggle-view').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
  });
  document.body.classList.toggle('view-list', state.viewMode === 'list');
  document.body.classList.toggle('has-collection', state.collection.length > 0);
  // Switching away from list view always closes the right drawer
  if (state.viewMode !== 'list') closeRightDrawer();
  syncClearFiltersBtn();
  if (state.collection.length === 0) {
    collectionSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    // Hide size toggles too — neither makes sense for an empty collection.
    document.getElementById('gridSizeControl').classList.add('hidden');
    document.getElementById('binderSizeControl').classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  collectionSection.classList.remove('hidden');

  const list = filteredSorted();

  document.getElementById('uniqueCount').textContent = list.length;
  document.getElementById('totalCount').textContent = list.reduce((s, c) => s + c.qty, 0);
  const value = list.reduce((s, c) => s + (c.price || 0) * c.qty, 0);
  document.getElementById('totalValue').textContent = value.toFixed(2);
  renderStatsPanel(list);
  applyGridSize();
  applyBinderSizeButtons();

  const gridContainer = document.getElementById('grid');
  const listContainer = document.getElementById('listView');
  const deckContainer = document.getElementById('deckView');
  const binderContainer = document.getElementById('binderView');
  const gridSizeCtl = document.getElementById('gridSizeControl');
  const binderSizeCtl = document.getElementById('binderSizeControl');

  // Reset chrome
  gridContainer.classList.add('hidden');
  listContainer.classList.remove('active');
  deckContainer.classList.remove('active');
  binderContainer.classList.remove('active');
  gridSizeCtl.classList.add('hidden');
  binderSizeCtl.classList.add('hidden');

  if (state.viewMode === 'deck') {
    deckContainer.classList.add('active');
    renderDeckView(list);
  } else if (state.viewMode === 'binder') {
    binderContainer.classList.add('active');
    binderSizeCtl.classList.remove('hidden');
    renderBinderView(list);
  } else if (state.viewMode === 'grid') {
    gridContainer.classList.remove('hidden');
    gridSizeCtl.classList.remove('hidden');
    gridEl.innerHTML = list.map(c => renderTile(c)).join('');
  } else {
    listContainer.classList.add('active');
    listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
    syncSortIndicator();
  }
  updateBulkBar();
}

function syncSortIndicator() {
  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    const field = th.dataset.sort;
    const isActive = !!state.sortField && field === state.sortField;
    th.classList.toggle('sort-active', isActive);
    const arrowEl = th.querySelector('.sort-arrow');
    if (arrowEl) arrowEl.textContent = state.sortDir === 'desc' ? '↓' : '↑';
  });
}

export function applyGridSize() {
  const sizeClass = 'grid-' + state.gridSize;
  if (gridEl) {
    gridEl.classList.remove('grid-small', 'grid-medium', 'grid-large');
    gridEl.classList.add(sizeClass);
  }
  document.querySelectorAll('[data-grid-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gridSize === state.gridSize);
  });
}

function formatPrice(c) {
  if (!c.price) return '';
  const base = '$' + c.price.toFixed(2);
  if (!c.priceFallback) return base;
  return base + '<span class="price-fallback-mark" title="regular usd shown when exact finish price is unavailable">*</span>';
}

function renderTile(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = state.collection.indexOf(c);
  const badges = [];
  if (c.qty > 1) badges.push('<span class="badge">×' + c.qty + '</span>');
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}<br><small>${esc((c.setCode||'').toUpperCase())} #${esc(c.cn||'')}</small></div>`;
  const caption = esc(name) + ' · ' + esc((c.setCode || '').toUpperCase());
  const scryfallAction = c.scryfallUri
    ? `<button class="card-scryfall-link" type="button" data-scryfall-url="${esc(c.scryfallUri)}">scryfall ↗</button>`
    : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  return `<div class="card-tile detail-trigger${finishClass}" role="button" tabindex="0" data-index="${index}" aria-label="edit ${esc(name)}">
    ${img}
    <div class="card-badges">${badges.join('')}</div>
    <div class="card-caption">${caption}</div>
    ${scryfallAction ? `<div class="card-actions">${scryfallAction}</div>` : ''}
  </div>`;
}

function renderRow(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = state.collection.indexOf(c);
  const key = collectionKey(c);
  const selected = state.selectedKeys.has(key);
  const previewClasses = c.imageUrl ? 'card-name-button card-preview-link detail-trigger' : 'card-name-button detail-trigger';
  const previewAttr = c.imageUrl ? ` data-preview-url="${esc(c.imageUrl)}"` : '';
  const setCodeLower = (c.setCode || '').toLowerCase();
  const setCode = setCodeLower.toUpperCase();
  const iconUrl = setCodeLower ? getSetIconUrl(setCodeLower) : '';
  const setIcon = iconUrl
    ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
    : '';
  return `<tr class="detail-trigger${selected ? ' row-selected' : ''}" data-index="${index}" data-key="${esc(key)}">
    <td class="col-check"><input type="checkbox" class="row-check" data-key="${esc(key)}"${selected ? ' checked' : ''} aria-label="select row"></td>
    <td class="card-name-cell"><button class="${previewClasses}" type="button" data-index="${index}"${previewAttr}>${esc(name)}</button></td>
    <td class="muted set-cell">${setIcon}${esc(setCode)}</td>
    <td class="muted cn-cell">${esc(c.cn || '')}</td>
    <td class="muted finish-cell">${esc(c.finish)}</td>
    <td class="muted rarity-cell" title="${esc(c.rarity || '')}">${esc(RARITY_ABBR[c.rarity] || c.rarity || '')}</td>
    <td class="muted condition-cell" title="${esc((c.condition || '').replace(/_/g, ' '))}">${esc(CONDITION_ABBR[c.condition] || (c.condition || '').replace(/_/g, ' '))}</td>
    <td class="location-cell">${locationCellHtml(c, index)}</td>
    <td class="tags-cell">${(c.tags || []).map(t => `<span class="row-tag">${esc(t)}<button class="row-tag-remove" type="button" data-tag="${esc(t)}" data-index="${index}" aria-label="remove ${esc(t)}">×</button></span>`).join('')}<input class="row-tag-input" data-index="${index}" list="rowTagOptions" placeholder="+ tag" autocomplete="off"></td>
    <td class="qty-cell">${c.qty}</td>
    <td class="muted price-cell">${formatPrice(c)}</td>
  </tr>`;
}

function renderDeckCard(c, isLast) {
  const name = c.resolvedName || c.name || '?';
  const idx = state.collection.indexOf(c);
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="deck-qty">×${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const lastClass = isLast ? ' deck-card-last' : '';
  return `<div class="deck-card detail-trigger${finishClass}${lastClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}</div>`;
}

function renderEmptyScopeState(targetEl, mode) {
  const label = mode === 'binder' ? 'binder view' : 'deck view';
  const locations = allCollectionLocations();
  if (locations.length === 0) {
    targetEl.innerHTML = `<div class="deck-empty-state">
      <p class="deck-empty-prompt">${esc(label)} needs a filter — add a location to a card via the drawer, or apply a search query</p>
    </div>`;
    return;
  }
  const chips = locations.map(loc =>
    `<button type="button" class="deck-empty-chip" data-loc="${esc(formatLocationLabel(loc))}">${locationPillHtml(loc)}</button>`
  ).join('');
  targetEl.innerHTML = `<div class="deck-empty-state">
    <p class="deck-empty-prompt">${esc(label)} needs a filter — try <code>loc:breya</code> or pick a location below</p>
    <div class="deck-empty-chips">${chips}</div>
  </div>`;
}

function renderDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');
  const searchInput = document.getElementById('searchInput');
  const searchQuery = (searchInput && searchInput.value || '').trim();

  if (!searchQuery) {
    if (deckActionsEl) deckActionsEl.classList.add('hidden');
    setDeckPreviewCard(null);
    renderEmptyScopeState(deckColumnsEl, 'deck');
    document.getElementById('deckSummary').textContent = '';
    return;
  }

  if (deckActionsEl) deckActionsEl.classList.remove('hidden');

  const cols = groupDeck(list, state.deckGroupBy);
  if (cols.length === 0) {
    deckColumnsEl.innerHTML = '';
    setDeckPreviewCard(null);
  } else {
    deckColumnsEl.innerHTML = cols.map(col => {
      const total = col.cards.reduce((s, c) => s + (c.qty || 1), 0);
      const price = col.cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
      const priceStr = price > 0 ? ` · $${price.toFixed(2)}` : '';
      const stack = col.cards.map((c, i) => renderDeckCard(c, i === col.cards.length - 1)).join('');
      return `<div class="deck-col"><div class="deck-col-header">${esc(col.label)}<span class="deck-col-count">${total}${priceStr}</span></div><div class="deck-stack">${stack}</div></div>`;
    }).join('');
    setDeckPreviewCard(firstCardForPanel(cols));
  }

  const total = list.reduce((s, c) => s + (c.qty || 1), 0);
  const summary = document.getElementById('deckSummary');
  if (!state.selectedFormat) {
    summary.textContent = total + ' cards';
  } else {
    const illegal = list.filter(c => c.legalities && c.legalities[state.selectedFormat] && c.legalities[state.selectedFormat] !== 'legal' && c.legalities[state.selectedFormat] !== 'restricted');
    if (illegal.length > 0) {
      summary.innerHTML = total + ' cards · <span class="warn">' + illegal.length + ' not ' + state.selectedFormat + '-legal</span>';
    } else {
      summary.textContent = total + ' cards · all legal in ' + state.selectedFormat;
    }
  }
}

function renderBinderSlot(c) {
  if (!c) {
    return '<div class="binder-slot binder-slot-empty" aria-hidden="true"></div>';
  }
  const name = c.resolvedName || c.name || '?';
  const idx = state.collection.indexOf(c);
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="binder-qty">×${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  return `<div class="binder-slot detail-trigger${finishClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}</div>`;
}

function renderBinderView(list) {
  const pagesEl = document.getElementById('binderPages');
  const navEl = document.getElementById('binderNav');
  const summaryEl = document.getElementById('binderSummary');
  const searchInput = document.getElementById('searchInput');
  const searchQuery = (searchInput && searchInput.value || '').trim();

  if (!searchQuery) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    renderEmptyScopeState(pagesEl, 'binder');
    return;
  }

  if (list.length === 0) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    pagesEl.innerHTML = `<div class="deck-empty-state"><p class="deck-empty-prompt">no cards match</p></div>`;
    return;
  }

  const slotsPerPage = binderSlotCount(state.binderSize);
  const sorted = sortForBinder(list);
  const pages = paginateForBinder(sorted, slotsPerPage);
  if (state.binderPage >= pages.length) state.binderPage = 0;
  if (state.binderPage < 0) state.binderPage = 0;

  const conf = BINDER_SIZES[state.binderSize] || BINDER_SIZES['4x3'];
  const currentPage = pages[state.binderPage] || [];
  const slotsHtml = currentPage.map(c => renderBinderSlot(c)).join('');
  pagesEl.innerHTML = `<div class="binder-page" style="grid-template-columns: repeat(${conf.cols}, 1fr);">${slotsHtml}</div>`;

  navEl.classList.remove('hidden');
  const prevBtn = document.getElementById('binderPrev');
  const nextBtn = document.getElementById('binderNext');
  const indicator = document.getElementById('binderPageIndicator');
  prevBtn.disabled = state.binderPage <= 0;
  nextBtn.disabled = state.binderPage >= pages.length - 1;
  indicator.textContent = `page ${state.binderPage + 1} of ${pages.length}`;
  const total = list.reduce((s, c) => s + (c.qty || 1), 0);
  summaryEl.textContent = `${total} cards · ${list.length} unique`;
}

function applyBinderSizeButtons() {
  document.querySelectorAll('[data-binder-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.binderSize === state.binderSize);
  });
}

function loadBinderSize() {
  try {
    const v = localStorage.getItem(BINDER_SIZE_KEY);
    if (v && VALID_BINDER_SIZES.includes(v)) state.binderSize = v;
  } catch (e) {}
}

function saveBinderSize() {
  try { localStorage.setItem(BINDER_SIZE_KEY, state.binderSize); } catch (e) {}
}

function setDeckPreviewCard(c) {
  const panel = document.getElementById('deckPreviewPanel');
  if (!panel) return;
  if (!c) {
    panel.classList.add('hidden');
    panel.dataset.index = '';
    panel.dataset.previewIndex = '';
    return;
  }
  panel.classList.remove('hidden');
  const idx = state.collection.indexOf(c);
  panel.dataset.index = String(idx);
  panel.dataset.previewIndex = String(idx);
  const name = c.resolvedName || c.name || '?';
  const imgEl = panel.querySelector('.deck-preview-card');
  const placeholderEl = panel.querySelector('.deck-preview-placeholder');
  const nameEl = panel.querySelector('.deck-preview-name');
  const metaEl = panel.querySelector('.deck-preview-meta');
  const flipRow = panel.querySelector('.deck-preview-flip-row');
  if (c.imageUrl) {
    imgEl.src = c.imageUrl;
    imgEl.alt = name;
    imgEl.dataset.current = 'front';
    imgEl.classList.remove('hidden');
    placeholderEl.classList.add('hidden');
  } else {
    imgEl.classList.add('hidden');
    imgEl.removeAttribute('src');
    placeholderEl.textContent = name;
    placeholderEl.classList.remove('hidden');
  }
  if (flipRow) flipRow.classList.toggle('hidden', !c.backImageUrl || !c.imageUrl);
  // foil/etched shine parity
  imgEl.parentElement.classList.toggle('is-foil', c.finish === 'foil');
  imgEl.parentElement.classList.toggle('is-etched', c.finish === 'etched');
  nameEl.textContent = name;
  const qty = c.qty || 1;
  const priceTotal = (c.price || 0) * qty;
  const priceStr = c.price
    ? `$${c.price.toFixed(2)}${qty > 1 ? ` · $${priceTotal.toFixed(2)} total` : ''}`
    : '';
  metaEl.textContent = `×${qty}${priceStr ? '  ·  ' + priceStr : ''}`;
}

function deckPreviewFromTarget(target) {
  const card = target && target.closest && target.closest('.deck-card');
  if (!card) return;
  const idx = parseInt(card.dataset.index, 10);
  if (Number.isNaN(idx)) return;
  const entry = state.collection[idx];
  if (!entry) return;
  setDeckPreviewCard(entry);
}

function loadDeckGroup() {
  try {
    const v = localStorage.getItem(DECK_GROUP_KEY);
    if (v && VALID_DECK_GROUPS.includes(v)) state.deckGroupBy = v;
  } catch (e) {}
}

function saveDeckGroup() {
  try { localStorage.setItem(DECK_GROUP_KEY, state.deckGroupBy); } catch (e) {}
}

function buildDecklistText(list) {
  return list.map(c => {
    const name = c.resolvedName || c.name || '';
    const setCode = (c.setCode || '').toUpperCase();
    const cn = c.cn || '';
    const finishMarker = c.finish === 'foil' ? ' *F*' : c.finish === 'etched' ? ' *E*' : '';
    return `${c.qty} ${name} (${setCode}) ${cn}${finishMarker}`;
  }).join('\n');
}

function showCardPreview(link) {
  const url = link.dataset.previewUrl;
  if (!url) return;

  const rect = link.getBoundingClientRect();
  cardPreviewImg.src = url;
  cardPreviewEl.classList.add('visible');

  const previewWidth = 300;
  const previewHeight = 418;
  const padding = 20;
  const linkCenterX = rect.left + rect.width / 2;
  const windowCenterX = window.innerWidth / 2;

  let left = linkCenterX < windowCenterX
    ? rect.right + padding
    : rect.left - previewWidth - padding;
  let top = rect.top - previewHeight / 2 + rect.height / 2;

  top = Math.max(padding, Math.min(top, window.innerHeight - previewHeight - padding));
  left = Math.max(padding, Math.min(left, window.innerWidth - previewWidth - padding));

  cardPreviewEl.style.left = left + 'px';
  cardPreviewEl.style.top = top + 'px';
}

export function hideCardPreview() {
  cardPreviewEl.classList.remove('visible');
}

export function showImageLightbox(frontUrl, backUrl) {
  if (!frontUrl) return;
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
  lightboxEl.classList.remove('visible');
  lightboxEl.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
}

export function isLightboxVisible() {
  return lightboxEl.classList.contains('visible');
}

const RIGHT_DRAWER_PANELS = ['addDetails', 'importDetails', 'statsPanel'];

export function openRightDrawer(targetIds) {
  const ids = (Array.isArray(targetIds) ? targetIds : [targetIds]).filter(id => RIGHT_DRAWER_PANELS.includes(id));
  if (ids.length === 0) return;
  if (state.viewMode === 'list') {
    document.body.classList.add('right-drawer-open');
    RIGHT_DRAWER_PANELS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.open = ids.includes(id);
    });
  } else {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.open = true;
    });
  }
  const target = document.getElementById(ids[0]);
  if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' });
}

export function closeRightDrawer() {
  document.body.classList.remove('right-drawer-open');
}

export function isRightDrawerOpen() {
  return document.body.classList.contains('right-drawer-open');
}

export function initView() {
  gridEl = document.getElementById('grid');
  listBodyEl = document.getElementById('listBody');
  collectionSection = document.getElementById('collectionSection');
  emptyState = document.getElementById('emptyState');
  cardPreviewEl = document.getElementById('cardPreview');
  cardPreviewImg = cardPreviewEl.querySelector('img');
  lightboxEl = document.getElementById('imageLightbox');
  lightboxImg = document.getElementById('imageLightboxImg');
  lightboxFlipBtn = document.getElementById('lightboxFlip');

  document.getElementById('copyDecklistBtn').addEventListener('click', async () => {
    const text = buildDecklistText(filteredSorted());
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('decklist copied (' + filteredSorted().length + ' cards)', 'success');
    } catch (e) {
      showFeedback('clipboard unavailable: ' + e.message, 'error');
    }
  });

  document.querySelector('.app-header-views').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const next = btn.dataset.view;
    if (!['list', 'grid', 'deck', 'binder'].includes(next)) return;
    if (state.viewMode === next) return;
    state.viewMode = next;
    if (next === 'binder') state.binderPage = 0;
    save();
    render();
  });

  document.querySelector('table thead').addEventListener('click', e => {
    if (e.target.closest('.sort-clear-btn')) {
      state.sortField = null;
      state.sortDir = 'asc';
      save();
      render();
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    if (state.sortField === field) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = field;
      state.sortDir = 'asc';
    }
    save();
    render();
  });

  // FAB cluster — list-view summon panels on demand
  const fabCluster = document.getElementById('fabCluster');
  if (fabCluster) {
    fabCluster.addEventListener('click', e => {
      const btn = e.target.closest('[data-fab-target]');
      if (!btn) return;
      const targets = btn.dataset.fabTarget.split(',').map(s => s.trim()).filter(Boolean);
      openRightDrawer(targets);
    });
  }
  const appRightBackdrop = document.getElementById('appRightBackdrop');
  if (appRightBackdrop) {
    appRightBackdrop.addEventListener('click', closeRightDrawer);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!isRightDrawerOpen()) return;
    // Defer to higher-priority overlays (lightbox / detail drawer handle their own Escape).
    if (isLightboxVisible()) return;
    const detailDrawerEl = document.getElementById('detailDrawer');
    if (detailDrawerEl && detailDrawerEl.classList.contains('visible')) return;
    closeRightDrawer();
  });

  loadBinderSize();
  applyBinderSizeButtons();
  document.getElementById('binderSizeControl').addEventListener('click', e => {
    const btn = e.target.closest('[data-binder-size]');
    if (!btn) return;
    if (!VALID_BINDER_SIZES.includes(btn.dataset.binderSize)) return;
    state.binderSize = btn.dataset.binderSize;
    state.binderPage = 0;
    saveBinderSize();
    applyBinderSizeButtons();
    render();
  });

  document.getElementById('binderPrev').addEventListener('click', () => {
    if (state.binderPage > 0) {
      state.binderPage--;
      render();
    }
  });
  document.getElementById('binderNext').addEventListener('click', () => {
    state.binderPage++;
    render();
  });

  // Binder slot click → open detail drawer; chip click → set search
  const binderPagesEl = document.getElementById('binderPages');
  binderPagesEl.addEventListener('click', e => {
    const chip = e.target.closest('.deck-empty-chip');
    if (chip) {
      const loc = chip.dataset.loc || '';
      const searchInput = document.getElementById('searchInput');
      searchInput.value = 'loc:' + quoteLocationForSearch(loc);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const slot = e.target.closest('.binder-slot:not(.binder-slot-empty)');
    if (!slot) return;
    openDetail(parseInt(slot.dataset.index, 10));
  });
  binderPagesEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const slot = e.target.closest('.binder-slot:not(.binder-slot-empty)');
    if (!slot) return;
    e.preventDefault();
    openDetail(parseInt(slot.dataset.index, 10));
  });

  // Keyboard arrow nav for binder pages (only when binder mode and no input focused)
  document.addEventListener('keydown', e => {
    if (state.viewMode !== 'binder') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') {
      if (state.binderPage > 0) { state.binderPage--; render(); }
    } else {
      state.binderPage++;
      render();
    }
  });

  // Reset binder page on filter/search changes
  const searchInputForBinder = document.getElementById('searchInput');
  searchInputForBinder.addEventListener('input', () => { state.binderPage = 0; });
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { state.binderPage = 0; });
  });

  loadDeckGroup();
  const deckGroupEl = document.getElementById('deckGroupBy');
  if (deckGroupEl) {
    deckGroupEl.value = state.deckGroupBy;
    deckGroupEl.addEventListener('change', () => {
      const v = deckGroupEl.value;
      if (!VALID_DECK_GROUPS.includes(v)) return;
      state.deckGroupBy = v;
      saveDeckGroup();
      render();
    });
  }

  document.getElementById('deckColumns').addEventListener('click', e => {
    const chip = e.target.closest('.deck-empty-chip');
    if (chip) {
      const loc = chip.dataset.loc || '';
      const searchInput = document.getElementById('searchInput');
      searchInput.value = 'loc:' + quoteLocationForSearch(loc);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const card = e.target.closest('.deck-card');
    if (!card) return;
    openDetail(parseInt(card.dataset.index, 10));
  });

  document.getElementById('deckColumns').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.deck-card');
    if (!card) return;
    e.preventDefault();
    openDetail(parseInt(card.dataset.index, 10));
  });

  // hover/focus → update sticky preview panel
  document.getElementById('deckColumns').addEventListener('mouseover', e => {
    deckPreviewFromTarget(e.target);
  });
  document.getElementById('deckColumns').addEventListener('focusin', e => {
    deckPreviewFromTarget(e.target);
  });

  // panel click → open the drawer for whichever card is currently shown
  const previewPanel = document.getElementById('deckPreviewPanel');
  if (previewPanel) {
    previewPanel.addEventListener('click', e => {
      if (e.target.closest('.deck-preview-flip-row')) return;
      const idx = parseInt(previewPanel.dataset.index, 10);
      if (Number.isNaN(idx)) return;
      openDetail(idx);
    });
    previewPanel.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('.deck-preview-flip-row')) return;
      const idx = parseInt(previewPanel.dataset.index, 10);
      if (Number.isNaN(idx)) return;
      e.preventDefault();
      openDetail(idx);
    });
    const flipBtn = document.getElementById('deckPreviewFlipBtn');
    if (flipBtn) {
      flipBtn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(previewPanel.dataset.index, 10);
        if (Number.isNaN(idx)) return;
        const entry = state.collection[idx];
        if (!entry || !entry.backImageUrl) return;
        const imgEl = previewPanel.querySelector('.deck-preview-card');
        if (!imgEl) return;
        const showingBack = imgEl.dataset.current === 'back';
        imgEl.dataset.current = showingBack ? 'front' : 'back';
        imgEl.src = showingBack ? entry.imageUrl : entry.backImageUrl;
      });
    }
  }

  document.getElementById('gridSizeControl').addEventListener('click', e => {
    const btn = e.target.closest('[data-grid-size]');
    if (!btn) return;
    state.gridSize = btn.dataset.gridSize;
    save();
    applyGridSize();
  });

  gridEl.addEventListener('click', e => {
    const scryfallLink = e.target.closest('.card-scryfall-link');
    if (scryfallLink) {
      e.stopPropagation();
      window.open(scryfallLink.dataset.scryfallUrl, '_blank', 'noopener');
      return;
    }
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !gridEl.contains(trigger)) return;
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  gridEl.addEventListener('keydown', e => {
    const scryfallLink = e.target.closest('.card-scryfall-link');
    if (scryfallLink && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      window.open(scryfallLink.dataset.scryfallUrl, '_blank', 'noopener');
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !gridEl.contains(trigger)) return;
    e.preventDefault();
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  listBodyEl.addEventListener('click', e => {
    const removeTagBtn = e.target.closest('.row-tag-remove');
    if (removeTagBtn) {
      e.preventDefault();
      removeRowTag(parseInt(removeTagBtn.dataset.index, 10), removeTagBtn.dataset.tag);
      return;
    }
    const removeLocBtn = e.target.closest('.loc-pill-remove');
    if (removeLocBtn) {
      e.preventDefault();
      clearRowLocation(parseInt(removeLocBtn.dataset.index, 10));
      return;
    }
    const nameBtn = e.target.closest('.card-name-button');
    if (nameBtn) {
      openDetail(parseInt(nameBtn.dataset.index, 10));
      return;
    }
    if (e.target.closest('input, select, button, a')) return;
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !listBodyEl.contains(trigger)) return;
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  listBodyEl.addEventListener('keydown', e => {
    if (e.target.classList.contains('row-tag-input')) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitRowTag(e.target);
      } else if (e.key === 'Escape') {
        e.target.value = '';
        e.target.blur();
      }
      return;
    }
    if (e.target.classList.contains('loc-picker-name')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRowLocationFromPicker(e.target);
      } else if (e.key === 'Escape') {
        e.target.value = '';
        e.target.blur();
      }
    }
  });

  listBodyEl.addEventListener('change', e => {
    if (e.target.classList.contains('row-check')) {
      // bulk module handles this
      return;
    }
    if (e.target.classList.contains('row-tag-input')) {
      if (e.target.value.trim()) commitRowTag(e.target);
      return;
    }
    if (e.target.classList.contains('loc-picker-name')) {
      if (e.target.value.trim()) commitRowLocationFromPicker(e.target);
    }
  });

  // Card-preview hover is delegated at the document level so it works for the
  // list rows AND for banner/history rows that also use `.card-preview-link`.
  document.addEventListener('mouseover', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link) return;
    showCardPreview(link);
  });

  document.addEventListener('mouseout', e => {
    const link = e.target.closest('.card-preview-link');
    if (!link || link.contains(e.relatedTarget)) return;
    hideCardPreview();
  });

  lightboxEl.addEventListener('click', e => {
    if (e.target.closest('.lightbox-flip')) return;
    hideImageLightbox();
  });
  lightboxFlipBtn.addEventListener('click', () => {
    if (!lightboxBack) return;
    lightboxShowingBack = !lightboxShowingBack;
    const url = lightboxShowingBack ? lightboxBack : lightboxFront;
    lightboxImg.src = biggerImageUrl(url);
  });
}
