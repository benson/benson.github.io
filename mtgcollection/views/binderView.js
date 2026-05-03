import { state, BINDER_PRICES_KEY, BINDER_SIZE_KEY } from '../state.js';
import { esc } from '../feedback.js';
import { BINDER_LAYOUTS, BINDER_LIST_SIZE, BINDER_SIZES, binderSlotCount, paginateForBinder, sortForBinder } from '../binder.js';
import { renderRow } from './listRowView.js';
import { formatPrice } from '../ui/priceUi.js';

export const VALID_BINDER_SIZES = BINDER_LAYOUTS;

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

export function renderBinderSlot(c, collection = state.collection) {
  if (!c) {
    return '<div class="binder-slot binder-slot-empty" aria-hidden="true"></div>';
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
  return `<div class="binder-slot detail-trigger${finishClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}${priceBadge}</div>`;
}

export function renderBinderView(list, {
  hasActiveFilter = () => true,
  renderEmptyScopeState = () => {},
} = {}) {
  const pagesEl = document.getElementById('binderPages');
  const navEl = document.getElementById('binderNav');
  const summaryEl = document.getElementById('binderSummary');
  pagesEl.classList.remove('binder-pages-list');

  if (!hasActiveFilter()) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    renderEmptyScopeState(pagesEl, 'binder');
    return;
  }

  if (list.length === 0) {
    navEl.classList.add('hidden');
    summaryEl.textContent = '';
    pagesEl.innerHTML = '<div class="deck-empty-state"><p class="deck-empty-prompt">no cards match</p></div>';
    return;
  }

  const slotsPerPage = binderSlotCount(state.binderSize);
  const sorted = sortForBinder(list);
  const total = list.reduce((s, c) => s + (c.qty || 1), 0);
  summaryEl.textContent = `${total} cards - ${list.length} unique`;

  if (state.binderSize === BINDER_LIST_SIZE) {
    state.binderPage = 0;
    navEl.classList.add('hidden');
    pagesEl.classList.add('binder-pages-list');
    pagesEl.innerHTML = renderBinderListTable(sorted);
    applyBinderSizeButtons();
    applyBinderPriceToggle();
    return;
  }

  const pages = paginateForBinder(sorted, slotsPerPage);
  if (state.binderPage >= pages.length) state.binderPage = 0;
  if (state.binderPage < 0) state.binderPage = 0;

  const conf = BINDER_SIZES[state.binderSize] || BINDER_SIZES['4x3'];
  const currentPage = pages[state.binderPage] || [];
  const slotsHtml = currentPage.map(c => renderBinderSlot(c)).join('');
  pagesEl.innerHTML = `<div class="binder-page binder-page-${esc(state.binderSize)}" style="grid-template-columns: repeat(${conf.cols}, 1fr);">${slotsHtml}</div>`;

  navEl.classList.remove('hidden');
  const prevBtn = document.getElementById('binderPrev');
  const nextBtn = document.getElementById('binderNext');
  const indicator = document.getElementById('binderPageIndicator');
  prevBtn.disabled = state.binderPage <= 0;
  nextBtn.disabled = state.binderPage >= pages.length - 1;
  indicator.textContent = `page ${state.binderPage + 1} of ${pages.length}`;
  applyBinderPriceToggle();
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
