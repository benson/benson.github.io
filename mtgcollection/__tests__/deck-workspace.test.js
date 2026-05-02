import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionKey, ensureContainer, normalizeDeckBoard } from '../collection.js';
import { splitDeckBoards, deckStats, drawSampleHand } from '../stats.js';
import { state } from '../state.js';

const card = (name, opts = {}) => ({
  name,
  resolvedName: name,
  qty: opts.qty || 1,
  location: { type: 'deck', name: 'breya' },
  deckBoard: opts.deckBoard,
  typeLine: opts.typeLine || 'Creature',
  cmc: opts.cmc ?? 2,
  price: opts.price || 0,
  finish: 'normal',
  condition: 'near_mint',
  language: 'en',
  setCode: 'cmm',
  cn: name,
});

test('normalizeDeckBoard: defaults unknown values to main', () => {
  assert.equal(normalizeDeckBoard('sideboard'), 'sideboard');
  assert.equal(normalizeDeckBoard('maybe'), 'maybe');
  assert.equal(normalizeDeckBoard(''), 'main');
  assert.equal(normalizeDeckBoard('commander'), 'main');
});

test('deck container metadata defaults from the physical container name', () => {
  state.containers = {};
  const deck = ensureContainer({ type: 'deck', name: 'Breya' }, 100);
  assert.equal(deck.deck.title, 'breya');
  assert.equal(deck.deck.description, '');
  assert.equal(deck.deck.commander, '');
  state.containers = {};
});

test('collectionKey: deck board is part of identity inside deck containers', () => {
  const main = card('Sol Ring', { deckBoard: 'main' });
  const side = card('Sol Ring', { deckBoard: 'sideboard' });
  assert.notEqual(collectionKey(main), collectionKey(side));
});

test('splitDeckBoards: unknown board entries fall into main', () => {
  const boards = splitDeckBoards([
    card('A'),
    card('B', { deckBoard: 'sideboard' }),
    card('C', { deckBoard: 'maybe' }),
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, v.map(c => c.name)])), {
    main: ['A'],
    sideboard: ['B'],
    maybe: ['C'],
  });
});

test('deckStats: counts boards and averages mainboard mana values', () => {
  const stats = deckStats([
    card('Land', { qty: 2, typeLine: 'Basic Land', cmc: 0 }),
    card('Spell', { qty: 2, typeLine: 'Instant', cmc: 2, price: 1 }),
    card('Side', { deckBoard: 'sideboard', qty: 1, cmc: 5, price: 3 }),
  ]);
  assert.equal(stats.main, 4);
  assert.equal(stats.sideboard, 1);
  assert.equal(stats.lands, 2);
  assert.equal(stats.nonlands, 2);
  assert.equal(stats.value, 5);
  assert.equal(stats.avgManaValue, 1);
  assert.equal(stats.avgSpellManaValue, 2);
});

test('drawSampleHand: expands quantities and can use deterministic randomness', () => {
  const cards = [
    card('A', { qty: 2 }),
    card('B', { qty: 1 }),
    card('C', { qty: 1 }),
  ];
  const hand = drawSampleHand(cards, 2, () => 0);
  assert.equal(hand.hand.length, 2);
  assert.equal(hand.next.length, 2);
  assert.deepEqual([...hand.hand, ...hand.next].map(c => c.name).sort(), ['A', 'A', 'B', 'C']);
});
