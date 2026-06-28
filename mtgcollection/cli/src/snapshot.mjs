// Read-side helpers over a bootstrap snapshot, reusing the app's search core.
import { tokenizeSearch, matchSearch, passesMultiselectFilters, compareCards } from '../vendor/searchCore.js';

export function emptySnapshot() {
  return {
    app: { schemaVersion: 1, collection: [], containers: {}, ui: { selectedFormat: '' } },
    history: [],
    shares: [],
  };
}

export function collectionOf(snapshot) {
  return snapshot?.app?.collection || [];
}

export function containersOf(snapshot) {
  return snapshot?.app?.containers || {};
}

// Filter + sort a collection with the exact app grammar and sort order.
export function runQuery(collection, query = '', { sort = 'name', dir = 'asc', filters = {} } = {}) {
  const tokens = tokenizeSearch(query || '');
  const filtered = (collection || []).filter(c => matchSearch(c, tokens) && passesMultiselectFilters(c, filters));
  const sign = dir === 'desc' ? -1 : 1;
  return [...filtered].sort((a, b) => sign * compareCards(a, b, sort));
}

export function summarize(collection) {
  let unique = 0;
  let total = 0;
  let value = 0;
  for (const c of collection || []) {
    unique += 1;
    const qty = parseInt(c.qty, 10) || 0;
    total += qty;
    if (typeof c.price === 'number') value += c.price * qty;
  }
  return { unique, total, value: Math.round(value * 100) / 100 };
}
