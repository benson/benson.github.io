import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import {
  getEffectiveShape,
  readActiveLocationFromFilter,
  setActiveContainerRoute,
  setTopLevelViewMode,
} from '../routeState.js';
import { resetStateAfterEach } from './testUtils.js';

resetStateAfterEach();

test('setActiveContainerRoute: deck containers enter the deck workspace', () => {
  const loc = setActiveContainerRoute({ type: 'deck', name: 'breya' }, { syncFilter: false });

  assert.deepEqual(loc, { type: 'deck', name: 'breya' });
  assert.equal(state.viewMode, 'decks');
  assert.deepEqual(state.activeLocation, { type: 'deck', name: 'breya' });
  assert.equal(getEffectiveShape(), 'deck');
});

test('getEffectiveShape: storage containers distinguish binder and box routes', () => {
  setActiveContainerRoute({ type: 'binder', name: 'trade binder' }, { syncFilter: false });
  assert.equal(state.viewMode, 'storage');
  assert.equal(getEffectiveShape(), 'binder');

  state.viewAsList = true;
  assert.equal(getEffectiveShape(), 'box');

  setActiveContainerRoute({ type: 'box', name: 'bulk' }, { syncFilter: false });
  assert.equal(getEffectiveShape(), 'box');
});

test('setTopLevelViewMode: clears active container and returns to home shapes', () => {
  setActiveContainerRoute({ type: 'deck', name: 'breya' }, { syncFilter: false });
  state.binderPage = 3;

  setTopLevelViewMode('decks', { syncFilter: false });

  assert.equal(state.viewMode, 'decks');
  assert.equal(state.activeLocation, null);
  assert.equal(state.binderPage, 0);
  assert.equal(getEffectiveShape(), 'decks-home');
});

test('readActiveLocationFromFilter: only a single selected location becomes route state', () => {
  assert.deepEqual(
    readActiveLocationFromFilter({ dataset: { selected: JSON.stringify(['binder:trade binder']) } }),
    { type: 'binder', name: 'trade binder' }
  );
  assert.equal(
    readActiveLocationFromFilter({ dataset: { selected: JSON.stringify(['binder:a', 'box:b']) } }),
    null
  );
});

test('getEffectiveShape: share snapshots always render as deck workspace', () => {
  state.shareSnapshot = { container: { type: 'deck', name: 'shared breya' } };
  state.viewMode = 'collection';

  assert.equal(getEffectiveShape(), 'deck');
});
