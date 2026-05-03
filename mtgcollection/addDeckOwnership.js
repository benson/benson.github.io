import { normalizeLocation } from './collection.js';

export function buildDeckOwnershipReadout({ collection = [], card = null, location = null } = {}) {
  if (!card) return null;
  const owned = collection.filter(c => c.scryfallId === card.id);
  const ownedQty = owned.reduce((sum, c) => sum + (c.qty || 0), 0);
  const inDeck = owned.filter(c => {
    const loc = normalizeLocation(c.location);
    return loc?.type === 'deck' && loc.name === location?.name;
  });
  const inDeckQty = inDeck.reduce((sum, c) => sum + (c.qty || 0), 0);

  if (ownedQty === 0) {
    return {
      text: "you don't own this printing yet - defaults to placeholder",
      placeholderState: true,
      placeholderChecked: true,
    };
  }

  const breakdown = owned.map(c => {
    const loc = normalizeLocation(c.location);
    return (c.qty || 0) + ' in ' + (loc ? loc.type + ':' + loc.name : 'unsorted');
  }).join(', ');

  return {
    text: 'you own ' + ownedQty + ' of this printing (' + breakdown + ')' + (inDeckQty ? ' - ' + inDeckQty + ' already in this deck' : ''),
    placeholderState: false,
    placeholderChecked: false,
  };
}
