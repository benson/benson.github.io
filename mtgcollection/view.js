import { state, DECK_GROUP_KEY, DECK_VIEW_PREFS_KEY, BINDER_SIZE_KEY, SCRYFALL_API } from './state.js';
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
  getCardImageUrl,
  getCardBackImageUrl,
  makeEntry,
  getUsdPrice,
  resolveDeckListEntry,
  addToDeckList,
  removeFromDeckList,
  moveDeckListEntryBoard,
} from './collection.js';
import { save, commitCollectionChange } from './persistence.js';
import { openDetail, populateFilters } from './detail.js';
import { setSelectedLocation } from './add.js';
import { filteredSorted, syncClearFiltersBtn, hasActiveFilter } from './search.js';
import { groupDeck, firstCardForPanel, splitDeckBoards, deckStats, renderDeckStatsHtml, drawSampleHand } from './stats.js';
import { updateBulkBar } from './bulk.js';
import { paginateForBinder, sortForBinder, BINDER_SIZES, binderSlotCount } from './binder.js';
import { getSetIconUrl } from './setIcons.js';
import { recordEvent, captureBefore, locationDiffSummary, setHistoryScope } from './changelog.js';
import { setMultiselectValue, getMultiselectValue } from './multiselect.js';
import { buildDeckExport, defaultDeckExportOptions } from './deckExport.js';
import { openShareModal } from './share.js';

const VALID_DECK_GROUPS = ['type', 'cmc', 'color', 'rarity'];
const VALID_DECK_MODES = ['visual', 'text', 'stats', 'hands', 'notes'];
const VALID_DECK_BOARD_FILTERS = ['all', 'main', 'sideboard', 'maybe'];
const VALID_DECK_CARD_SIZES = ['small', 'medium', 'large'];
const VALID_DECK_OWNERSHIP_VIEWS = ['decklist', 'building'];
const VALID_BINDER_SIZES = Object.keys(BINDER_SIZES);
const RARITY_ABBR = { common: 'c', uncommon: 'u', rare: 'r', mythic: 'm', special: 's', bonus: 'b' };
const CONDITION_ABBR = { near_mint: 'nm', lightly_played: 'lp', moderately_played: 'mp', heavily_played: 'hp', damaged: 'dmg' };

// Navigate into a specific container. The viewMode is set to the appropriate
// top-level route; the location filter is set so getEffectiveShape() can
// resolve to the workspace shape (deck/binder) or filtered list (box).
export function navigateToLocation(type, name) {
  if (type === 'deck') state.viewMode = 'decks';
  else if (type === 'binder' || type === 'box') state.viewMode = 'storage';
  else state.viewMode = 'collection';
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

// Derive the effective render shape from viewMode + active container filter.
// - 'collection' → always 'collection' (flat list across all locations).
// - 'decks' → 'deck' workspace if a single deck filter is set, else 'decks-home'.
// - 'storage' → 'binder' if a single binder filter is set; 'box' if a single
//   box filter is set; else 'storage-home'.
// 'viewAsList' is a binder-only escape hatch.
export function getEffectiveShape() {
  // Viewer mode always renders the snapshot's deck workspace (slice 1 is
  // deck-only). Skip the filter-multiselect dance.
  if (state.shareSnapshot) return 'deck';
  if (state.viewMode === 'collection') return 'collection';
  const filterEl = document.getElementById('filterLocation');
  const values = filterEl ? getMultiselectValue(filterEl) : [];
  const single = values.length === 1 ? values[0] : null;
  const singleType = single ? single.split(':')[0] : null;
  if (state.viewMode === 'decks') {
    if (singleType === 'deck') return 'deck';
    return 'decks-home';
  }
  if (state.viewMode === 'storage') {
    if (singleType === 'binder') return state.viewAsList ? 'box' : 'binder';
    if (singleType === 'box') return 'box';
    return 'storage-home';
  }
  return 'collection';
}

function currentDeckScope() {
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return null;
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return null;
  const [type, ...rest] = values[0].split(':');
  if (type !== 'deck') return null;
  return { type, name: rest.join(':') };
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
  // New top-level viewMode classes (drive per-route CSS)
  document.body.classList.toggle('view-collection', state.viewMode === 'collection');
  document.body.classList.toggle('view-decks', state.viewMode === 'decks');
  document.body.classList.toggle('view-storage', state.viewMode === 'storage');
  // Shape classes (drive per-shape CSS) — keep legacy 'view-list'/'view-locations'
  // names as aliases so existing CSS keeps working without a sweep.
  document.body.classList.toggle('view-list', shape === 'collection' || shape === 'box');
  document.body.classList.toggle('view-deck', shape === 'deck');
  document.body.classList.toggle('view-binder', shape === 'binder');
  document.body.classList.toggle('view-locations', shape === 'decks-home' || shape === 'storage-home');
  document.body.classList.toggle('view-decks-home', shape === 'decks-home');
  document.body.classList.toggle('view-storage-home', shape === 'storage-home');
  document.body.classList.toggle('has-collection', state.collection.length > 0);
  document.body.classList.toggle('deck-ownership-decklist', shape === 'deck' && state.deckOwnershipView === 'decklist');
  // Share-mode UI: banner visible whenever we're rendering someone else's
  // snapshot. The body class also gates write affordances via CSS.
  document.body.classList.toggle('share-mode', !!state.shareSnapshot);
  const shareBanner = document.getElementById('shareBanner');
  if (shareBanner) {
    if (state.shareSnapshot) {
      const deckName = state.shareSnapshot.container?.name || 'deck';
      shareBanner.innerHTML = '<span>viewing shared deck <strong>' + esc(deckName) + '</strong> — read-only</span>'
        + ' <button class="btn btn-secondary" type="button" data-share-banner-action="exit">exit</button>';
      shareBanner.classList.remove('hidden');
    } else {
      shareBanner.classList.add('hidden');
    }
  }
  // Right drawer is only meaningful for the flat list / collection / deck shape
  if (shape !== 'collection' && shape !== 'box' && shape !== 'deck') closeRightDrawer();
  syncClearFiltersBtn();
  syncViewAsListToggles();
  setHistoryScope(shape === 'deck' ? currentDeckScope() : null);
  const containers = allContainers();
  // Decks-home and storage-home render even on an empty collection so the
  // user can create a container before adding cards.
  const isHomeShape = shape === 'decks-home' || shape === 'storage-home';
  if (state.collection.length === 0 && containers.length === 0 && !isHomeShape) {
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

  if (shape === 'decks-home') {
    locationsContainer.classList.add('active');
    renderDecksHome(containers);
  } else if (shape === 'storage-home') {
    locationsContainer.classList.add('active');
    renderStorageHome(containers);
  } else if (shape === 'deck') {
    deckContainer.classList.add('active');
    renderDeckView(list);
  } else if (shape === 'binder') {
    binderContainer.classList.add('active');
    binderSizeCtl.classList.remove('hidden');
    renderBinderView(list);
  } else {
    // 'collection' or 'box' — both render as flat list. 'box' is just a
    // collection view filtered to a single box container.
    listContainer.classList.add('active');
    listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
    syncSortIndicator();
  }
  updateBulkBar();
}

// Shape bar: shows the auto-shape and a toggle to override to list.
// Now binder-only — the only shape with a meaningful "view as list" escape.
function syncViewAsListToggles() {
  const autoType = (() => {
    if (state.viewMode !== 'storage') return null;
    const filterEl = document.getElementById('filterLocation');
    if (!filterEl) return null;
    const values = getMultiselectValue(filterEl);
    if (values.length !== 1) return null;
    const type = values[0].split(':')[0];
    return type === 'binder' ? type : null;
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

// Edit-row markup shared by both home views. Matches the original
// `.location-card-edit-row` structure so existing rename/save handlers work.
function containerEditRowHtml(c, allowedTypes = LOCATION_TYPES) {
  const radioName = 'editLocType_' + esc(c.type) + '_' + esc(c.name);
  const typeRadiosHtml = allowedTypes.map(t => `<label class="loc-type-radio${t === c.type ? ' is-selected' : ''}">
    <input type="radio" name="${radioName}" value="${esc(t)}"${t === c.type ? ' checked' : ''}>
    <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
  </label>`).join('');
  return `<div class="location-card-edit-row">
    <div class="loc-type-radios">${typeRadiosHtml}</div>
    <input class="location-rename-input" type="text" value="${esc(c.name)}">
    <div class="location-card-edit-actions">
      <button class="btn location-rename-save" type="button">save</button>
      <button class="btn btn-secondary location-rename-cancel" type="button">cancel</button>
    </div>
  </div>`;
}

// Storage home — boxes and binders only. Each tile keeps the existing
// skeumorphic styling. Handlers are class-name driven (.location-card,
// .location-card-edit-btn, etc.) so they fire unchanged.
function renderStorageHome(containers) {
  const STORAGE_TYPES = ['binder', 'box'];
  const typeLabels = { binder: 'binders', box: 'boxes' };
  const createHtml = `<form class="locations-create" id="locationsCreateForm">
    <span class="locations-create-label">new container</span>
    <div class="locations-create-types" role="radiogroup" aria-label="container type">
      ${STORAGE_TYPES.map((t, i) => `<label class="locations-create-type${i === 0 ? ' is-selected' : ''}">
        <input type="radio" name="locationsCreateType" value="${esc(t)}"${i === 0 ? ' checked' : ''}>
        <span class="loc-pill loc-pill-${esc(t)}">${LOC_ICONS[t]}<span>${esc(t)}</span></span>
      </label>`).join('')}
    </div>
    <input id="locationsCreateName" type="text" placeholder="name" autocomplete="off">
    <button class="btn" type="submit">create</button>
  </form>`;
  const groups = STORAGE_TYPES.map(type => {
    const ofType = containers.filter(c => c.type === type);
    const cards = ofType.map(c => {
      const stats = containerStats(c);
      const value = stats.value > 0 ? ' &middot; $' + stats.value.toFixed(2) : '';
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
        ${containerEditRowHtml(c, STORAGE_TYPES)}
      </article>`;
    }).join('') || '<div class="deck-empty-prompt">no ' + esc(typeLabels[type]) + ' yet</div>';
    return `<section class="locations-group">
      <div class="locations-group-title">${esc(typeLabels[type])}</div>
      <div class="locations-list">${cards}</div>
    </section>`;
  }).join('');
  locationsEl.innerHTML = createHtml + groups;
}

// Compute decklist total + owned fraction for a deck container.
function deckOwnership(deck) {
  const list = Array.isArray(deck.deckList) ? deck.deckList : [];
  const total = list.reduce((s, e) => s + (e.qty || 0), 0);
  let owned = 0;
  let value = 0;
  for (const entry of list) {
    const r = resolveDeckListEntry(entry, state.collection);
    owned += Math.min(entry.qty || 0, r.ownedQty);
    if (r.primary) value += (r.primary.price || 0) * (entry.qty || 0);
  }
  return { total, owned, value };
}

// Decks home — only deck containers. Tiles show commander art + format badge
// + owned fraction. The create form has no type picker (always 'deck').
function renderDecksHome(containers) {
  const decks = containers.filter(c => c.type === 'deck');
  const createHtml = `<form class="locations-create locations-create-decks" id="locationsCreateForm">
    <span class="locations-create-label">new deck</span>
    <input type="hidden" name="locationsCreateType" value="deck">
    <input id="locationsCreateName" type="text" placeholder="deck name" autocomplete="off">
    <button class="btn" type="submit">create deck</button>
  </form>`;
  const tiles = decks.map(c => {
    const meta = c.deck || defaultDeckMetadata(c.name);
    const own = deckOwnership(c);
    const formatBadge = meta.format
      ? `<span class="deck-home-badge deck-home-format">${esc(meta.format)}</span>`
      : '';
    const commanderArt = meta.commanderImageUrl
      ? `<div class="deck-home-art"><img src="${esc(meta.commanderImageUrl)}" alt="" loading="lazy"></div>`
      : `<div class="deck-home-art deck-home-art-empty">${LOC_ICONS.deck}</div>`;
    const valueStr = own.value > 0 ? ' &middot; $' + own.value.toFixed(2) : '';
    const ownedStr = own.total > 0 ? `${own.owned}/${own.total} owned` : 'empty deck';
    return `<article class="location-card deck-home-card" data-loc-type="deck" data-loc-name="${esc(c.name)}" tabindex="0" role="button" aria-label="open ${esc(c.name)}">
      ${commanderArt}
      <div class="location-card-name">
        ${LOC_ICONS.deck}
        <span class="location-card-name-text">${esc(c.name)}</span>
        ${formatBadge}
        <button class="location-card-edit-btn" type="button" aria-label="edit">✎</button>
        <button class="location-card-menu-btn" type="button" aria-label="more options" aria-haspopup="menu">⋯</button>
      </div>
      <div class="location-card-menu" role="menu">
        <button class="location-card-menu-item location-delete" type="button" role="menuitem">delete</button>
      </div>
      <div class="location-card-stats">${esc(ownedStr)}${valueStr}</div>
      ${containerEditRowHtml(c, ['deck'])}
    </article>`;
  }).join('') || '<div class="deck-empty-prompt">no decks yet</div>';
  locationsEl.innerHTML = createHtml + `<section class="locations-group">
    <div class="locations-list">${tiles}</div>
  </section>`;
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
  // Viewer mode: the snapshot's deck IS the current deck. Skip the
  // multiselect (which doesn't exist meaningfully in share-mode anyway).
  if (state.shareSnapshot?.container?.type === 'deck') {
    const snapDeck = state.shareSnapshot.container;
    return ensureContainer({ type: 'deck', name: snapDeck.name });
  }
  const filterEl = document.getElementById('filterLocation');
  if (!filterEl) return null;
  const values = getMultiselectValue(filterEl);
  if (values.length !== 1) return null;
  const loc = normalizeLocation(values[0]);
  if (!loc || loc.type !== 'deck') return null;
  return ensureContainer(loc);
}

function currentDeckMetadata() {
  const deck = currentDeckContainer();
  return deck?.deck || defaultDeckMetadata(deck?.name || 'deck');
}

export function renderDeckCard(c, isLast) {
  const name = c.resolvedName || c.name || '?';
  const idx = c.inventoryIndex >= 0 ? c.inventoryIndex : -1;
  const sid = c.scryfallId || '';
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="deck-qty">x${c.qty}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const placeholderClass = c.placeholder ? ' deck-card-placeholder' : '';
  const lastClass = isLast ? ' deck-card-last' : '';
  const board = normalizeDeckBoard(c.deckBoard);
  const menuId = 'deck-card-menu-' + sid + '-' + board;
  // Stash enough on the article that the hover handler can synthesize a
  // preview for placeholders (cards in the decklist but not yet in inventory).
  const dataAttrs = `data-scryfall-id="${esc(sid)}" data-board="${esc(board)}" data-inventory-index="${idx}"`
    + ` data-card-name="${esc(name)}"`
    + ` data-image-url="${esc(c.imageUrl || '')}"`
    + ` data-back-image-url="${esc(c.backImageUrl || '')}"`
    + ` data-card-qty="${c.qty || 1}"`
    + ` data-card-finish="${esc(c.finish || 'normal')}"`
    + ` data-card-price="${c.price || 0}"`;
  const moveItem = (targetBoard, label) =>
    `<button role="menuitem" type="button" data-card-action="move-board" data-board-target="${targetBoard}" ${dataAttrs}${board === targetBoard ? ' disabled' : ''}>${esc(label)}</button>`;
  const openItem = idx >= 0
    ? `<button role="menuitem" type="button" data-card-action="open" data-inventory-index="${idx}">open details</button>`
    : '';
  const removeLabel = c.qty > 1 ? `remove ${c.qty} from deck` : 'remove from deck';
  return `<article class="deck-card${finishClass}${placeholderClass}${lastClass}" ${dataAttrs}>
    <button class="deck-card-face detail-trigger" type="button" data-card-action="open" data-inventory-index="${idx}" aria-label="open ${esc(name)} details">${img}${qty}</button>
    <button class="deck-card-menu-btn" type="button" data-card-menu-toggle aria-label="card actions for ${esc(name)}" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}">...</button>
    <div class="deck-card-menu" id="${menuId}" role="menu" hidden>
      ${openItem}
      ${moveItem('main', 'move to mainboard')}
      ${moveItem('sideboard', 'move to sideboard')}
      ${moveItem('maybe', 'move to maybeboard')}
      <button role="menuitem" type="button" class="deck-card-menu-danger" data-card-action="remove-from-deck" ${dataAttrs}>${esc(removeLabel)}</button>
    </div>
  </article>`;
}

function closeDeckCardMenus(root = document) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.deck-card.menu-open').forEach(card => {
    card.classList.remove('menu-open');
    const toggle = card.querySelector('[data-card-menu-toggle]');
    const menu = card.querySelector('.deck-card-menu');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
}

function openDeckCardMenu(toggle, { focusFirst = false } = {}) {
  const card = toggle?.closest('.deck-card');
  const menu = card?.querySelector('.deck-card-menu');
  if (!card || !menu) return;
  closeDeckCardMenus(document.getElementById('deckColumns') || document);
  card.classList.add('menu-open');
  menu.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  if (focusFirst) {
    const first = menu.querySelector('[role="menuitem"]:not([disabled])');
    if (first) first.focus();
  }
}

function toggleDeckCardMenu(toggle) {
  const card = toggle?.closest('.deck-card');
  if (!card) return;
  if (card.classList.contains('menu-open')) {
    closeDeckCardMenus(card.parentElement || document);
  } else {
    openDeckCardMenu(toggle);
  }
}

function moveFocusInDeckCardMenu(menu, current, direction) {
  const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
  if (!items.length) return;
  const idx = Math.max(0, items.indexOf(current));
  items[(idx + direction + items.length) % items.length].focus();
}

function deckCardEventPayload(entry) {
  return {
    name: entry.resolvedName || entry.name || 'card',
    imageUrl: entry.imageUrl || '',
    backImageUrl: entry.backImageUrl || '',
  };
}

// Move a decklist entry between boards (main/sideboard/maybe). Only mutates
// the deck container's decklist — physical inventory locations are untouched.
function moveDeckCardToBoard(scryfallId, fromBoard, rawBoard) {
  const deck = currentDeckContainer();
  if (!deck || !scryfallId) return;
  const targetBoard = normalizeDeckBoard(rawBoard);
  const currentBoard = normalizeDeckBoard(fromBoard);
  if (targetBoard === currentBoard) return;
  const entry = (deck.deckList || []).find(e => e.scryfallId === scryfallId && e.board === currentBoard);
  if (!entry) return;
  if (!moveDeckListEntryBoard(deck, scryfallId, currentBoard, targetBoard)) return;
  state.deckSampleHand = null;
  const deckLoc = deck.type + ':' + deck.name;
  recordEvent({
    type: 'edit',
    summary: 'Moved {card} to ' + (targetBoard === 'maybe' ? 'maybeboard' : targetBoard),
    cards: [{ name: entry.name || '', imageUrl: entry.imageUrl || '', backImageUrl: entry.backImageUrl || '' }],
    scope: 'deck',
    deckLocation: deckLoc,
  });
  commitCollectionChange();
}

// Remove a decklist entry from the deck. Inventory is left alone — physical
// cards keep their location.
function removeDeckCardFromDeck(scryfallId, board) {
  const deck = currentDeckContainer();
  if (!deck || !scryfallId) return;
  const norm = normalizeDeckBoard(board);
  const entry = (deck.deckList || []).find(e => e.scryfallId === scryfallId && e.board === norm);
  if (!entry) return;
  if (!removeFromDeckList(deck, scryfallId, norm)) return;
  state.deckSampleHand = null;
  const deckLoc = deck.type + ':' + deck.name;
  recordEvent({
    type: 'edit',
    summary: 'Removed {card} from {loc:' + deck.type + ':' + deck.name + '}',
    cards: [{ name: entry.name || '', imageUrl: entry.imageUrl || '', backImageUrl: entry.backImageUrl || '' }],
    scope: 'deck',
    deckLocation: deckLoc,
  });
  commitCollectionChange();
}

function handleDeckCardAction(actionEl) {
  const action = actionEl?.dataset.cardAction;
  closeDeckCardMenus(document.getElementById('deckColumns') || document);
  if (action === 'open') {
    const idx = parseInt(actionEl.dataset.inventoryIndex || '-1', 10);
    if (idx >= 0) openDetail(idx);
    return;
  }
  const sid = actionEl?.dataset.scryfallId;
  const board = actionEl?.dataset.board;
  if (!sid || !board) return;
  if (action === 'move-board') {
    moveDeckCardToBoard(sid, board, actionEl.dataset.boardTarget);
  } else if (action === 'remove-from-deck') {
    removeDeckCardFromDeck(sid, board);
  }
}

function renderDeckTextRows(list) {
  if (!list.length) return '<div class="deck-empty-prompt">no cards</div>';
  return list.map(c => `<div class="deck-text-row"><span>${c.qty || 1} ${esc(c.resolvedName || c.name || '')}</span><span>${esc((c.setCode || '').toUpperCase())} ${esc(c.cn || '')}</span></div>`).join('');
}

const BOARD_LABEL = { main: 'main', sideboard: 'side', maybe: 'maybe' };

function renderDeckTextRow(c) {
  const name = c.resolvedName || c.name || '(unknown)';
  const index = c.inventoryIndex >= 0 ? c.inventoryIndex : -1;
  const previewClasses = c.imageUrl ? 'card-name-button card-preview-link detail-trigger' : 'card-name-button detail-trigger';
  const previewAttr = c.imageUrl ? ` data-preview-url="${esc(c.imageUrl)}"` : '';
  const setCodeLower = (c.setCode || '').toLowerCase();
  const setCode = setCodeLower.toUpperCase();
  const iconUrl = setCodeLower ? getSetIconUrl(setCodeLower) : '';
  const setIcon = iconUrl
    ? `<img class="set-icon" src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">`
    : '';
  const placeholderCls = c.placeholder ? ' deck-text-row-placeholder' : '';
  const physicalLoc = c.placeholder
    ? '<span class="deck-row-loc deck-row-loc-placeholder">placeholder</span>'
    : c.location
      ? `<span class="deck-row-loc">in ${esc(c.location.type)}:${esc(c.location.name)}</span>`
      : '';
  return `<tr class="detail-trigger${placeholderCls}" data-index="${index}">
    <td class="card-name-cell"><button class="${previewClasses}" type="button" data-index="${index}"${previewAttr}>${esc(name)}</button>${physicalLoc}</td>
    <td class="muted set-cell">${setIcon}${esc(setCode)}</td>
    <td class="muted cn-cell">${esc(c.cn || '')}</td>
    <td class="muted finish-cell">${esc(c.finish)}</td>
    <td class="muted rarity-cell" title="${esc(c.rarity || '')}">${esc(RARITY_ABBR[c.rarity] || c.rarity || '')}</td>
    <td class="muted condition-cell" title="${esc((c.condition || '').replace(/_/g, ' '))}">${esc(CONDITION_ABBR[c.condition] || (c.condition || '').replace(/_/g, ' '))}</td>
    <td class="tags-cell">${(c.tags || []).map(t => `<span class="row-tag">${esc(t)}</span>`).join('')}</td>
    <td class="qty-cell">${c.qty}</td>
    <td class="muted price-cell">${formatPrice(c)}</td>
  </tr>`;
}

function renderDeckBoardSection(title, cards, { grouped = false } = {}) {
  const total = cards.reduce((s, c) => s + (c.qty || 1), 0);
  const value = cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
  const body = grouped
    ? groupDeck(cards, state.deckGroupBy).map(col => {
      const colTotal = col.cards.reduce((s, c) => s + (c.qty || 1), 0);
      const colValue = col.cards.reduce((s, c) => s + (c.price || 0) * (c.qty || 1), 0);
      const valueStr = state.deckShowPrices && colValue > 0 ? ` - $${colValue.toFixed(2)}` : '';
      const stack = col.cards.map((c, i) => renderDeckCard(c, i === col.cards.length - 1)).join('');
      return `<div class="deck-col"><div class="deck-col-header">${esc(col.label)}<span class="deck-col-count">${colTotal}${esc(valueStr)}</span></div><div class="deck-stack">${stack}</div></div>`;
    }).join('')
    : cards.map((c, i) => renderDeckCard(c, i === cards.length - 1)).join('');
  const valueStr = state.deckShowPrices && value > 0 ? ` - $${value.toFixed(2)}` : '';
  return `<section class="deck-board-section">
    <div class="deck-board-header"><h3>${esc(title)}</h3><span>${total} cards${esc(valueStr)}</span></div>
    <div class="${grouped ? 'deck-columns' : 'deck-side-stack'}">${body || '<div class="deck-empty-prompt">no cards</div>'}</div>
  </section>`;
}

function renderDeckStatsDashboard(stats, statHtml, format) {
  return `<div class="deck-dashboard">
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
  </div>`;
}

function boardLabel(board) {
  return board === 'main' ? 'mainboard' : board === 'sideboard' ? 'sideboard' : 'maybeboard';
}

function filterDeckBoards(boards, filter) {
  if (filter === 'main') return [['main', boards.main]];
  if (filter === 'sideboard') return [['sideboard', boards.sideboard]];
  if (filter === 'maybe') return [['maybe', boards.maybe]];
  return [['main', boards.main], ['sideboard', boards.sideboard], ['maybe', boards.maybe]];
}

function renderDeckTextMode(boards) {
  const sections = filterDeckBoards(boards, state.deckBoardFilter);
  const cards = sections.flatMap(([, c]) => c);
  if (!cards.length) {
    return `<div class="deck-text-mode"><div class="deck-empty-prompt">no cards</div></div>`;
  }
  return `<div class="deck-text-mode">
    <table class="deck-text-table">
      <thead>
        <tr>
          <th>name</th>
          <th>set</th>
          <th>cn</th>
          <th>finish</th>
          <th>rarity</th>
          <th>condition</th>
          <th>tags</th>
          <th>qty</th>
          <th>price</th>
        </tr>
      </thead>
      <tbody>${cards.map(c => renderDeckTextRow(c)).join('')}</tbody>
    </table>
  </div>`;
}

function renderDeckNotesMode(model) {
  const hasNotes = !!model.description;
  return `<section class="deck-board-section deck-notes-panel">
    <div class="deck-board-header"><h3>notes</h3><button class="btn btn-secondary" type="button" data-edit-deck-details aria-controls="deckDetailsEditor" aria-expanded="false">edit details</button></div>
    <p class="${hasNotes ? '' : 'deck-empty-prompt'}">${esc(hasNotes ? model.description : 'No deck notes yet.')}</p>
  </section>`;
}

function renderDeckSampleHandSection() {
  return `<section class="deck-sample-hand" id="deckSampleHand">
    <div class="deck-board-header"><h3>sample hand</h3><div><button class="btn btn-secondary" type="button" data-sample-hand="draw">new hand</button><button class="btn btn-secondary" type="button" data-sample-hand="mulligan">mulligan</button></div></div>
    <div class="deck-hand-cards" id="deckHandCards"></div>
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
  if (!handEl) return;
  const deck = currentDeckContainer();
  const deckKey = deck ? deck.type + ':' + deck.name : '';
  if (!state.deckSampleHand || state.deckSampleHand.deckKey !== deckKey) {
    handEl.innerHTML = '<div class="deck-empty-prompt">draw a hand to preview opening texture</div>';
    return;
  }
  // Use the same deck-card renderer as the visual mode so cards size + look
  // identical and the existing hover-preview delegation just works. Each
  // hand entry is a single drawn card — override qty to 1 so the ×N badge
  // doesn't render the deck total (drawSampleHand pushes the same card
  // reference N times for an N-of, so the underlying object still has
  // qty: N).
  const hand = state.deckSampleHand.hand;
  handEl.innerHTML = hand.map((c, i) =>
    renderDeckCard({ ...c, qty: 1 }, i === hand.length - 1)
  ).join('');
}

export function deckDetailsViewModel(deck, meta = {}, stats = {}, selectedFormat = '') {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const safeStats = stats && typeof stats === 'object' ? stats : {};
  const deckName = String(deck?.name || '');
  const title = String(safeMeta.title || '').trim();
  const description = String(safeMeta.description || '').trim();
  const formatInput = String(safeMeta.format || selectedFormat || '').trim();
  const commander = String(safeMeta.commander || '').trim();
  const commanderScryfallId = String(safeMeta.commanderScryfallId || '').trim();
  const commanderImageUrl = String(safeMeta.commanderImageUrl || '').trim();
  const commanderBackImageUrl = String(safeMeta.commanderBackImageUrl || '').trim();
  const partner = String(safeMeta.partner || '').trim();
  const partnerScryfallId = String(safeMeta.partnerScryfallId || '').trim();
  const partnerImageUrl = String(safeMeta.partnerImageUrl || '').trim();
  const partnerBackImageUrl = String(safeMeta.partnerBackImageUrl || '').trim();
  const companion = String(safeMeta.companion || '').trim();
  const value = Number(safeStats.value) || 0;
  const count = key => parseInt(safeStats[key], 10) || 0;
  return {
    title,
    displayTitle: title || deckName || 'deck',
    description,
    descriptionText: description || 'No description yet.',
    format: formatInput || 'unspecified format',
    formatInput,
    shareId: deck?.shareId || '',
    commander,
    commanderScryfallId,
    commanderImageUrl,
    commanderBackImageUrl,
    partner,
    partnerScryfallId,
    partnerImageUrl,
    partnerBackImageUrl,
    companion,
    total: count('total'),
    main: count('main'),
    sideboard: count('sideboard'),
    maybe: count('maybe'),
    valueText: value > 0 ? '$' + value.toFixed(2) : '-',
  };
}

const FORMAT_PRESETS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander', 'brawl'];

function deckMetaItem(label, value, emptyText) {
  const hasValue = !!value;
  const cls = 'deck-meta-value' + (hasValue ? '' : ' is-empty');
  return `<div><dt>${esc(label)}</dt><dd class="${cls}">${esc(hasValue ? value : emptyText)}</dd></div>`;
}

function deckMetaCardItem(label, name, imageUrl, backImageUrl, scryfallId, emptyText) {
  if (!name) {
    return `<div><dt>${esc(label)}</dt><dd class="deck-meta-value is-empty">${esc(emptyText)}</dd></div>`;
  }
  // Use .deck-meta-preview-link instead of .card-preview-link so the hover
  // updates the sticky deck preview panel rather than firing the floating
  // popup. Falls back to metadata when the card isn't in the deck yet.
  const cls = 'deck-meta-value deck-meta-card-name deck-meta-preview-link';
  const dataAttrs = ' data-scryfall-id="' + esc(scryfallId || '') + '"'
    + ' data-card-name="' + esc(name) + '"'
    + ' data-image-url="' + esc(imageUrl || '') + '"'
    + ' data-back-image-url="' + esc(backImageUrl || '') + '"';
  return `<div><dt>${esc(label)}</dt><dd class="${cls}"${dataAttrs}>${esc(name)}</dd></div>`;
}

export function renderDeckDetailsHeaderHtml(model) {
  const descClass = 'deck-description' + (model.description ? '' : ' is-empty');
  return `<section class="deck-hero">
      <div class="deck-hero-main">
        <div class="deck-kicker">deck</div>
        <h2>${esc(model.displayTitle)}</h2>
        <p class="${descClass}">${esc(model.descriptionText)}</p>
        <dl class="deck-meta-strip" aria-label="deck details">
          ${deckMetaItem('format', model.formatInput, 'unspecified format')}
          ${model.formatInput === 'commander' ? deckMetaCardItem('commander', model.commander, model.commanderImageUrl, model.commanderBackImageUrl, model.commanderScryfallId, 'not set') : ''}
          ${model.formatInput === 'commander' && model.partner ? deckMetaCardItem('partner', model.partner, model.partnerImageUrl, model.partnerBackImageUrl, model.partnerScryfallId, 'none') : ''}
          ${model.companion ? deckMetaItem('companion', model.companion, '') : ''}
        </dl>
      </div>
      <div class="deck-hero-side">
        <div class="deck-hero-stats" aria-label="deck totals">
          <span><strong>${model.total}</strong> total</span>
          <span><strong>${model.main}</strong> main</span>
          <span><strong>${model.sideboard}</strong> side</span>
          <span><strong>${model.maybe}</strong> maybe</span>
          <span><strong>${esc(model.valueText)}</strong> value</span>
        </div>
        <div class="deck-hero-actions">
          <div class="deck-export-menu-wrap">
            <button class="btn btn-secondary" type="button" data-toggle-deck-export aria-controls="deckExportPanel" aria-expanded="false">export</button>
            ${renderDeckExportPanel()}
          </div>
          <button class="btn btn-secondary deck-share-btn" type="button" data-deck-action="share">${model.shareId ? 'sharing' : 'share'}</button>
          <button class="btn" type="button" data-sample-hand="draw">sample hand</button>
          <button class="btn btn-secondary" type="button" data-edit-deck-details aria-controls="deckDetailsEditor" aria-expanded="false">edit details</button>
        </div>
      </div>
    </section>
    <section class="deck-details-editor hidden" id="deckDetailsEditor" aria-label="edit deck details">
      <form class="deck-metadata-form" id="deckMetadataForm" data-format="${esc(model.formatInput)}">
        <label class="deck-metadata-field"><span>title</span><input name="title" value="${esc(model.title)}" placeholder="deck title" autocomplete="off"></label>
        <label class="deck-metadata-field"><span>format</span>${renderDeckFormatPicker(model.formatInput)}</label>
        <label class="deck-metadata-field deck-metadata-commander"><span>commander</span>
          <span class="deck-meta-ac-wrap">
            <input name="commander" value="${esc(model.commander)}" placeholder="commander" autocomplete="off" data-meta-ac="commander" data-meta-ac-scryfall-id="${esc(model.commanderScryfallId)}" data-meta-ac-image="${esc(model.commanderImageUrl)}" data-meta-ac-back-image="${esc(model.commanderBackImageUrl)}">
            <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
          </span>
        </label>
        <label class="deck-metadata-field deck-metadata-partner"><span>partner</span>
          <span class="deck-meta-ac-wrap">
            <input name="partner" value="${esc(model.partner)}" placeholder="partner" autocomplete="off" data-meta-ac="partner" data-meta-ac-scryfall-id="${esc(model.partnerScryfallId)}" data-meta-ac-image="${esc(model.partnerImageUrl)}" data-meta-ac-back-image="${esc(model.partnerBackImageUrl)}">
            <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
          </span>
        </label>
        <div class="deck-metadata-field deck-metadata-companion">
          <span>companion</span>
          ${model.companion
            ? `<input name="companion" value="${esc(model.companion)}" placeholder="companion" autocomplete="off">`
            : `<button type="button" class="deck-companion-add" data-add-companion>+ add companion</button><input name="companion" value="" placeholder="companion" autocomplete="off" hidden>`}
        </div>
        <label class="deck-metadata-field deck-metadata-description"><span>description</span><textarea name="description" rows="3" placeholder="description">${esc(model.description)}</textarea></label>
        <div class="deck-metadata-actions">
          <button class="btn btn-secondary" type="button" data-cancel-deck-details>cancel</button>
          <button class="btn" type="submit">save deck</button>
        </div>
      </form>
    </section>`;
}

// Commander/partner autocomplete — debounced search against Scryfall with
// is:commander or is:partner filter, rendered in the .autocomplete-list
// anchored under the input.
let metaAcDebounce = null;
let metaAcAbort = null;
let metaAcItems = [];
let metaAcIndex = -1;
// Cache full Scryfall card objects keyed by scryfallId so we can auto-add
// the picked commander/partner to the deck on save without a refetch.
const metaAcCardCache = new Map();

function metaAcWrap(input) { return input?.parentElement?.classList.contains('deck-meta-ac-wrap') ? input.parentElement : null; }
function metaAcList(input) { return metaAcWrap(input)?.querySelector('.deck-meta-ac-list') || null; }

function hideMetaAc(input) {
  const list = metaAcList(input);
  if (!list) return;
  list.classList.remove('active');
  list.innerHTML = '';
  metaAcItems = [];
  metaAcIndex = -1;
}

function renderMetaAcList(input) {
  const list = metaAcList(input);
  if (!list) return;
  if (!metaAcItems.length) { hideMetaAc(input); return; }
  list.innerHTML = metaAcItems.map((item, i) => `<li role="option"${i === metaAcIndex ? ' class="highlight"' : ''} data-ac-index="${i}">${esc(item.name)}</li>`).join('');
  list.classList.add('active');
}

async function fetchMetaAc(input) {
  const kind = input.dataset.metaAc;
  if (kind !== 'commander' && kind !== 'partner') return;
  const q = (input.value || '').trim();
  if (q.length < 2) { hideMetaAc(input); return; }
  if (metaAcAbort) metaAcAbort.abort();
  metaAcAbort = new AbortController();
  const filter = kind === 'partner' ? 'is:partner' : 'is:commander';
  const url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(`${filter} name:${q}`) + '&order=name&unique=cards';
  try {
    const resp = await fetch(url, { signal: metaAcAbort.signal });
    if (!resp.ok) { hideMetaAc(input); return; } // 404 = no matches
    const data = await resp.json();
    metaAcItems = (data.data || []).slice(0, 10).map(c => {
      metaAcCardCache.set(c.id, c);
      return {
        id: c.id,
        name: c.name,
        imageUrl: getCardImageUrl(c) || '',
        backImageUrl: getCardBackImageUrl(c) || '',
      };
    });
    metaAcIndex = -1;
    renderMetaAcList(input);
  } catch (e) {
    if (e.name !== 'AbortError') hideMetaAc(input);
  }
}

function pickMetaAc(input, item) {
  input.value = item.name;
  input.dataset.metaAcScryfallId = item.id || '';
  input.dataset.metaAcImage = item.imageUrl || '';
  input.dataset.metaAcBackImage = item.backImageUrl || '';
  hideMetaAc(input);
}

// If the picked commander/partner isn't already in this deck's decklist, add
// it (board: main, qty: 1). This is purely a decklist mutation — physical
// inventory is untouched.
function ensureCommanderEntryInDeck(scryfallId, deck) {
  if (!scryfallId || !deck || deck.type !== 'deck') return null;
  if (!Array.isArray(deck.deckList)) deck.deckList = [];
  const already = deck.deckList.some(e => e.scryfallId === scryfallId);
  if (already) return null;
  const card = metaAcCardCache.get(scryfallId);
  if (!card) return null;
  addToDeckList(deck, {
    scryfallId: card.id,
    qty: 1,
    board: 'main',
    name: card.name,
    setCode: card.set,
    cn: card.collector_number,
    imageUrl: getCardImageUrl(card),
    backImageUrl: getCardBackImageUrl(card),
  });
  recordEvent({
    type: 'add',
    summary: 'Added {card} as commander to {loc:' + deck.type + ':' + deck.name + '}',
    cards: [{ name: card.name, imageUrl: getCardImageUrl(card), backImageUrl: getCardBackImageUrl(card) || '' }],
    scope: 'deck',
    deckLocation: deck.type + ':' + deck.name,
  });
  return scryfallId;
}

function renderDeckFormatPicker(formatInput) {
  const isPreset = !formatInput || FORMAT_PRESETS.includes(formatInput);
  const selectValue = !formatInput ? '' : isPreset ? formatInput : 'custom';
  const opts = [
    `<option value=""${selectValue === '' ? ' selected' : ''}>—</option>`,
    ...FORMAT_PRESETS.map(f => `<option value="${f}"${selectValue === f ? ' selected' : ''}>${f}</option>`),
    `<option value="custom"${selectValue === 'custom' ? ' selected' : ''}>custom</option>`,
  ].join('');
  const customValue = !isPreset ? formatInput : '';
  return `<span class="deck-format-picker">
    <select name="formatPreset" data-deck-format-preset>${opts}</select>
    <input name="formatCustom" data-deck-format-custom value="${esc(customValue)}" placeholder="custom format" autocomplete="off"${selectValue === 'custom' ? '' : ' hidden'}>
  </span>`;
}

export function renderDeckWorkspaceControls() {
  const modeBtn = (mode, label) =>
    `<button class="deck-mode-btn${state.deckMode === mode ? ' active' : ''}" type="button" data-deck-mode="${mode}" aria-pressed="${state.deckMode === mode ? 'true' : 'false'}">${label}</button>`;
  const boardBtn = (board, label) =>
    `<button class="deck-board-filter-btn${state.deckBoardFilter === board ? ' active' : ''}" type="button" data-deck-board-filter="${board}" aria-pressed="${state.deckBoardFilter === board ? 'true' : 'false'}">${label}</button>`;
  return `<div class="deck-workspace-controls">
    <div class="deck-mode-tabs" aria-label="deck view mode">
      ${modeBtn('visual', 'visual')}
      ${modeBtn('text', 'text')}
      ${modeBtn('stats', 'stats')}
      ${modeBtn('hands', 'hands')}
      ${modeBtn('notes', 'notes')}
    </div>
    <div class="deck-board-filter-tabs" aria-label="deck board filter">
      ${boardBtn('all', 'all')}
      ${boardBtn('main', 'main')}
      ${boardBtn('sideboard', 'side')}
      ${boardBtn('maybe', 'maybe')}
    </div>
    <div class="deck-ownership-toggle" role="group" aria-label="ownership view" title="decklist mode hides ownership and physical location; building mode surfaces them">
      <button type="button" class="deck-ownership-btn${state.deckOwnershipView === 'decklist' ? ' active' : ''}" data-deck-ownership="decklist" aria-pressed="${state.deckOwnershipView === 'decklist' ? 'true' : 'false'}">decklist</button>
      <button type="button" class="deck-ownership-btn${state.deckOwnershipView === 'building' ? ' active' : ''}" data-deck-ownership="building" aria-pressed="${state.deckOwnershipView === 'building' ? 'true' : 'false'}">building</button>
    </div>
    <details class="deck-view-settings">
      <summary>view settings</summary>
      <div class="deck-settings-grid">
        <div class="deck-card-size-row">
          <span class="deck-settings-label">card size</span>
          <div class="deck-card-size-segmented" role="group" aria-label="card size">
            ${VALID_DECK_CARD_SIZES.map(v => {
              const labels = { small: 'sm', medium: 'md', large: 'lg' };
              const active = state.deckCardSize === v;
              return `<button type="button" class="deck-card-size-btn${active ? ' active' : ''}" data-deck-card-size="${v}" aria-pressed="${active ? 'true' : 'false'}">${labels[v]}</button>`;
            }).join('')}
          </div>
        </div>
        <label class="deck-settings-check"><input type="checkbox" data-deck-show-prices${state.deckShowPrices ? ' checked' : ''}> show prices</label>
      </div>
    </details>
  </div>`;
}

export function renderDeckExportPanel() {
  const opts = defaultDeckExportOptions('moxfield');
  return `<section class="deck-export-panel hidden" id="deckExportPanel" aria-label="export deck">
    <form id="deckExportForm" class="deck-export-form">
      <label>format
        <select name="preset">
          <option value="moxfield" selected>moxfield text</option>
          <option value="plain">plain text</option>
          <option value="arena">arena</option>
          <option value="mtgo">mtgo</option>
          <option value="csv">csv</option>
          <option value="json">json</option>
        </select>
      </label>
      <div class="deck-export-checks" aria-label="included boards">
        <label><input type="checkbox" name="includeCommander" checked> commander</label>
        <label><input type="checkbox" name="board" value="main"${opts.boards.includes('main') ? ' checked' : ''}> main</label>
        <label><input type="checkbox" name="board" value="sideboard"${opts.boards.includes('sideboard') ? ' checked' : ''}> side</label>
        <label><input type="checkbox" name="board" value="maybe"${opts.boards.includes('maybe') ? ' checked' : ''}> maybe</label>
        <label><input type="checkbox" name="collapsePrintings"> collapse printings</label>
      </div>
      <div class="deck-export-actions">
        <button class="btn" type="button" data-export-action="copy">copy</button>
        <button class="btn btn-secondary" type="button" data-export-action="download">download</button>
        <button class="btn btn-secondary" type="button" data-close-deck-export>close</button>
      </div>
    </form>
  </section>`;
}

// Build a render-shaped card for the deck workspace from a (deckList entry,
// inventory) pair. The result quacks like a collection entry — existing render
// helpers (renderDeckCard, splitDeckBoards, deckStats, etc.) work on it
// without modification. `inventoryIndex` lets click handlers open the drawer
// for the underlying physical card when one exists.
function buildDeckCardFromEntry(entry) {
  const resolution = resolveDeckListEntry(entry, state.collection);
  const inv = resolution.primary;
  const inventoryIndex = inv ? state.collection.indexOf(inv) : -1;
  return {
    scryfallId: entry.scryfallId,
    name: entry.name || inv?.name || '?',
    resolvedName: entry.name || inv?.resolvedName || inv?.name || '?',
    setCode: entry.setCode || inv?.setCode || '',
    setName: inv?.setName || '',
    cn: entry.cn || inv?.cn || '',
    rarity: inv?.rarity || entry.rarity || '',
    qty: entry.qty,
    deckBoard: entry.board,
    finish: inv?.finish || 'normal',
    condition: inv?.condition || 'near_mint',
    language: inv?.language || 'en',
    location: inv?.location || null,
    price: inv?.price || 0,
    priceFallback: inv?.priceFallback || false,
    cmc: inv?.cmc ?? entry.cmc ?? null,
    colors: (inv?.colors && inv.colors.length ? inv.colors : entry.colors) || [],
    colorIdentity: (inv?.colorIdentity && inv.colorIdentity.length ? inv.colorIdentity : entry.colorIdentity) || [],
    typeLine: inv?.typeLine || entry.typeLine || '',
    oracleText: inv?.oracleText || '',
    legalities: inv?.legalities || {},
    tags: inv?.tags || [],
    imageUrl: entry.imageUrl || inv?.imageUrl || '',
    backImageUrl: entry.backImageUrl || inv?.backImageUrl || '',
    placeholder: resolution.placeholder,
    ownedQty: resolution.ownedQty,
    needed: resolution.needed,
    inventoryIndex,
  };
}

function renderDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');
  const deck = currentDeckContainer();

  // Viewer mode always has an "active scope" — the snapshot. Skip the
  // empty-state guard which assumes the user picked a location.
  if (!state.shareSnapshot && !hasActiveFilter()) {
    if (deckActionsEl) deckActionsEl.classList.add('hidden');
    setDeckPreviewCard(null);
    renderEmptyScopeState(deckColumnsEl, 'deck');
    document.getElementById('deckSummary').textContent = '';
    return;
  }

  if (deckActionsEl) deckActionsEl.classList.add('hidden');
  if (deck && (!deck.deck || typeof deck.deck !== 'object')) deck.deck = defaultDeckMetadata(deck.name);
  if (deck && !Array.isArray(deck.deckList)) deck.deckList = [];
  const meta = deck?.deck || defaultDeckMetadata(deck?.name || 'deck');
  // Build the list of "deck cards" by resolving the decklist against the
  // inventory. Each card has identity from the decklist entry, board from the
  // entry, and finish/price/etc. from the primary inventory match (if any).
  list = (deck?.deckList || []).map(entry => buildDeckCardFromEntry(entry));
  for (const c of list) c.deckBoard = normalizeDeckBoard(c.deckBoard);
  const boards = splitDeckBoards(list);
  const stats = deckStats(list);
  const statHtml = renderDeckStatsHtml(boards.main);
  const format = meta.format || state.selectedFormat || 'unspecified format';
  const headerModel = deckDetailsViewModel(deck, meta, stats, state.selectedFormat);
  const filteredBoards = filterDeckBoards(boards, state.deckBoardFilter);
  const visualMainSections = filteredBoards
    .filter(([board]) => board === 'main')
    .map(([, cards]) => renderDeckBoardSection('mainboard', cards, { grouped: true }))
    .join('');
  const visualSideSections = filteredBoards
    .filter(([board]) => board !== 'main')
    .map(([board, cards]) => renderDeckBoardSection(boardLabel(board), cards))
    .join('');
  // Group-by control lives inline with the visual mode — irrelevant for
  // text/stats/hands/notes so it shouldn't share top-level chrome with them.
  const visualGroupByBar = `<div class="deck-visual-controls">
    <label class="deck-visual-group-by">group by
      <select data-deck-group>
        ${VALID_DECK_GROUPS.map(v => `<option value="${v}"${state.deckGroupBy === v ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
    </label>
  </div>`;
  let visualBody;
  if (state.deckBoardFilter === 'all') {
    visualBody = `${visualGroupByBar}<div class="deck-content-grid${visualSideSections ? '' : ' deck-content-grid-single'}">
      <main>
        ${visualMainSections || (visualSideSections ? '' : renderDeckBoardSection('mainboard', [], { grouped: true }))}
      </main>
      ${visualSideSections ? `<aside class="deck-board-aside">${visualSideSections}</aside>` : ''}
    </div>`;
  } else if (state.deckBoardFilter === 'main') {
    visualBody = `${visualGroupByBar}<div class="deck-content-grid deck-content-grid-single"><main>${visualMainSections}</main></div>`;
  } else {
    visualBody = `${visualGroupByBar}<div class="deck-content-grid deck-content-grid-single"><main>${visualSideSections}</main></div>`;
  }
  const modeBody = state.deckMode === 'stats'
    ? renderDeckStatsDashboard(stats, statHtml, format)
    : state.deckMode === 'hands'
      ? renderDeckSampleHandSection()
      : state.deckMode === 'text'
        ? renderDeckTextMode(boards)
        : state.deckMode === 'notes'
          ? renderDeckNotesMode(headerModel)
          : visualBody;

  deckColumnsEl.innerHTML = `<div class="deck-workspace deck-card-size-${esc(state.deckCardSize)}">
    ${renderDeckDetailsHeaderHtml(headerModel)}
    ${renderDeckWorkspaceControls()}
    ${modeBody}
  </div>`;

  const cols = groupDeck(boards.main, state.deckGroupBy);
  // Default preview: commander art if the deck has one, otherwise the first
  // card in the visual grid (today's behavior).
  const commanderPreview = headerModel.commanderImageUrl
    ? {
        name: headerModel.commander || '',
        resolvedName: headerModel.commander || '',
        imageUrl: headerModel.commanderImageUrl,
        backImageUrl: headerModel.commanderBackImageUrl || '',
        qty: 1,
        finish: 'normal',
        price: 0,
      }
    : null;
  setDeckPreviewCard(commanderPreview || firstCardForPanel(cols) || list[0] || null);
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
  if (!target?.closest) return;
  const card = target.closest('.deck-card');
  if (card) {
    const idx = parseInt(card.dataset.inventoryIndex || '-1', 10);
    if (idx >= 0) {
      const entry = state.collection[idx];
      if (entry) { setDeckPreviewCard(entry); return; }
    }
    // Placeholder (no inventory entry) — synthesize a preview from the data
    // attrs the renderer stamps onto the article.
    const name = card.dataset.cardName || '';
    const imageUrl = card.dataset.imageUrl || '';
    if (name || imageUrl) {
      setDeckPreviewCard({
        name,
        resolvedName: name,
        imageUrl,
        backImageUrl: card.dataset.backImageUrl || '',
        qty: parseInt(card.dataset.cardQty || '1', 10),
        finish: card.dataset.cardFinish || 'normal',
        price: parseFloat(card.dataset.cardPrice || '0') || 0,
      });
    }
    return;
  }
  const metaLink = target.closest('.deck-meta-preview-link');
  if (metaLink) {
    const scryfallId = metaLink.dataset.scryfallId;
    const deckScope = currentDeckScope();
    let entry = null;
    if (scryfallId) {
      entry = state.collection.find(c =>
        c.scryfallId === scryfallId
        && normalizeLocation(c.location)?.type === 'deck'
        && (!deckScope || normalizeLocation(c.location)?.name === deckScope.name)
      );
    }
    if (entry) {
      setDeckPreviewCard(entry);
    } else {
      // Commander not yet in deck — render a synthetic card from metadata.
      const name = metaLink.dataset.cardName || '';
      const imageUrl = metaLink.dataset.imageUrl || '';
      const backImageUrl = metaLink.dataset.backImageUrl || '';
      if (name || imageUrl) {
        setDeckPreviewCard({
          name,
          resolvedName: name,
          imageUrl,
          backImageUrl,
          qty: 1,
          finish: 'normal',
          price: 0,
        });
      }
    }
  }
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

function loadDeckPrefs() {
  try {
    const raw = localStorage.getItem(DECK_VIEW_PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (VALID_DECK_MODES.includes(prefs.mode)) state.deckMode = prefs.mode;
    if (VALID_DECK_BOARD_FILTERS.includes(prefs.boardFilter)) state.deckBoardFilter = prefs.boardFilter;
    if (VALID_DECK_CARD_SIZES.includes(prefs.cardSize)) state.deckCardSize = prefs.cardSize;
    if (typeof prefs.showPrices === 'boolean') state.deckShowPrices = prefs.showPrices;
    if (VALID_DECK_OWNERSHIP_VIEWS.includes(prefs.ownershipView)) state.deckOwnershipView = prefs.ownershipView;
  } catch (e) {}
}

function saveDeckPrefs() {
  try {
    localStorage.setItem(DECK_VIEW_PREFS_KEY, JSON.stringify({
      mode: state.deckMode,
      boardFilter: state.deckBoardFilter,
      cardSize: state.deckCardSize,
      showPrices: state.deckShowPrices,
      ownershipView: state.deckOwnershipView,
    }));
  } catch (e) {}
}

function buildDecklistText(list) {
  return buildDeckExport(list, currentDeckMetadata(), { preset: 'moxfield' }).body;
}

function deckExportOptionsFromForm(form) {
  const fd = new FormData(form);
  const preset = String(fd.get('preset') || 'moxfield');
  const boards = fd.getAll('board').map(v => String(v)).filter(v => ['main', 'sideboard', 'maybe'].includes(v));
  const defaults = defaultDeckExportOptions(preset);
  const options = {
    preset,
    boards: boards.length ? boards : defaults.boards,
    includeCommander: fd.get('includeCommander') === 'on',
  };
  if (fd.get('collapsePrintings') === 'on') options.collapsePrintings = true;
  return options;
}

function downloadDeckExport(result) {
  const blob = new Blob([result.body], { type: result.mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename || 'deck.txt';
  a.click();
  URL.revokeObjectURL(url);
}

async function handleDeckExportAction(action) {
  const form = document.getElementById('deckExportForm');
  if (!form) return;
  const result = buildDeckExport(filteredSorted(), currentDeckMetadata(), deckExportOptionsFromForm(form));
  if (action === 'download') {
    downloadDeckExport(result);
    showFeedback('deck export downloaded', 'success');
  } else {
    try {
      await navigator.clipboard.writeText(result.body);
      showFeedback('deck export copied', 'success');
    } catch (err) {
      showFeedback('clipboard unavailable: ' + err.message, 'error');
    }
  }
  if (result.warnings?.length) showFeedback(result.warnings.join(' '), 'info');
}

function setDeckPanelOpen(panelId, triggerSelector, open) {
  const root = document.getElementById('deckColumns');
  const panel = root?.querySelector('#' + panelId);
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  const trigger = root.querySelector(triggerSelector);
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const first = panel.querySelector('textarea, input, select, button');
    if (first) first.focus();
  }
}

// Track the most recent requested URL so a fast mouse-over a row of cards
// shows the latest one's image (and not whichever onload happens to fire last).
let pendingPreviewUrl = null;

function showCardPreview(link) {
  const url = link.dataset.previewUrl;
  if (!url) return;

  const rect = link.getBoundingClientRect();
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
  cardPreviewEl.classList.add('visible');

  pendingPreviewUrl = url;

  // If the same image is already cached + decoded, no flicker possible —
  // just show. This also covers re-hovering the row you were just on.
  if (cardPreviewImg.src === url && cardPreviewImg.complete && cardPreviewImg.naturalWidth > 0) {
    cardPreviewImg.style.visibility = 'visible';
    return;
  }

  // Otherwise hide the img while the new one decodes so the previous card
  // doesn't briefly stay on screen. Show it as soon as the new image is
  // ready — but only if it's still the one the user wants (race guard for
  // fast cursor movement).
  cardPreviewImg.style.visibility = 'hidden';
  cardPreviewImg.onload = () => {
    if (pendingPreviewUrl === url) cardPreviewImg.style.visibility = 'visible';
  };
  cardPreviewImg.src = url;
}

export function hideCardPreview() {
  cardPreviewEl.classList.remove('visible');
  pendingPreviewUrl = null;
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

export function openRightDrawer(targetIds, options = {}) {
  const ids = (Array.isArray(targetIds) ? targetIds : [targetIds]).filter(id => RIGHT_DRAWER_PANELS.includes(id));
  if (ids.length === 0) return;
  const shape = getEffectiveShape();
  // Drawer overlay is used in shapes where the right sidebar is hidden by
  // the CSS layout (collection / box list / deck workspace). Other shapes
  // (binder / decks-home / storage-home) just open the details inline.
  const useDrawer = shape === 'collection' || shape === 'box' || shape === 'deck';
  if (useDrawer) {
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
  if (options.seedLocation) {
    setSelectedLocation(options.seedLocation);
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

  document.querySelector('.app-header-views').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const next = btn.dataset.view;
    if (!['collection', 'decks', 'storage'].includes(next)) return;
    if (state.viewMode === next) return;
    state.viewMode = next;
    state.viewAsList = false;
    // Switching top-level routes clears the location filter so the home shape
    // is reached. (User can drill back into a single container after.)
    const filterEl = document.getElementById('filterLocation');
    if (filterEl) setMultiselectValue(filterEl, []);
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
      const seedLocation = getEffectiveShape() === 'deck' ? currentDeckScope() : null;
      openRightDrawer(targets, { seedLocation });
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
    if (getEffectiveShape() !== 'binder') return;
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
  loadDeckPrefs();
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
    const modeBtn = e.target.closest('[data-deck-mode]');
    if (modeBtn) {
      const mode = modeBtn.dataset.deckMode;
      if (!VALID_DECK_MODES.includes(mode)) return;
      state.deckMode = mode;
      saveDeckPrefs();
      render();
      return;
    }
    const boardFilterBtn = e.target.closest('[data-deck-board-filter]');
    if (boardFilterBtn) {
      const filter = boardFilterBtn.dataset.deckBoardFilter;
      if (!VALID_DECK_BOARD_FILTERS.includes(filter)) return;
      state.deckBoardFilter = filter;
      saveDeckPrefs();
      render();
      return;
    }
    const sizeBtn = e.target.closest('[data-deck-card-size]');
    if (sizeBtn) {
      const size = sizeBtn.dataset.deckCardSize;
      if (!VALID_DECK_CARD_SIZES.includes(size)) return;
      state.deckCardSize = size;
      saveDeckPrefs();
      render();
      return;
    }
    const ownershipBtn = e.target.closest('[data-deck-ownership]');
    if (ownershipBtn) {
      const v = ownershipBtn.dataset.deckOwnership;
      if (!VALID_DECK_OWNERSHIP_VIEWS.includes(v)) return;
      state.deckOwnershipView = v;
      saveDeckPrefs();
      render();
      return;
    }
    if (e.target.closest('[data-add-companion]')) {
      const wrap = e.target.closest('.deck-metadata-companion');
      const input = wrap?.querySelector('input[name="companion"]');
      const btn = wrap?.querySelector('[data-add-companion]');
      if (input) { input.hidden = false; input.focus(); }
      if (btn) btn.remove();
      return;
    }
    if (e.target.closest('[data-deck-action="share"]')) {
      const deck = currentDeckContainer();
      if (deck) openShareModal(deck);
      return;
    }
    const acItem = e.target.closest('.deck-meta-ac-list li');
    if (acItem) {
      const input = acItem.closest('.deck-meta-ac-wrap')?.querySelector('input[data-meta-ac]');
      const idx = parseInt(acItem.dataset.acIndex || '-1', 10);
      const item = metaAcItems[idx];
      if (input && item) pickMetaAc(input, item);
      return;
    }
    const exportToggle = e.target.closest('[data-toggle-deck-export]');
    if (exportToggle) {
      e.stopPropagation();
      const panel = document.getElementById('deckExportPanel');
      setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', panel?.classList.contains('hidden'));
      return;
    }
    if (e.target.closest('[data-close-deck-export]')) {
      setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', false);
      return;
    }
    const menuToggle = e.target.closest('[data-card-menu-toggle]');
    if (menuToggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleDeckCardMenu(menuToggle);
      return;
    }
    const cardAction = e.target.closest('[data-card-action]');
    if (cardAction) {
      e.preventDefault();
      e.stopPropagation();
      handleDeckCardAction(cardAction);
      return;
    }
    // (Sample-hand cards are now rendered as .deck-card articles, so they
    // route through the data-card-action handler above — no special case.)
    const textNameBtn = e.target.closest('.deck-text-table .card-name-button');
    if (textNameBtn) {
      openDetail(parseInt(textNameBtn.dataset.index, 10));
      return;
    }
    if (!e.target.closest('input, select, button, a')) {
      const textRow = e.target.closest('.deck-text-table tr.detail-trigger');
      if (textRow) {
        openDetail(parseInt(textRow.dataset.index, 10));
        return;
      }
    }
    if (!e.target.closest('.deck-card')) closeDeckCardMenus(document.getElementById('deckColumns'));
  });

  document.getElementById('deckColumns').addEventListener('change', e => {
    const groupSelect = e.target.closest('[data-deck-group]');
    if (groupSelect) {
      const v = groupSelect.value;
      if (!VALID_DECK_GROUPS.includes(v)) return;
      state.deckGroupBy = v;
      saveDeckGroup();
      render();
      return;
    }
    const formatPreset = e.target.closest('[data-deck-format-preset]');
    if (formatPreset) {
      const form = formatPreset.closest('#deckMetadataForm');
      const customInput = form?.querySelector('[data-deck-format-custom]');
      if (customInput) {
        const showCustom = formatPreset.value === 'custom';
        customInput.hidden = !showCustom;
        if (showCustom) customInput.focus();
      }
      const effective = formatPreset.value === 'custom' ? (customInput?.value || '') : formatPreset.value;
      if (form) form.dataset.format = effective;
      return;
    }
    const priceToggle = e.target.closest('[data-deck-show-prices]');
    if (priceToggle) {
      state.deckShowPrices = !!priceToggle.checked;
      saveDeckPrefs();
      render();
    }
  });

  document.getElementById('deckColumns').addEventListener('input', e => {
    const acInput = e.target.closest('input[data-meta-ac]');
    if (!acInput) return;
    // Typing invalidates a previously-picked card — clear stashed image+id data
    // so the form save doesn't carry stale info forward.
    acInput.dataset.metaAcScryfallId = '';
    acInput.dataset.metaAcImage = '';
    acInput.dataset.metaAcBackImage = '';
    if (metaAcDebounce) clearTimeout(metaAcDebounce);
    metaAcDebounce = setTimeout(() => fetchMetaAc(acInput), 250);
  });

  document.getElementById('deckColumns').addEventListener('keydown', e => {
    const acInput = e.target.closest('input[data-meta-ac]');
    if (!acInput) return;
    const list = metaAcList(acInput);
    if (!list?.classList.contains('active')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      metaAcIndex = Math.min(metaAcItems.length - 1, metaAcIndex + 1);
      renderMetaAcList(acInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      metaAcIndex = Math.max(-1, metaAcIndex - 1);
      renderMetaAcList(acInput);
    } else if (e.key === 'Enter') {
      const item = metaAcItems[metaAcIndex];
      if (item) {
        e.preventDefault();
        pickMetaAc(acInput, item);
      }
    } else if (e.key === 'Escape') {
      hideMetaAc(acInput);
    }
  });

  document.getElementById('deckColumns').addEventListener('focusout', e => {
    const acInput = e.target.closest('input[data-meta-ac]');
    if (!acInput) return;
    // Delay to allow click on a suggestion to register first
    setTimeout(() => {
      if (document.activeElement?.closest('.deck-meta-ac-wrap') !== metaAcWrap(acInput)) {
        hideMetaAc(acInput);
      }
    }, 150);
  });

  document.getElementById('deckColumns').addEventListener('click', e => {
    const root = document.getElementById('deckColumns');
    const editBtn = e.target.closest('[data-edit-deck-details]');
    if (editBtn) {
      const editor = root.querySelector('#deckDetailsEditor');
      if (!editor) return;
      editor.classList.remove('hidden');
      editBtn.setAttribute('aria-expanded', 'true');
      const firstInput = editor.querySelector('input[name="title"]');
      if (firstInput) firstInput.focus();
      return;
    }
    const cancelBtn = e.target.closest('[data-cancel-deck-details]');
    if (!cancelBtn) return;
    const editor = root.querySelector('#deckDetailsEditor');
    if (editor) editor.classList.add('hidden');
    const toggle = root.querySelector('[data-edit-deck-details]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('deckColumns').addEventListener('submit', e => {
    if (e.target.id !== 'deckMetadataForm') return;
    e.preventDefault();
    const deck = currentDeckContainer();
    if (!deck) return;
    const fd = new FormData(e.target);
    const preset = String(fd.get('formatPreset') || '').trim();
    const custom = String(fd.get('formatCustom') || '').trim();
    const format = preset === 'custom' ? custom : preset;
    const isCommander = format === 'commander';
    const cmdInput = e.target.querySelector('input[data-meta-ac="commander"]');
    const partnerInput = e.target.querySelector('input[data-meta-ac="partner"]');
    const cmdScryfallId = String(cmdInput?.dataset.metaAcScryfallId || '');
    const partnerScryfallId = String(partnerInput?.dataset.metaAcScryfallId || '');
    deck.deck = {
      ...defaultDeckMetadata(deck.name),
      title: String(fd.get('title') || '').trim() || deck.name,
      format,
      commander: isCommander ? String(fd.get('commander') || '').trim() : '',
      commanderScryfallId: isCommander ? cmdScryfallId : '',
      commanderImageUrl: isCommander ? String(cmdInput?.dataset.metaAcImage || '') : '',
      commanderBackImageUrl: isCommander ? String(cmdInput?.dataset.metaAcBackImage || '') : '',
      partner: isCommander ? String(fd.get('partner') || '').trim() : '',
      partnerScryfallId: isCommander ? partnerScryfallId : '',
      partnerImageUrl: isCommander ? String(partnerInput?.dataset.metaAcImage || '') : '',
      partnerBackImageUrl: isCommander ? String(partnerInput?.dataset.metaAcBackImage || '') : '',
      companion: String(fd.get('companion') || '').trim(),
      description: String(fd.get('description') || '').trim(),
    };
    deck.updatedAt = Date.now();
    // Lenient mode: if the picked commander/partner isn't already a card
    // in this deck, auto-add it as a placeholder. Only fires when the user
    // has explicitly picked from autocomplete (scryfallId set).
    let added = 0;
    if (isCommander) {
      if (cmdScryfallId && ensureCommanderEntryInDeck(cmdScryfallId, deck)) added++;
      if (partnerScryfallId && ensureCommanderEntryInDeck(partnerScryfallId, deck)) added++;
    }
    save();
    render();
    if (added > 0) showFeedback('added ' + added + ' commander card' + (added === 1 ? '' : 's') + ' to deck', 'success');
  });

  document.getElementById('deckColumns').addEventListener('click', e => {
    const sampleBtn = e.target.closest('[data-sample-hand]');
    if (!sampleBtn) return;
    // Source from the resolved decklist, not inventory. After the
    // deck/decklist split, filteredSorted() only sees inventory rows
    // physically located in the deck — nearly always empty for decklist-
    // first decks and useless for sample hands.
    const deck = currentDeckContainer();
    const list = (deck?.deckList || [])
      .map(entry => buildDeckCardFromEntry(entry))
      .map(c => ({ ...c, deckBoard: normalizeDeckBoard(c.deckBoard) }));
    const boards = splitDeckBoards(list);
    const size = sampleBtn.dataset.sampleHand === 'mulligan' ? 6 : 7;
    state.deckSampleHand = {
      deckKey: deck ? deck.type + ':' + deck.name : '',
      ...drawSampleHand(boards.main, size),
    };
    state.deckMode = 'hands';
    saveDeckPrefs();
    render();
  });

  document.getElementById('deckColumns').addEventListener('click', async e => {
    const exportAction = e.target.closest('[data-export-action]');
    if (exportAction) {
      await handleDeckExportAction(exportAction.dataset.exportAction);
      return;
    }
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
    if (e.key === 'Escape') {
      closeDeckCardMenus(document.getElementById('deckColumns'));
      return;
    }
    const toggle = e.target.closest('[data-card-menu-toggle]');
    if (toggle && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDeckCardMenu(toggle, { focusFirst: true });
      return;
    }
    const menu = e.target.closest('.deck-card-menu');
    if (!menu) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocusInDeckCardMenu(menu, e.target, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
      const target = e.key === 'Home' ? items[0] : items[items.length - 1];
      if (target) target.focus();
    }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('.deck-card')) return;
    closeDeckCardMenus(document.getElementById('deckColumns'));
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
    // Decks form uses a hidden input for type; storage form uses a radio group.
    // Try both — the radio :checked match wins when present, otherwise fall
    // back to the hidden input's value (or 'box' as a last resort).
    const checked = document.querySelector('input[name="locationsCreateType"]:checked');
    const hidden = document.querySelector('input[type="hidden"][name="locationsCreateType"]');
    const type = checked ? checked.value : (hidden ? hidden.value : 'box');
    const nameInput = document.getElementById('locationsCreateName');
    const created = ensureContainer({ type, name: nameInput.value });
    if (!created) return;
    nameInput.value = '';
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

  // Close the export dropdown when clicking outside it.
  document.addEventListener('click', e => {
    const panel = document.getElementById('deckExportPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (e.target.closest('.deck-export-menu-wrap')) return;
    setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', false);
  });
}
