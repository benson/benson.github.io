import { state } from './state.js';
import { initFeedback } from './feedback.js';
import { save, loadFromStorage, migrateSavedCollection } from './persistence.js';
import { initSearch, applyUrlStateOnLoad, clearAllFilters } from './search.js';
import { render, initView } from './view.js';
import { initBulk } from './bulk.js';
import { initAdd } from './add.js';
import { initDetail, populateFilters, renderDetailLegality } from './detail.js';
import {
  initImport,
  exportCsv,
  backfillMissingPrices,
  lazyBackfillSearchFields,
} from './import.js';
import { refreshSetIcons } from './setIcons.js';
import { initChangelog } from './changelog.js';

const TEXT_CASE_KEY = 'mtgcollection_text_case_v1';
const CHROME_KEY = 'mtgcollection_chrome_v1';

function applyTextCase(mode) {
  document.body.classList.toggle('proper-case', mode === 'proper');
}

function applyChrome(mode) {
  document.body.classList.toggle('chrome-classic', mode === 'classic');
}

async function boot() {
  // Apply text-case preference before anything renders
  try {
    applyTextCase(localStorage.getItem(TEXT_CASE_KEY));
  } catch (e) {}

  // Apply chrome-border preference before anything renders
  try {
    applyChrome(localStorage.getItem(CHROME_KEY));
  } catch (e) {}

  // Lowest-level init first — feedback + DOM refs
  initFeedback();

  // Init submodules (each wires its own event listeners + DOM refs)
  initView();
  initSearch();
  initBulk();
  initAdd();
  initDetail();
  initImport();
  initChangelog();

  // Format selector — wire listener now; sync value after loadFromStorage()
  const formatSelectEl = document.getElementById('formatSelect');
  const footerEl = document.querySelector('.app-footer');
  const updateFooter = () => {
    if (footerEl) footerEl.classList.toggle('format-active', !!state.selectedFormat);
  };
  formatSelectEl.addEventListener('change', () => {
    state.selectedFormat = formatSelectEl.value;
    save();
    updateFooter();
    if (state.detailIndex >= 0) renderDetailLegality();
    if (state.viewMode === 'deck') render();
  });
  updateFooter();

  document.getElementById('fabCluster').addEventListener('click', e => {
    if (e.target.closest('[data-fab-action="export"]')) exportCsv();
  });

  document.getElementById('resetAppBtn').addEventListener('click', () => {
    clearAllFilters();
    state.viewMode = 'list';
    state.detailIndex = -1;
    save();
    history.replaceState(null, '', location.pathname);
    render();
  });

  // Boot the collection
  const hasSavedCollection = loadFromStorage();
  formatSelectEl.value = state.selectedFormat;
  updateFooter();
  if (hasSavedCollection) {
    migrateSavedCollection();
    await backfillMissingPrices();
  }
  populateFilters();
  render();
  if (state.collection.length === 0) {
    document.getElementById('addDetails').open = true;
  } else {
    document.getElementById('importDetails').open = false;
  }
  applyUrlStateOnLoad();
  lazyBackfillSearchFields();

  // Populate the set-icon cache from Scryfall in the background; re-render
  // when it lands so cards with quirky set codes (pmkm, h2r, sld, etc.)
  // get their proper icons.
  refreshSetIcons().then(updated => { if (updated) render(); });

  document.getElementById('caseToggleBtn').addEventListener('click', () => {
    const next = document.body.classList.contains('proper-case') ? 'lower' : 'proper';
    try { localStorage.setItem(TEXT_CASE_KEY, next); } catch (e) {}
    applyTextCase(next);
  });

  document.getElementById('chromeToggleBtn').addEventListener('click', () => {
    const next = document.body.classList.contains('chrome-classic') ? 'soft' : 'classic';
    try { localStorage.setItem(CHROME_KEY, next); } catch (e) {}
    applyChrome(next);
  });
}

boot();
