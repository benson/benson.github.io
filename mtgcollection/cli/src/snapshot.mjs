// Read-side helpers over a bootstrap snapshot, reusing the app's search core.
import { tokenizeSearch, matchSearch, passesMultiselectFilters, compareCards } from '../vendor/searchCore.js';
import { locationKey } from '../vendor/collection.js';

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

// Parse a container reference like "deck:breya", "breya", or "binder:rares".
// Returns { type, name } where type may be null if unqualified.
export function parseContainerRef(ref) {
  const m = String(ref || '').trim().match(/^(deck|binder|box)\s*[:]\s*(.+)$/i);
  if (m) return { type: m[1].toLowerCase(), name: m[2].trim().toLowerCase() };
  return { type: null, name: String(ref || '').trim().toLowerCase() };
}

export function listContainers(snapshot, type = null) {
  const containers = Object.values(containersOf(snapshot));
  const collection = collectionOf(snapshot);
  return containers
    .filter(c => !type || c.type === type)
    .map(c => {
      const key = c.type + ':' + c.name;
      const cards = collection.filter(card => locationKey(card.location) === key);
      const stats = summarize(cards);
      return { type: c.type, name: c.name, unique: stats.unique, total: stats.total, value: stats.value, meta: c.deck || null };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export function findContainer(snapshot, ref) {
  const { type, name } = parseContainerRef(ref);
  const containers = Object.values(containersOf(snapshot));
  const matches = containers.filter(c => c.name === name && (!type || c.type === type));
  return { matches, type, name };
}

export function containerCards(snapshot, container) {
  const key = container.type + ':' + container.name;
  return collectionOf(snapshot).filter(card => locationKey(card.location) === key);
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
