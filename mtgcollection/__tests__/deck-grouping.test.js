import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupByType,
  groupByCmc,
  groupByColor,
  groupByRarity,
  groupDeck,
} from '../stats.js';

const card = (name, opts = {}) => ({
  name,
  resolvedName: name,
  typeLine: opts.typeLine || '',
  cmc: opts.cmc,
  colorIdentity: opts.colorIdentity,
  rarity: opts.rarity,
  qty: opts.qty || 1,
});

// ---- groupByType ----

test('groupByType: separates creatures from lands', () => {
  const list = [
    card('Forest', { typeLine: 'Basic Land — Forest' }),
    card('Goblin', { typeLine: 'Creature — Goblin', cmc: 1 }),
  ];
  const groups = groupByType(list);
  const labels = groups.map(g => g.label);
  assert.deepEqual(labels, ['creatures', 'lands']);
  assert.equal(groups[0].cards[0].name, 'Goblin');
  assert.equal(groups[1].cards[0].name, 'Forest');
});

test('groupByType: type line "Artifact Creature" goes to creatures (creature wins)', () => {
  const list = [
    card('Steel Hellkite', { typeLine: 'Artifact Creature — Dragon', cmc: 5 }),
    card('Sol Ring', { typeLine: 'Artifact', cmc: 1 }),
  ];
  const groups = groupByType(list);
  const labels = groups.map(g => g.label);
  assert.deepEqual(labels, ['creatures', 'artifacts']);
  assert.equal(groups[0].cards[0].name, 'Steel Hellkite');
  assert.equal(groups[1].cards[0].name, 'Sol Ring');
});

test('groupByType: prescribed display order', () => {
  const list = [
    card('Plains', { typeLine: 'Basic Land — Plains' }),
    card('Bolt', { typeLine: 'Instant', cmc: 1 }),
    card('Dragon', { typeLine: 'Creature — Dragon', cmc: 6 }),
    card('Wrath', { typeLine: 'Sorcery', cmc: 4 }),
    card('Sol Ring', { typeLine: 'Artifact', cmc: 1 }),
    card('Glade', { typeLine: 'Enchantment', cmc: 3 }),
    card('Jace', { typeLine: 'Legendary Planeswalker — Jace', cmc: 4 }),
    card('Invasion', { typeLine: 'Battle — Siege', cmc: 5 }),
  ];
  const labels = groupByType(list).map(g => g.label);
  assert.deepEqual(labels, [
    'creatures', 'instants', 'sorceries', 'artifacts',
    'enchantments', 'planeswalkers', 'battles', 'lands',
  ]);
});

test('groupByType: empty groups omitted', () => {
  const list = [card('Bolt', { typeLine: 'Instant', cmc: 1 })];
  const groups = groupByType(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'instants');
});

test('groupByType: unrecognized type goes to other', () => {
  const list = [card('Mystery', { typeLine: 'Conspiracy' })];
  const groups = groupByType(list);
  assert.equal(groups[0].label, 'other');
});

test('groupByType: sorts cards by cmc then name within group', () => {
  const list = [
    card('Cinder Glade', { typeLine: 'Land' }),
    card('Forest', { typeLine: 'Basic Land — Forest' }),
    card('Mountain', { typeLine: 'Basic Land — Mountain' }),
  ];
  const groups = groupByType(list);
  const names = groups[0].cards.map(c => c.name);
  assert.deepEqual(names, ['Cinder Glade', 'Forest', 'Mountain']);
});

// ---- groupByCmc ----

test('groupByCmc: buckets 0..7+ with lands separated', () => {
  const list = [
    card('Bolt', { typeLine: 'Instant', cmc: 1 }),
    card('Forest', { typeLine: 'Basic Land — Forest' }),
    card('Big', { typeLine: 'Creature', cmc: 9 }),
    card('Bear', { typeLine: 'Creature', cmc: 2 }),
  ];
  const groups = groupByCmc(list);
  const labels = groups.map(g => g.label);
  assert.deepEqual(labels, ['1', '2', '7+', 'lands']);
  assert.equal(groups[2].cards[0].name, 'Big');
});

test('groupByCmc: cmc 7 and cmc 12 both go to 7+', () => {
  const list = [
    card('Seven', { typeLine: 'Creature', cmc: 7 }),
    card('Twelve', { typeLine: 'Creature', cmc: 12 }),
  ];
  const groups = groupByCmc(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '7+');
  assert.equal(groups[0].cards.length, 2);
});

test('groupByCmc: cmc 0 forms its own bucket', () => {
  const list = [card('MoxJet', { typeLine: 'Artifact', cmc: 0 })];
  const groups = groupByCmc(list);
  assert.equal(groups[0].label, '0');
});

test('groupByCmc: missing cmc lands in bucket 0', () => {
  const list = [card('NoCmc', { typeLine: 'Creature' })];
  const groups = groupByCmc(list);
  assert.equal(groups[0].label, '0');
});

test('groupByCmc: lands always in lands column regardless of cmc', () => {
  const list = [
    card('Maze of Ith', { typeLine: 'Land', cmc: 0 }),
    card('Bolt', { typeLine: 'Instant', cmc: 1 }),
  ];
  const groups = groupByCmc(list);
  const labels = groups.map(g => g.label);
  assert.deepEqual(labels, ['1', 'lands']);
});

// ---- groupByColor ----

test('groupByColor: empty colorIdentity → Colorless', () => {
  const list = [card('Sol Ring', { typeLine: 'Artifact', cmc: 1, colorIdentity: [] })];
  const groups = groupByColor(list);
  assert.equal(groups[0].label, 'colorless');
});

test('groupByColor: undefined colorIdentity → Colorless', () => {
  const list = [card('Sol Ring', { typeLine: 'Artifact', cmc: 1 })];
  const groups = groupByColor(list);
  assert.equal(groups[0].label, 'colorless');
});

test('groupByColor: multi-color → Multicolor', () => {
  const list = [card('Cmdr', { typeLine: 'Creature', cmc: 3, colorIdentity: ['W', 'U'] })];
  const groups = groupByColor(list);
  assert.equal(groups[0].label, 'multicolor');
});

test('groupByColor: single color → that color', () => {
  const list = [
    card('Bolt', { typeLine: 'Instant', cmc: 1, colorIdentity: ['R'] }),
    card('Plains', { typeLine: 'Land', colorIdentity: ['W'] }),
    card('Bayou', { typeLine: 'Land', colorIdentity: ['B', 'G'] }),
  ];
  const labels = groupByColor(list).map(g => g.label);
  assert.deepEqual(labels, ['white', 'red', 'multicolor']);
});

test('groupByColor: prescribed display order WUBRG → multi → colorless', () => {
  const list = [
    card('Z', { typeLine: 'Creature', colorIdentity: [] }),
    card('Y', { typeLine: 'Creature', colorIdentity: ['G'] }),
    card('X', { typeLine: 'Creature', colorIdentity: ['W'] }),
    card('M', { typeLine: 'Creature', colorIdentity: ['U', 'R'] }),
    card('B', { typeLine: 'Creature', colorIdentity: ['B'] }),
    card('U', { typeLine: 'Creature', colorIdentity: ['U'] }),
    card('R', { typeLine: 'Creature', colorIdentity: ['R'] }),
  ];
  const labels = groupByColor(list).map(g => g.label);
  assert.deepEqual(labels, ['white', 'blue', 'black', 'red', 'green', 'multicolor', 'colorless']);
});

// ---- groupByRarity ----

test('groupByRarity: standard 4 buckets, mythic-first sort order', () => {
  const list = [
    card('A', { rarity: 'common' }),
    card('B', { rarity: 'mythic' }),
    card('C', { rarity: 'uncommon' }),
    card('D', { rarity: 'rare' }),
  ];
  const labels = groupByRarity(list).map(g => g.label);
  assert.deepEqual(labels, ['mythic', 'rare', 'uncommon', 'common']);
});

test('groupByRarity: empty groups omitted', () => {
  const list = [card('A', { rarity: 'rare' })];
  const groups = groupByRarity(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'rare');
});

test('groupByRarity: missing rarity goes to other bucket', () => {
  const list = [
    card('Known', { rarity: 'common' }),
    card('Unknown', {}),
  ];
  const labels = groupByRarity(list).map(g => g.label);
  assert.deepEqual(labels, ['common', 'other']);
});

// ---- groupDeck dispatcher ----

test('groupDeck: default mode is type', () => {
  const list = [card('Bolt', { typeLine: 'Instant', cmc: 1 })];
  const groups = groupDeck(list);
  assert.equal(groups[0].label, 'instants');
});

test('groupDeck: dispatches to cmc/color/rarity', () => {
  const list = [card('Bolt', { typeLine: 'Instant', cmc: 1, colorIdentity: ['R'], rarity: 'common' })];
  assert.equal(groupDeck(list, 'cmc')[0].label, '1');
  assert.equal(groupDeck(list, 'color')[0].label, 'red');
  assert.equal(groupDeck(list, 'rarity')[0].label, 'common');
});

test('groupDeck: unknown mode falls back to type', () => {
  const list = [card('Bolt', { typeLine: 'Instant', cmc: 1 })];
  const groups = groupDeck(list, 'nonsense');
  assert.equal(groups[0].label, 'instants');
});

// ---- sort within group ----

test('sort: cmc ascending then alphabetical', () => {
  const list = [
    card('Zog', { typeLine: 'Creature', cmc: 3 }),
    card('Aardvark', { typeLine: 'Creature', cmc: 3 }),
    card('Mid', { typeLine: 'Creature', cmc: 2 }),
  ];
  const groups = groupByType(list);
  const names = groups[0].cards.map(c => c.name);
  assert.deepEqual(names, ['Mid', 'Aardvark', 'Zog']);
});
