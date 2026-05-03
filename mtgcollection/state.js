// Shared mutable state. Use object properties (not let bindings) so
// other modules can both read and reassign through `state.x = ...`.
export const state = {
  collection: [],
  containers: {},
  // Top-level routes: 'collection' | 'decks' | 'storage'.
  viewMode: 'collection',
  // Binder-shape escape hatch only. Collection/decks/storage don't use this.
  viewAsList: false,
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
  sortField: null,
  sortDir: 'asc',
  // When non-null, the app is in read-only viewer mode for someone else's
  // shared deck. Set by share.js initShareViewer(); cleared by reloading
  // without `?share=`. Persisted writes are guarded in persistence.js.
  shareSnapshot: null,
};

export const STORAGE_KEY = 'mtgcollection_v1';
export const DECK_GROUP_KEY = 'mtgcollection_deck_group_v1';
export const DECK_VIEW_PREFS_KEY = 'mtgcollection_deck_view_prefs_v1';
export const BINDER_SIZE_KEY = 'mtgcollection_binder_size_v1';
export const SCRYFALL_API = 'https://api.scryfall.com';
