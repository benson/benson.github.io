import { getCardBackImageUrl, getCardImageUrl } from './collection.js';

export function buildAddPreviewCardModel(card) {
  const imageUrl = getCardImageUrl(card);
  const backUrl = getCardBackImageUrl(card);
  return {
    name: card.name,
    imageUrl,
    backUrl,
    meta: [card.set_name, card.type_line, card.rarity].filter(Boolean).join(' \u2014 '),
  };
}

export function findExistingPreviewEntries(collection = [], card) {
  const cardName = (card.name || '').toLowerCase();
  return collection.filter(c =>
    (c.scryfallId && c.scryfallId === card.id) ||
    ((c.resolvedName || c.name || '').toLowerCase() === cardName)
  );
}

export function buildExistingPreviewText(collection = [], card) {
  const matches = findExistingPreviewEntries(collection, card);
  if (!matches.length) return null;
  const totalQty = matches.reduce((sum, c) => sum + (parseInt(c.qty, 10) || 0), 0);
  return 'already in collection (\u00d7' + totalQty + ')';
}
