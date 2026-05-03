import { state, BINDER_SIZE_KEY } from '../state.js';
import { esc } from '../feedback.js';
import { paginateForBinder, sortForBinder, BINDER_SIZES, binderSlotCount } from '../binder.js';

export const VALID_BINDER_SIZES = Object.keys(BINDER_SIZES);

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
  const finishClass = c.finish === 'foil' ? ' is-foil' : c.finish === 'etched' ? ' is-etched' : '';
  return `<div class="binder-slot detail-trigger${finishClass}" role="button" tabindex="0" data-index="${idx}" aria-label="${esc(name)}">${img}${qty}</div>`;
}

export function renderBinderView(list, {
  hasActiveFilter = () => true,
  renderEmptyScopeState = () => {},
} = {}) {
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
    pagesEl.innerHTML = '<div class="deck-empty-state"><p class="deck-empty-prompt">no cards match</p></div>';
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
  summaryEl.textContent = `${total} cards - ${list.length} unique`;
}

export function applyBinderSizeButtons(doc = document) {
  doc.querySelectorAll('[data-binder-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.binderSize === state.binderSize);
  });
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
