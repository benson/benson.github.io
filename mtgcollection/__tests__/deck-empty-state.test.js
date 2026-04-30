import test from 'node:test';
import assert from 'node:assert/strict';
import { allCollectionLocations, quoteLocationForSearch } from '../collection.js';
import { state } from '../state.js';

// ---- allCollectionLocations ----

test('allCollectionLocations: returns sorted unique non-empty locations', () => {
  state.collection = [];
  state.collection = [
    { location: 'breya' },
    { location: 'binder' },
    { location: 'breya' },
    { location: 'atraxa deck' },
  ];
  assert.deepEqual(allCollectionLocations(), ['atraxa deck', 'binder', 'breya']);
  state.collection = [];
});

test('allCollectionLocations: ignores empty/whitespace/null/undefined locations', () => {
  state.collection = [];
  state.collection = [
    { location: '' },
    { location: '   ' },
    { location: null },
    { location: undefined },
    { location: 'binder' },
    {},
  ];
  assert.deepEqual(allCollectionLocations(), ['binder']);
  state.collection = [];
});

test('allCollectionLocations: normalizes case and trim before deduping', () => {
  state.collection = [];
  state.collection = [
    { location: 'Binder' },
    { location: '  binder  ' },
    { location: 'BINDER' },
  ];
  assert.deepEqual(allCollectionLocations(), ['binder']);
  state.collection = [];
});

test('allCollectionLocations: empty state returns empty array', () => {
  state.collection = [];
  assert.deepEqual(allCollectionLocations(), []);
});

test('allCollectionLocations: accepts explicit collection arg', () => {
  state.collection = [];
  const out = allCollectionLocations([
    { location: 'foo' },
    { location: 'bar' },
  ]);
  assert.deepEqual(out, ['bar', 'foo']);
});

// ---- quoteLocationForSearch ----

test('quoteLocationForSearch: bare token (no whitespace) is unquoted', () => {
  assert.equal(quoteLocationForSearch('breya'), 'breya');
  assert.equal(quoteLocationForSearch('binder'), 'binder');
});

test('quoteLocationForSearch: location with whitespace is wrapped in double quotes', () => {
  assert.equal(quoteLocationForSearch('atraxa deck'), '"atraxa deck"');
  assert.equal(quoteLocationForSearch('main binder shelf'), '"main binder shelf"');
});

test('quoteLocationForSearch: location with tab/newline is also quoted', () => {
  assert.equal(quoteLocationForSearch('foo\tbar'), '"foo\tbar"');
});

test('quoteLocationForSearch: produces a search string that tokenizes back to a single loc token', async () => {
  const { tokenizeSearch } = await import('../search.js');
  const tokens = tokenizeSearch('loc:' + quoteLocationForSearch('atraxa deck'));
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].field, 'loc');
  assert.equal(tokens[0].value, 'atraxa deck');
});
