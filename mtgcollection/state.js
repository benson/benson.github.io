// Shared mutable state. Use object properties (not let bindings) so
// other modules can both read and reassign through `state.x = ...`.
export const state = {
  collection: [],
  containers: {},
  viewMode: 'grid',
  gridSize: 'medium',
  selectedFormat: '',
  selectedKeys: new Set(),
  detailIndex: -1,
  deckGroupBy: 'type',
  binderSize: '4x3',
  binderPage: 0,
  sortField: null,
  sortDir: 'asc',
};

export const STORAGE_KEY = 'mtgcollection_v1';
export const DECK_GROUP_KEY = 'mtgcollection_deck_group_v1';
export const BINDER_SIZE_KEY = 'mtgcollection_binder_size_v1';
export const SCRYFALL_API = 'https://api.scryfall.com';
