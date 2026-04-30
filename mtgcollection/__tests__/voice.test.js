import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceText } from '../add.js';

const SETS = new Set(['fin', 'mh2', 'cmm', 'tmt', 'ltr', 'otj', 'p23']);

// ---- baseline / empty / unparsed ----

test('voice: empty text returns empty', () => {
  assert.equal(parseVoiceText('', SETS).kind, 'empty');
  assert.equal(parseVoiceText('   ', SETS).kind, 'empty');
});

test('voice: unparseable text returns unparsed', () => {
  assert.equal(parseVoiceText('hello world', SETS).kind, 'unparsed');
});

test('voice: plain set + cn parses with no qty/location', () => {
  const r = parseVoiceText('fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
  assert.equal(r.qty, null);
  assert.equal(r.location, null);
  assert.equal(r.foil, false);
  assert.equal(r.condition, null);
  assert.equal(r.variant, 'regular');
});

// ---- qty: digit prefix ----

test('voice qty: digit prefix "2 fin 142"', () => {
  const r = parseVoiceText('2 fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
  assert.equal(r.qty, 2);
});

test('voice qty: digit prefix preserves higher quantities', () => {
  const r = parseVoiceText('12 fin 142', SETS);
  assert.equal(r.qty, 12);
});

// ---- qty: x-suffix ----

test('voice qty: suffix "fin 142 x3"', () => {
  const r = parseVoiceText('fin 142 x3', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
  assert.equal(r.qty, 3);
});

test('voice qty: suffix with space "fin 142 x 3"', () => {
  const r = parseVoiceText('fin 142 x 3', SETS);
  assert.equal(r.qty, 3);
  assert.equal(r.cn, '142');
});

// ---- qty: word forms ----

test('voice qty: "two fin 142"', () => {
  const r = parseVoiceText('two fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.qty, 2);
});

test('voice qty: "two of fin 142"', () => {
  const r = parseVoiceText('two of fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.qty, 2);
});

test('voice qty: every word from one to ten resolves', () => {
  const expectations = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  for (const [word, n] of Object.entries(expectations)) {
    const r = parseVoiceText(`${word} fin 142`, SETS);
    assert.equal(r.qty, n, `expected qty=${n} for "${word}"`);
    assert.equal(r.set, 'fin');
    assert.equal(r.cn, '142');
  }
});

test('voice qty: defaults to null when no qty keyword', () => {
  const r = parseVoiceText('fin 142', SETS);
  assert.equal(r.qty, null);
});

// ---- location ----

test('voice location: "fin 142 in breya deck"', () => {
  const r = parseVoiceText('fin 142 in breya deck', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
  assert.equal(r.location, 'breya deck');
});

test('voice location: "fin 142 to red box" (uses "to")', () => {
  const r = parseVoiceText('fin 142 to red box', SETS);
  assert.equal(r.location, 'red box');
});

test('voice location: trims and lowercases', () => {
  const r = parseVoiceText('fin 142 in   Breya Deck  ', SETS);
  assert.equal(r.location, 'breya deck');
});

test('voice location: null when no in/to keyword', () => {
  const r = parseVoiceText('fin 142', SETS);
  assert.equal(r.location, null);
});

// ---- combined qty + location ----

test('voice combo: "two fin 142 in breya deck"', () => {
  const r = parseVoiceText('two fin 142 in breya deck', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
  assert.equal(r.qty, 2);
  assert.equal(r.location, 'breya deck');
});

test('voice combo: "fin 142 x2 in box" — qty suffix + location', () => {
  const r = parseVoiceText('fin 142 x2 in box', SETS);
  assert.equal(r.qty, 2);
  assert.equal(r.location, 'box');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
});

test('voice combo: qty + foil + condition + location', () => {
  const r = parseVoiceText('three fin 142 foil lp in trade binder', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.qty, 3);
  assert.equal(r.foil, true);
  assert.equal(r.condition, 'lightly_played');
  assert.equal(r.location, 'trade binder');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
});

// ---- existing keywords still work after refactor ----

test('voice: foil keyword still detected', () => {
  const r = parseVoiceText('fin 142 foil', SETS);
  assert.equal(r.foil, true);
});

test('voice: nm condition still detected', () => {
  const r = parseVoiceText('fin 142 nm', SETS);
  assert.equal(r.condition, 'near_mint');
});

test('voice: prerelease variant detected', () => {
  const r = parseVoiceText('fin 142 prerelease', SETS);
  assert.equal(r.variant, 'prerelease');
});

test('voice: promo variant detected', () => {
  const r = parseVoiceText('fin 142 promo', SETS);
  assert.equal(r.variant, 'promo');
});

// ---- "again" repeat keyword ----

test('voice again: bare "again" → kind=again, qty=null', () => {
  const r = parseVoiceText('again', SETS);
  assert.equal(r.kind, 'again');
  assert.equal(r.qty, null);
});

test('voice again: "again 3" → qty=3', () => {
  const r = parseVoiceText('again 3', SETS);
  assert.equal(r.kind, 'again');
  assert.equal(r.qty, 3);
});

test('voice again: "again three times" → qty=3', () => {
  const r = parseVoiceText('again three times', SETS);
  assert.equal(r.kind, 'again');
  assert.equal(r.qty, 3);
});

test('voice again: "again 5 times" → qty=5', () => {
  const r = parseVoiceText('again 5 times', SETS);
  assert.equal(r.kind, 'again');
  assert.equal(r.qty, 5);
});

test('voice again: garbage tail keeps qty null but still kind=again', () => {
  const r = parseVoiceText('again banana', SETS);
  assert.equal(r.kind, 'again');
  assert.equal(r.qty, null);
});

// ---- edge cases ----

test('voice: filler words "okay" stripped before parse', () => {
  const r = parseVoiceText('okay fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
});

test('voice: "number" token before cn is stripped', () => {
  const r = parseVoiceText('fin number 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'fin');
  assert.equal(r.cn, '142');
});

test('voice: invalid qty=0 ignored', () => {
  // "0 fin 142" — leading "0" with no word follow gets matched? Our regex requires \d{1,3} \s+ then a-z.
  // "0 fin 142" → digit prefix matches "0 ", but then we set qty=0 which fails Number.isFinite/qty>=1, becomes null.
  const r = parseVoiceText('0 fin 142', SETS);
  assert.equal(r.kind, 'card');
  assert.equal(r.qty, null);
});

test('voice: location does not greedy-eat earlier "in"-like substrings', () => {
  // "fin 142" — "fin" contains no standalone "in" (the 'in' inside "fin" has no leading word boundary)
  const r = parseVoiceText('fin 142', SETS);
  assert.equal(r.location, null);
});

test('voice: works without validSets fallback (token form set + cn)', () => {
  const r = parseVoiceText('xyz 142', new Set());
  assert.equal(r.kind, 'card');
  assert.equal(r.set, 'xyz');
  assert.equal(r.cn, '142');
});
