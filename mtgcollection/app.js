import { state } from './state.js';
import { initFeedback } from './feedback.js';
import { save, loadFromStorage, migrateSavedCollection } from './persistence.js';
import { initSearch, applyUrlStateOnLoad } from './search.js';
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

async function boot() {
  // Lowest-level init first — feedback + DOM refs
  initFeedback();

  // Init submodules (each wires its own event listeners + DOM refs)
  initView();
  initSearch();
  initBulk();
  initAdd();
  initDetail();
  initImport();

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

  document.getElementById('footerExportBtn').addEventListener('click', () => exportCsv());

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
  if (state.collection.length > 0) {
    document.getElementById('importDetails').open = false;
  }
  applyUrlStateOnLoad();
  lazyBackfillSearchFields();
}

boot();
