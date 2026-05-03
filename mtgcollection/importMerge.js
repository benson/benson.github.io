import { collectionKey } from './collection.js';
import { mergeSource } from './adapters.js';

// Pure: takes (existing, imported) -> new collection. Dedupes by collectionKey,
// sums qty on collisions, unions tags on collisions, merges per-format
// `_source` metadata so re-imports don't drop earlier preserved fields.
export function mergeIntoCollection(existing, imported) {
  const byKey = new Map();
  for (const c of existing) byKey.set(collectionKey(c), c);
  for (const c of imported) {
    const k = collectionKey(c);
    if (byKey.has(k)) {
      const e = byKey.get(k);
      e.qty += c.qty;
      e.tags = [...new Set([...(e.tags || []), ...(c.tags || [])])];
      mergeSource(e, c);
    } else {
      byKey.set(k, c);
    }
  }
  return Array.from(byKey.values());
}
