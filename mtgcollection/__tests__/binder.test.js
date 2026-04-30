import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateForBinder, sortForBinder, BINDER_SIZES, binderSlotCount } from '../binder.js';

const card = (name, opts = {}) => ({
  name,
  resolvedName: name,
  setCode: opts.setCode || 'fin',
  cn: opts.cn || '1',
  qty: opts.qty ?? 1,
});

test('paginateForBinder: 12 cards into 4x3 yields one full page', () => {
  const cards = Array.from({ length: 12 }, (_, i) => card('Card ' + i));
  const pages = paginateForBinder(cards, 12);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 12);
  assert.ok(pages[0].every(c => c !== null));
});

test('paginateForBinder: 13 cards into 4x3 yields two pages, second padded with 11 nulls', () => {
  const cards = Array.from({ length: 13 }, (_, i) => card('Card ' + i));
  const pages = paginateForBinder(cards, 12);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 12);
  assert.equal(pages[1].length, 12);
  assert.equal(pages[1][0].name, 'Card 12');
  for (let i = 1; i < 12; i++) assert.equal(pages[1][i], null);
});

test('paginateForBinder: 9 cards into 3x3 yields one full page', () => {
  const cards = Array.from({ length: 9 }, (_, i) => card('Card ' + i));
  const pages = paginateForBinder(cards, 9);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 9);
  assert.ok(pages[0].every(c => c !== null));
});

test('paginateForBinder: empty input returns a single empty page array', () => {
  assert.deepEqual(paginateForBinder([], 12), [[]]);
});

test('paginateForBinder: qty>1 still gives one slot (entry passes through unchanged)', () => {
  const cards = [card('Sol Ring', { qty: 4 }), card('Lightning Bolt', { qty: 2 })];
  const pages = paginateForBinder(cards, 4);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 4);
  assert.equal(pages[0][0].name, 'Sol Ring');
  assert.equal(pages[0][0].qty, 4);
  assert.equal(pages[0][1].name, 'Lightning Bolt');
  assert.equal(pages[0][1].qty, 2);
  assert.equal(pages[0][2], null);
  assert.equal(pages[0][3], null);
});

test('paginateForBinder: 5 cards into 2x2 yields two pages with last padded', () => {
  const cards = Array.from({ length: 5 }, (_, i) => card('Card ' + i));
  const pages = paginateForBinder(cards, 4);
  assert.equal(pages.length, 2);
  assert.equal(pages[1][0].name, 'Card 4');
  assert.equal(pages[1][1], null);
  assert.equal(pages[1][2], null);
  assert.equal(pages[1][3], null);
});

test('paginateForBinder: invalid slotsPerPage throws', () => {
  assert.throws(() => paginateForBinder([], 0));
  assert.throws(() => paginateForBinder([], -1));
  assert.throws(() => paginateForBinder([], 1.5));
});

test('sortForBinder: sorts by name, then setCode, then cn numerically', () => {
  const cards = [
    card('Sol Ring', { setCode: 'cmr', cn: '12' }),
    card('Lightning Bolt', { setCode: 'lea', cn: '161' }),
    card('Sol Ring', { setCode: 'c14', cn: '5' }),
    card('Lightning Bolt', { setCode: 'lea', cn: '99' }),
  ];
  const sorted = sortForBinder(cards);
  assert.equal(sorted[0].name, 'Lightning Bolt');
  assert.equal(sorted[0].cn, '99');
  assert.equal(sorted[1].name, 'Lightning Bolt');
  assert.equal(sorted[1].cn, '161');
  assert.equal(sorted[2].name, 'Sol Ring');
  assert.equal(sorted[2].setCode, 'c14');
  assert.equal(sorted[3].name, 'Sol Ring');
  assert.equal(sorted[3].setCode, 'cmr');
});

test('binderSlotCount: returns slots for known sizes, falls back to 4x3', () => {
  assert.equal(binderSlotCount('4x3'), 12);
  assert.equal(binderSlotCount('3x3'), 9);
  assert.equal(binderSlotCount('2x2'), 4);
  assert.equal(binderSlotCount('bogus'), 12);
});
