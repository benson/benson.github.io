import { state } from './state.js';
import { initFeedback } from './feedback.js';
import { onCollectionCommit, resetCollectionCommitHooks } from './appRuntime.js';
import { commitCollectionChange } from './commit.js';
import { loadFromStorage, migrateSavedCollection } from './persistence.js';
import { initSearch, applyUrlStateOnLoad } from './search.js';
import { render, initView, navigateToLocation } from './view.js';
import { initBulk } from './bulk.js';
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
import { bindAppControls, loadChromePreferences } from './appControls.js';

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

async function boot() {
  loadChromePreferences();

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

  // App-level DOM controls; format selector syncs after loadFromStorage().
  const appControls = bindAppControls();

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
  appControls.syncFormatSelect();
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

}

boot();
