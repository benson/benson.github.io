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
import { initShareViewer, initShare } from './share.js';
import { setTopLevelViewMode } from './routeState.js';

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

  // Detect viewer mode early — if `?share=ID` is present, we'll skip the
  // user's own localStorage entirely and render the snapshot read-only.
  const shareId = (() => {
    try { return new URL(location.href).searchParams.get('share') || ''; }
    catch (e) { return ''; }
  })();
  const isViewer = shareId && shareId.length >= 6;
  if (isViewer) document.body.classList.add('share-mode');

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
  initShare();

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
    // Format selector affects deck workspace rendering. Re-render whenever
    // the deck shape would be active.
    render();
  });
  updateFooter();

  document.getElementById('fabCluster').addEventListener('click', e => {
    if (e.target.closest('[data-fab-action="export"]')) exportCsv();
  });

  document.getElementById('emptyState').addEventListener('click', e => {
    const btn = e.target.closest('[data-empty-action]');
    if (!btn) return;
    const action = btn.dataset.emptyAction;
    if (action === 'new-deck') {
      setTopLevelViewMode('decks');
      save();
      render();
      document.getElementById('locationsCreateName')?.focus();
    } else if (action === 'new-container') {
      setTopLevelViewMode('storage');
      save();
      render();
      document.getElementById('locationsCreateName')?.focus();
    } else if (action === 'open-import') {
      const det = document.getElementById('addDetails');
      if (det) det.open = true;
      const tabBtn = document.querySelector('[data-add-mode="import"]');
      if (tabBtn) tabBtn.click();
    } else if (action === 'load-sample') {
      document.getElementById('loadSampleBtn')?.click();
    } else if (action === 'load-test') {
      document.getElementById('loadTestDataBtn')?.click();
    }
  });

  document.getElementById('resetAppBtn').addEventListener('click', () => {
    clearAllFilters();
    setTopLevelViewMode('collection');
    state.detailIndex = -1;
    save();
    history.replaceState(null, '', location.pathname);
    render();
  });

  // Boot the collection — viewer mode short-circuits the localStorage path
  // entirely so the user's own data is never touched.
  if (isViewer) {
    const ok = await initShareViewer(shareId);
    if (!ok) {
      // Viewer load failed — show an inert error state instead of falling
      // through to the user's localStorage (which would silently swap data).
      document.body.classList.add('share-error');
      const banner = document.getElementById('shareBanner');
      if (banner) {
        banner.classList.remove('hidden');
        banner.innerHTML = '<span>couldn\'t load this snapshot — it may have expired</span>'
          + ' <a href="' + location.pathname + '">open my collection</a>';
      }
      return;
    }
    populateFilters();
    render();
    return;
  }

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
