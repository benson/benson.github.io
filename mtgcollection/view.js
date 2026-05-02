import { state, DECK_GROUP_KEY, BINDER_SIZE_KEY } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  normalizeTag,
  biggerImageUrl,
  allCollectionLocations,
  allContainers,
  containerStats,
  ensureContainer,
  renameContainer,
  deleteEmptyContainer,
  deleteContainerAndUnlocateCards,
  formatLocationLabel,
  LOCATION_TYPES,
  DEFAULT_LOCATION_TYPE,
  normalizeDeckBoard,
  defaultDeckMetadata,
} from './collection.js';
import { save, commitCollectionChange } from './persistence.js';
import { openDetail, populateFilters } from './detail.js';
import { filteredSorted, syncClearFiltersBtn, hasActiveFilter } from './search.js';
import { groupDeck, firstCardForPanel, splitDeckBoards, deckStats, renderDeckStatsHtml, drawSampleHand } from './stats.js';
import { updateBulkBar } from './bulk.js';
import { paginateForBinder, sortForBinder, BINDER_SIZES, binderSlotCount } from './binder.js';
import { getSetIconUrl } from './setIcons.js';
import { recordEvent, captureBefore, locationDiffSummary } from './changelog.js';
import { setMultiselectValue, getMultiselectValue } from './multiselect.js';

const VALID_DECK_GROUPS = ['type', 'cmc', 'color', 'rarity'];
const VALID_BINDER_SIZES = Object.keys(BINDER_SIZES);
const RARITY_ABBR = { common: 'c', uncommon: 'u', rare: 'r', mythic: 'm', special: 's', bonus: 'b' };
const CONDITION_ABBR = { near_mint: 'nm', lightly_played: 'lp', moderately_played: 'mp', heavily_played: 'hp', damaged: 'dmg' };

// Switch out of locations-home (if there) and select the location in the
// multiselect. Effective shape (deck/binder/list) is auto-derived in render()
// from the single-container filter.
export function navigateToLocation(type, name) {
  state.viewMode = 'list';
  state.viewAsList = false;
  // Clear any stray `loc:` query so the multiselect filter is the source of truth.
  const searchInput = document.getElementById('searchInput');
  if (searchInput && /\bloc:/.test(searchInput.value)) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const filterEl = document.getElementById('filterLocation');
  if (filterEl) setMultiselectValue(filterEl, [type + ':' + name]);
  save();
  render();
}

// Derive the effective render shape from current state + active filters.
// 'locations' wins (it's a destination); otherwise: a single-location filter
// resolves to that location's natural shape, unless the user has toggled
// "view as list".
export function getEffectiveShape() {
  if (state.viewMode === 'locations') return 'locations';
  if (state.viewAsList) return 'list';
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return 'list';
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return 'list';
  const type = values[0].split(':')[0];
  if (type === 'deck') return 'deck';
  if (type === 'binder') return 'binder';
  return 'list';
}

export const LOC_ICONS = {
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
    summary: 'Tagged {card} +' + tag,
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
    summary: 'Tagged {card} -' + tag,
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

let locationsEl, listBodyEl, collectionSection, emptyState;
let cardPreviewEl, cardPreviewImg;
let lightboxEl, lightboxImg, lightboxFlipBtn;
let lightboxFront = null;
let lightboxBack = null;
let lightboxShowingBack = false;

export function render() {
  const shape = getEffectiveShape();
  document.querySelectorAll('.app-header-views .toggle-view').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
  });
  document.body.classList.toggle('view-list', shape === 'list');
  document.body.classList.toggle('view-deck', shape === 'deck');
  document.body.classList.toggle('view-locations', shape === 'locations');
  document.body.classList.toggle('has-collection', state.collection.length > 0);
  // Switching away from list shape always closes the right drawer
  if (shape !== 'list') closeRightDrawer();
  syncClearFiltersBtn();
  syncViewAsListToggles();
  const containers = allContainers();
  if (state.collection.length === 0 && containers.length === 0 && shape !== 'locations') {
    collectionSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
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
  applyBinderSizeButtons();

  const listContainer = document.getElementById('listView');
  const deckContainer = document.getElementById('deckView');
  const binderContainer = document.getElementById('binderView');
  const locationsContainer = document.getElementById('locationsView');
  const binderSizeCtl = document.getElementById('binderSizeControl');

  // Reset chrome
  locationsContainer.classList.remove('active');
  listContainer.classList.remove('active');
  deckContainer.classList.remove('active');
  binderContainer.classList.remove('active');
  binderSizeCtl.classList.add('hidden');

  if (shape === 'locations') {
    locationsContainer.classList.add('active');
    renderLocationsView(containers);
  } else if (shape === 'deck') {
    deckContainer.classList.add('active');
    renderDeckView(list);
  } else if (shape === 'binder') {
    binderContainer.classList.add('active');
    binderSizeCtl.classList.remove('hidden');
    renderBinderView(list);
  } else {
    listContainer.classList.add('active');
    listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
    syncSortIndicator();
  }
  updateBulkBar();
}

// Shape bar: shows the auto-shape and a toggle to override to list.
// Visible only when a single deck/binder filter would auto-shape the view.
function syncViewAsListToggles() {
  const autoType = (() => {
    if (state.viewMode === 'locations') return null;
    const filterEl = document.getElementById('filterLocation');
    if (!filterEl) return null;
    const values = getMultiselectValue(filterEl);
    if (values.length !== 1) return null;
    const type = values[0].split(':')[0];
    return (type === 'deck' || type === 'binder') ? type : null;
  })();
  const bar = document.getElementById('shapeBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !autoType);
  if (!autoType) return;
  const label = document.getElementById('shapeBarLabel');
  const btn = bar.querySelector('[data-view-as-list]');
  if (state.viewAsList) {
    label.textContent = 'showing as list';
    btn.textContent = 'back to ' + autoType + ' view';
  } else {
    label.textContent = 'showing as ' + autoType;
    btn.textContent = 'view as list';
  }
  btn.setAttribute('aria-pressed', state.viewAsList ? 'true' : 'false');
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

function formatPrice(c) {
  if (!c.price) return '';
  const base = '$' + c.price.toFixed(2);
  if (!c.priceFallback) return base;
  return base + '<span class="price-fallback-mark" title="regular usd shown when exact finish price is unavailable">*</span>';
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

function renderLocationsView(containers) {
  const typeLabels = { deck: 'decks', binder: 'binders', box: 'boxes' };
  const createHtml = `<form class="locations-create" id="locationsCreateForm">
    <span class="locations-create-label">new location</span>
    <div class="locations-create-types" role="radiogroup" aria-label="container type">
      ${LOCATION_TYPES.map((t, i) => `<label class="locations-create-type${i === 0 ? ' is-selected' : ''}">
        <input type="radio" name="locationsCreateType" value="${esc(t)}"${i === 0 ? ' checked' : ''}>
        <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
      </label>`).join('')}
    </div>
    <input id="locationsCreateName" type="text" placeholder="name" autocomplete="off">
    <button class="btn" type="submit">create</button>
  </form>`;
  const groups = LOCATION_TYPES.map(type => {
    const ofType = containers.filter(c => c.type === type);
    const cards = ofType.map(c => {
      const stats = containerStats(c);
      const value = stats.value > 0 ? ' &middot; $' + stats.value.toFixed(2) : '';
      const radioName = 'editLocType_' + esc(c.type) + '_' + esc(c.name);
      const typeRadiosHtml = LOCATION_TYPES.map(t => `<label class="loc-type-radio${t === c.type ? ' is-selected' : ''}">
        <input type="radio" name="${radioName}" value="${esc(t)}"${t === c.type ? ' checked' : ''}>
        <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
      </label>`).join('');
      return `<article class="location-card" data-loc-type="${esc(c.type)}" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
        <div class="location-card-name">
          ${LOC_ICONS[c.type] || LOC_ICONS.box}
          <span class="location-card-name-text">${esc(c.name)}</span>
          <button class="location-card-edit-btn" type="button" aria-label="edit">✎</button>
          <button class="location-card-menu-btn" type="button" aria-label="more options" aria-haspopup="menu">⋯</button>
        </div>
        <div class="location-card-menu" role="menu">
          <button class="location-card-menu-item location-delete" type="button" role="menuitem">delete</button>
        </div>
        <div class="location-card-stats">${stats.unique} unique &middot; ${stats.total} total${value}</div>
        <div class="location-card-edit-row">
          <div class="loc-type-radios">${typeRadiosHtml}</div>
          <input class="location-rename-input" type="text" value="${esc(c.name)}">
          <div class="location-card-edit-actions">
            <button class="btn location-rename-save" type="button">save</button>
            <button class="btn btn-secondary location-rename-cancel" type="button">cancel</button>
          </div>
        </div>
      </article>`;
    }).join('') || '<div class="deck-empty-prompt">no ' + esc(typeLabels[type]) + ' yet</div>';
    return `<section class="locations-group">
      <div class="locations-group-title">${esc(typeLabels[type])}</div>
      <div class="locations-list">${cards}</div>
    </section>`;
  }).join('');
  locationsEl.innerHTML = createHtml + groups;
}

function renderLegacyDeckCard(c, isLast) {
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
  const TYPE_HEADERS = { deck: 'decks', binder: 'binders', box: 'boxes' };
  const groups = LOCATION_TYPES.map(type => {
    const ofType = locations.filter(l => l.type === type);
    if (ofType.length === 0) return '';
    const chips = ofType.map(loc =>
      `<button type="button" class="deck-empty-chip" data-loc="${esc(formatLocationLabel(loc))}">${locationPillHtml(loc)}</button>`
    ).join('');
    return `<div class="deck-empty-group">
      <div class="deck-empty-group-label">${TYPE_HEADERS[type]}</div>
      <div class="deck-empty-chips-row">${chips}</div>
    </div>`;
  }).join('');
  targetEl.innerHTML = `<div class="deck-empty-state">
    <p class="deck-empty-prompt">${esc(label)} needs a filter — pick a location below</p>
    <div class="deck-empty-chips">${groups}</div>
  </div>`;
}

function currentDeckContainer() {
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return null;
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return null;
  const loc = normalizeLocation(values[0]);
  if (!loc || loc.type !== 'deck') return null;
  return ensureContainer(loc);
}

function renderDeckCard(c, isLast) {
  const name = c.resolvedName || c.name || '?';
  const idx = state.collection.indexOf(c);
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="deck-qty">x${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const lastClass = isLast ? ' deck-card-last' : '';
  return `<div class="deck-card detail-trigger${finishClass}${lastClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}
    <select class="deck-card-board" data-index="${idx}" aria-label="move ${esc(name)}">
      <option value="main"${normalizeDeckBoard(c.deckBoard) === 'main' ? ' selected' : ''}>main</option>
      <option value="sideboard"${normalizeDeckBoard(c.deckBoard) === 'sideboard' ? ' selected' : ''}>side</option>
      <option value="maybe"${normalizeDeckBoard(c.deckBoard) === 'maybe' ? ' selected' : ''}>maybe</option>
    </select>
  </div>`;
}

function renderDeckTextRows(list) {
  if (!list.length) return '<div class="deck-empty-prompt">no cards</div>';
  return list.map(c => `<div class="deck-text-row"><span>${c.qty || 1} ${esc(c.resolvedName || c.name || '')}</span><span>${esc((c.setCode || '').toUpperCase())} ${esc(c.cn || '')}</span></div>`).join('');
}

function renderDeckBoardSection(title, cards, { grouped = false } = {}) {
  const total = cards.reduce((s, c) => s + (c.qty || 1), 0);
  const body = grouped
    ? groupDeck(cards, state.deckGroupBy).map(col => {
      const colTotal = col.cards.reduce((s, c) => s + (c.qty || 1), 0);
      const stack = col.cards.map((c, i) => renderDeckCard(c, i === col.cards.length - 1)).join('');
      return `<div class="deck-col"><div class="deck-col-header">${esc(col.label)}<span class="deck-col-count">${colTotal}</span></div><div class="deck-stack">${stack}</div></div>`;
    }).join('')
    : cards.map((c, i) => renderDeckCard(c, i === cards.length - 1)).join('');
  return `<section class="deck-board-section">
    <div class="deck-board-header"><h3>${esc(title)}</h3><span>${total} cards</span></div>
    <div class="${grouped ? 'deck-columns' : 'deck-side-stack'}">${body || '<div class="deck-empty-prompt">no cards</div>'}</div>
  </section>`;
}

function renderLegacyDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');

  if (!hasActiveFilter()) {
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

function renderSampleHandPanel() {
  const handEl = document.getElementById('deckHandCards');
  const nextEl = document.getElementById('deckNextCards');
  if (!handEl || !nextEl) return;
  const deck = currentDeckContainer();
  const deckKey = deck ? deck.type + ':' + deck.name : '';
  if (!state.deckSampleHand || state.deckSampleHand.deckKey !== deckKey) {
    handEl.innerHTML = '<div class="deck-empty-prompt">draw a hand to preview opening texture</div>';
    nextEl.innerHTML = '';
    return;
  }
  const cardTile = c => {
    const name = c.resolvedName || c.name || '?';
    const idx = state.collection.indexOf(c);
    const img = c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">` : `<div class="placeholder">${esc(name)}</div>`;
    return `<button class="deck-hand-card" type="button" data-index="${idx}">${img}<span>${esc(name)}</span></button>`;
  };
  handEl.innerHTML = state.deckSampleHand.hand.map(cardTile).join('');
  nextEl.innerHTML = state.deckSampleHand.next.length
    ? '<span>next</span>' + state.deckSampleHand.next.map(c => `<button class="deck-next-card" type="button" data-index="${state.collection.indexOf(c)}">${esc(c.resolvedName || c.name || '?')}</button>`).join('')
    : '';
}

function renderDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');
  const deck = currentDeckContainer();

  if (!hasActiveFilter()) {
    if (deckActionsEl) deckActionsEl.classList.add('hidden');
    setDeckPreviewCard(null);
    renderEmptyScopeState(deckColumnsEl, 'deck');
    document.getElementById('deckSummary').textContent = '';
    return;
  }

  if (deckActionsEl) deckActionsEl.classList.remove('hidden');
  for (const c of list) c.deckBoard = normalizeDeckBoard(c.deckBoard);
  if (deck && (!deck.deck || typeof deck.deck !== 'object')) deck.deck = defaultDeckMetadata(deck.name);
  const meta = deck?.deck || defaultDeckMetadata(deck?.name || 'deck');
  const boards = splitDeckBoards(list);
  const stats = deckStats(list);
  const statHtml = renderDeckStatsHtml(boards.main);
  const format = meta.format || state.selectedFormat || 'unspecified format';
  const valueStr = stats.value > 0 ? '$' + stats.value.toFixed(2) : '-';
  const commanderNames = [meta.commander, meta.partner].filter(Boolean);
  const commanderHtml = commanderNames.length
    ? `<section class="deck-board-section deck-commanders"><div class="deck-board-header"><h3>commander</h3><span>${commanderNames.length}</span></div><div class="deck-text-list">${commanderNames.map(n => `<div class="deck-text-row"><span>${esc(n)}</span><span>metadata</span></div>`).join('')}</div></section>`
    : '';

  deckColumnsEl.innerHTML = `<div class="deck-workspace">
    <section class="deck-hero">
      <div>
        <div class="deck-kicker">deck</div>
        <h2>${esc(meta.title || deck?.name || 'deck')}</h2>
        <p>${esc(meta.description || 'No description yet.')}</p>
      </div>
      <div class="deck-hero-stats">
        <span><strong>${stats.main}</strong> main</span>
        <span><strong>${stats.sideboard}</strong> side</span>
        <span><strong>${stats.maybe}</strong> maybe</span>
        <span><strong>${valueStr}</strong> value</span>
        <button class="btn btn-secondary" type="button" data-copy-decklist>copy list</button>
      </div>
    </section>
    <form class="deck-metadata-form" id="deckMetadataForm">
      <input name="title" value="${esc(meta.title || '')}" placeholder="deck title" autocomplete="off">
      <input name="format" value="${esc(format === 'unspecified format' ? '' : format)}" placeholder="format" autocomplete="off">
      <input name="commander" value="${esc(meta.commander || '')}" placeholder="commander" autocomplete="off">
      <input name="partner" value="${esc(meta.partner || '')}" placeholder="partner" autocomplete="off">
      <textarea name="description" rows="2" placeholder="description">${esc(meta.description || '')}</textarea>
      <button class="btn" type="submit">save deck</button>
    </form>
    <div class="deck-dashboard">
      <section class="deck-stat-card"><h3>curve</h3>${statHtml.curveHtml}</section>
      <section class="deck-stat-card"><h3>summary</h3>
        <div class="breakdown-row"><span>format</span><span class="breakdown-count">${esc(format)}</span></div>
        <div class="breakdown-row"><span>lands</span><span class="breakdown-count">${stats.lands}</span></div>
        <div class="breakdown-row"><span>nonlands</span><span class="breakdown-count">${stats.nonlands}</span></div>
        <div class="breakdown-row"><span>avg mv</span><span class="breakdown-count">${stats.avgManaValue.toFixed(2)}</span></div>
        <div class="breakdown-row"><span>avg spell mv</span><span class="breakdown-count">${stats.avgSpellManaValue.toFixed(2)}</span></div>
      </section>
      <section class="deck-stat-card"><h3>types</h3>${statHtml.typeHtml}</section>
      <section class="deck-stat-card"><h3>colors</h3>${statHtml.colorHtml}</section>
    </div>
    <section class="deck-sample-hand" id="deckSampleHand">
      <div class="deck-board-header"><h3>sample hand</h3><div><button class="btn btn-secondary" type="button" data-sample-hand="draw">new hand</button><button class="btn btn-secondary" type="button" data-sample-hand="mulligan">mulligan</button></div></div>
      <div class="deck-hand-row" id="deckHandCards"></div>
      <div class="deck-next-row" id="deckNextCards"></div>
    </section>
    <div class="deck-content-grid">
      <main>
        ${commanderHtml}
        ${renderDeckBoardSection('mainboard', boards.main, { grouped: true })}
      </main>
      <aside class="deck-board-aside">
        ${renderDeckBoardSection('sideboard', boards.sideboard)}
        ${renderDeckBoardSection('maybeboard', boards.maybe)}
        <section class="deck-board-section"><div class="deck-board-header"><h3>text list</h3><span>${stats.total} cards</span></div><div class="deck-text-list">${renderDeckTextRows(list)}</div></section>
      </aside>
    </div>
  </div>`;

  const cols = groupDeck(boards.main, state.deckGroupBy);
  setDeckPreviewCard(firstCardForPanel(cols) || list[0] || null);
  renderSampleHandPanel();
  const summary = document.getElementById('deckSummary');
  summary.textContent = stats.total + ' cards - ' + format;
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

  if (!hasActiveFilter()) {
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
  const line = c => {
    const name = c.resolvedName || c.name || '';
    const setCode = (c.setCode || '').toUpperCase();
    const cn = c.cn || '';
    const finishMarker = c.finish === 'foil' ? ' *F*' : c.finish === 'etched' ? ' *E*' : '';
    return `${c.qty} ${name} (${setCode}) ${cn}${finishMarker}`;
  };
  const boards = splitDeckBoards(list);
  const sections = [
    ['Mainboard', boards.main],
    ['Sideboard', boards.sideboard],
    ['Maybeboard', boards.maybe],
  ].filter(([, cards]) => cards.length);
  return sections.map(([label, cards]) => label + '\n' + cards.map(line).join('\n')).join('\n\n');
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

const RIGHT_DRAWER_PANELS = ['addDetails'];

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
  locationsEl = document.getElementById('locationsView');
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
    if (!['list', 'locations'].includes(next)) return;
    if (state.viewMode === next) return;
    state.viewMode = next;
    state.viewAsList = false;
    save();
    render();
  });

  // Per-shape "view as list" toggle. Visible only when a single
  // deck/binder filter would otherwise auto-shape the view.
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('[data-view-as-list]');
    if (!btn) return;
    state.viewAsList = !state.viewAsList;
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
      const pill = chip.querySelector('.loc-pill');
      if (pill) navigateToLocation(pill.dataset.locType, pill.dataset.locName);
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
      const pill = chip.querySelector('.loc-pill');
      if (pill) navigateToLocation(pill.dataset.locType, pill.dataset.locName);
      return;
    }
    const handCard = e.target.closest('.deck-hand-card, .deck-next-card');
    if (handCard) {
      openDetail(parseInt(handCard.dataset.index, 10));
      return;
    }
    if (e.target.closest('select, input, textarea, button')) return;
    const card = e.target.closest('.deck-card');
    if (!card) return;
    openDetail(parseInt(card.dataset.index, 10));
  });

  document.getElementById('deckColumns').addEventListener('change', e => {
    const boardSelect = e.target.closest('.deck-card-board');
    if (!boardSelect) return;
    const entry = state.collection[parseInt(boardSelect.dataset.index, 10)];
    if (!entry) return;
    entry.deckBoard = normalizeDeckBoard(boardSelect.value);
    state.deckSampleHand = null;
    commitCollectionChange({ coalesce: true });
  });

  document.getElementById('deckColumns').addEventListener('submit', e => {
    if (e.target.id !== 'deckMetadataForm') return;
    e.preventDefault();
    const deck = currentDeckContainer();
    if (!deck) return;
    const fd = new FormData(e.target);
    deck.deck = {
      ...defaultDeckMetadata(deck.name),
      title: String(fd.get('title') || '').trim() || deck.name,
      format: String(fd.get('format') || '').trim(),
      commander: String(fd.get('commander') || '').trim(),
      partner: String(fd.get('partner') || '').trim(),
      description: String(fd.get('description') || '').trim(),
    };
    deck.updatedAt = Date.now();
    save();
    render();
  });

  document.getElementById('deckColumns').addEventListener('click', e => {
    const sampleBtn = e.target.closest('[data-sample-hand]');
    if (!sampleBtn) return;
    const boards = splitDeckBoards(filteredSorted());
    const size = sampleBtn.dataset.sampleHand === 'mulligan' ? 6 : 7;
    const deck = currentDeckContainer();
    state.deckSampleHand = {
      deckKey: deck ? deck.type + ':' + deck.name : '',
      ...drawSampleHand(boards.main, size),
    };
    renderSampleHandPanel();
  });

  document.getElementById('deckColumns').addEventListener('click', async e => {
    const copyBtn = e.target.closest('[data-copy-decklist]');
    if (!copyBtn) return;
    const text = buildDecklistText(filteredSorted());
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('decklist copied', 'success');
    } catch (err) {
      showFeedback('clipboard unavailable: ' + err.message, 'error');
    }
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

  locationsEl.addEventListener('change', e => {
    if (e.target.name !== 'locationsCreateType') return;
    const labels = locationsEl.querySelectorAll('.locations-create-type');
    labels.forEach(l => {
      const input = l.querySelector('input');
      l.classList.toggle('is-selected', !!(input && input.checked));
    });
  });

  locationsEl.addEventListener('submit', e => {
    if (e.target.id !== 'locationsCreateForm') return;
    e.preventDefault();
    const checked = document.querySelector('input[name="locationsCreateType"]:checked');
    const type = checked ? checked.value : 'box';
    const nameInput = document.getElementById('locationsCreateName');
    const created = ensureContainer({ type, name: nameInput.value });
    if (!created) return;
    save();
    populateFilters();
    render();
  });

  // Type-radio click delegation inside edit rows: toggle is-selected on the active label.
  locationsEl.addEventListener('change', e => {
    if (!e.target || e.target.type !== 'radio') return;
    if (!e.target.name || !e.target.name.startsWith('editLocType_')) return;
    const card = e.target.closest('.location-card');
    if (!card) return;
    card.querySelectorAll('.location-card-edit-row .loc-type-radio').forEach(l => {
      const r = l.querySelector('input');
      l.classList.toggle('is-selected', !!(r && r.checked));
    });
  });

  // Close any open card menu when clicking outside.
  document.addEventListener('click', e => {
    if (!e.target.closest('.location-card-menu-btn') && !e.target.closest('.location-card-menu')) {
      locationsEl.querySelectorAll('.location-card.menu-open').forEach(c => c.classList.remove('menu-open'));
    }
  });

  locationsEl.addEventListener('click', e => {
    const card = e.target.closest('.location-card');
    if (!card) return;
    const loc = { type: card.dataset.locType, name: card.dataset.locName };

    if (e.target.closest('.location-card-menu-btn')) {
      e.stopPropagation();
      const wasOpen = card.classList.contains('menu-open');
      locationsEl.querySelectorAll('.location-card.menu-open').forEach(c => c.classList.remove('menu-open'));
      if (!wasOpen) card.classList.add('menu-open');
      return;
    }
    if (e.target.closest('.location-card-edit-btn')) {
      e.stopPropagation();
      card.classList.add('editing');
      card.classList.remove('menu-open');
      const input = card.querySelector('.location-rename-input');
      if (input) { input.focus(); input.select(); }
      return;
    }
    if (e.target.closest('.location-rename-cancel')) {
      card.classList.remove('editing');
      return;
    }
    if (e.target.closest('.location-rename-save')) {
      const input = card.querySelector('.location-rename-input');
      const checked = card.querySelector('.location-card-edit-row input[type="radio"]:checked');
      const newType = checked ? checked.value : loc.type;
      const newName = input ? input.value : loc.name;
      if (renameContainer(loc, { type: newType, name: newName })) {
        commitCollectionChange({ coalesce: true });
      }
      return;
    }
    if (e.target.closest('.location-delete')) {
      const stats = containerStats(loc);
      if (stats.total > 0) {
        const msg = 'delete ' + loc.type + ' "' + loc.name + '"?\n\nthis will clear the location from '
          + stats.total + ' card' + (stats.total === 1 ? '' : 's')
          + ' (' + stats.unique + ' unique). the cards stay in your collection.';
        if (!confirm(msg)) return;
        deleteContainerAndUnlocateCards(loc);
        commitCollectionChange();
      } else {
        if (!confirm('delete ' + loc.type + ' "' + loc.name + '"?')) return;
        if (deleteEmptyContainer(loc)) {
          save();
          populateFilters();
          render();
        }
      }
      return;
    }
    // Click on body / name / stats (not on a control) → open the container.
    // Don't open while editing or while the menu is open.
    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    if (e.target.closest('.location-card-edit-row')) return;
    navigateToLocation(loc.type, loc.name);
  });

  // Keyboard activation: Enter/Space on a focused card opens it (matches the
  // role="button" we set on .location-card).
  locationsEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.location-card');
    if (!card || e.target !== card) return;
    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    e.preventDefault();
    navigateToLocation(card.dataset.locType, card.dataset.locName);
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
    if (e.target.closest('input, select, button, a, .loc-pill')) return;
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

  // Clicking a `.loc-pill` (in list, grid, or anywhere) navigates to that
  // location's view + filter. The remove `×` and the deck-empty-chip
  // wrapper handle their own clicks.
  document.addEventListener('click', e => {
    if (e.target.closest('.loc-pill-remove')) return;
    if (e.target.closest('.deck-empty-chip')) return;
    const pill = e.target.closest('.loc-pill');
    if (!pill) return;
    const type = pill.dataset.locType;
    const name = pill.dataset.locName;
    if (type && name) navigateToLocation(type, name);
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
