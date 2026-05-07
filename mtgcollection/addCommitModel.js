import { getCardBackImageUrl, getCardImageUrl } from './collection.js';

export function buildDeckListEntryFromCard(card, qty) {
  return {
    scryfallId: card.id,
    qty,
    board: 'main',
    name: card.name,
    setCode: card.set,
    cn: card.collector_number,
    imageUrl: getCardImageUrl(card),
    backImageUrl: getCardBackImageUrl(card),
  };
}

export function buildPlaceholderAddEvent(card, location) {
  return {
    type: 'add',
    summary: 'Added {card} as placeholder to {loc:' + location.type + ':' + location.name + '}',
    cards: [{
      name: card.name,
      imageUrl: getCardImageUrl(card),
      backImageUrl: getCardBackImageUrl(card) || '',
    }],
    scope: 'deck',
    deckLocation: location.type + ':' + location.name,
  };
}

export function buildVoiceAddEvent({ card, entry, opts, key, before = [], created = [] }) {
  return {
    type: 'add',
    summary: 'Added \u00d7' + opts.qty,
    before,
    created,
    affectedKeys: [key],
    cards: [{
      name: card.name,
      imageUrl: entry.imageUrl || '',
      backImageUrl: entry.backImageUrl || '',
    }],
  };
}

export function buildInventoryAddEvent({ card, entry, key, before = [], created = [] }) {
  return {
    type: 'add',
    summary: 'Added {card}',
    before,
    created,
    affectedKeys: [key],
    cards: [{
      name: card.name,
      imageUrl: entry.imageUrl || '',
      backImageUrl: entry.backImageUrl || '',
    }],
  };
}

export function buildLastAddInputFromCard({ card, finish, condition, qty, location }) {
  return {
    set: card.set,
    cn: card.collector_number,
    variant: 'regular',
    foil: finish === 'foil',
    condition,
    qty,
    location,
  };
}
