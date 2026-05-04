import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deckMatchesHomeFilters,
  renderDecksHomeHtml,
  renderStorageHomeHtml,
  storageMatchesHomeFilters,
} from '../views/locationHomeViews.js';

const deck = (name, format = '') => ({
  type: 'deck',
  name,
  deck: { title: name, format },
  deckList: [],
});

test('deckMatchesHomeFilters: filters by live search and format buckets', () => {
  assert.equal(deckMatchesHomeFilters(deck('Breya Artifacts', 'commander'), { query: 'breya' }), true);
  assert.equal(deckMatchesHomeFilters(deck('Breya Artifacts', 'commander'), { query: 'esper' }), false);
  assert.equal(deckMatchesHomeFilters(deck('Modern Burn', 'modern'), { formats: ['modern'] }), true);
  assert.equal(deckMatchesHomeFilters(deck('Pile'), { formats: ['unspecified'] }), true);
  assert.equal(deckMatchesHomeFilters(deck('Pile'), { formats: ['commander'] }), false);
});

test('renderDecksHomeHtml: renders only matching decks and distinguishes empty results', () => {
  const html = renderDecksHomeHtml([
    deck('Breya Artifacts', 'commander'),
    deck('Modern Burn', 'modern'),
  ], { query: 'breya', formats: ['commander'] });

  assert.match(html, /Breya Artifacts/);
  assert.doesNotMatch(html, /Modern Burn/);
  assert.match(
    renderDecksHomeHtml([deck('Modern Burn', 'modern')], { query: 'breya' }),
    /no decks match/
  );
});

test('storageMatchesHomeFilters: filters binder and box containers by name and type', () => {
  assert.equal(storageMatchesHomeFilters({ type: 'binder', name: 'Trade Binder' }, { query: 'trade' }), true);
  assert.equal(storageMatchesHomeFilters({ type: 'box', name: 'Bulk Box' }, { query: 'trade' }), false);
  assert.equal(storageMatchesHomeFilters({ type: 'binder', name: 'Trade Binder' }, { types: ['binder'] }), true);
  assert.equal(storageMatchesHomeFilters({ type: 'box', name: 'Bulk Box' }, { types: ['binder'] }), false);
  assert.equal(storageMatchesHomeFilters(deck('Breya'), {}), false);
});

test('renderStorageHomeHtml: renders filtered storage containers and empty match states', () => {
  const html = renderStorageHomeHtml([
    { type: 'binder', name: 'trade binder' },
    { type: 'box', name: 'bulk box' },
  ], { query: 'trade', types: ['binder'] });

  assert.match(html, /trade binder/);
  assert.doesNotMatch(html, /bulk box/);
  assert.match(
    renderStorageHomeHtml([{ type: 'box', name: 'bulk box' }], { query: 'trade' }),
    /no boxes match/
  );
});
