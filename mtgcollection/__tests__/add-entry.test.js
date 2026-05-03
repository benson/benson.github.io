import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionKey } from '../collection.js';
import { buildCollectionEntryFromCard, mergeEntryIntoCollection } from '../addEntry.js';

function card(extra = {}) {
  return {
    id: 'sol-id',
    name: 'Sol Ring',
    set: 'sld',
    set_name: 'Secret Lair Drop',
    collector_number: '1011',
    rarity: 'rare',
    cmc: 1,
    colors: [],
    color_identity: [],
    type_line: 'Artifact',
    oracle_text: 'Tap: Add CC.',
    legalities: { commander: 'legal' },
    scryfall_uri: 'https://scryfall.test/card/sol-id',
    image_uris: {
      normal: 'https://img.test/normal/sol.jpg',
      large: 'https://img.test/large/sol.jpg',
    },
    prices: { usd: '3.50', usd_foil: '5.00' },
    ...extra,
  };
}

test('buildCollectionEntryFromCard: maps Scryfall fields and chosen add options', () => {
  const entry = buildCollectionEntryFromCard(card(), {
    finish: 'foil',
    qty: 2,
    condition: 'near_mint',
    language: 'en',
    location: { type: 'binder', name: 'trade binder' },
    tags: ['edh', 'sale'],
  });

  assert.equal(entry.name, 'Sol Ring');
  assert.equal(entry.resolvedName, 'Sol Ring');
  assert.equal(entry.setCode, 'sld');
  assert.equal(entry.qty, 2);
  assert.deepEqual(entry.location, { type: 'binder', name: 'trade binder' });
  assert.equal(entry.typeLine, 'Artifact');
  assert.equal(entry.oracleText, 'Tap: Add CC.');
  assert.equal(entry.imageUrl, 'https://img.test/normal/sol.jpg');
  assert.equal(entry.price, 5);
  assert.deepEqual(entry.tags, ['edh', 'sale']);
});

test('buildCollectionEntryFromCard: falls back to card face text and images', () => {
  const entry = buildCollectionEntryFromCard(card({
    name: 'Front // Back',
    type_line: undefined,
    oracle_text: undefined,
    colors: undefined,
    image_uris: undefined,
    card_faces: [
      {
        type_line: 'Creature',
        oracle_text: 'front text',
        colors: ['U'],
        image_uris: { normal: 'https://img.test/normal/front.jpg' },
      },
      {
        type_line: 'Instant',
        oracle_text: 'back text',
        image_uris: { normal: 'https://img.test/normal/back.jpg' },
      },
    ],
  }), {
    finish: 'normal',
    qty: 1,
    condition: 'near_mint',
    language: 'en',
    location: null,
  });

  assert.deepEqual(entry.colors, ['U']);
  assert.equal(entry.typeLine, 'Creature // Instant');
  assert.equal(entry.oracleText, 'front text // back text');
  assert.equal(entry.imageUrl, 'https://img.test/normal/front.jpg');
  assert.equal(entry.backImageUrl, 'https://img.test/normal/back.jpg');
});

test('mergeEntryIntoCollection: increments matching rows and snapshots tags', () => {
  const entry = buildCollectionEntryFromCard(card(), {
    finish: 'normal',
    qty: 2,
    condition: 'near_mint',
    language: 'en',
    location: null,
  });
  const existing = { ...entry, qty: 1, tags: ['edh'] };
  const collection = [existing];

  const result = mergeEntryIntoCollection(collection, entry);

  assert.equal(collection.length, 1);
  assert.equal(collection[0].qty, 3);
  assert.deepEqual(result.created, []);
  assert.equal(result.before[0].key, collectionKey(entry));
  assert.deepEqual(result.before[0].card.tags, ['edh']);
});

test('mergeEntryIntoCollection: appends new entries and returns created key', () => {
  const entry = buildCollectionEntryFromCard(card(), {
    finish: 'etched',
    qty: 1,
    condition: 'near_mint',
    language: 'en',
    location: null,
  });
  const collection = [];

  const result = mergeEntryIntoCollection(collection, entry);

  assert.equal(collection[0], entry);
  assert.deepEqual(result.before, []);
  assert.deepEqual(result.created, [collectionKey(entry)]);
});
