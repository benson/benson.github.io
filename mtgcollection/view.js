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
  containerStats,
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
} from './routeState.js';
import {
  deckDetailsViewModel,
  renderDeckDetailsHeaderHtml,
  renderDeckExportPanel,
  renderDeckWorkspaceControls,
} from './views/deckHeaderView.js';
import { LOC_ICONS, locationPillHtml } from './ui/locationUi.js';
import {
  deckMatchesHomeFilters,
  deckOwnership,
  renderDecksHomeHtml,
  storageMatchesHomeFilters,
  renderStorageHomeHtml,
} from './views/locationHomeViews.js';
import {
  renderCollectionTotals,
  renderCountValueTotals,
  renderDeckTotals,
} from './views/totalsView.js';
import { renderRow } from './views/listRowView.js';
import { renderCollectionVisualGrid } from './views/collectionVisualView.js';
import {
  renderDeckNotesMode,
  renderDeckSampleHandSection,
  renderDeckStatsDashboard,
  renderDeckTextMode,
  renderDeckVisualMode,
} from './views/deckBodyView.js';
import {
  applyBinderSizeButtons,
  applyBinderPriceToggle,
  loadBinderPrices,
  loadBinderSize,
  renderBinderView,
} from './views/binderView.js';
import { initCardPreview } from './ui/cardPreview.js';
import { createDeckMetaAutocomplete } from './deckMetaAutocomplete.js';
import { buildDeckCardFromEntry } from './deckCardModel.js';
import { createDeckPreviewPanel } from './deckPreviewPanel.js';
import { createRightDrawer } from './rightDrawer.js';
import { renderDeckSampleHandPanel } from './deckSampleHand.js';
import { bindAppShellActions } from './appShellActions.js';
import { bindBinderControls } from './binderActions.js';
import { bindDeckWorkspaceInteractions } from './deckWorkspaceActions.js';
import { bindLocationHomeInteractions } from './locationHomeActions.js';
import { bindListRowInteractions } from './listRowActions.js';
import { renameContainerCommand } from './commands.js';
import { getMultiselectValue } from './multiselect.js';

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

export function containerIdentityHtml(loc) {
  const icon = LOC_ICONS[loc.type] || '';
  return `<button class="container-identity-name" type="button" data-container-rename data-loc-type="${esc(loc.type)}" data-loc-name="${esc(loc.name)}">${esc(loc.name)}</button>
    <span class="loc-pill loc-pill-${esc(loc.type)} container-identity-type">${icon}<span>${esc(loc.type)}</span></span>`;
}

function containerIdentityEditHtml(loc) {
  return `<form class="container-identity-edit" data-container-rename-form data-loc-type="${esc(loc.type)}" data-loc-name="${esc(loc.name)}">
    <input class="container-identity-input" name="containerName" type="text" value="${esc(loc.name)}" aria-label="rename ${esc(loc.type)}">
    <button class="btn container-identity-save" type="submit">save</button>
    <button class="btn btn-secondary container-identity-cancel" type="button" data-container-rename-cancel>cancel</button>
    <span class="loc-pill loc-pill-${esc(loc.type)} container-identity-type">${LOC_ICONS[loc.type] || ''}<span>${esc(loc.type)}</span></span>
  </form>`;
}

function startContainerIdentityEdit(strip, loc) {
  strip.innerHTML = containerIdentityEditHtml(loc);
  const input = strip.querySelector('.container-identity-input');
  input?.focus();
  input?.select();
}

function cancelContainerIdentityEdit(strip, loc) {
  strip.innerHTML = containerIdentityHtml(loc);
}

function saveContainerIdentityEdit(form) {
  const loc = { type: form.dataset.locType, name: form.dataset.locName };
  const input = form.querySelector('.container-identity-input');
  const nextName = (input?.value || '').trim();
  if (!nextName || nextName === loc.name) {
    cancelContainerIdentityEdit(form.parentElement, loc);
    return;
  }
  const next = { type: loc.type, name: nextName };
  const result = renameContainerCommand(loc, next);
  if (!result.ok) {
    input?.focus();
    input?.select();
    return;
  }
  setActiveContainerRoute(next);
  save();
  render();
}

function syncContainerIdentityStrip(containers = []) {
  const strip = document.getElementById('containerIdentityStrip');
  if (!strip) return;
  const loc = getActiveLocation();
  const exists = loc && containers.some(c => c.type === loc.type && c.name === loc.name);
  if (!exists || (loc.type !== 'binder' && loc.type !== 'box')) {
    strip.classList.add('hidden');
    strip.innerHTML = '';
    return;
  }
  strip.innerHTML = containerIdentityHtml(loc);
  strip.classList.remove('hidden');
}

let locationsEl, listBodyEl, collectionSection, emptyState;
let collectionDisplayControlsEl = null;
let collectionVisualEl = null;
let deckMetaAutocomplete = null;
let deckPreviewPanel = null;
let rightDrawer = null;

const SIDEBAR_CONFIG = {
  decks: {
    searchPlaceholder: 'search decks',
    searchHelp: false,
    collectionFilterIds: [],
    deckFormatFilter: true,
    storageTypeFilter: false,
    historyLabel: 'deck history',
  },
  storage: {
    searchPlaceholder: 'search storage',
    searchHelp: false,
    collectionFilterIds: [],
    deckFormatFilter: false,
    storageTypeFilter: true,
    historyLabel: 'storage history',
  },
  default: {
    searchPlaceholder: 'search collection',
    searchHelp: true,
    collectionFilterIds: ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag', 'formatSelect'],
    deckFormatFilter: false,
    storageTypeFilter: false,
    historyLabel: 'collection history',
  },
};

function syncSidebarChrome(shape) {
  const config = shape === 'decks-home'
    ? SIDEBAR_CONFIG.decks
    : shape === 'storage-home' ? SIDEBAR_CONFIG.storage : SIDEBAR_CONFIG.default;
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.placeholder = config.searchPlaceholder;
  const searchHelpBtn = document.getElementById('searchHelpBtn');
  const searchHelpPopover = document.getElementById('searchHelpPopover');
  searchHelpBtn?.classList.toggle('hidden', !config.searchHelp);
  if (!config.searchHelp) searchHelpPopover?.classList.remove('visible');
  ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag', 'formatSelect'].forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', !config.collectionFilterIds.includes(id));
  });
  document.getElementById('filterDeckFormat')?.classList.toggle('hidden', !config.deckFormatFilter);
  document.getElementById('filterStorageType')?.classList.toggle('hidden', !config.storageTypeFilter);
  const summary = document.querySelector('#historyDetails > summary');
  if (summary) summary.textContent = config.historyLabel;
}

function setTotalsStrip(html) {
  const strip = document.getElementById('appTotalsStrip');
  if (strip) strip.innerHTML = html || '';
}

function deckHomeFilters() {
  return {
    query: document.getElementById('searchInput')?.value || '',
    formats: getMultiselectValue(document.getElementById('filterDeckFormat')),
  };
}

function hasDeckHomeFilter(filters) {
  return Boolean(String(filters.query || '').trim() || (filters.formats || []).length);
}

function storageHomeFilters() {
  return {
    query: document.getElementById('searchInput')?.value || '',
    types: getMultiselectValue(document.getElementById('filterStorageType')),
  };
}

function hasStorageHomeFilter(filters) {
  return Boolean(String(filters.query || '').trim() || (filters.types || []).length);
}

function deckValue(decks) {
  return decks.reduce((sum, deck) => sum + deckOwnership(deck).value, 0);
}

function containerValue(containers) {
  return containers.reduce((sum, container) => sum + containerStats(container).value, 0);
}

function setCollectionTotals(list) {
  setTotalsStrip(renderCollectionTotals(list, state.collection, { filteredActive: hasActiveFilter() }));
}

function setDecksHomeTotals(containers, filters) {
  const decks = containers.filter(c => c.type === 'deck');
  const filteredDecks = decks.filter(c => deckMatchesHomeFilters(c, filters));
  const filteredActive = hasDeckHomeFilter(filters);
  setTotalsStrip(renderCountValueTotals({
    label: 'decks',
    count: filteredDecks.length,
    totalCount: decks.length,
    value: deckValue(filteredDecks),
    totalValue: deckValue(decks),
    filteredActive,
  }));
}

function setStorageHomeTotals(containers, filters) {
  const storage = containers.filter(c => c.type === 'binder' || c.type === 'box');
  const filteredStorage = storage.filter(c => storageMatchesHomeFilters(c, filters));
  const filteredActive = hasStorageHomeFilter(filters);
  setTotalsStrip(renderCountValueTotals({
    label: 'containers',
    count: filteredStorage.length,
    totalCount: storage.length,
    value: containerValue(filteredStorage),
    totalValue: containerValue(storage),
    filteredActive,
  }));
}

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
  // Right drawer is only meaningful for card-browsing shapes.
  if (shape !== 'collection' && shape !== 'box' && shape !== 'deck' && shape !== 'binder') closeRightDrawer();
  syncSidebarChrome(shape);
  syncClearFiltersBtn();
  syncViewAsListToggles();
  setHistoryScope(shape === 'deck'
    ? currentDeckScope()
    : shape === 'decks-home' ? { kind: 'decks' }
      : shape === 'storage-home' ? { kind: 'storage' }
        : (shape === 'binder' || shape === 'box') ? getActiveLocation() : null);
  const containers = allContainers();
  // Decks-home and storage-home render even on an empty collection so the
  // user can create a container before adding cards.
  const isHomeShape = shape === 'decks-home' || shape === 'storage-home';
  if (state.collection.length === 0 && containers.length === 0 && !isHomeShape) {
    collectionSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    document.getElementById('binderSizeControl').classList.add('hidden');
    syncContainerIdentityStrip([]);
    setTotalsStrip(renderCollectionTotals([], []));
    return;
  }
  emptyState.classList.add('hidden');
  collectionSection.classList.remove('hidden');

  const list = filteredSorted();
  syncContainerIdentityStrip(containers);

  applyBinderSizeButtons();
  applyBinderPriceToggle();

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
    const filters = deckHomeFilters();
    locationsEl.innerHTML = renderDecksHomeHtml(containers, filters);
    setDecksHomeTotals(containers, filters);
  } else if (shape === 'storage-home') {
    locationsContainer.classList.add('active');
    const filters = storageHomeFilters();
    locationsEl.innerHTML = renderStorageHomeHtml(containers, filters);
    setStorageHomeTotals(containers, filters);
  } else if (shape === 'deck') {
    deckContainer.classList.add('active');
    renderDeckView(list);
  } else if (shape === 'binder') {
    binderContainer.classList.add('active');
    binderSizeCtl.classList.remove('hidden');
    renderBinderView(list, { hasActiveFilter, renderEmptyScopeState });
    setCollectionTotals(list);
  } else {
    // 'collection' or 'box' — both render as flat list. 'box' is just a
    // collection view filtered to a single box container.
    listContainer.classList.add('active');
    const mode = state.collectionDisplayMode === 'visual' ? 'visual' : 'table';
    syncCollectionDisplayChrome(listContainer, mode);
    if (mode === 'visual') {
      listBodyEl.innerHTML = '';
      collectionVisualEl.innerHTML = renderCollectionVisualGrid(list, state.collection);
    } else {
      listBodyEl.innerHTML = list.map(c => renderRow(c)).join('');
      if (collectionVisualEl) collectionVisualEl.innerHTML = '';
      syncSortIndicator();
    }
    setCollectionTotals(list);
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
    const effectiveField = state.sortField || 'name';
    const isActive = field === effectiveField;
    th.classList.toggle('sort-active', isActive);
    const arrowEl = th.querySelector('.sort-arrow');
    if (arrowEl) arrowEl.textContent = isActive && state.sortDir === 'desc' ? '↓' : '↑';
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

function ensureCollectionDisplayChrome(listContainer) {
  if (!listContainer) return;
  if (!collectionDisplayControlsEl) {
    collectionDisplayControlsEl = document.getElementById('collectionDisplayControls');
  }
  if (!collectionDisplayControlsEl) {
    collectionDisplayControlsEl = document.createElement('div');
    collectionDisplayControlsEl.className = 'collection-display-controls segmented';
    collectionDisplayControlsEl.id = 'collectionDisplayControls';
    collectionDisplayControlsEl.setAttribute('aria-label', 'collection display');
    collectionDisplayControlsEl.innerHTML = `
      <button class="segment-btn" type="button" data-collection-display-mode="table">table</button>
      <button class="segment-btn" type="button" data-collection-display-mode="visual">visual</button>
    `;
    const bulkBar = listContainer.querySelector('#bulkBar');
    bulkBar?.insertAdjacentElement('afterend', collectionDisplayControlsEl);
  }
  if (!collectionVisualEl) {
    collectionVisualEl = document.createElement('div');
    collectionVisualEl.className = 'collection-visual-view';
    collectionVisualEl.id = 'collectionVisualView';
    listContainer.appendChild(collectionVisualEl);
  }
}

function syncCollectionDisplayChrome(listContainer, mode) {
  ensureCollectionDisplayChrome(listContainer);
  collectionDisplayControlsEl?.querySelectorAll('[data-collection-display-mode]').forEach(btn => {
    const active = btn.dataset.collectionDisplayMode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  listContainer?.classList.toggle('collection-display-table', mode === 'table');
  listContainer?.classList.toggle('collection-display-visual', mode === 'visual');
  const table = listContainer?.querySelector('table');
  if (table) table.hidden = mode !== 'table';
  if (collectionVisualEl) collectionVisualEl.hidden = mode !== 'visual';
}

function applyDeckIdentityEntries(model, deckCards = []) {
  const apply = (prefix) => {
    const id = model[prefix + 'ScryfallId'];
    if (!id) return;
    const entry = deckCards.find(c => c.scryfallId === id && c.inventoryIndex >= 0);
    if (!entry) return;
    model[prefix] = entry.resolvedName || entry.name || model[prefix];
    model[prefix + 'ImageUrl'] = entry.imageUrl || model[prefix + 'ImageUrl'];
    model[prefix + 'BackImageUrl'] = entry.backImageUrl || model[prefix + 'BackImageUrl'];
    model[prefix + 'Finish'] = entry.finish || 'normal';
  };
  apply('commander');
  apply('partner');
  return model;
}

function deckCoverChoices(deckCards = []) {
  const seen = new Set();
  const choices = [];
  for (const card of deckCards) {
    const scryfallId = String(card?.scryfallId || '').trim();
    const imageUrl = String(card?.imageUrl || '').trim();
    if (!scryfallId || !imageUrl || seen.has(scryfallId)) continue;
    seen.add(scryfallId);
    choices.push({
      scryfallId,
      name: card.resolvedName || card.name || scryfallId,
      imageUrl,
      backImageUrl: card.backImageUrl || '',
      finish: card.finish || 'normal',
    });
  }
  return choices;
}

function applyDeckCoverEntry(model, deckCards = []) {
  if (!model.coverScryfallId) return model;
  const entry = deckCards.find(c => c.scryfallId === model.coverScryfallId && c.imageUrl);
  if (!entry) return model;
  model.coverName = entry.resolvedName || entry.name || model.coverName;
  model.coverImageUrl = entry.imageUrl || model.coverImageUrl;
  model.coverBackImageUrl = entry.backImageUrl || model.coverBackImageUrl;
  model.coverFinish = entry.finish || 'normal';
  return model;
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
    setTotalsStrip(renderDeckTotals({ main: 0, sideboard: 0, maybe: 0, value: 0 }));
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
  setTotalsStrip(renderDeckTotals(stats));
  const statHtml = renderDeckStatsHtml(boards.main);
  const format = meta.format || state.selectedFormat || 'unspecified format';
  const headerModel = applyDeckCoverEntry(
    applyDeckIdentityEntries(
      deckDetailsViewModel(deck, { ...meta, coverChoices: deckCoverChoices(list) }, stats, state.selectedFormat),
      list
    ),
    list
  );
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
  // Default preview: commander art if the deck has one; non-commander decks
  // can pin a cover card; otherwise use the first card in the visual grid.
  const commanderPreview = headerModel.commanderImageUrl
    ? {
        name: headerModel.commander || '',
        resolvedName: headerModel.commander || '',
        imageUrl: headerModel.commanderImageUrl,
        backImageUrl: headerModel.commanderBackImageUrl || '',
        qty: 1,
        finish: headerModel.commanderFinish || 'normal',
        price: 0,
      }
    : null;
  const coverPreview = !commanderPreview && headerModel.coverImageUrl
    ? {
        name: headerModel.coverName || '',
        resolvedName: headerModel.coverName || '',
        imageUrl: headerModel.coverImageUrl,
        backImageUrl: headerModel.coverBackImageUrl || '',
        qty: 1,
        finish: headerModel.coverFinish || 'normal',
        price: 0,
      }
    : null;
  deckPreviewPanel?.setCard(commanderPreview || coverPreview || firstCardForPanel(cols) || list[0] || null);
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
  const identityStrip = document.getElementById('containerIdentityStrip');
  identityStrip?.addEventListener('click', event => {
    const button = event.target.closest('[data-container-rename]');
    const cancel = event.target.closest('[data-container-rename-cancel]');
    if (cancel) {
      const form = cancel.closest('[data-container-rename-form]');
      if (!form) return;
      cancelContainerIdentityEdit(identityStrip, { type: form.dataset.locType, name: form.dataset.locName });
      return;
    }
    if (!button) return;
    const loc = { type: button.dataset.locType, name: button.dataset.locName };
    startContainerIdentityEdit(identityStrip, loc);
  });
  identityStrip?.addEventListener('submit', event => {
    const form = event.target.closest('[data-container-rename-form]');
    if (!form) return;
    event.preventDefault();
    saveContainerIdentityEdit(form);
  });
  identityStrip?.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const form = event.target.closest('[data-container-rename-form]');
    if (!form) return;
    event.preventDefault();
    cancelContainerIdentityEdit(identityStrip, { type: form.dataset.locType, name: form.dataset.locName });
  });

  document.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-collection-display-mode]');
    if (!modeButton) return;
    state.collectionDisplayMode = modeButton.dataset.collectionDisplayMode === 'visual' ? 'visual' : 'table';
    save();
    render();
  });

  collectionSection?.addEventListener('click', event => {
    const visualTrigger = event.target.closest('[data-collection-visual-detail], [data-collection-visual-card]');
    if (!visualTrigger || !collectionSection.contains(visualTrigger)) return;
    if (event.target.closest('[data-collection-display-mode]')) return;
    if (event.target.closest('.loc-pill')) return;
    openDetail(parseInt(visualTrigger.dataset.index, 10));
  });

  bindAppShellActions({
    stateRef: state,
    getEffectiveShapeImpl: getEffectiveShape,
    currentDeckScopeImpl: currentDeckScope,
    openRightDrawerImpl: openRightDrawer,
    closeRightDrawerImpl: closeRightDrawer,
    isRightDrawerOpenImpl: isRightDrawerOpen,
    navigateToLocationImpl: navigateToLocation,
    saveImpl: save,
    renderImpl: render,
  });

  loadBinderSize();
  loadBinderPrices();
  applyBinderSizeButtons();
  applyBinderPriceToggle();
  bindBinderControls({
    stateRef: state,
    getEffectiveShapeImpl: getEffectiveShape,
    navigateToLocationImpl: navigateToLocation,
    openDetailImpl: openDetail,
    renderImpl: render,
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
    listBodyEl: collectionSection,
    openDetailImpl: openDetail,
  });

}
