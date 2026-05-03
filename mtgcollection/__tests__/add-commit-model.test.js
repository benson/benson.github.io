import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeckListEntryFromCard,
  buildInventoryAddEvent,
  buildLastAddInputFromCard,
  buildPlaceholderAddEvent,
  buildVoiceAddEvent,
} from '../addCommitModel.js';

const card = {
  id: 'abc',
  name: 'Sol Ring',
  set: 'cmm',
  collector_number: '300',
  image_uris: { normal: 'front.jpg' },
};

test('buildDeckListEntryFromCard: creates a mainboard decklist row from a Scryfall card', () => {
  assert.deepEqual(buildDeckListEntryFromCard(card, 2), {
    scryfallId: 'abc',
    qty: 2,
    board: 'main',
    name: 'Sol Ring',
    setCode: 'cmm',
    cn: '300',
    imageUrl: 'front.jpg',
    backImageUrl: null,
  });
});

test('buildPlaceholderAddEvent: scopes placeholder events to the deck location', () => {
  assert.deepEqual(buildPlaceholderAddEvent(card, { type: 'deck', name: 'breya' }), {
    type: 'add',
    summary: 'Added {card} as placeholder to {loc:deck:breya}',
    cards: [{ name: 'Sol Ring', imageUrl: 'front.jpg', backImageUrl: '' }],
    scope: 'deck',
    deckLocation: 'deck:breya',
  });
});

test('buildVoiceAddEvent: preserves undo arrays and affected key', () => {
  const event = buildVoiceAddEvent({
    card,
    entry: { imageUrl: 'entry-front.jpg', backImageUrl: 'entry-back.jpg' },
    opts: { qty: 3 },
    key: 'key-1',
    before: [{ key: 'key-1' }],
    created: [],
  });

  assert.equal(event.summary, 'Added \u00d73');
  assert.deepEqual(event.affectedKeys, ['key-1']);
  assert.deepEqual(event.before, [{ key: 'key-1' }]);
  assert.deepEqual(event.cards, [{ name: 'Sol Ring', imageUrl: 'entry-front.jpg', backImageUrl: 'entry-back.jpg' }]);
});

test('buildInventoryAddEvent: summarizes set and collector number', () => {
  const event = buildInventoryAddEvent({
    card,
    entry: { imageUrl: 'entry-front.jpg', backImageUrl: '' },
    key: 'key-1',
    before: [],
    created: ['key-1'],
  });

  assert.equal(event.summary, 'Added (CMM #300)');
  assert.deepEqual(event.created, ['key-1']);
  assert.deepEqual(event.affectedKeys, ['key-1']);
});

test('buildLastAddInputFromCard: stores repeatable collector-number add context', () => {
  assert.deepEqual(buildLastAddInputFromCard({
    card,
    finish: 'foil',
    condition: 'near_mint',
    qty: 2,
    location: { type: 'box', name: 'bulk' },
  }), {
    set: 'cmm',
    cn: '300',
    variant: 'regular',
    foil: true,
    condition: 'near_mint',
    qty: 2,
    location: { type: 'box', name: 'bulk' },
  });
});
