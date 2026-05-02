import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeckExport,
  buildDeckExportSections,
  defaultDeckExportOptions,
  formatDeckTextLine,
} from '../deckExport.js';

const card = (name, opts = {}) => ({
  name,
  resolvedName: opts.resolvedName || name,
  qty: opts.qty ?? 1,
  deckBoard: opts.deckBoard || 'main',
  setCode: opts.setCode ?? 'cmm',
  cn: opts.cn ?? '1',
  finish: opts.finish ?? 'normal',
  scryfallId: opts.scryfallId || name.toLowerCase().replaceAll(' ', '-'),
  typeLine: opts.typeLine || 'Instant',
});

const SAMPLE = [
  card('Breya, Etherium Shaper', { qty: 1, setCode: 'c16', cn: '29', typeLine: 'Legendary Creature' }),
  card('Sol Ring', { qty: 1, setCode: 'cmm', cn: '410' }),
  card('Sol Ring', { qty: 2, setCode: 'ltc', cn: '300', finish: 'foil' }),
  card('Swords to Plowshares', { qty: 1, deckBoard: 'sideboard', setCode: 'sta', cn: '10' }),
  card('Counterspell', { qty: 1, deckBoard: 'maybe', setCode: 'mh2', cn: '267', finish: 'etched' }),
];

test('defaultDeckExportOptions: V1 preset board defaults', () => {
  assert.deepEqual(defaultDeckExportOptions('plain').boards, ['main', 'sideboard']);
  assert.deepEqual(defaultDeckExportOptions('moxfield').boards, ['main', 'sideboard', 'maybe']);
  assert.deepEqual(defaultDeckExportOptions('arena').boards, ['main', 'sideboard']);
  assert.deepEqual(defaultDeckExportOptions('mtgo').boards, ['main', 'sideboard']);
  assert.deepEqual(defaultDeckExportOptions('csv').boards, ['main', 'sideboard', 'maybe']);
  assert.deepEqual(defaultDeckExportOptions('json').boards, ['main', 'sideboard', 'maybe']);
});

test('plain: clipboard text with commander, mainboard, sideboard, no maybeboard or printings', () => {
  const result = buildDeckExport(SAMPLE, { title: 'Breya Shelf', commander: 'Breya, Etherium Shaper' }, { preset: 'plain' });
  assert.equal(result.mime, 'text/plain');
  assert.equal(result.filename, 'breya-shelf-plain.txt');
  assert.equal(result.body, [
    'Commander',
    '1 Breya, Etherium Shaper',
    '',
    'Mainboard',
    '3 Sol Ring',
    '',
    'Sideboard',
    '1 Swords to Plowshares',
  ].join('\n'));
  assert.doesNotMatch(result.body, /Counterspell/);
  assert.doesNotMatch(result.body, /\(|\*F\*|undefined/);
});

test('moxfield: includes all boards, split printings, set/cn, foil and etched markers', () => {
  const result = buildDeckExport(SAMPLE, { commander: 'Breya, Etherium Shaper' }, { preset: 'moxfield' });
  assert.equal(result.body, [
    'Commander',
    '1 Breya, Etherium Shaper (C16) 29',
    '',
    'Mainboard',
    '1 Sol Ring (CMM) 410',
    '2 Sol Ring (LTC) 300 *F*',
    '',
    'Sideboard',
    '1 Swords to Plowshares (STA) 10',
    '',
    'Maybeboard',
    '1 Counterspell (MH2) 267 *E*',
  ].join('\n'));
});

test('arena: Deck and Sideboard sections, no maybeboard, printings, or finish markers', () => {
  const result = buildDeckExport(SAMPLE, { commander: 'Breya, Etherium Shaper' }, { preset: 'arena' });
  assert.equal(result.body, [
    'Commander',
    '1 Breya, Etherium Shaper',
    '',
    'Deck',
    '3 Sol Ring',
    '',
    'Sideboard',
    '1 Swords to Plowshares',
  ].join('\n'));
  assert.doesNotMatch(result.body, /Counterspell|\(|\*F\*/);
});

test('mtgo: main lines plus SB-prefixed sideboard lines and no maybeboard', () => {
  const result = buildDeckExport(SAMPLE, { commander: 'Breya, Etherium Shaper' }, { preset: 'mtgo' });
  assert.equal(result.body, [
    'Commander',
    '1 Breya, Etherium Shaper',
    '',
    '3 Sol Ring',
    'SB: 1 Swords to Plowshares',
  ].join('\n'));
  assert.doesNotMatch(result.body, /Counterspell/);
});

test('csv: app-native rows include all boards and preserve printings/finish', () => {
  const result = buildDeckExport(SAMPLE, { commander: 'Breya, Etherium Shaper' }, { preset: 'csv' });
  assert.equal(result.mime, 'text/csv');
  assert.equal(result.filename, 'deck.csv');
  assert.equal(result.body, [
    'board,quantity,name,setCode,cn,finish',
    'commander,1,"Breya, Etherium Shaper",c16,29,normal',
    'main,1,Sol Ring,cmm,410,normal',
    'main,2,Sol Ring,ltc,300,foil',
    'sideboard,1,Swords to Plowshares,sta,10,normal',
    'maybe,1,Counterspell,mh2,267,etched',
  ].join('\n'));
});

test('json: app-native payload includes metadata, all boards, warnings, and full card data', () => {
  const result = buildDeckExport(SAMPLE, { title: 'Breya', commander: 'Breya, Etherium Shaper' }, { preset: 'json' });
  assert.equal(result.mime, 'application/json');
  const parsed = JSON.parse(result.body);
  assert.equal(parsed.metadata.title, 'Breya');
  assert.equal(parsed.boards.commander[0].card.setCode, 'c16');
  assert.equal(parsed.boards.main.length, 2);
  assert.equal(parsed.boards.maybe[0].card.finish, 'etched');
  assert.deepEqual(parsed.warnings, []);
  assert.equal(result.output.boards.sideboard[0].name, 'Swords to Plowshares');
});

test('commander metadata: exact mainboard match decrements only export sections', () => {
  const list = [card('Atraxa, Praetors Voice', { qty: 2 }), card('Forest', { qty: 4 })];
  const { sections } = buildDeckExportSections(list, { commander: 'Atraxa, Praetors Voice' }, { preset: 'plain' });
  assert.equal(sections.commander[0].qty, 1);
  assert.equal(sections.main.find(entry => entry.name === 'Atraxa, Praetors Voice').qty, 1);
  assert.equal(list[0].qty, 2);
});

test('commander metadata: missing exact match exports name-only and warns', () => {
  const result = buildDeckExport([card('Forest', { qty: 4 })], { commander: 'The Ur-Dragon' }, { preset: 'plain' });
  assert.match(result.body, /^Commander\n1 The Ur-Dragon\n\nMainboard\n4 Forest$/);
  assert.deepEqual(result.warnings, ['commander "The Ur-Dragon" was not found in the mainboard; exported as name-only.']);
});

test('partner metadata: exports a second commander slot and decrements mainboard', () => {
  const result = buildDeckExport([
    card('Tymna the Weaver'),
    card('Thrasios, Triton Hero'),
    card('Island', { qty: 2 }),
  ], { commander: 'Tymna the Weaver', partner: 'Thrasios, Triton Hero' }, { preset: 'plain' });
  assert.equal(result.body, [
    'Commander',
    '1 Tymna the Weaver',
    '1 Thrasios, Triton Hero',
    '',
    'Mainboard',
    '2 Island',
  ].join('\n'));
});

test('plain/arena/mtgo collapse multiple printings by name, moxfield/csv/json keep them split', () => {
  const list = [
    card('Lightning Bolt', { qty: 1, setCode: 'clu', cn: '141' }),
    card('Lightning Bolt', { qty: 3, setCode: 'sta', cn: '42', finish: 'foil' }),
  ];
  assert.match(buildDeckExport(list, {}, { preset: 'plain' }).body, /4 Lightning Bolt/);
  assert.match(buildDeckExport(list, {}, { preset: 'arena' }).body, /4 Lightning Bolt/);
  assert.match(buildDeckExport(list, {}, { preset: 'mtgo' }).body, /4 Lightning Bolt/);
  assert.match(buildDeckExport(list, {}, { preset: 'moxfield' }).body, /1 Lightning Bolt \(CLU\) 141\n3 Lightning Bolt \(STA\) 42 \*F\*/);
  assert.match(buildDeckExport(list, {}, { preset: 'csv' }).body, /main,1,Lightning Bolt,clu,141,normal\nmain,3,Lightning Bolt,sta,42,foil/);
  assert.equal(buildDeckExport(list, {}, { preset: 'json' }).output.boards.main.length, 2);
});

test('formatDeckTextLine: missing set/cn never prints dangling punctuation or undefined', () => {
  assert.equal(formatDeckTextLine(card('Mystery Card', { setCode: '', cn: '', finish: 'foil' }), { preset: 'moxfield' }), '1 Mystery Card *F*');
  assert.equal(formatDeckTextLine(card('No Number', { setCode: 'abc', cn: '' }), { preset: 'moxfield' }), '1 No Number');
  assert.equal(formatDeckTextLine(card('No Set', { setCode: '', cn: '7' }), { preset: 'moxfield' }), '1 No Set');
  assert.doesNotMatch(formatDeckTextLine({ name: 'Bare', qty: 1 }, { preset: 'moxfield' }), /\(\)|undefined/);
});

test('custom board selection can include maybeboard for plain exports', () => {
  const result = buildDeckExport(SAMPLE, {}, { preset: 'plain', boards: ['main', 'maybe'], includeCommander: false });
  assert.equal(result.body, [
    'Mainboard',
    '1 Breya, Etherium Shaper',
    '3 Sol Ring',
    '',
    'Maybeboard',
    '1 Counterspell',
  ].join('\n'));
  assert.doesNotMatch(result.body, /Sideboard/);
  assert.equal(result.output.maybe[0].name, 'Counterspell');
});
