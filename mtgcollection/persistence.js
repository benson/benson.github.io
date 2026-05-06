import { state, STORAGE_KEY, BINDER_SIZE_KEY } from './state.js';
import { BINDER_LAYOUTS } from './binder.js';
import { normalizeLocation, ensureContainersForCollection } from './collection.js';
import { applyLoadedState } from './state.js';
import { normalizeStoredAppData, serializeAppState } from './storageSchema.js';
import { showFeedback } from './feedback.js';
import { runSyncChangeHooks } from './syncRuntime.js';

// ---- Persistence ----
export function save() {
  // Belt-and-suspenders: when we're rendering someone else's shared snapshot
  // the UI shouldn't trigger writes, but if anything slips through this no-ops
  // so we never corrupt the user's actual collection on disk.
  if (state.shareSnapshot) return;
  try {
    const serialized = serializeAppState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    runSyncChangeHooks({ reason: 'app-save', app: serialized });
  } catch (e) {
    showFeedback('collection too large for localstorage - ' + e.message, 'error');
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = normalizeStoredAppData(JSON.parse(raw));
    if (!data) return false;

    applyLoadedState({
      collection: data.collection,
      containers: data.containers,
      viewMode: data.ui.viewMode,
      activeLocation: null,
      viewAsList: data.ui.viewAsList,
      collectionDisplayMode: data.ui.collectionDisplayMode,
      selectedFormat: data.ui.selectedFormat,
      sortField: data.ui.sortField,
      sortDir: data.ui.sortDir,
    });
    ensureContainersForCollection();
    try {
      const v = localStorage.getItem(BINDER_SIZE_KEY);
      if (v && BINDER_LAYOUTS.includes(v)) state.binderSize = v;
    } catch (e) {}
    return true;
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
