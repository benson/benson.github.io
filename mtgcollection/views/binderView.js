import { state, BINDER_PRICES_KEY, BINDER_SIZE_KEY, BINDER_VIEW_PREFS_KEY } from '../state.js';
import { esc } from '../feedback.js';
import {
  BINDER_LAYOUTS,
  BINDER_LIST_SIZE,
  BINDER_SIZES,
  binderCardKey,
  binderHasLens,
  binderSlotCount,
  cardsFromBinderOrder,
  filterForBinderLens,
  paginateForBinder,
  sortForBinder,
} from '../binder.js?binder-playlist-4';
import { renderRow } from './listRowView.js';
import { formatPrice } from '../ui/priceUi.js';
import { formatMoney } from './totalsView.js';

export const VALID_BINDER_SIZES = BINDER_LAYOUTS;
export const VALID_BINDER_MODES = ['view', 'organize'];
export const VALID_BINDER_SORTS = ['binder', 'name', 'price-desc', 'price-asc', 'recent'];
export const VALID_BINDER_COLORS = ['', 'w', 'u', 'b', 'r', 'g', 'multicolor', 'colorless'];
export const VALID_BINDER_TYPES = ['', 'creature', 'land', 'artifact', 'enchantment', 'planeswalker', 'spell'];

function renderBinderListTable(cards) {
  return `<table class="binder-list-table">
    <thead>
      <tr>
        <th class="col-check"></th>
        <th>name</th>
        <th>set</th>
        <th>cn</th>
        <th>finish</th>
        <th>rarity</th>
        <th>condition</th>
        <th>location</th>
        <th>tags</th>
        <th>qty</th>
        <th>price</th>
      </tr>
    </thead>
    <tbody>${cards.map(c => renderRow(c)).join('')}</tbody>
  </table>`;
}

function cleanBinderMode(value) {
  return VALID_BINDER_MODES.includes(value) ? value : 'view';
}

function cleanBinderSort(value) {
  return VALID_BINDER_SORTS.includes(value) ? value : 'binder';
}

function cleanBinderColor(value) {
  return VALID_BINDER_COLORS.includes(value) ? value : '';
}

function cleanBinderType(value) {
  return VALID_BINDER_TYPES.includes(value) ? value : '';
}

export function binderLensActive(stateRef = state) {
  return binderHasLens(stateRef);
}

export function applyBinderExploreControls(doc = document) {
  doc.querySelectorAll('[data-binder-mode]').forEach(btn => {
    const active = btn.dataset.binderMode === state.binderMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const sort = doc.getElementById('binderSortSelect');
  if (sort) {
    sort.value = cleanBinderSort(state.binderSort);
    sort.disabled = state.binderMode === 'organize';
  }
  const search = doc.getElementById('binderSearchInput');
  if (search && search.value !== (state.binderSearch || '')) search.value = state.binderSearch || '';
  const color = doc.getElementById('binderColorFilter');
  if (color) color.value = cleanBinderColor(state.binderColorFilter);
  const type = doc.getElementById('binderTypeFilter');
  if (type) type.value = cleanBinderType(state.binderTypeFilter);
  const reset = doc.getElementById('binderLensReset');
  if (reset) reset.classList.toggle('hidden', !binderLensActive());
}

export function renderBinderSlot(c, collection = state.collection, {
  slotIndex = null,
  draggable = false,
} = {}) {
  const slotAttr = Number.isInteger(slotIndex) ? ` data-binder-slot="${slotIndex}"` : '';
  if (!c) {
    const label = Number.isInteger(slotIndex) ? `<span class="binder-empty-slot-label">${slotIndex + 1}</span>` : '';
    return `<div class="binder-slot binder-slot-empty"${slotAttr} aria-hidden="true">${label}</div>`;
  }
  const name = c.resolvedName || c.name || '?';
  const idx = collection.indexOf(c);
  const img = c.imageUrl
    ? `<img src="${esc(c.imageUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="placeholder">${esc(name)}</div>`;
  const qty = c.qty > 1 ? `<span class="binder-qty">&times;${c.qty}</span>` : '';
  const price = state.binderShowPrices ? formatPrice(c) : '';
  const priceBadge = price ? `<span class="binder-price-badge">${price}</span>` : '';
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  const dragAttrs = draggable ? ' draggable="true" data-binder-draggable="true"' : '';
  const key = binderCardKey(c);
  return `<div class="binder-slot detail-trigger${finishClass}${draggable ? ' binder-slot-draggable' : ''}" role="button" tabindex="0" data-index="${idx}" data-binder-key="${esc(key)}"${slotAttr}${dragAttrs} aria-label="${esc(name)}">${img}${qty}${priceBadge}</div>`;
}

export function renderBinderView(list, {
  container = null,
  hasActiveFilter = () => true,
  renderEmptyScopeState = () => {},
} = {}) {
  const pagesEl = document.getElementById('binderPages');
  const navEl = document.getElementById('binderNav');
  const summaryEl = document.getElementById('binderSummary');
  pagesEl.classList.remove('binder-pages-list', ...BINDER_LAYOUTS.map(size => 'binder-pages-' + size));
  pagesEl.classList.add('binder-pages-' + state.binderSize);

  if (!hasActiveFilter()) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    applyBinderExploreControls();
    renderEmptyScopeState(pagesEl, 'binder');
    return;
  }

  const slotsPerPage = binderSlotCount(state.binderSize);
  const organize = state.binderMode === 'organize';
  const lensActive = binderLensActive();
  const scoped = organize ? list : filterForBinderLens(list, state);

  if (scoped.length === 0) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    pagesEl.innerHTML = '<div class="deck-empty-state"><p class="deck-empty-prompt">no cards match</p></div>';
    applyBinderExploreControls();
    return;
  }

  const sortMode = organize ? 'binder' : cleanBinderSort(state.binderSort);
  const sorted = sortForBinder(scoped, { container, sortMode, collection: state.collection });
  const total = scoped.reduce((s, c) => s + (parseInt(c.qty, 10) || 0), 0);
  const value = scoped.reduce((s, c) => s + ((Number(c.price) || 0) * (parseInt(c.qty, 10) || 0)), 0);
  summaryEl.textContent = `${total} cards - ${scoped.length} unique - ${formatMoney(value)} value`;

  if (state.binderSize === BINDER_LIST_SIZE) {
    state.binderPage = 0;
    navEl.classList.add('hidden');
    pagesEl.classList.add('binder-pages-list');
    pagesEl.innerHTML = renderBinderListTable(sorted);
    applyBinderSizeButtons();
    applyBinderPriceToggle();
    applyBinderExploreControls();
    return;
  }

  const preserveAuthorSlots = organize || (sortMode === 'binder' && !lensActive);
  const pageCards = preserveAuthorSlots
    ? cardsFromBinderOrder(container, scoped, { preserveEmptySlots: true, slotsPerPage })
    : sorted;
  const pages = paginateForBinder(pageCards, slotsPerPage);
  if (state.binderPage >= pages.length) state.binderPage = 0;
  if (state.binderPage < 0) state.binderPage = 0;

  const conf = BINDER_SIZES[state.binderSize] || BINDER_SIZES['4x3'];
  const currentPage = pages[state.binderPage] || [];
  const slotsHtml = currentPage.map((c, index) => renderBinderSlot(c, state.collection, {
    slotIndex: state.binderPage * slotsPerPage + index,
    draggable: organize,
  })).join('');
  pagesEl.innerHTML = `<div class="binder-surface binder-surface-${esc(state.binderSize)}${organize ? ' binder-surface-organize' : ''}">
    <div class="binder-page binder-page-${esc(state.binderSize)}${organize ? ' binder-page-organize' : ''}" style="grid-template-columns: repeat(${conf.cols}, minmax(0, 1fr)); grid-template-rows: repeat(${conf.rows}, auto);">${slotsHtml}</div>
  </div>`;

  navEl.classList.remove('hidden');
  const prevBtn = document.getElementById('binderPrev');
  const nextBtn = document.getElementById('binderNext');
  const indicator = document.getElementById('binderPageIndicator');
  prevBtn.disabled = state.binderPage <= 0;
  nextBtn.disabled = state.binderPage >= pages.length - 1;
  indicator.textContent = `page ${state.binderPage + 1} of ${pages.length}`;
  applyBinderPriceToggle();
  applyBinderExploreControls();
}

export function applyBinderSizeButtons(doc = document) {
  doc.querySelectorAll('[data-binder-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.binderSize === state.binderSize);
    btn.setAttribute('aria-pressed', btn.dataset.binderSize === state.binderSize ? 'true' : 'false');
  });
}

export function applyBinderPriceToggle(doc = document) {
  const toggle = doc.getElementById('binderPriceToggle');
  if (toggle) toggle.checked = state.binderShowPrices !== false;
}

export function loadBinderSize(storage = localStorage) {
  try {
    const v = storage.getItem(BINDER_SIZE_KEY);
    if (v && VALID_BINDER_SIZES.includes(v)) state.binderSize = v;
  } catch (e) {}
}

export function saveBinderSize(storage = localStorage) {
  try { storage.setItem(BINDER_SIZE_KEY, state.binderSize); } catch (e) {}
}

export function loadBinderPrices(storage = localStorage) {
  try {
    const v = storage.getItem(BINDER_PRICES_KEY);
    state.binderShowPrices = v == null ? true : v !== 'false';
  } catch (e) {}
}

export function saveBinderPrices(storage = localStorage) {
  try { storage.setItem(BINDER_PRICES_KEY, state.binderShowPrices === false ? 'false' : 'true'); } catch (e) {}
}

export function loadBinderViewPrefs(storage = localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(BINDER_VIEW_PREFS_KEY) || '{}');
    state.binderMode = cleanBinderMode(raw.mode);
    state.binderSort = cleanBinderSort(raw.sort);
    state.binderSearch = typeof raw.search === 'string' ? raw.search : '';
    state.binderColorFilter = cleanBinderColor(raw.color);
    state.binderTypeFilter = cleanBinderType(raw.type);
  } catch (e) {}
}

export function saveBinderViewPrefs(storage = localStorage) {
  try {
    storage.setItem(BINDER_VIEW_PREFS_KEY, JSON.stringify({
      mode: cleanBinderMode(state.binderMode),
      sort: cleanBinderSort(state.binderSort),
      search: String(state.binderSearch || ''),
      color: cleanBinderColor(state.binderColorFilter),
      type: cleanBinderType(state.binderTypeFilter),
    }));
  } catch (e) {}
}
