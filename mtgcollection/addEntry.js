import {
  collectionKey,
  getCardBackImageUrl,
  getCardImageUrl,
  getUsdPrice,
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
  entry.resolvedName = card.name;
  entry.cmc = card.cmc ?? null;
  entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
  entry.colorIdentity = card.color_identity || [];
  entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
  entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
  entry.legalities = card.legalities || {};
  entry.scryfallUri = card.scryfall_uri;
  entry.imageUrl = getCardImageUrl(card);
  entry.backImageUrl = getCardBackImageUrl(card);
  const priced = getUsdPrice(card, entry.finish);
  entry.price = priced.price;
  entry.priceFallback = priced.fallback;
  return entry;
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
