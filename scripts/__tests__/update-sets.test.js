const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSets } = require('../update-sets.js');

// Fixed "today" for deterministic tests. msh's release (2026-06-26) is ~69 days out.
const TODAY = new Date('2026-04-18T00:00:00Z');

// Scryfall-shaped fixtures. Only the fields the filter reads are populated.
const FIXTURES = {
  sos:  { code: 'sos',  name: 'Secrets of Strixhaven',          set_type: 'expansion',        released_at: '2026-04-24', digital: false },
  msh:  { code: 'msh',  name: 'Marvel Super Heroes',            set_type: 'expansion',        released_at: '2026-06-26', digital: false },
  tdm:  { code: 'tdm',  name: 'Tarkir: Dragonstorm',            set_type: 'expansion',        released_at: '2025-04-11', digital: false },
  ph23: { code: 'ph23', name: '2023 Heroes of the Realm',       set_type: 'expansion',        released_at: '2023-12-05', digital: false },
  big:  { code: 'big',  name: 'The Big Score',                  set_type: 'masterpiece',      released_at: '2024-04-19', digital: false, parent_set_code: 'otj' },
  m15:  { code: 'm15',  name: 'Magic 2015',                     set_type: 'core',             released_at: '2014-07-18', digital: false },
  sir:  { code: 'sir',  name: 'Shadows over Innistrad Remastered', set_type: 'masters',       released_at: '2023-03-21', digital: true },
  j25:  { code: 'j25',  name: 'Foundations Jumpstart',          set_type: 'draft_innovation', released_at: '2024-11-15', digital: false, parent_set_code: 'fdn' },
  hho:  { code: 'hho',  name: 'Happy Holidays',                 set_type: 'funny',            released_at: '2003-12-01', digital: false },
  // Far-future main release outside the 90-day upcoming window — should drop
  future: { code: 'zzz', name: 'Future Set', set_type: 'expansion', released_at: '2027-01-01', digital: false },
  // Token sub-product for upcoming msh — has parent_set_code, not in booster index
  tmsh: { code: 'tmsh', name: 'Marvel Super Heroes Tokens', set_type: 'token', released_at: '2026-06-26', digital: false, parent_set_code: 'msh' },
};

// Booster-data index matching what's shipping today. Every set listed here is treated
// as "has a config, ship it". Presence of `msh` is deliberately omitted — it's upcoming.
const BOOSTER_INDEX = {
  boosters: {
    sos: ['collector', 'play'],
    tdm: ['collector', 'play'],
    j25: ['jumpstart'],
    m15: ['draft'],
  },
};

function run(fixtures, index = BOOSTER_INDEX, today = TODAY) {
  return filterSets(fixtures, index, today);
}

function codes(result) {
  return result.map(s => s.code);
}

test('includes a play-era set with a booster-data config', () => {
  const out = run([FIXTURES.sos]);
  assert.deepEqual(codes(out), ['sos']);
});

test('includes an upcoming play-era set within 90 days even without a config', () => {
  const out = run([FIXTURES.msh]);
  assert.deepEqual(codes(out), ['msh']);
});

test('includes a released play-era set that has a booster-data config', () => {
  const out = run([FIXTURES.tdm]);
  assert.deepEqual(codes(out), ['tdm']);
});

test('drops Heroes of the Realm (ph23) — not in booster index, not a consumer product', () => {
  const out = run([FIXTURES.ph23]);
  assert.deepEqual(codes(out), []);
});

test('drops a bonus sheet with parent_set_code (big, parent=otj)', () => {
  const out = run([FIXTURES.big]);
  assert.deepEqual(codes(out), []);
});

test('includes a legacy core set present in the booster index (m15)', () => {
  const out = run([FIXTURES.m15]);
  assert.deepEqual(codes(out), ['m15']);
});

test('drops a digital-only set even if set_type is masters', () => {
  const out = run([FIXTURES.sir]);
  assert.deepEqual(codes(out), []);
});

test('includes a jumpstart sub-product with parent_set_code that is in the booster index (j25)', () => {
  const out = run([FIXTURES.j25]);
  assert.deepEqual(codes(out), ['j25']);
});

test('drops a novelty funny set (hho Happy Holidays) that is not in the booster index', () => {
  const out = run([FIXTURES.hho]);
  assert.deepEqual(codes(out), []);
});

test('drops an upcoming token sub-product (tmsh) with parent_set_code', () => {
  const out = run([FIXTURES.tmsh]);
  assert.deepEqual(codes(out), []);
});

test('drops a far-future main release outside the 90-day window', () => {
  const out = run([FIXTURES.future]);
  assert.deepEqual(codes(out), []);
});

test('legacy extras (mat, dbl) pass through even without a booster-data config', () => {
  const mat = { code: 'mat', name: 'March of the Machine: The Aftermath', set_type: 'expansion', released_at: '2023-05-12', digital: false };
  const dbl = { code: 'dbl', name: 'Innistrad: Double Feature', set_type: 'draft_innovation', released_at: '2022-01-28', digital: false };
  const out = run([mat, dbl]);
  assert.deepEqual(codes(out).sort(), ['dbl', 'mat']);
});

test('output is sorted by release date descending and reshaped to {code, name, released}', () => {
  const out = run([FIXTURES.m15, FIXTURES.msh, FIXTURES.sos]);
  assert.deepEqual(out, [
    { code: 'msh', name: 'Marvel Super Heroes',       released: '2026-06-26' },
    { code: 'sos', name: 'Secrets of Strixhaven',     released: '2026-04-24' },
    { code: 'm15', name: 'Magic 2015',                released: '2014-07-18' },
  ]);
});

test('full fixture sweep matches the expected allowlist', () => {
  const all = Object.values(FIXTURES);
  const out = codes(run(all)).sort();
  assert.deepEqual(out, ['j25', 'm15', 'msh', 'sos', 'tdm']);
});
