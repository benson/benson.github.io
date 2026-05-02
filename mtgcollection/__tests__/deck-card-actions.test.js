import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import { renderDeckCard } from '../view.js';

afterEach(() => {
  state.collection = [];
});

test('renderDeckCard: renders contextual card actions instead of an inline board select', () => {
  const card = {
    scryfallId: 'sol-ring-id',
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    qty: 1,
    deckBoard: 'sideboard',
    imageUrl: 'https://example.test/sol-ring.jpg',
    inventoryIndex: -1,
  };

  const html = renderDeckCard(card, true);

  assert.match(html, /<article class="deck-card deck-card-last"/);
  assert.match(html, /class="deck-card-face detail-trigger"/);
  assert.match(html, /data-card-menu-toggle/);
  assert.match(html, /role="menu"/);
  assert.match(html, /data-card-action="move-board"/);
  assert.match(html, /data-board-target="main"/);
  assert.match(html, /data-scryfall-id="sol-ring-id"/);
  assert.match(html, /data-card-action="remove-from-deck"/);
  assert.doesNotMatch(html, /deck-card-board/);
  assert.doesNotMatch(html, /<select/);
});

test('renderDeckCard: disables the move action for the current board', () => {
  const card = { scryfallId: 'cs-id', name: 'Counterspell', qty: 1, deckBoard: 'maybe', inventoryIndex: -1 };

  const html = renderDeckCard(card, false);

  // The button for the current board (maybe) should be disabled.
  assert.match(html, /data-board-target="maybe"[^>]*disabled/);
  assert.doesNotMatch(html, /data-board-target="main"[^>]*disabled/);
});
