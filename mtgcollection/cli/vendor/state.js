function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneSelectedKeys(raw) {
  if (raw instanceof Set) return new Set(raw);
  if (Array.isArray(raw)) return new Set(raw);
  return new Set();
}

export function createInitialState(overrides = {}) {
  const initial = {
    collection: [],
    containers: {},
    // Top-level routes: 'collection' | 'decks' | 'storage'.
    viewMode: 'collection',
    // The single physical container currently being browsed, independent from
    // broad collection filters. Stored as { type, name } or null.
    activeLocation: null,
    // Binder-shape escape hatch only. Collection/decks/storage don't use this.
    viewAsList: false,
    collectionDisplayMode: 'table',
    selectedFormat: '',
    selectedKeys: new Set(),
    detailIndex: -1,
    deckGroupBy: 'type',
    deckMode: 'visual',
    deckBoardFilter: 'all',
    deckCardSize: 'medium',
    deckShowPrices: true,
    deckOwnershipView: 'building',
    deckSampleHand: null,
    binderSize: '4x3',
    binderPage: 0,
    binderShowPrices: true,
    binderMode: 'view',
    binderSort: 'binder',
    binderSearch: '',
    binderColorFilter: '',
    binderTypeFilter: '',
    sortField: null,
    sortDir: 'asc',
    // When non-null, the app is in read-only viewer mode for someone else's
    // shared deck. Set by share.js initShareViewer(); cleared by reloading
    // without `?share=`. Persisted writes are guarded in persistence.js.
    shareSnapshot: null,
  };
  const next = { ...initial, ...overrides };
  next.collection = Array.isArray(overrides.collection) ? overrides.collection : initial.collection;
  next.containers = isPlainObject(overrides.containers) ? overrides.containers : initial.containers;
  next.selectedKeys = cloneSelectedKeys(overrides.selectedKeys);
  return next;
}

// Shared mutable state. Use object properties (not let bindings) so
// other modules can both read and reassign through `state.x = ...`.
export const state = createInitialState();

export function resetState(overrides = {}) {
  const next = createInitialState(overrides);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);
  return state;
}

export function applyLoadedState(loaded = {}) {
  const defaults = createInitialState();
  state.collection = Array.isArray(loaded.collection) ? loaded.collection : defaults.collection;
  state.containers = isPlainObject(loaded.containers) ? loaded.containers : defaults.containers;
  state.viewMode = typeof loaded.viewMode === 'string' ? loaded.viewMode : defaults.viewMode;
  state.activeLocation = loaded.activeLocation ?? defaults.activeLocation;
  state.viewAsList = Boolean(loaded.viewAsList);
  state.collectionDisplayMode = loaded.collectionDisplayMode === 'visual' ? 'visual' : defaults.collectionDisplayMode;
  state.selectedFormat = typeof loaded.selectedFormat === 'string' ? loaded.selectedFormat : defaults.selectedFormat;
  state.sortField = typeof loaded.sortField === 'string' && loaded.sortField ? loaded.sortField : defaults.sortField;
  state.sortDir = loaded.sortDir === 'desc' ? 'desc' : defaults.sortDir;
  state.selectedKeys = new Set();
  state.detailIndex = defaults.detailIndex;
  state.deckSampleHand = defaults.deckSampleHand;
  state.binderPage = defaults.binderPage;
  state.shareSnapshot = loaded.shareSnapshot ?? defaults.shareSnapshot;
  return state;
}

export const STORAGE_KEY = 'mtgcollection_v1';
export const DECK_GROUP_KEY = 'mtgcollection_deck_group_v1';
export const DECK_VIEW_PREFS_KEY = 'mtgcollection_deck_view_prefs_v1';
export const BINDER_SIZE_KEY = 'mtgcollection_binder_size_v1';
export const BINDER_PRICES_KEY = 'mtgcollection_binder_prices_v1';
export const BINDER_VIEW_PREFS_KEY = 'mtgcollection_binder_view_prefs_v1';
export const SCRYFALL_API = 'https://api.scryfall.com';
