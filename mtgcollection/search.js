import { state } from './state.js';
import { save } from './persistence.js';
import { getMultiselectValue, setMultiselectValue, initMultiselect } from './multiselect.js';
import { clearActiveLocation, syncActiveLocationFromFilter } from './routeState.js';
import { tokenizeSearch, matchSearch, passesMultiselectFilters, compareCards } from './searchCore.js';

// Re-export the pure query/match primitives so existing importers (app modules,
// tests) keep using them from search.js. The implementation lives in
// searchCore.js, which the biblioplex CLI shares verbatim.
export { tokenizeSearch, matchSearch, passesMultiselectFilters } from './searchCore.js';

export function filteredSorted() {
  const q = document.getElementById('searchInput').value.trim();
  const tokens = tokenizeSearch(q);
  const sets = getMultiselectValue(document.getElementById('filterSet'));
  const rarities = getMultiselectValue(document.getElementById('filterRarity'));
  const finishes = getMultiselectValue(document.getElementById('filterFoil'));
  const locations = getMultiselectValue(document.getElementById('filterLocation'));
  const tags = getMultiselectValue(document.getElementById('filterTag'));

  const format = state.selectedFormat || '';

  let list = state.collection.filter(c => {
    if (!matchSearch(c, tokens)) return false;
    return passesMultiselectFilters(c, { sets, rarities, finishes, locations, tags, format });
  });

  const field = state.sortField || 'name';
  const dir = state.sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => dir * compareCards(a, b, field));
  return list;
}

// True when any filter has a non-default value (search bar, multiselects,
// format dropdown).
export function hasActiveFilter() {
  const q = document.getElementById('searchInput').value.trim();
  if (q) return true;
  const ids = ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden') && getMultiselectValue(el).length > 0) return true;
  }
  const deckFormatEl = document.getElementById('filterDeckFormat');
  if (deckFormatEl && !deckFormatEl.classList.contains('hidden') && getMultiselectValue(deckFormatEl).length > 0) return true;
  const storageTypeEl = document.getElementById('filterStorageType');
  if (storageTypeEl && !storageTypeEl.classList.contains('hidden') && getMultiselectValue(storageTypeEl).length > 0) return true;
  const formatEl = document.getElementById('formatSelect');
  if (state.selectedFormat && (!formatEl || !formatEl.classList.contains('hidden'))) return true;
  return false;
}

export function clearAllFilters() {
  document.getElementById('searchInput').value = '';
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'].forEach(id => {
    setMultiselectValue(document.getElementById(id), []);
  });
  setMultiselectValue(document.getElementById('filterDeckFormat'), []);
  setMultiselectValue(document.getElementById('filterStorageType'), []);
  syncDeckFormatUrl([]);
  syncStorageTypeUrl([]);
  clearActiveLocation();
  // Also clear the format dropdown
  state.selectedFormat = '';
  const fmtEl = document.getElementById('formatSelect');
  if (fmtEl) fmtEl.value = '';
  document.querySelector('.app-footer')?.classList.remove('format-active');
}

let urlStateDebounce = null;
let searchInputEl = null;
let searchClearBtn = null;
let renderCurrentView = () => {};

export function configureSearchActions({ renderImpl } = {}) {
  if (typeof renderImpl === 'function') renderCurrentView = renderImpl;
}

function syncSearchClearBtn() {
  searchClearBtn.classList.toggle('visible', !!searchInputEl.value);
}

function syncUrlFromSearch() {
  const q = searchInputEl.value.trim();
  const url = new URL(window.location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

function syncDeckFormatUrl(values = getMultiselectValue(document.getElementById('filterDeckFormat'))) {
  const url = new URL(window.location.href);
  if (values.length) url.searchParams.set('df', values.join(','));
  else url.searchParams.delete('df');
  history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

function syncStorageTypeUrl(values = getMultiselectValue(document.getElementById('filterStorageType'))) {
  const url = new URL(window.location.href);
  if (values.length) url.searchParams.set('st', values.join(','));
  else url.searchParams.delete('st');
  history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
}

export function applyUrlStateOnLoad() {
  const params = new URL(window.location.href).searchParams;
  const q = params.get('q');
  if (q) {
    searchInputEl.value = q;
  }
  const deckFormats = (params.get('df') || '').split(',').map(v => v.trim()).filter(Boolean);
  if (deckFormats.length) setMultiselectValue(document.getElementById('filterDeckFormat'), deckFormats);
  const storageTypes = (params.get('st') || '').split(',').map(v => v.trim()).filter(Boolean);
  if (storageTypes.length) setMultiselectValue(document.getElementById('filterStorageType'), storageTypes);
  syncSearchClearBtn();
  if (q || deckFormats.length || storageTypes.length) renderCurrentView();
}

export function syncClearFiltersBtn() {
  const btn = document.getElementById('clearFiltersBtn');
  if (!btn) return;
  btn.classList.toggle('visible', hasActiveFilter());
}

export function initSearch(options = {}) {
  configureSearchActions(options);
  searchInputEl = document.getElementById('searchInput');
  searchClearBtn = document.getElementById('searchClearBtn');

  searchClearBtn.addEventListener('click', () => {
    searchInputEl.value = '';
    searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    searchInputEl.focus();
  });

  const searchHelpBtn = document.getElementById('searchHelpBtn');
  const searchHelpPopover = document.getElementById('searchHelpPopover');
  function positionSearchHelpPopover() {
    const wrap = searchHelpBtn.closest('.search-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    searchHelpPopover.style.top = (rect.bottom + 4) + 'px';
    searchHelpPopover.style.left = rect.left + 'px';
  }
  searchHelpBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !searchHelpPopover.classList.contains('visible');
    if (willOpen) positionSearchHelpPopover();
    searchHelpPopover.classList.toggle('visible');
  });
  document.addEventListener('click', e => {
    if (!searchHelpPopover.classList.contains('visible')) return;
    if (e.target.closest('#searchHelpPopover') || e.target.closest('#searchHelpBtn')) return;
    searchHelpPopover.classList.remove('visible');
  });
  window.addEventListener('resize', () => {
    if (searchHelpPopover.classList.contains('visible')) positionSearchHelpPopover();
  });

  searchInputEl.addEventListener('input', () => {
    syncSearchClearBtn();
    clearTimeout(urlStateDebounce);
    urlStateDebounce = setTimeout(syncUrlFromSearch, 250);
  });

  // Initialize multiselect filter controls (build the trigger + popover DOM)
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag', 'filterDeckFormat', 'filterStorageType'].forEach(id => {
    initMultiselect(document.getElementById(id), {
      onChange: values => {
        if (id === 'filterLocation') {
          syncActiveLocationFromFilter(document.getElementById(id));
          // Reset shape-override + binder pagination when the active container changes,
          // so viewAsList doesn't bleed across containers.
          state.viewAsList = false;
          state.binderPage = 0;
          save();
        }
        if (id === 'filterDeckFormat') syncDeckFormatUrl(values);
        if (id === 'filterStorageType') syncStorageTypeUrl(values);
        renderCurrentView();
      },
    });
  });

  // Native controls that still emit input/change
  document.getElementById('searchInput').addEventListener('input', renderCurrentView);
  document.getElementById('searchInput').addEventListener('change', renderCurrentView);

  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAllFilters();
      searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      renderCurrentView();
    });
  }
}
