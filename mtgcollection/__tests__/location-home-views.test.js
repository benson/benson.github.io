import test from 'node:test';
import assert from 'node:assert/strict';
import { deckMatchesHomeFilters, renderDecksHomeHtml } from '../views/locationHomeViews.js';

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
