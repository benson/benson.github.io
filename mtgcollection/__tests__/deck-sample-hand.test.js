import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  buildDeckSampleHand,
  deckSampleHandKey,
  renderDeckSampleHandPanel,
} from '../deckSampleHand.js';

const entry = (name, opts = {}) => ({
  scryfallId: opts.scryfallId || name.toLowerCase(),
  name,
  qty: opts.qty || 1,
  board: opts.board || 'main',
  imageUrl: '',
  ...opts,
});

test('deckSampleHandKey: scopes hands to the current deck container', () => {
  assert.equal(deckSampleHandKey({ type: 'deck', name: 'breya' }), 'deck:breya');
  assert.equal(deckSampleHandKey(null), '');
});

test('buildDeckSampleHand: resolves decklist mainboard cards and excludes other boards', () => {
  const deck = {
    type: 'deck',
    name: 'breya',
    deckList: [
      entry('A', { qty: 2 }),
      entry('B', { qty: 1 }),
      entry('Side', { board: 'sideboard', qty: 4 }),
      entry('Maybe', { board: 'maybe', qty: 4 }),
    ],
  };

  const hand = buildDeckSampleHand({ deck, handSize: 2, random: () => 0 });
  const names = [...hand.hand, ...hand.next].map(card => card.name).sort();

  assert.equal(hand.deckKey, 'deck:breya');
  assert.equal(hand.hand.length, 2);
  assert.deepEqual(names, ['A', 'A', 'B']);
});

test('renderDeckSampleHandPanel: renders a prompt until the hand matches the active deck', () => {
  const win = new Window();
  const handEl = win.document.createElement('div');

  renderDeckSampleHandPanel({
    handEl,
    deck: { type: 'deck', name: 'breya' },
    sampleHand: { deckKey: 'deck:other', hand: [entry('A')] },
  });

  assert.match(handEl.textContent, /draw a hand/);
});

test('renderDeckSampleHandPanel: renders drawn cards as single-copy deck cards', () => {
  const win = new Window();
  const handEl = win.document.createElement('div');

  renderDeckSampleHandPanel({
    handEl,
    deck: { type: 'deck', name: 'breya' },
    sampleHand: { deckKey: 'deck:breya', hand: [entry('A', { qty: 4 }), entry('B', { qty: 2 })] },
    renderCard: (card, isLast) => `<span data-qty="${card.qty}" data-last="${isLast ? 'yes' : 'no'}">${card.name}</span>`,
  });

  const cards = handEl.querySelectorAll('span');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].dataset.qty, '1');
  assert.equal(cards[0].dataset.last, 'no');
  assert.equal(cards[1].dataset.qty, '1');
  assert.equal(cards[1].dataset.last, 'yes');
});
