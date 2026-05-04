import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import {
  applyRouteStateFromUrl,
  getEffectiveShape,
  readActiveLocationFromFilter,
  setActiveContainerRoute,
  setTopLevelViewMode,
  syncRouteUrlFromState,
} from '../routeState.js';
import { resetStateAfterEach } from './testUtils.js';

resetStateAfterEach();

test('setActiveContainerRoute: deck containers enter the deck workspace', () => {
  state.deckMode = 'hands';
  state.deckBoardFilter = 'main';
  state.deckSampleHand = { hand: [] };

  const loc = setActiveContainerRoute({ type: 'deck', name: 'breya' }, { syncFilter: false });

  assert.deepEqual(loc, { type: 'deck', name: 'breya' });
  assert.equal(state.viewMode, 'decks');
  assert.deepEqual(state.activeLocation, { type: 'deck', name: 'breya' });
  assert.equal(getEffectiveShape(), 'deck');
  assert.equal(state.deckMode, 'visual');
  assert.equal(state.deckBoardFilter, 'all');
  assert.equal(state.deckSampleHand, null);
});

test('getEffectiveShape: storage containers distinguish binder and box routes', () => {
  setActiveContainerRoute({ type: 'binder', name: 'trade binder' }, { syncFilter: false });
  assert.equal(state.viewMode, 'storage');
  assert.equal(getEffectiveShape(), 'binder');

  state.viewAsList = true;
  assert.equal(getEffectiveShape(), 'binder');

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

test('applyRouteStateFromUrl: defaults hard reloads to collection without route params', () => {
  state.viewMode = 'decks';
  state.activeLocation = { type: 'deck', name: 'breya' };

  const hadRoute = applyRouteStateFromUrl({
    locationObj: { href: 'https://example.com/mtgcollection/?auth=clerk&sync=remote' },
  });

  assert.equal(hadRoute, false);
  assert.equal(state.viewMode, 'collection');
  assert.equal(state.activeLocation, null);
});

test('applyRouteStateFromUrl: loc param restores container routes', () => {
  const hadRoute = applyRouteStateFromUrl({
    locationObj: { href: 'https://example.com/mtgcollection/?auth=clerk&sync=remote&loc=deck%3Abreya' },
  });

  assert.equal(hadRoute, true);
  assert.equal(state.viewMode, 'decks');
  assert.deepEqual(state.activeLocation, { type: 'deck', name: 'breya' });
});

test('syncRouteUrlFromState: preserves existing query params while writing view routes', () => {
  state.viewMode = 'storage';
  const paths = [];

  const path = syncRouteUrlFromState({
    historyObj: { replaceState: (stateArg, titleArg, nextPath) => paths.push(nextPath) },
    locationObj: { href: 'https://example.com/mtgcollection/?auth=clerk&sync=remote&q=sol' },
  });

  assert.equal(path, '/mtgcollection/?auth=clerk&sync=remote&q=sol&view=storage');
  assert.deepEqual(paths, [path]);
});

test('syncRouteUrlFromState: active containers use loc and collection clears route params', () => {
  state.viewMode = 'decks';
  state.activeLocation = { type: 'deck', name: 'breya' };
  const paths = [];

  syncRouteUrlFromState({
    historyObj: { replaceState: (stateArg, titleArg, nextPath) => paths.push(nextPath) },
    locationObj: { href: 'https://example.com/mtgcollection/?auth=clerk&view=decks' },
  });
  setTopLevelViewMode('collection', { syncFilter: false, updateUrl: false });
  syncRouteUrlFromState({
    historyObj: { replaceState: (stateArg, titleArg, nextPath) => paths.push(nextPath) },
    locationObj: { href: 'https://example.com/mtgcollection/?auth=clerk&loc=deck%3Abreya' },
  });

  assert.deepEqual(paths, [
    '/mtgcollection/?auth=clerk&loc=deck%3Abreya',
    '/mtgcollection/?auth=clerk',
  ]);
});
