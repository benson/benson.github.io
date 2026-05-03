import {
  applyScryfallCardResolution,
  collectionKey,
  makeEntry,
} from './collection.js';

export function buildCollectionEntryFromCard(card, opts) {
  const entry = makeEntry({
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    cn: card.collector_number,
    finish: opts.finish,
    qty: opts.qty,
    condition: opts.condition,
    language: opts.language,
    location: opts.location,
    scryfallId: card.id,
    rarity: card.rarity || '',
  });
  return applyScryfallCardResolution(entry, card, { priceMode: 'replace' });
}

export function mergeEntryIntoCollection(collection, entry) {
  const key = collectionKey(entry);
  const existing = collection.find(c => collectionKey(c) === key);
  let before = [];
  let created = [];
  if (existing) {
    before = [{ key, card: { ...existing, tags: Array.isArray(existing.tags) ? [...existing.tags] : [] } }];
    existing.qty += entry.qty;
  } else {
    collection.push(entry);
    created = [key];
  }
  return { key, before, created, entry: existing || entry };
}
