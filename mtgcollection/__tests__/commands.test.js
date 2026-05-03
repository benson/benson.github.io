import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetState, state } from '../state.js';
import { ensureContainer } from '../collection.js';
import {
  deleteContainerAndUnlocateCardsCommand,
  deleteEmptyContainerCommand,
  moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommand,
  renameContainerCommand,
} from '../commands.js';

function deckWithList() {
  const deck = ensureContainer({ type: 'deck', name: 'breya' });
  deck.deckList = [
    {
      scryfallId: 'sol-ring',
      qty: 1,
      board: 'main',
      name: 'Sol Ring',
      imageUrl: 'https://images.test/sol-ring.jpg',
      backImageUrl: '',
    },
  ];
  return deck;
}

function sideEffects() {
  const calls = { commits: [], records: [] };
  return {
    calls,
    commit: options => calls.commits.push(options || {}),
    record: event => calls.records.push(event),
  };
}

afterEach(resetState);

test('moveDeckCardToBoardCommand: moves a decklist entry and records one commit', () => {
  resetState();
  const deck = deckWithList();
  state.deckSampleHand = { hand: [] };
  const fx = sideEffects();

  const result = moveDeckCardToBoardCommand(deck, 'sol-ring', 'main', 'sideboard', fx);

  assert.equal(result.ok, true);
  assert.equal(deck.deckList[0].board, 'sideboard');
  assert.equal(state.deckSampleHand, null);
  assert.equal(fx.calls.commits.length, 1);
  assert.equal(fx.calls.records.length, 1);
  assert.equal(fx.calls.records[0].deckLocation, 'deck:breya');
});

test('moveDeckCardToBoardCommand: no-ops when the target board is unchanged', () => {
  resetState();
  const deck = deckWithList();
  const fx = sideEffects();

  const result = moveDeckCardToBoardCommand(deck, 'sol-ring', 'main', 'main', fx);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'same-board');
  assert.equal(deck.deckList[0].board, 'main');
  assert.equal(fx.calls.commits.length, 0);
  assert.equal(fx.calls.records.length, 0);
});

test('removeDeckCardFromDeckCommand: removes from decklist without touching inventory', () => {
  resetState();
  const deck = deckWithList();
  state.collection = [{ name: 'Sol Ring', scryfallId: 'sol-ring', location: { type: 'box', name: 'bulk' } }];
  const fx = sideEffects();

  const result = removeDeckCardFromDeckCommand(deck, 'sol-ring', 'main', fx);

  assert.equal(result.ok, true);
  assert.equal(deck.deckList.length, 0);
  assert.equal(state.collection.length, 1);
  assert.equal(fx.calls.commits.length, 1);
  assert.equal(fx.calls.records[0].summary, 'Removed {card} from {loc:deck:breya}');
});

test('renameContainerCommand: updates registry and inventory locations via a single command', () => {
  resetState();
  ensureContainer({ type: 'box', name: 'bulk' });
  state.collection = [{ name: 'Island', location: { type: 'box', name: 'bulk' } }];
  const fx = sideEffects();

  const result = renameContainerCommand({ type: 'box', name: 'bulk' }, { type: 'box', name: 'long box' }, fx);

  assert.equal(result.ok, true);
  assert.equal(state.collection[0].location.name, 'long box');
  assert.ok(state.containers['box:long box']);
  assert.equal(fx.calls.commits.length, 1);
  assert.deepEqual(fx.calls.commits[0], { coalesce: true });
});

test('delete container commands cover empty and occupied physical storage', () => {
  resetState();
  ensureContainer({ type: 'binder', name: 'trade binder' });
  ensureContainer({ type: 'box', name: 'bulk' });
  state.collection = [{ name: 'Island', location: { type: 'box', name: 'bulk' } }];
  const fx = sideEffects();

  const empty = deleteEmptyContainerCommand({ type: 'binder', name: 'trade binder' }, fx);
  const occupied = deleteContainerAndUnlocateCardsCommand({ type: 'box', name: 'bulk' }, fx);

  assert.equal(empty.ok, true);
  assert.equal(occupied.ok, true);
  assert.equal(occupied.cleared, 1);
  assert.equal(state.collection[0].location, null);
  assert.equal(state.containers['binder:trade binder'], undefined);
  assert.equal(state.containers['box:bulk'], undefined);
  assert.equal(fx.calls.commits.length, 2);
});
