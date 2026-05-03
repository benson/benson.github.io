import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLoadedState,
  createInitialState,
  resetState,
  state,
} from '../state.js';
import { resetStateAfterEach } from './testUtils.js';

resetStateAfterEach();

test('createInitialState: returns fresh mutable containers for each call', () => {
  const a = createInitialState();
  const b = createInitialState();

  assert.notEqual(a.collection, b.collection);
  assert.notEqual(a.containers, b.containers);
  assert.notEqual(a.selectedKeys, b.selectedKeys);
  assert.deepEqual(a.collection, []);
  assert.deepEqual(a.containers, {});
  assert.deepEqual([...a.selectedKeys], []);
});

test('resetState: preserves the exported state object identity', () => {
  const ref = state;
  state.collection = [{ name: 'Sol Ring' }];
  state.selectedKeys = new Set(['a']);
  state.deckMode = 'stats';

  resetState({ viewMode: 'decks' });

  assert.equal(state, ref);
  assert.equal(state.viewMode, 'decks');
  assert.deepEqual(state.collection, []);
  assert.deepEqual([...state.selectedKeys], []);
  assert.equal(state.deckMode, 'visual');
});

test('applyLoadedState: applies persisted shell fields without clobbering view preferences', () => {
  state.deckGroupBy = 'cmc';
  state.deckMode = 'stats';
  state.deckCardSize = 'large';
  state.binderSize = '3x3';
  state.selectedKeys = new Set(['stale']);
  state.detailIndex = 3;
  state.deckSampleHand = { hand: [] };

  applyLoadedState({
    collection: [{ name: 'Island' }],
    containers: { 'box:bulk': { type: 'box', name: 'bulk' } },
    viewMode: 'storage',
    viewAsList: true,
    selectedFormat: 'commander',
    sortField: 'name',
    sortDir: 'desc',
  });

  assert.deepEqual(state.collection, [{ name: 'Island' }]);
  assert.deepEqual(state.containers, { 'box:bulk': { type: 'box', name: 'bulk' } });
  assert.equal(state.viewMode, 'storage');
  assert.equal(state.viewAsList, true);
  assert.equal(state.selectedFormat, 'commander');
  assert.equal(state.sortField, 'name');
  assert.equal(state.sortDir, 'desc');
  assert.deepEqual([...state.selectedKeys], []);
  assert.equal(state.detailIndex, -1);
  assert.equal(state.deckSampleHand, null);
  assert.equal(state.deckGroupBy, 'cmc');
  assert.equal(state.deckMode, 'stats');
  assert.equal(state.deckCardSize, 'large');
  assert.equal(state.binderSize, '3x3');
});
