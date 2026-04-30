import { state, STORAGE_KEY } from './state.js';
import { coalesceCollection, normalizeLocation } from './collection.js';
import { showFeedback } from './feedback.js';
import { populateFilters } from './detail.js';
import { render } from './view.js';

// ---- Persistence ----
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      collection: state.collection,
      viewMode: state.viewMode,
      gridSize: state.gridSize,
      selectedFormat: state.selectedFormat,
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
      state.viewMode = data.viewMode || 'grid';
      state.gridSize = ['small', 'medium', 'large'].includes(data.gridSize) ? data.gridSize : 'medium';
      state.selectedFormat = typeof data.selectedFormat === 'string' ? data.selectedFormat : '';
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
    state.collection.forEach(c => { c.location = 'breya deck'; });
    save();
  }
}

// ---- Commit helper: consolidates the save/populateFilters/render triplet ----
export function commitCollectionChange({ coalesce = false } = {}) {
  if (coalesce) coalesceCollection();
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
