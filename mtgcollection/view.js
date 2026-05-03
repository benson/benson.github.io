import { state } from './state.js';
import { esc } from './feedback.js';
import {
  allCollectionLocations,
  allContainers,
  ensureContainer,
  formatLocationLabel,
  LOCATION_TYPES,
  normalizeDeckBoard,
  defaultDeckMetadata,
  makeEntry,
  getUsdPrice,
} from './collection.js';
import { save } from './persistence.js';
import { openDetail, populateFilters } from './detail.js';
import { setSelectedLocation } from './add.js';
import { filteredSorted, syncClearFiltersBtn, hasActiveFilter } from './search.js';
import { groupDeck, firstCardForPanel, splitDeckBoards, deckStats, renderDeckStatsHtml } from './stats.js';
import { updateBulkBar } from './bulk.js';
import { setHistoryScope } from './changelog.js';
import {
  loadDeckGroup,
  loadDeckPrefs,
} from './deckPreferences.js';
import {
  getActiveLocation,
  getActiveLocationOfType,
  getEffectiveShape as getRouteEffectiveShape,
  setActiveContainerRoute,
  setTopLevelViewMode,
  VALID_VIEW_MODES,
} from './routeState.js';
import {
  deckDetailsViewModel,
  renderDeckDetailsHeaderHtml,
  renderDeckExportPanel,
  renderDeckWorkspaceControls,
} from './views/deckHeaderView.js';
import { locationPillHtml } from './ui/locationUi.js';
import { renderDecksHomeHtml, renderStorageHomeHtml } from './views/locationHomeViews.js';
import { renderRow } from './views/listRowView.js';
import {
  renderDeckNotesMode,
  renderDeckSampleHandSection,
  renderDeckStatsDashboard,
  renderDeckTextMode,
  renderDeckVisualMode,
} from './views/deckBodyView.js';
import {
  applyBinderSizeButtons,
  loadBinderSize,
  renderBinderView,
  saveBinderSize,
  VALID_BINDER_SIZES,
} from './views/binderView.js';
import { initCardPreview, isLightboxVisible } from './ui/cardPreview.js';
import { createDeckMetaAutocomplete } from './deckMetaAutocomplete.js';
import { buildDeckCardFromEntry } from './deckCardModel.js';
import { createDeckPreviewPanel } from './deckPreviewPanel.js';
import { createRightDrawer } from './rightDrawer.js';
import { renderDeckSampleHandPanel } from './deckSampleHand.js';
import { bindDeckWorkspaceInteractions } from './deckWorkspaceActions.js';
import { bindLocationHomeInteractions } from './locationHomeActions.js';
import { bindListRowInteractions } from './listRowActions.js';

export function navigateToLocation(type, name) {
  setActiveContainerRoute({ type, name });
  // Clear any stray `loc:` query so the multiselect filter is the source of truth.
  const searchInput = document.getElementById('searchInput');
  if (searchInput && /\bloc:/.test(searchInput.value)) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  save();
  render();
}

export function getEffectiveShape() {
  return getRouteEffectiveShape();
}

function currentDeckScope() {
  if (state.shareSnapshot?.container?.type === 'deck') {
    return { type: 'deck', name: state.shareSnapshot.container.name };
  }
  return getActiveLocationOfType('deck');
}

let locationsEl, listBodyEl, collectionSection, emptyState;
let deckMetaAutocomplete = null;
let deckPreviewPanel = null;
let rightDrawer = null;

export function render() {
  const shape = getEffectiveShape();
  document.querySelectorAll('.app-header-views .toggle-view').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
  });
  // New top-level viewMode classes (drive per-route CSS)
  document.body.classList.toggle('view-collection', state.viewMode === 'collection');
  document.body.classList.toggle('view-decks', state.viewMode === 'decks');
  document.body.classList.toggle('view-storage', state.viewMode === 'storage');
  // Shape classes (drive per-shape CSS) — keep legacy 'view-list'/'view-locations'
  // names as aliases so existing CSS keeps working without a sweep.
  document.body.classList.toggle('view-list', shape === 'collection' || shape === 'box');
  document.body.classList.toggle('view-deck', shape === 'deck');
  document.body.classList.toggle('view-binder', shape === 'binder');
  document.body.classList.toggle('view-locations', shape === 'decks-home' || shape === 'storage-home');
  document.body.classList.toggle('view-decks-home', shape === 'decks-home');
  document.body.classList.toggle('view-storage-home', shape === 'storage-home');
  document.body.classList.toggle('has-collection', state.collection.length > 0);
  document.body.classList.toggle('deck-ownership-decklist', shape === 'deck' && state.deckOwnershipView === 'decklist');
  // Share-mode UI: banner visible whenever we're rendering someone else's
  // snapshot. The body class also gates write affordances via CSS.
  document.body.classList.toggle('share-mode', !!state.shareSnapshot);
  const shareBanner = document.getElementById('shareBanner');
  if (shareBanner) {
    if (state.shareSnapshot) {
      const deckName = state.shareSnapshot.container?.name || 'deck';
      shareBanner.innerHTML = '<span>viewing shared deck <strong>' + esc(deckName) + '</strong> — read-only</span>'
        + ' <button class="btn btn-secondary" type="button" data-share-banner-action="exit">exit</button>';
      shareBanner.classList.remove('hidden');
    } else {
      shareBanner.classList.add('hidden');
    }
  }
  // Right drawer is only meaningful for the flat list / collection / deck shape
  if (shape !== 'collection' && shape !== 'box' && shape !== 'deck') closeRightDrawer();
  syncClearFiltersBtn();
  syncViewAsListToggles();
  setHistoryScope(shape === 'deck' ? currentDeckScope() : null);
  const containers = allContainers();
  // Decks-home and storage-home render even on an empty collection so the
  // user can create a container before adding cards.
  const isHomeShape = shape === 'decks-home' || shape === 'storage-home';
  if (state.collection.length === 0 && containers.length === 0 && !isHomeShape) {
    collectionSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    document.getElementById('binderSizeControl').classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  collectionSection.classList.remove('hidden');

  const list = filteredSorted();

  document.getElementById('uniqueCount').textContent = list.length;
  document.getElementById('totalCount').textContent = list.reduce((s, c) => s + c.qty, 0);
  const value = list.reduce((s, c) => s + (c.price || 0) * c.qty, 0);
  document.getElementById('totalValue').textContent = value.toFixed(2);
  applyBinderSizeButtons();

  const listContainer = document.getElementById('listView');
  const deckContainer = document.getElementById('deckView');
  const binderContainer = document.getElementById('binderView');
  const locationsContainer = document.getElementById('locationsView');
  const binderSizeCtl = document.getElementById('binderSizeControl');

  // Reset chrome
  locationsContainer.classList.remove('active');
  listContainer.classList.remove('active');
  deckContainer.classList.remove('active');
  binderContainer.classList.remove('active');
  binderSizeCtl.classList.add('hidden');

  if (shape === 'decks-home') {
    locationsContainer.classList.add('active');
    locationsEl.innerHTML = renderDecksHomeHtml(containers);
  } else if (shape === 'storage-home') {
    locationsContainer.classList.add('active');
    locationsEl.innerHTML = renderStorageHomeHtml(containers);
  } else if (shape === 'deck') {
    deckContainer.classList.add('active');
    renderDeckView(list);
  } else if (shape === 'binder') {
    binderContainer.classList.add('active');
    binderSizeCtl.classList.remove('hidden');
    renderBinderView(list, { hasActiveFilter, renderEmptyScopeState });
  } else {
    // 'collection' or 'box' — both render as flat list. 'box' is just a
    // collection view filtered to a single box container.
    listContainer.classList.add('active');
    listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
    syncSortIndicator();
  }
  updateBulkBar();
}

// Shape bar: shows the auto-shape and a toggle to override to list.
// Now binder-only — the only shape with a meaningful "view as list" escape.
function syncViewAsListToggles() {
  const autoType = (() => {
    if (state.viewMode !== 'storage') return null;
    const loc = getActiveLocation();
    return loc?.type === 'binder' ? loc.type : null;
  })();
  const bar = document.getElementById('shapeBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !autoType);
  if (!autoType) return;
  const label = document.getElementById('shapeBarLabel');
  const btn = bar.querySelector('[data-view-as-list]');
  if (state.viewAsList) {
    label.textContent = 'showing as list';
    btn.textContent = 'back to ' + autoType + ' view';
  } else {
    label.textContent = 'showing as ' + autoType;
    btn.textContent = 'view as list';
  }
  btn.setAttribute('aria-pressed', state.viewAsList ? 'true' : 'false');
}

function syncSortIndicator() {
  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    const field = th.dataset.sort;
    const isActive = !!state.sortField && field === state.sortField;
    th.classList.toggle('sort-active', isActive);
    const arrowEl = th.querySelector('.sort-arrow');
    if (arrowEl) arrowEl.textContent = state.sortDir === 'desc' ? '↓' : '↑';
  });
}

function renderEmptyScopeState(targetEl, mode) {
  const label = mode === 'binder' ? 'binder view' : 'deck view';
  const locations = allCollectionLocations();
  if (locations.length === 0) {
    targetEl.innerHTML = `<div class="deck-empty-state">
      <p class="deck-empty-prompt">${esc(label)} needs a filter — add a location to a card via the drawer, or apply a search query</p>
    </div>`;
    return;
  }
  const TYPE_HEADERS = { deck: 'decks', binder: 'binders', box: 'boxes' };
  const groups = LOCATION_TYPES.map(type => {
    const ofType = locations.filter(l => l.type === type);
    if (ofType.length === 0) return '';
    const chips = ofType.map(loc =>
      `<button type="button" class="deck-empty-chip" data-loc="${esc(formatLocationLabel(loc))}">${locationPillHtml(loc)}</button>`
    ).join('');
    return `<div class="deck-empty-group">
      <div class="deck-empty-group-label">${TYPE_HEADERS[type]}</div>
      <div class="deck-empty-chips-row">${chips}</div>
    </div>`;
  }).join('');
  targetEl.innerHTML = `<div class="deck-empty-state">
    <p class="deck-empty-prompt">${esc(label)} needs a filter — pick a location below</p>
    <div class="deck-empty-chips">${groups}</div>
  </div>`;
}

function currentDeckContainer() {
  // Viewer mode: the snapshot's deck IS the current deck. Skip the
  // multiselect (which doesn't exist meaningfully in share-mode anyway).
  if (state.shareSnapshot?.container?.type === 'deck') {
    const snapDeck = state.shareSnapshot.container;
    return ensureContainer({ type: 'deck', name: snapDeck.name });
  }
  const loc = getActiveLocationOfType('deck');
  if (!loc) return null;
  return ensureContainer(loc);
}

function currentDeckMetadata() {
  const deck = currentDeckContainer();
  return deck?.deck || defaultDeckMetadata(deck?.name || 'deck');
}

function renderSampleHandPanel() {
  renderDeckSampleHandPanel({
    handEl: document.getElementById('deckHandCards'),
    deck: currentDeckContainer(),
    sampleHand: state.deckSampleHand,
  });
}

function renderDeckView(list) {
  const deckColumnsEl = document.getElementById('deckColumns');
  const deckActionsEl = document.querySelector('#deckView .deck-actions');
  const deck = currentDeckContainer();

  // Viewer mode always has an "active scope" — the snapshot. Skip the
  // empty-state guard which assumes the user picked a location.
  if (!state.shareSnapshot && !hasActiveFilter()) {
    if (deckActionsEl) deckActionsEl.classList.add('hidden');
    deckPreviewPanel?.setCard(null);
    renderEmptyScopeState(deckColumnsEl, 'deck');
    document.getElementById('deckSummary').textContent = '';
    return;
  }

  if (deckActionsEl) deckActionsEl.classList.add('hidden');
  if (deck && (!deck.deck || typeof deck.deck !== 'object')) deck.deck = defaultDeckMetadata(deck.name);
  if (deck && !Array.isArray(deck.deckList)) deck.deckList = [];
  const meta = deck?.deck || defaultDeckMetadata(deck?.name || 'deck');
  // Build the list of "deck cards" by resolving the decklist against the
  // inventory. Each card has identity from the decklist entry, board from the
  // entry, and finish/price/etc. from the primary inventory match (if any).
  list = (deck?.deckList || []).map(entry => buildDeckCardFromEntry(entry, state.collection));
  for (const c of list) c.deckBoard = normalizeDeckBoard(c.deckBoard);
  const boards = splitDeckBoards(list);
  const stats = deckStats(list);
  const statHtml = renderDeckStatsHtml(boards.main);
  const format = meta.format || state.selectedFormat || 'unspecified format';
  const headerModel = deckDetailsViewModel(deck, meta, stats, state.selectedFormat);
  const modeBody = state.deckMode === 'stats'
    ? renderDeckStatsDashboard(stats, statHtml, format)
    : state.deckMode === 'hands'
      ? renderDeckSampleHandSection()
      : state.deckMode === 'text'
        ? renderDeckTextMode(boards)
        : state.deckMode === 'notes'
          ? renderDeckNotesMode(headerModel)
          : renderDeckVisualMode(boards);

  deckColumnsEl.innerHTML = `<div class="deck-workspace deck-card-size-${esc(state.deckCardSize)}">
    ${renderDeckDetailsHeaderHtml(headerModel)}
    ${renderDeckWorkspaceControls()}
    ${modeBody}
  </div>`;

  const cols = groupDeck(boards.main, state.deckGroupBy);
  // Default preview: commander art if the deck has one, otherwise the first
  // card in the visual grid (today's behavior).
  const commanderPreview = headerModel.commanderImageUrl
    ? {
        name: headerModel.commander || '',
        resolvedName: headerModel.commander || '',
        imageUrl: headerModel.commanderImageUrl,
        backImageUrl: headerModel.commanderBackImageUrl || '',
        qty: 1,
        finish: 'normal',
        price: 0,
      }
    : null;
  deckPreviewPanel?.setCard(commanderPreview || firstCardForPanel(cols) || list[0] || null);
  renderSampleHandPanel();
  const summary = document.getElementById('deckSummary');
  summary.textContent = stats.total + ' cards - ' + format;
}

export function openRightDrawer(targetIds, options = {}) {
  rightDrawer?.open(targetIds, options);
}

export function closeRightDrawer() {
  rightDrawer?.close();
}

export function isRightDrawerOpen() {
  return !!rightDrawer?.isOpen();
}

export function initView() {
  locationsEl = document.getElementById('locationsView');
  listBodyEl = document.getElementById('listBody');
  collectionSection = document.getElementById('collectionSection');
  emptyState = document.getElementById('emptyState');
  initCardPreview();
  deckMetaAutocomplete = createDeckMetaAutocomplete({
    rootEl: document.getElementById('deckColumns'),
  });
  deckMetaAutocomplete.bind();
  deckPreviewPanel = createDeckPreviewPanel({
    panelEl: document.getElementById('deckPreviewPanel'),
    getCollection: () => state.collection,
    getDeckScope: currentDeckScope,
    openDetail,
  });
  deckPreviewPanel.bind();
  rightDrawer = createRightDrawer({
    getShape: getEffectiveShape,
    setSelectedLocation,
  });

  document.querySelector('.app-header-views').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const next = btn.dataset.view;
    if (!VALID_VIEW_MODES.includes(next)) return;
    if (state.viewMode === next && !getActiveLocation()) return;
    setTopLevelViewMode(next);
    save();
    render();
  });

  // Per-shape "view as list" toggle. Visible only when a single
  // deck/binder filter would otherwise auto-shape the view.
  document.body.addEventListener('click', e => {
    const btn = e.target.closest('[data-view-as-list]');
    if (!btn) return;
    state.viewAsList = !state.viewAsList;
    save();
    render();
  });

  document.querySelector('table thead').addEventListener('click', e => {
    if (e.target.closest('.sort-clear-btn')) {
      state.sortField = null;
      state.sortDir = 'asc';
      save();
      render();
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    if (state.sortField === field) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = field;
      state.sortDir = 'asc';
    }
    save();
    render();
  });

  // FAB cluster — list-view summon panels on demand
  const fabCluster = document.getElementById('fabCluster');
  if (fabCluster) {
    fabCluster.addEventListener('click', e => {
      const btn = e.target.closest('[data-fab-target]');
      if (!btn) return;
      const targets = btn.dataset.fabTarget.split(',').map(s => s.trim()).filter(Boolean);
      const seedLocation = getEffectiveShape() === 'deck' ? currentDeckScope() : null;
      openRightDrawer(targets, { seedLocation });
    });
  }
  const appRightBackdrop = document.getElementById('appRightBackdrop');
  if (appRightBackdrop) {
    appRightBackdrop.addEventListener('click', closeRightDrawer);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!isRightDrawerOpen()) return;
    // Defer to higher-priority overlays (lightbox / detail drawer handle their own Escape).
    if (isLightboxVisible()) return;
    const detailDrawerEl = document.getElementById('detailDrawer');
    if (detailDrawerEl && detailDrawerEl.classList.contains('visible')) return;
    closeRightDrawer();
  });

  loadBinderSize();
  applyBinderSizeButtons();
  document.getElementById('binderSizeControl').addEventListener('click', e => {
    const btn = e.target.closest('[data-binder-size]');
    if (!btn) return;
    if (!VALID_BINDER_SIZES.includes(btn.dataset.binderSize)) return;
    state.binderSize = btn.dataset.binderSize;
    state.binderPage = 0;
    saveBinderSize();
    applyBinderSizeButtons();
    render();
  });

  document.getElementById('binderPrev').addEventListener('click', () => {
    if (state.binderPage > 0) {
      state.binderPage--;
      render();
    }
  });
  document.getElementById('binderNext').addEventListener('click', () => {
    state.binderPage++;
    render();
  });

  // Binder slot click → open detail drawer; chip click → set search
  const binderPagesEl = document.getElementById('binderPages');
  binderPagesEl.addEventListener('click', e => {
    const chip = e.target.closest('.deck-empty-chip');
    if (chip) {
      const pill = chip.querySelector('.loc-pill');
      if (pill) navigateToLocation(pill.dataset.locType, pill.dataset.locName);
      return;
    }
    const slot = e.target.closest('.binder-slot:not(.binder-slot-empty)');
    if (!slot) return;
    openDetail(parseInt(slot.dataset.index, 10));
  });
  binderPagesEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const slot = e.target.closest('.binder-slot:not(.binder-slot-empty)');
    if (!slot) return;
    e.preventDefault();
    openDetail(parseInt(slot.dataset.index, 10));
  });

  // Keyboard arrow nav for binder pages (only when binder mode and no input focused)
  document.addEventListener('keydown', e => {
    if (getEffectiveShape() !== 'binder') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') {
      if (state.binderPage > 0) { state.binderPage--; render(); }
    } else {
      state.binderPage++;
      render();
    }
  });

  // Reset binder page on filter/search changes
  const searchInputForBinder = document.getElementById('searchInput');
  searchInputForBinder.addEventListener('input', () => { state.binderPage = 0; });
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { state.binderPage = 0; });
  });

  loadDeckGroup();
  loadDeckPrefs();
  bindDeckWorkspaceInteractions({
    deckColumnsEl: document.getElementById('deckColumns'),
    deckGroupEl: document.getElementById('deckGroupBy'),
    stateRef: state,
    currentDeckContainerImpl: currentDeckContainer,
    currentDeckMetadataImpl: currentDeckMetadata,
    filteredSortedImpl: filteredSorted,
    getCardById: id => deckMetaAutocomplete?.getCard(id),
    navigateToLocationImpl: navigateToLocation,
    openDetailImpl: openDetail,
    renderImpl: render,
    saveImpl: save,
    deckPreviewPanel,
  });

  bindLocationHomeInteractions({
    locationsEl,
    navigateToLocationImpl: navigateToLocation,
    saveImpl: save,
    populateFiltersImpl: populateFilters,
    renderImpl: render,
  });

  bindListRowInteractions({
    listBodyEl,
    openDetailImpl: openDetail,
  });

  // Clicking a `.loc-pill` (in list, grid, or anywhere) navigates to that
  // location's view + filter. The remove `×` and the deck-empty-chip
  // wrapper handle their own clicks.
  document.addEventListener('click', e => {
    if (e.target.closest('.loc-pill-remove')) return;
    if (e.target.closest('.deck-empty-chip')) return;
    const pill = e.target.closest('.loc-pill');
    if (!pill) return;
    const type = pill.dataset.locType;
    const name = pill.dataset.locName;
    if (type && name) navigateToLocation(type, name);
  });

}
