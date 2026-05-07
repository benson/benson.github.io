import { state } from './state.js';
import { initFeedback } from './feedback.js';
import { onCollectionCommit, resetCollectionCommitHooks } from './appRuntime.js';
import { commitCollectionChange } from './commit.js';
import { loadFromStorage, migrateSavedCollection } from './persistence.js';
import { initSearch, applyUrlStateOnLoad } from './search.js';
import { render, initView, navigateToLocation, openRightDrawer } from './view.js?binder-playlist-6';
import { initBulk } from './bulk.js?bulk-location-picker-4';
import { initAdd } from './add.js';
import { initDetail, populateFilters } from './detail.js';
import {
  initImport,
  backfillMissingPrices,
  lazyBackfillSearchFields,
} from './import.js';
import { refreshSetIcons } from './setIcons.js';
import { initChangelog } from './changelog.js';
import { initShareViewer, initShare, schedulePushForDeck } from './share.js';
import { bindAppControls, loadChromePreferences } from './appControls.js?empty-import-1';
import {
  initSyncEngine,
  loadLocalSyncSnapshotIntoState,
  primeSyncBaseline,
} from './syncEngine.js';
import { initSyncUi } from './syncUi.js?settings-header-1';
import { initMcpChat } from './mcpChat.js';
import { applyRouteStateFromUrl } from './routeState.js';
import { bindSidebarToggle, loadSidebarPreference } from './sidebarPreferences.js?drawer-peek-1';
import { bindHistoryDrawerToggle, loadHistoryDrawerPreference } from './historyDrawer.js?bottom-drawer-1';

function mirrorSharedDecks() {
  if (state.shareSnapshot) return;
  for (const container of Object.values(state.containers || {})) {
    if (container.shareId) schedulePushForDeck(container);
  }
}

function refreshAfterCollectionCommit() {
  populateFilters();
  render();
  mirrorSharedDecks();
}

function markBootReady() {
  document.body.classList.add('app-boot-settling');
  document.body.classList.remove('app-booting');
  const raf = document.defaultView?.requestAnimationFrame?.bind(document.defaultView);
  const clearSettling = () => document.body.classList.remove('app-boot-settling');
  if (raf) raf(() => raf(clearSettling));
  else setTimeout(clearSettling, 80);
}

const SYNC_BOOT_WAIT_MS = 2500;
const LOCAL_SYNC_BOOT_WAIT_MS = 1000;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withBootBudget(promise, fallback, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    wait(ms).then(() => fallback),
  ]);
}

function showBootFailure(error) {
  markBootReady();
  const feedback = document.getElementById('feedback');
  if (feedback) {
    feedback.textContent = error?.message || String(error || 'app failed to load');
    feedback.classList.add('error');
  }
}

function runPostBootBackfills() {
  backfillMissingPrices()
    .then(() => {
      populateFilters();
      render();
    })
    .catch(error => console.warn('[prices] backfill skipped after boot:', error.message || error));

  lazyBackfillSearchFields()
    .catch(error => console.warn('[search] lazy backfill skipped after boot:', error.message || error));

  // Populate the set-icon cache from Scryfall in the background; re-render
  // when it lands so cards with quirky set codes (pmkm, h2r, sld, etc.)
  // get their proper icons.
  refreshSetIcons()
    .then(updated => { if (updated) render(); })
    .catch(error => console.warn('[sets] icon refresh skipped after boot:', error.message || error));
}

async function boot() {
  loadChromePreferences();
  loadSidebarPreference();
  loadHistoryDrawerPreference();

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
  resetCollectionCommitHooks();
  onCollectionCommit(refreshAfterCollectionCommit);

  // Init submodules (each wires its own event listeners + DOM refs)
  initView();
  initSearch({ renderImpl: render });
  initBulk({ renderImpl: render });
  initAdd();
  initDetail();
  initImport();
  initChangelog({
    commitCollectionChangeImpl: commitCollectionChange,
    navigateToLocationImpl: navigateToLocation,
  });
  initShare();
  initSyncUi();
  initMcpChat();

  // App-level DOM controls; format selector syncs after loadFromStorage().
  const appControls = bindAppControls({ openRightDrawerImpl: openRightDrawer });
  bindSidebarToggle();
  bindHistoryDrawerToggle();

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
      markBootReady();
      return;
    }
    populateFilters();
    render();
    markBootReady();
    return;
  }

  const hasLocalSyncSnapshot = await withBootBudget(
    loadLocalSyncSnapshotIntoState(),
    false,
    LOCAL_SYNC_BOOT_WAIT_MS
  );
  const hasSavedCollection = hasLocalSyncSnapshot || loadFromStorage();
  appControls.syncFormatSelect();
  if (hasSavedCollection) {
    migrateSavedCollection();
  }
  applyRouteStateFromUrl();
  await withBootBudget(primeSyncBaseline(), null, LOCAL_SYNC_BOOT_WAIT_MS);
  const syncInit = initSyncEngine({ render, populateFilters, applyRouteState: applyRouteStateFromUrl });
  const syncReady = await Promise.race([
    syncInit.then(() => true),
    wait(SYNC_BOOT_WAIT_MS).then(() => false),
  ]);
  if (!syncReady) {
    syncInit
      .then(() => {
        populateFilters();
        applyRouteStateFromUrl();
        render();
      })
      .catch(error => console.warn('[sync] startup continued after boot:', error.message || error));
  }
  populateFilters();
  applyRouteStateFromUrl();
  applyUrlStateOnLoad();
  render();
  markBootReady();
  if (state.collection.length === 0) {
    document.getElementById('addDetails').open = true;
  }
  if (hasSavedCollection) runPostBootBackfills();
}

boot().catch(showBootFailure);
