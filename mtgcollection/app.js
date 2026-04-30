import { state } from './state.js';
import { initFeedback, showFeedback, hideFeedback, getFeedbackEl } from './feedback.js';
import {
  save,
  loadFromStorage,
  migrateSavedCollection,
  bumpBackupCounter,
  resetBackupCounter,
  maybeShowBackupNag,
} from './persistence.js';
import { initSearch, applyUrlStateOnLoad } from './search.js';
import { render, initView } from './view.js';
import { initBulk } from './bulk.js';
import { initAdd } from './add.js';
import { initDetail, populateFilters, renderDetailLegality } from './detail.js';
import {
  initImport,
  loadBreyaDeck,
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
  formatSelectEl.addEventListener('change', () => {
    state.selectedFormat = formatSelectEl.value;
    save();
    if (state.detailIndex >= 0) renderDetailLegality();
    if (state.viewMode === 'deck') render();
  });

  // Backup nag actions
  getFeedbackEl().addEventListener('click', e => {
    const btn = e.target.closest('[data-backup-action]');
    if (!btn) return;
    if (btn.dataset.backupAction === 'export') {
      exportCsv();
      resetBackupCounter();
      hideFeedback();
    } else if (btn.dataset.backupAction === 'dismiss') {
      resetBackupCounter();
      hideFeedback();
    }
  });

  // Boot the collection
  const hasSavedCollection = loadFromStorage();
  formatSelectEl.value = state.selectedFormat;
  if (!hasSavedCollection) {
    showFeedback('<span class="loading-spinner"></span> loading breya deck...', 'info');
    await loadBreyaDeck({ replace: true, silent: true });
    hideFeedback();
  } else {
    migrateSavedCollection();
    await backfillMissingPrices();
    populateFilters();
    render();
  }
  if (state.collection.length > 0) {
    document.getElementById('importDetails').open = false;
  }
  applyUrlStateOnLoad();
  const loadCount = bumpBackupCounter();
  if (hasSavedCollection) maybeShowBackupNag(loadCount);
  lazyBackfillSearchFields();
}

boot();
