import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STORAGE_SCHEMA_VERSION,
  normalizeStoredAppData,
  normalizeStoredCollectionDisplayMode,
  normalizeStoredCollectionEntry,
  normalizeStoredViewMode,
  serializeAppState,
} from '../storageSchema.js';

test('serializeAppState: writes versioned payload with ui envelope', () => {
  const payload = serializeAppState({
    collection: [{ name: 'Sol Ring' }],
    containers: { 'deck:breya': { type: 'deck', name: 'breya' } },
    viewMode: 'decks',
    viewAsList: true,
    collectionDisplayMode: 'visual',
    selectedFormat: 'commander',
    sortField: 'price',
    sortDir: 'desc',
  });

  assert.equal(payload.schemaVersion, APP_STORAGE_SCHEMA_VERSION);
  assert.deepEqual(payload.ui, {
    viewMode: 'decks',
    viewAsList: true,
    collectionDisplayMode: 'visual',
    selectedFormat: 'commander',
    sortField: 'price',
    sortDir: 'desc',
  });
  assert.equal(payload.collection[0].name, 'Sol Ring');
  assert.equal(Object.hasOwn(payload, 'viewMode'), false);
});

test('normalizeStoredAppData: accepts legacy payloads and normalizes card fields', () => {
  const data = normalizeStoredAppData({
    collection: [{
      name: 'Sol Ring',
      setCode: 'CMM',
      qty: '2',
      finish: 'Foil',
      condition: 'LP',
      language: 'EN',
      location: 'deck Breya',
      deckBoard: 'Sideboard',
      tags: ['mana', 'Mana', ''],
      price: '1.25',
      rarity: 'Rare',
      colors: ['C'],
      cmc: '1',
      imageUrl: 'front.jpg',
      resolvedName: 'Sol Ring',
    }],
    containers: {
      'deck:breya': { type: 'deck', name: 'Breya', deck: { title: 'Breya' } },
    },
    viewMode: 'locations',
    viewAsList: 1,
    collectionDisplayMode: 'visual',
    selectedFormat: 'modern',
    sortField: 'price',
    sortDir: 'desc',
  });

  assert.equal(data.schemaVersion, APP_STORAGE_SCHEMA_VERSION);
  assert.deepEqual(data.ui, {
    viewMode: 'storage',
    viewAsList: true,
    collectionDisplayMode: 'visual',
    selectedFormat: 'modern',
    sortField: 'price',
    sortDir: 'desc',
  });
  assert.deepEqual(data.collection[0].location, { type: 'deck', name: 'breya' });
  assert.equal(data.collection[0].deckBoard, 'sideboard');
  assert.equal(data.collection[0].setCode, 'cmm');
  assert.equal(data.collection[0].finish, 'foil');
  assert.equal(data.collection[0].condition, 'lightly_played');
  assert.equal(data.collection[0].language, 'en');
  assert.deepEqual(data.collection[0].tags, ['mana']);
  assert.equal(data.collection[0].price, 1.25);
  assert.equal(data.collection[0].rarity, 'rare');
  assert.deepEqual(data.collection[0].colors, ['C']);
  assert.equal(data.collection[0].cmc, 1);
  assert.deepEqual(Object.keys(data.containers), ['deck:breya']);
});

test('normalizeStoredAppData: accepts versioned ui envelopes', () => {
  const data = normalizeStoredAppData({
    schemaVersion: APP_STORAGE_SCHEMA_VERSION,
    collection: [],
    containers: {},
    ui: {
      viewMode: 'decks',
      viewAsList: true,
      collectionDisplayMode: 'visual',
      selectedFormat: 'commander',
      sortField: 'name',
      sortDir: 'desc',
    },
  });

  assert.deepEqual(data.ui, {
    viewMode: 'decks',
    viewAsList: true,
    collectionDisplayMode: 'visual',
    selectedFormat: 'commander',
    sortField: 'name',
    sortDir: 'desc',
  });
});

test('normalizeStoredAppData: rejects unknown versions and invalid collections', () => {
  assert.equal(normalizeStoredAppData({ schemaVersion: 999, collection: [] }), null);
  assert.equal(normalizeStoredAppData({ schemaVersion: APP_STORAGE_SCHEMA_VERSION, collection: {} }), null);
  assert.equal(normalizeStoredAppData(null), null);
});

test('normalizeStoredCollectionEntry: preserves resolved fields while normalizing basics', () => {
  const card = normalizeStoredCollectionEntry({
    name: 'Atraxa',
    location: 'binder legends',
    deckBoard: 'sideboard',
    imageUrl: 'front.jpg',
    backImageUrl: 'back.jpg',
    oracleText: 'Flying, vigilance, deathtouch, lifelink',
    legalities: { commander: 'legal' },
    _source: { provider: 'scryfall' },
    colors: ['G', 'W', 'U', 'B'],
    colorIdentity: ['G', 'W', 'U', 'B'],
  });

  assert.equal(card.imageUrl, 'front.jpg');
  assert.equal(card.backImageUrl, 'back.jpg');
  assert.equal(card.oracleText, 'Flying, vigilance, deathtouch, lifelink');
  assert.deepEqual(card.legalities, { commander: 'legal' });
  assert.deepEqual(card._source, { provider: 'scryfall' });
  assert.deepEqual(card.colors, ['G', 'W', 'U', 'B']);
  assert.deepEqual(card.colorIdentity, ['G', 'W', 'U', 'B']);
  assert.equal(Object.hasOwn(card, 'deckBoard'), false);
});

test('normalizeStoredViewMode: maps retired routes to current routes', () => {
  assert.equal(normalizeStoredViewMode('locations'), 'storage');
  assert.equal(normalizeStoredViewMode('list'), 'collection');
  assert.equal(normalizeStoredViewMode('deck'), 'collection');
});

test('normalizeStoredCollectionDisplayMode: accepts visual and defaults to table', () => {
  assert.equal(normalizeStoredCollectionDisplayMode('visual'), 'visual');
  assert.equal(normalizeStoredCollectionDisplayMode('table'), 'table');
  assert.equal(normalizeStoredCollectionDisplayMode('grid'), 'table');
  assert.equal(normalizeStoredCollectionDisplayMode(null), 'table');
});
