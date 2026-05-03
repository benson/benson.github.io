import { state } from './state.js';
import { esc, showFeedback } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  normalizeTag,
  allCollectionLocations,
  allContainers,
  containerStats,
  ensureContainer,
  formatLocationLabel,
  LOCATION_TYPES,
  DEFAULT_LOCATION_TYPE,
  normalizeDeckBoard,
  defaultDeckMetadata,
  getCardImageUrl,
  getCardBackImageUrl,
  makeEntry,
  getUsdPrice,
  addToDeckList,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { save } from './persistence.js';
import { openDetail, populateFilters } from './detail.js';
import { setSelectedLocation } from './add.js';
import { filteredSorted, syncClearFiltersBtn, hasActiveFilter } from './search.js';
import { groupDeck, firstCardForPanel, splitDeckBoards, deckStats, renderDeckStatsHtml } from './stats.js';
import { updateBulkBar } from './bulk.js';
import { recordEvent, captureBefore, locationDiffSummary, setHistoryScope } from './changelog.js';
import { buildDeckExport } from './deckExport.js';
import {
  deckExportOptionsFromForm,
  loadDeckGroup,
  loadDeckPrefs,
  saveDeckGroup,
  saveDeckPrefs,
} from './deckPreferences.js';
import { openShareModal } from './share.js';
import {
  getActiveLocation,
  getActiveLocationOfType,
  getEffectiveShape as getRouteEffectiveShape,
  setActiveContainerRoute,
  setTopLevelViewMode,
  VALID_VIEW_MODES,
} from './routeState.js';
import {
  VALID_DECK_BOARD_FILTERS,
  VALID_DECK_CARD_SIZES,
  VALID_DECK_GROUPS,
  VALID_DECK_MODES,
  VALID_DECK_OWNERSHIP_VIEWS,
} from './deckUi.js';
import {
  deckDetailsViewModel,
  renderDeckDetailsHeaderHtml,
  renderDeckExportPanel,
  renderDeckWorkspaceControls,
} from './views/deckHeaderView.js';
import {
  deleteContainerAndUnlocateCardsCommand,
  deleteEmptyContainerCommand,
  moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommand,
  renameContainerCommand,
} from './commands.js';
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
import { buildDeckSampleHand, renderDeckSampleHandPanel } from './deckSampleHand.js';
import {
  closeDeckCardMenus,
  moveFocusInDeckCardMenu,
  openDeckCardMenu,
  toggleDeckCardMenu,
} from './deckCardMenu.js';

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

function commitRowLocationFromPicker(input) {
  const index = parseInt(input.dataset.index, 10);
  const c = state.collection[index];
  if (!c) return;
  const row = input.closest('tr');
  const typeSel = row && row.querySelector('.loc-picker-type');
  const type = typeSel ? typeSel.value : DEFAULT_LOCATION_TYPE;
  const name = input.value;
  const newLoc = normalizeLocation({ type, name });
  if (!newLoc) { input.value = ''; return; }
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.location = newLoc;
  const cardName = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: locationDiffSummary(null, newLoc),
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name: cardName, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function clearRowLocation(index) {
  const c = state.collection[index];
  if (!c || !c.location) return;
  const beforeLoc = c.location;
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.location = null;
  const cardName = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: locationDiffSummary(beforeLoc, null),
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name: cardName, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function commitRowTag(input) {
  const index = parseInt(input.dataset.index, 10);
  const c = state.collection[index];
  if (!c) return;
  const tag = normalizeTag(input.value);
  if (!tag) { input.value = ''; return; }
  if (!Array.isArray(c.tags)) c.tags = [];
  if (c.tags.includes(tag)) {
    showFeedback('already tagged ' + tag, 'info');
    input.value = '';
    return;
  }
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.tags.push(tag);
  const name = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: 'Tagged {card} +' + tag,
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
}

function removeRowTag(index, tag) {
  const c = state.collection[index];
  if (!c || !Array.isArray(c.tags) || !c.tags.includes(tag)) return;
  const beforeKey = collectionKey(c);
  const beforeSnap = captureBefore([beforeKey]);
  c.tags = c.tags.filter(t => t !== tag);
  const name = c.resolvedName || c.name || 'card';
  recordEvent({
    type: 'edit',
    summary: 'Tagged {card} -' + tag,
    before: beforeSnap,
    affectedKeys: [beforeKey],
    cards: [{ name, imageUrl: c.imageUrl || '', backImageUrl: c.backImageUrl || '' }],
  });
  commitCollectionChange({ coalesce: true });
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

// Move a decklist entry between boards (main/sideboard/maybe). Only mutates
// the deck container's decklist — physical inventory locations are untouched.
function moveDeckCardToBoard(scryfallId, fromBoard, rawBoard) {
  const deck = currentDeckContainer();
  moveDeckCardToBoardCommand(deck, scryfallId, fromBoard, rawBoard);
}

// Remove a decklist entry from the deck. Inventory is left alone — physical
// cards keep their location.
function removeDeckCardFromDeck(scryfallId, board) {
  const deck = currentDeckContainer();
  removeDeckCardFromDeckCommand(deck, scryfallId, board);
}

function handleDeckCardAction(actionEl) {
  const action = actionEl?.dataset.cardAction;
  closeDeckCardMenus(document.getElementById('deckColumns') || document);
  if (action === 'open') {
    const idx = parseInt(actionEl.dataset.inventoryIndex || '-1', 10);
    if (idx >= 0) openDetail(idx);
    return;
  }
  const sid = actionEl?.dataset.scryfallId;
  const board = actionEl?.dataset.board;
  if (!sid || !board) return;
  if (action === 'move-board') {
    moveDeckCardToBoard(sid, board, actionEl.dataset.boardTarget);
  } else if (action === 'remove-from-deck') {
    removeDeckCardFromDeck(sid, board);
  }
}

function renderSampleHandPanel() {
  renderDeckSampleHandPanel({
    handEl: document.getElementById('deckHandCards'),
    deck: currentDeckContainer(),
    sampleHand: state.deckSampleHand,
  });
}

// If the picked commander/partner isn't already in this deck's decklist, add
// it (board: main, qty: 1). This is purely a decklist mutation — physical
// inventory is untouched.
function ensureCommanderEntryInDeck(scryfallId, deck) {
  if (!scryfallId || !deck || deck.type !== 'deck') return null;
  if (!Array.isArray(deck.deckList)) deck.deckList = [];
  const already = deck.deckList.some(e => e.scryfallId === scryfallId);
  if (already) return null;
  const card = deckMetaAutocomplete?.getCard(scryfallId);
  if (!card) return null;
  addToDeckList(deck, {
    scryfallId: card.id,
    qty: 1,
    board: 'main',
    name: card.name,
    setCode: card.set,
    cn: card.collector_number,
    imageUrl: getCardImageUrl(card),
    backImageUrl: getCardBackImageUrl(card),
  });
  recordEvent({
    type: 'add',
    summary: 'Added {card} as commander to {loc:' + deck.type + ':' + deck.name + '}',
    cards: [{ name: card.name, imageUrl: getCardImageUrl(card), backImageUrl: getCardBackImageUrl(card) || '' }],
    scope: 'deck',
    deckLocation: deck.type + ':' + deck.name,
  });
  return scryfallId;
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

function buildDecklistText(list) {
  return buildDeckExport(list, currentDeckMetadata(), { preset: 'moxfield' }).body;
}

function downloadDeckExport(result) {
  const blob = new Blob([result.body], { type: result.mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename || 'deck.txt';
  a.click();
  URL.revokeObjectURL(url);
}

async function handleDeckExportAction(action) {
  const form = document.getElementById('deckExportForm');
  if (!form) return;
  const result = buildDeckExport(filteredSorted(), currentDeckMetadata(), deckExportOptionsFromForm(form));
  if (action === 'download') {
    downloadDeckExport(result);
    showFeedback('deck export downloaded', 'success');
  } else {
    try {
      await navigator.clipboard.writeText(result.body);
      showFeedback('deck export copied', 'success');
    } catch (err) {
      showFeedback('clipboard unavailable: ' + err.message, 'error');
    }
  }
  if (result.warnings?.length) showFeedback(result.warnings.join(' '), 'info');
}

function setDeckPanelOpen(panelId, triggerSelector, open) {
  const root = document.getElementById('deckColumns');
  const panel = root?.querySelector('#' + panelId);
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  const trigger = root.querySelector(triggerSelector);
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const first = panel.querySelector('textarea, input, select, button');
    if (first) first.focus();
  }
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
  const deckGroupEl = document.getElementById('deckGroupBy');
  if (deckGroupEl) {
    deckGroupEl.value = state.deckGroupBy;
    deckGroupEl.addEventListener('change', () => {
      const v = deckGroupEl.value;
      if (!VALID_DECK_GROUPS.includes(v)) return;
      state.deckGroupBy = v;
      saveDeckGroup();
      render();
    });
  }

  document.getElementById('deckColumns').addEventListener('click', e => {
    const chip = e.target.closest('.deck-empty-chip');
    if (chip) {
      const pill = chip.querySelector('.loc-pill');
      if (pill) navigateToLocation(pill.dataset.locType, pill.dataset.locName);
      return;
    }
    const modeBtn = e.target.closest('[data-deck-mode]');
    if (modeBtn) {
      const mode = modeBtn.dataset.deckMode;
      if (!VALID_DECK_MODES.includes(mode)) return;
      state.deckMode = mode;
      saveDeckPrefs();
      render();
      return;
    }
    const boardFilterBtn = e.target.closest('[data-deck-board-filter]');
    if (boardFilterBtn) {
      const filter = boardFilterBtn.dataset.deckBoardFilter;
      if (!VALID_DECK_BOARD_FILTERS.includes(filter)) return;
      state.deckBoardFilter = filter;
      saveDeckPrefs();
      render();
      return;
    }
    const sizeBtn = e.target.closest('[data-deck-card-size]');
    if (sizeBtn) {
      const size = sizeBtn.dataset.deckCardSize;
      if (!VALID_DECK_CARD_SIZES.includes(size)) return;
      state.deckCardSize = size;
      saveDeckPrefs();
      render();
      return;
    }
    const ownershipBtn = e.target.closest('[data-deck-ownership]');
    if (ownershipBtn) {
      const v = ownershipBtn.dataset.deckOwnership;
      if (!VALID_DECK_OWNERSHIP_VIEWS.includes(v)) return;
      state.deckOwnershipView = v;
      saveDeckPrefs();
      render();
      return;
    }
    if (e.target.closest('[data-add-companion]')) {
      const wrap = e.target.closest('.deck-metadata-companion');
      const input = wrap?.querySelector('input[name="companion"]');
      const btn = wrap?.querySelector('[data-add-companion]');
      if (input) { input.hidden = false; input.focus(); }
      if (btn) btn.remove();
      return;
    }
    if (e.target.closest('[data-deck-action="share"]')) {
      const deck = currentDeckContainer();
      if (deck) openShareModal(deck);
      return;
    }
    const exportToggle = e.target.closest('[data-toggle-deck-export]');
    if (exportToggle) {
      e.stopPropagation();
      const panel = document.getElementById('deckExportPanel');
      setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', panel?.classList.contains('hidden'));
      return;
    }
    if (e.target.closest('[data-close-deck-export]')) {
      setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', false);
      return;
    }
    const menuToggle = e.target.closest('[data-card-menu-toggle]');
    if (menuToggle) {
      e.preventDefault();
      e.stopPropagation();
      toggleDeckCardMenu(menuToggle);
      return;
    }
    const cardAction = e.target.closest('[data-card-action]');
    if (cardAction) {
      e.preventDefault();
      e.stopPropagation();
      handleDeckCardAction(cardAction);
      return;
    }
    // (Sample-hand cards are now rendered as .deck-card articles, so they
    // route through the data-card-action handler above — no special case.)
    const textNameBtn = e.target.closest('.deck-text-table .card-name-button');
    if (textNameBtn) {
      openDetail(parseInt(textNameBtn.dataset.index, 10));
      return;
    }
    if (!e.target.closest('input, select, button, a')) {
      const textRow = e.target.closest('.deck-text-table tr.detail-trigger');
      if (textRow) {
        openDetail(parseInt(textRow.dataset.index, 10));
        return;
      }
    }
    if (!e.target.closest('.deck-card')) closeDeckCardMenus(document.getElementById('deckColumns'));
  });

  document.getElementById('deckColumns').addEventListener('change', e => {
    const groupSelect = e.target.closest('[data-deck-group]');
    if (groupSelect) {
      const v = groupSelect.value;
      if (!VALID_DECK_GROUPS.includes(v)) return;
      state.deckGroupBy = v;
      saveDeckGroup();
      render();
      return;
    }
    const formatPreset = e.target.closest('[data-deck-format-preset]');
    if (formatPreset) {
      const form = formatPreset.closest('#deckMetadataForm');
      const customInput = form?.querySelector('[data-deck-format-custom]');
      if (customInput) {
        const showCustom = formatPreset.value === 'custom';
        customInput.hidden = !showCustom;
        if (showCustom) customInput.focus();
      }
      const effective = formatPreset.value === 'custom' ? (customInput?.value || '') : formatPreset.value;
      if (form) form.dataset.format = effective;
      return;
    }
    const priceToggle = e.target.closest('[data-deck-show-prices]');
    if (priceToggle) {
      state.deckShowPrices = !!priceToggle.checked;
      saveDeckPrefs();
      render();
    }
  });

  document.getElementById('deckColumns').addEventListener('click', e => {
    const root = document.getElementById('deckColumns');
    const editBtn = e.target.closest('[data-edit-deck-details]');
    if (editBtn) {
      const editor = root.querySelector('#deckDetailsEditor');
      if (!editor) return;
      editor.classList.remove('hidden');
      editBtn.setAttribute('aria-expanded', 'true');
      const firstInput = editor.querySelector('input[name="title"]');
      if (firstInput) firstInput.focus();
      return;
    }
    const cancelBtn = e.target.closest('[data-cancel-deck-details]');
    if (!cancelBtn) return;
    const editor = root.querySelector('#deckDetailsEditor');
    if (editor) editor.classList.add('hidden');
    const toggle = root.querySelector('[data-edit-deck-details]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('deckColumns').addEventListener('submit', e => {
    if (e.target.id !== 'deckMetadataForm') return;
    e.preventDefault();
    const deck = currentDeckContainer();
    if (!deck) return;
    const fd = new FormData(e.target);
    const preset = String(fd.get('formatPreset') || '').trim();
    const custom = String(fd.get('formatCustom') || '').trim();
    const format = preset === 'custom' ? custom : preset;
    const isCommander = format === 'commander';
    const cmdInput = e.target.querySelector('input[data-meta-ac="commander"]');
    const partnerInput = e.target.querySelector('input[data-meta-ac="partner"]');
    const cmdScryfallId = String(cmdInput?.dataset.metaAcScryfallId || '');
    const partnerScryfallId = String(partnerInput?.dataset.metaAcScryfallId || '');
    deck.deck = {
      ...defaultDeckMetadata(deck.name),
      title: String(fd.get('title') || '').trim() || deck.name,
      format,
      commander: isCommander ? String(fd.get('commander') || '').trim() : '',
      commanderScryfallId: isCommander ? cmdScryfallId : '',
      commanderImageUrl: isCommander ? String(cmdInput?.dataset.metaAcImage || '') : '',
      commanderBackImageUrl: isCommander ? String(cmdInput?.dataset.metaAcBackImage || '') : '',
      partner: isCommander ? String(fd.get('partner') || '').trim() : '',
      partnerScryfallId: isCommander ? partnerScryfallId : '',
      partnerImageUrl: isCommander ? String(partnerInput?.dataset.metaAcImage || '') : '',
      partnerBackImageUrl: isCommander ? String(partnerInput?.dataset.metaAcBackImage || '') : '',
      companion: String(fd.get('companion') || '').trim(),
      description: String(fd.get('description') || '').trim(),
    };
    deck.updatedAt = Date.now();
    // Lenient mode: if the picked commander/partner isn't already a card
    // in this deck, auto-add it as a placeholder. Only fires when the user
    // has explicitly picked from autocomplete (scryfallId set).
    let added = 0;
    if (isCommander) {
      if (cmdScryfallId && ensureCommanderEntryInDeck(cmdScryfallId, deck)) added++;
      if (partnerScryfallId && ensureCommanderEntryInDeck(partnerScryfallId, deck)) added++;
    }
    save();
    render();
    if (added > 0) showFeedback('added ' + added + ' commander card' + (added === 1 ? '' : 's') + ' to deck', 'success');
  });

  document.getElementById('deckColumns').addEventListener('click', e => {
    const sampleBtn = e.target.closest('[data-sample-hand]');
    if (!sampleBtn) return;
    // Source from the resolved decklist, not inventory. After the
    // deck/decklist split, filteredSorted() only sees inventory rows
    // physically located in the deck — nearly always empty for decklist-
    // first decks and useless for sample hands.
    const deck = currentDeckContainer();
    const size = sampleBtn.dataset.sampleHand === 'mulligan' ? 6 : 7;
    state.deckSampleHand = buildDeckSampleHand({ deck, collection: state.collection, handSize: size });
    state.deckMode = 'hands';
    saveDeckPrefs();
    render();
  });

  document.getElementById('deckColumns').addEventListener('click', async e => {
    const exportAction = e.target.closest('[data-export-action]');
    if (exportAction) {
      await handleDeckExportAction(exportAction.dataset.exportAction);
      return;
    }
    const copyBtn = e.target.closest('[data-copy-decklist]');
    if (!copyBtn) return;
    const text = buildDecklistText(filteredSorted());
    try {
      await navigator.clipboard.writeText(text);
      showFeedback('decklist copied', 'success');
    } catch (err) {
      showFeedback('clipboard unavailable: ' + err.message, 'error');
    }
  });

  document.getElementById('deckColumns').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDeckCardMenus(document.getElementById('deckColumns'));
      return;
    }
    const toggle = e.target.closest('[data-card-menu-toggle]');
    if (toggle && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDeckCardMenu(toggle, { focusFirst: true });
      return;
    }
    const menu = e.target.closest('.deck-card-menu');
    if (!menu) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocusInDeckCardMenu(menu, e.target, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
      const target = e.key === 'Home' ? items[0] : items[items.length - 1];
      if (target) target.focus();
    }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('.deck-card')) return;
    closeDeckCardMenus(document.getElementById('deckColumns'));
  });

  // hover/focus → update sticky preview panel
  document.getElementById('deckColumns').addEventListener('mouseover', e => {
    deckPreviewPanel?.showFromTarget(e.target);
  });
  document.getElementById('deckColumns').addEventListener('focusin', e => {
    deckPreviewPanel?.showFromTarget(e.target);
  });

  locationsEl.addEventListener('change', e => {
    if (e.target.name !== 'locationsCreateType') return;
    const labels = locationsEl.querySelectorAll('.locations-create-type');
    labels.forEach(l => {
      const input = l.querySelector('input');
      l.classList.toggle('is-selected', !!(input && input.checked));
    });
  });

  locationsEl.addEventListener('submit', e => {
    if (e.target.id !== 'locationsCreateForm') return;
    e.preventDefault();
    // Decks form uses a hidden input for type; storage form uses a radio group.
    // Try both — the radio :checked match wins when present, otherwise fall
    // back to the hidden input's value (or 'box' as a last resort).
    const checked = document.querySelector('input[name="locationsCreateType"]:checked');
    const hidden = document.querySelector('input[type="hidden"][name="locationsCreateType"]');
    const type = checked ? checked.value : (hidden ? hidden.value : 'box');
    const nameInput = document.getElementById('locationsCreateName');
    const created = ensureContainer({ type, name: nameInput.value });
    if (!created) return;
    nameInput.value = '';
    save();
    populateFilters();
    render();
  });

  // Type-radio click delegation inside edit rows: toggle is-selected on the active label.
  locationsEl.addEventListener('change', e => {
    if (!e.target || e.target.type !== 'radio') return;
    if (!e.target.name || !e.target.name.startsWith('editLocType_')) return;
    const card = e.target.closest('.location-card');
    if (!card) return;
    card.querySelectorAll('.location-card-edit-row .loc-type-radio').forEach(l => {
      const r = l.querySelector('input');
      l.classList.toggle('is-selected', !!(r && r.checked));
    });
  });

  // Close any open card menu when clicking outside.
  document.addEventListener('click', e => {
    if (!e.target.closest('.location-card-menu-btn') && !e.target.closest('.location-card-menu')) {
      locationsEl.querySelectorAll('.location-card.menu-open').forEach(c => c.classList.remove('menu-open'));
    }
  });

  locationsEl.addEventListener('click', e => {
    const card = e.target.closest('.location-card');
    if (!card) return;
    const loc = { type: card.dataset.locType, name: card.dataset.locName };

    if (e.target.closest('.location-card-menu-btn')) {
      e.stopPropagation();
      const wasOpen = card.classList.contains('menu-open');
      locationsEl.querySelectorAll('.location-card.menu-open').forEach(c => c.classList.remove('menu-open'));
      if (!wasOpen) card.classList.add('menu-open');
      return;
    }
    if (e.target.closest('.location-card-edit-btn')) {
      e.stopPropagation();
      card.classList.add('editing');
      card.classList.remove('menu-open');
      const input = card.querySelector('.location-rename-input');
      if (input) { input.focus(); input.select(); }
      return;
    }
    if (e.target.closest('.location-rename-cancel')) {
      card.classList.remove('editing');
      return;
    }
    if (e.target.closest('.location-rename-save')) {
      const input = card.querySelector('.location-rename-input');
      const checked = card.querySelector('.location-card-edit-row input[type="radio"]:checked');
      const newType = checked ? checked.value : loc.type;
      const newName = input ? input.value : loc.name;
      renameContainerCommand(loc, { type: newType, name: newName });
      return;
    }
    if (e.target.closest('.location-delete')) {
      const stats = containerStats(loc);
      if (stats.total > 0) {
        const msg = 'delete ' + loc.type + ' "' + loc.name + '"?\n\nthis will clear the location from '
          + stats.total + ' card' + (stats.total === 1 ? '' : 's')
          + ' (' + stats.unique + ' unique). the cards stay in your collection.';
        if (!confirm(msg)) return;
        deleteContainerAndUnlocateCardsCommand(loc);
      } else {
        if (!confirm('delete ' + loc.type + ' "' + loc.name + '"?')) return;
        deleteEmptyContainerCommand(loc);
      }
      return;
    }
    // Click on body / name / stats (not on a control) → open the container.
    // Don't open while editing or while the menu is open.
    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    if (e.target.closest('.location-card-edit-row')) return;
    navigateToLocation(loc.type, loc.name);
  });

  // Keyboard activation: Enter/Space on a focused card opens it (matches the
  // role="button" we set on .location-card).
  locationsEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.location-card');
    if (!card || e.target !== card) return;
    if (card.classList.contains('editing') || card.classList.contains('menu-open')) return;
    e.preventDefault();
    navigateToLocation(card.dataset.locType, card.dataset.locName);
  });

  listBodyEl.addEventListener('click', e => {
    const removeTagBtn = e.target.closest('.row-tag-remove');
    if (removeTagBtn) {
      e.preventDefault();
      removeRowTag(parseInt(removeTagBtn.dataset.index, 10), removeTagBtn.dataset.tag);
      return;
    }
    const removeLocBtn = e.target.closest('.loc-pill-remove');
    if (removeLocBtn) {
      e.preventDefault();
      clearRowLocation(parseInt(removeLocBtn.dataset.index, 10));
      return;
    }
    const nameBtn = e.target.closest('.card-name-button');
    if (nameBtn) {
      openDetail(parseInt(nameBtn.dataset.index, 10));
      return;
    }
    if (e.target.closest('input, select, button, a, .loc-pill')) return;
    const trigger = e.target.closest('.detail-trigger');
    if (!trigger || !listBodyEl.contains(trigger)) return;
    openDetail(parseInt(trigger.dataset.index, 10));
  });

  listBodyEl.addEventListener('keydown', e => {
    if (e.target.classList.contains('row-tag-input')) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commitRowTag(e.target);
      } else if (e.key === 'Escape') {
        e.target.value = '';
        e.target.blur();
      }
      return;
    }
    if (e.target.classList.contains('loc-picker-name')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRowLocationFromPicker(e.target);
      } else if (e.key === 'Escape') {
        e.target.value = '';
        e.target.blur();
      }
    }
  });

  listBodyEl.addEventListener('change', e => {
    if (e.target.classList.contains('row-check')) {
      // bulk module handles this
      return;
    }
    if (e.target.classList.contains('row-tag-input')) {
      if (e.target.value.trim()) commitRowTag(e.target);
      return;
    }
    if (e.target.classList.contains('loc-picker-name')) {
      if (e.target.value.trim()) commitRowLocationFromPicker(e.target);
    }
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

  // Close the export dropdown when clicking outside it.
  document.addEventListener('click', e => {
    const panel = document.getElementById('deckExportPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (e.target.closest('.deck-export-menu-wrap')) return;
    setDeckPanelOpen('deckExportPanel', '[data-toggle-deck-export]', false);
  });
}
