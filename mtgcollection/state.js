// Shared mutable state. Use object properties (not let bindings) so
// other modules can both read and reassign through `state.x = ...`.
export const state = {
  collection: [],
  viewMode: 'grid',
  gridSize: 'medium',
  selectedFormat: '',
  selectedKeys: new Set(),
  detailIndex: -1,
  lastSnapshot: null,
};

export const STORAGE_KEY = 'mtgcollection_v1';
export const SCRYFALL_API = 'https://api.scryfall.com';
