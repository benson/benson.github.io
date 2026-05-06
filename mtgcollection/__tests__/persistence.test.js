import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadFromStorage, save } from '../persistence.js';
import { APP_STORAGE_SCHEMA_VERSION } from '../storageSchema.js';
import { state, BINDER_SIZE_KEY, STORAGE_KEY } from '../state.js';
import { installLocalStorage, resetStateAfterEach } from './testUtils.js';

let restoreLocalStorage = () => {};
resetStateAfterEach();
afterEach(() => {
  restoreLocalStorage();
  restoreLocalStorage = () => {};
});

test('save: writes versioned app data', () => {
  const { storage, restore } = installLocalStorage();
  restoreLocalStorage = restore;
  state.collection = [{ name: 'Sol Ring', qty: 1 }];
  state.containers = { 'deck:breya': { type: 'deck', name: 'breya' } };
  state.viewMode = 'decks';
  state.viewAsList = true;
  state.collectionDisplayMode = 'visual';
  state.selectedFormat = 'commander';
  state.sortField = 'price';
  state.sortDir = 'desc';

  save();

  const payload = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(payload.schemaVersion, APP_STORAGE_SCHEMA_VERSION);
  assert.equal(payload.collection[0].name, 'Sol Ring');
  assert.deepEqual(payload.ui, {
    viewMode: 'decks',
    viewAsList: true,
    collectionDisplayMode: 'visual',
    selectedFormat: 'commander',
    sortField: 'price',
    sortDir: 'desc',
  });
});

test('loadFromStorage: reads legacy payloads through the schema normalizer', () => {
  const { restore } = installLocalStorage({
    [STORAGE_KEY]: JSON.stringify({
      collection: [{
        name: 'Sol Ring',
        qty: '2',
        location: 'deck Breya',
        deckBoard: 'sideboard',
        tags: 'not-an-array',
      }],
      containers: {},
      viewMode: 'locations',
      viewAsList: true,
      collectionDisplayMode: 'visual',
      selectedFormat: 'vintage',
      sortField: 'name',
      sortDir: 'desc',
    }),
    [BINDER_SIZE_KEY]: '3x3',
  });
  restoreLocalStorage = restore;

  assert.equal(loadFromStorage(), true);
  assert.equal(state.viewMode, 'storage');
  assert.equal(state.activeLocation, null);
  assert.equal(state.viewAsList, true);
  assert.equal(state.collectionDisplayMode, 'visual');
  assert.equal(state.selectedFormat, 'vintage');
  assert.equal(state.sortField, 'name');
  assert.equal(state.sortDir, 'desc');
  assert.equal(state.binderSize, '3x3');
  assert.deepEqual(state.collection[0].location, { type: 'deck', name: 'breya' });
  assert.equal(state.collection[0].deckBoard, 'sideboard');
  assert.deepEqual(state.collection[0].tags, []);
  assert.deepEqual(Object.keys(state.containers), ['deck:breya']);
});

test('loadFromStorage: returns false for unknown schema versions', () => {
  const { restore } = installLocalStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 999,
      collection: [],
      containers: {},
    }),
  });
  restoreLocalStorage = restore;
  state.collection = [{ name: 'Existing' }];

  assert.equal(loadFromStorage(), false);
  assert.deepEqual(state.collection, [{ name: 'Existing' }]);
});

test('save: share snapshots do not write local collection state', () => {
  const { storage, restore } = installLocalStorage();
  restoreLocalStorage = restore;
  state.shareSnapshot = { container: { type: 'deck', name: 'shared' } };
  state.collection = [{ name: 'Private Card' }];

  save();

  assert.equal(storage.getItem(STORAGE_KEY), null);
});
