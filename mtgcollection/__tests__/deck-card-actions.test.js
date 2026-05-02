import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import { renderDeckCard } from '../view.js';

afterEach(() => {
  state.collection = [];
});

test('renderDeckCard: renders contextual card actions instead of an inline board select', () => {
  const card = {
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    qty: 1,
    deckBoard: 'sideboard',
    imageUrl: 'https://example.test/sol-ring.jpg',
  };
  state.collection = [card];

  const html = renderDeckCard(card, true);

  assert.match(html, /<article class="deck-card deck-card-last"/);
  assert.match(html, /class="deck-card-face detail-trigger"/);
  assert.match(html, /data-card-menu-toggle/);
  assert.match(html, /role="menu"/);
  assert.match(html, /data-card-action="move-board"/);
  assert.match(html, /data-board="main"/);
  assert.match(html, /data-card-action="remove-from-deck"/);
  assert.doesNotMatch(html, /deck-card-board/);
  assert.doesNotMatch(html, /<select/);
});

test('renderDeckCard: disables the move action for the current board', () => {
  const card = { name: 'Counterspell', qty: 1, deckBoard: 'maybe' };
  state.collection = [card];

  const html = renderDeckCard(card, false);

  assert.match(html, /data-board="maybe" data-index="0" disabled/);
  assert.doesNotMatch(html, /data-board="main" data-index="0" disabled/);
});
