import { state, STORAGE_KEY, BINDER_SIZE_KEY } from './state.js';
import { BINDER_SIZES } from './binder.js';
import { coalesceCollection, normalizeLocation, normalizeContainers, ensureContainersForCollection, normalizeDeckBoard } from './collection.js';
import { showFeedback } from './feedback.js';
import { populateFilters } from './detail.js';
import { render } from './view.js';

// ---- Persistence ----
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      collection: state.collection,
      containers: state.containers,
      viewMode: state.viewMode,
      viewAsList: state.viewAsList,
      selectedFormat: state.selectedFormat,
      sortField: state.sortField,
      sortDir: state.sortDir,
    }));
  } catch (e) {
    showFeedback('collection too large for localstorage — ' + e.message, 'error');
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (Array.isArray(data.collection)) {
      state.collection = data.collection;
      state.containers = normalizeContainers(data.containers);
      for (const c of state.collection) {
        if (!Array.isArray(c.tags)) c.tags = [];
        // Coerce legacy string locations into typed {type, name} objects.
        c.location = normalizeLocation(c.location);
        if (c.location?.type === 'deck') c.deckBoard = normalizeDeckBoard(c.deckBoard);
        else if (Object.prototype.hasOwnProperty.call(c, 'deckBoard')) delete c.deckBoard;
      }
      ensureContainersForCollection();
      // Top-level route. Migrate legacy 'list'→'collection', 'locations'→'storage'
      // (the closest analog — boxes/binders dominated the old locations home).
      const VALID_VIEW_MODES = ['collection', 'decks', 'storage'];
      if (VALID_VIEW_MODES.includes(data.viewMode)) state.viewMode = data.viewMode;
      else if (data.viewMode === 'locations') state.viewMode = 'storage';
      else state.viewMode = 'collection';
      state.viewAsList = !!data.viewAsList;
      state.selectedFormat = typeof data.selectedFormat === 'string' ? data.selectedFormat : '';
      state.sortField = typeof data.sortField === 'string' && data.sortField ? data.sortField : null;
      state.sortDir = data.sortDir === 'desc' ? 'desc' : 'asc';
      try {
        const v = localStorage.getItem(BINDER_SIZE_KEY);
        if (v && Object.prototype.hasOwnProperty.call(BINDER_SIZES, v)) state.binderSize = v;
      } catch (e) {}
      return true;
    }
  } catch (e) {}
  return false;
}

export function migrateSavedCollection() {
  const total = state.collection.reduce((sum, c) => sum + (parseInt(c.qty, 10) || 0), 0);
  const hasNoLocations = state.collection.every(c => !normalizeLocation(c.location));
  const looksLikeBreyaDefault = state.collection.length === 96
    && total === 100
    && state.collection.some(c => (c.resolvedName || c.name) === 'Breya, Etherium Shaper');
  if (hasNoLocations && looksLikeBreyaDefault) {
    state.collection.forEach(c => { c.location = { type: 'deck', name: 'breya' }; });
    save();
  }
}

// ---- Commit helper: consolidates the save/populateFilters/render triplet ----
export function commitCollectionChange({ coalesce = false } = {}) {
  if (coalesce) coalesceCollection();
  ensureContainersForCollection();
  save();
  populateFilters();
  render();
}

// ---- Backup nag ----
const BACKUP_LOAD_KEY = 'mtgcollection_loads_since_backup';
const BACKUP_NAG_THRESHOLD = 15;

export function bumpBackupCounter() {
  const prev = parseInt(localStorage.getItem(BACKUP_LOAD_KEY) || '0', 10) || 0;
  const next = prev + 1;
  try { localStorage.setItem(BACKUP_LOAD_KEY, String(next)); } catch (e) {}
  return next;
}

export function resetBackupCounter() {
  try { localStorage.setItem(BACKUP_LOAD_KEY, '0'); } catch (e) {}
}

export function maybeShowBackupNag(loadCount) {
  if (loadCount < BACKUP_NAG_THRESHOLD) return;
  if (state.collection.length <= 1) return;
  showFeedback(
    'localstorage-only — back up your collection. ' +
    '<button class="backup-btn" type="button" data-backup-action="export">export csv</button>' +
    '<button class="backup-btn" type="button" data-backup-action="dismiss">remind later</button>',
    'info'
  );
}
