import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeSearch, matchSearch, passesMultiselectFilters } from '../search.js';

// ---- tokenizeSearch ----

test('tokenize: bare term becomes a name token', () => {
  const tokens = tokenizeSearch('sol');
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0], { field: 'name', op: ':', value: 'sol', neg: false });
});

test('tokenize: field:value with colon', () => {
  assert.deepEqual(tokenizeSearch('t:artifact'), [
    { field: 'type', op: ':', value: 'artifact', neg: false },
  ]);
  assert.deepEqual(tokenizeSearch('set:fin'), [
    { field: 'set', op: ':', value: 'fin', neg: false },
  ]);
  assert.deepEqual(tokenizeSearch('loc:breya'), [
    { field: 'loc', op: ':', value: 'breya', neg: false },
  ]);
});

test('tokenize: numeric ops on cmc/qty', () => {
  assert.deepEqual(tokenizeSearch('cmc<=2'), [
    { field: 'cmc', op: '<=', value: '2', neg: false },
  ]);
  assert.deepEqual(tokenizeSearch('qty>=4'), [
    { field: 'qty', op: '>=', value: '4', neg: false },
  ]);
  assert.deepEqual(tokenizeSearch('cmc=0'), [
    { field: 'cmc', op: '=', value: '0', neg: false },
  ]);
  assert.deepEqual(tokenizeSearch('cmc>5'), [
    { field: 'cmc', op: '>', value: '5', neg: false },
  ]);
});

test('tokenize: quoted value preserves spaces', () => {
  assert.deepEqual(tokenizeSearch('o:"flying creature"'), [
    { field: 'oracle', op: ':', value: 'flying creature', neg: false },
  ]);
});

test('tokenize: negation prefix', () => {
  assert.deepEqual(tokenizeSearch('-t:land'), [
    { field: 'type', op: ':', value: 'land', neg: true },
  ]);
});

test('tokenize: multi-token query', () => {
  const tokens = tokenizeSearch('sol t:artifact cmc<=2');
  assert.equal(tokens.length, 3);
  assert.deepEqual(tokens[0], { field: 'name', op: ':', value: 'sol', neg: false });
  assert.deepEqual(tokens[1], { field: 'type', op: ':', value: 'artifact', neg: false });
  assert.deepEqual(tokens[2], { field: 'cmc', op: '<=', value: '2', neg: false });
});

test('tokenize: rarity short form r:m maps via RARITY_SHORT downstream', () => {
  // tokenizer keeps the raw value 'm'; matcher resolves it via RARITY_SHORT
  assert.deepEqual(tokenizeSearch('r:m'), [
    { field: 'rarity', op: ':', value: 'm', neg: false },
  ]);
});

test('tokenize: empty and whitespace-only queries return []', () => {
  assert.deepEqual(tokenizeSearch(''), []);
  assert.deepEqual(tokenizeSearch('   '), []);
  assert.deepEqual(tokenizeSearch('\t\n '), []);
});

// ---- matchSearch ----

const FIXTURES = {
  solRing: {
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    typeLine: 'Artifact',
    colors: [],
    colorIdentity: [],
    cmc: 1,
    oracleText: 'Tap: Add CC.',
    rarity: 'uncommon',
    setCode: 'cmm',
    finish: 'normal',
    qty: 1,
    condition: 'near_mint',
    language: 'en',
    location: 'Breya Deck',
  },
  bolt: {
    name: 'Lightning Bolt',
    resolvedName: 'Lightning Bolt',
    typeLine: 'Instant',
    colors: ['R'],
    colorIdentity: ['R'],
    cmc: 1,
    oracleText: 'Lightning Bolt deals 3 damage to any target.',
    rarity: 'common',
    setCode: 'clb',
    finish: 'normal',
    qty: 4,
    condition: 'lightly_played',
    language: 'en',
    location: 'binder',
  },
  ragavan: {
    name: 'Ragavan, Nimble Pilferer',
    resolvedName: 'Ragavan, Nimble Pilferer',
    typeLine: 'Legendary Creature - Monkey Pirate',
    colors: ['R'],
    colorIdentity: ['R'],
    cmc: 1,
    oracleText: 'Whenever Ragavan deals combat damage...',
    rarity: 'mythic',
    setCode: 'mh2',
    finish: 'foil',
    qty: 1,
    condition: 'near_mint',
    language: 'en',
    location: '',
  },
  breya: {
    name: 'Breya, Etherium Shaper',
    resolvedName: 'Breya, Etherium Shaper',
    typeLine: 'Legendary Creature - Human Artificer',
    colors: ['W', 'U', 'B', 'R'],
    colorIdentity: ['W', 'U', 'B', 'R'],
    cmc: 4,
    oracleText: 'When Breya enters, create two 1/1 colorless Thopter artifact creature tokens with flying.',
    rarity: 'mythic',
    setCode: 'c16',
    finish: 'foil',
    qty: 1,
    condition: 'near_mint',
    language: 'en',
    location: 'breya deck',
  },
};

test('match: empty token list matches everything', () => {
  assert.equal(matchSearch(FIXTURES.solRing, []), true);
  assert.equal(matchSearch(FIXTURES.bolt, []), true);
});

test('match: name token does substring match', () => {
  const tokens = tokenizeSearch('sol');
  assert.equal(matchSearch(FIXTURES.solRing, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false);
});

test('match: type token', () => {
  const tokens = tokenizeSearch('t:artifact');
  assert.equal(matchSearch(FIXTURES.solRing, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false);
  assert.equal(matchSearch(FIXTURES.breya, tokens), false); // "Artificer" does NOT contain "artifact"

  const creature = tokenizeSearch('t:creature');
  assert.equal(matchSearch(FIXTURES.breya, creature), true);
  assert.equal(matchSearch(FIXTURES.solRing, creature), false);
});

test('match: single color token', () => {
  const tokens = tokenizeSearch('c:r');
  assert.equal(matchSearch(FIXTURES.bolt, tokens), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokens), false); // no colors
});

test('match: multi-color token requires all', () => {
  const tokens = tokenizeSearch('c:wubr');
  assert.equal(matchSearch(FIXTURES.breya, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false);
});

test('match: colorless via c:c matches empty colors', () => {
  const tokens = tokenizeSearch('c:c');
  assert.equal(matchSearch(FIXTURES.solRing, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false);
});

test('match: color identity (ci)', () => {
  const tokens = tokenizeSearch('ci:wubr');
  assert.equal(matchSearch(FIXTURES.breya, tokens), true);
  assert.equal(matchSearch(FIXTURES.ragavan, tokens), false);
});

test('match: cmc compare ops', () => {
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('cmc<=2')), true);
  assert.equal(matchSearch(FIXTURES.breya, tokenizeSearch('cmc<=2')), false);
  assert.equal(matchSearch(FIXTURES.breya, tokenizeSearch('cmc>=4')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('cmc=1')), true);
  assert.equal(matchSearch(FIXTURES.breya, tokenizeSearch('cmc>3')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('cmc>3')), false);
});

test('match: oracle text substring', () => {
  assert.equal(matchSearch(FIXTURES.breya, tokenizeSearch('o:flying')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('o:flying')), false);
});

test('match: oracle text quoted multi-word', () => {
  assert.equal(matchSearch(FIXTURES.breya, tokenizeSearch('o:"thopter artifact"')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('o:"thopter artifact"')), false);
});

test('match: rarity short form r:m -> mythic', () => {
  const tokens = tokenizeSearch('r:m');
  assert.equal(matchSearch(FIXTURES.ragavan, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false);
});

test('match: rarity full word r:common', () => {
  const tokens = tokenizeSearch('r:common');
  assert.equal(matchSearch(FIXTURES.bolt, tokens), true);
  assert.equal(matchSearch(FIXTURES.ragavan, tokens), false);
});

test('match: set token (case-insensitive)', () => {
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('set:cmm')), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('set:CMM')), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('set:mh2')), false);
});

test('match: finish token', () => {
  assert.equal(matchSearch(FIXTURES.ragavan, tokenizeSearch('f:foil')), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('f:foil')), false);
});

test('match: qty compare', () => {
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('qty>=4')), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('qty>=4')), false);
});

test('match: language', () => {
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('lang:en')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('lang:ja')), false);
});

test('match: condition substring with snake/space normalization', () => {
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('cond:lightly')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('cond:lightly_played')), true);
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('cond:lightly')), false);
});

test('match: location uses normalizeLocation', () => {
  assert.equal(matchSearch(FIXTURES.solRing, tokenizeSearch('loc:breya')), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokenizeSearch('loc:breya')), false);
});

test('match: negation excludes matches', () => {
  const tokens = tokenizeSearch('-t:land');
  assert.equal(matchSearch(FIXTURES.solRing, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), true);

  const negArtifact = tokenizeSearch('-t:artifact');
  assert.equal(matchSearch(FIXTURES.solRing, negArtifact), false);
  assert.equal(matchSearch(FIXTURES.bolt, negArtifact), true);
});

test('match: multi-clause AND', () => {
  const tokens = tokenizeSearch('t:creature c:r cmc<=1');
  assert.equal(matchSearch(FIXTURES.ragavan, tokens), true);
  assert.equal(matchSearch(FIXTURES.bolt, tokens), false); // not a creature
  assert.equal(matchSearch(FIXTURES.breya, tokens), false); // cmc=4
});

// ---- tag: tokenizer ----

test('tokenize: tag:foo single token', () => {
  assert.deepEqual(tokenizeSearch('tag:foo'), [
    { field: 'tag', op: ':', value: 'foo', neg: false },
  ]);
});

test('tokenize: tag:"edh staple" preserves quoted spaces', () => {
  assert.deepEqual(tokenizeSearch('tag:"edh staple"'), [
    { field: 'tag', op: ':', value: 'edh staple', neg: false },
  ]);
});

test('tokenize: -tag:foo negation', () => {
  assert.deepEqual(tokenizeSearch('-tag:foo'), [
    { field: 'tag', op: ':', value: 'foo', neg: true },
  ]);
});

test('tokenize: tags:foo aliases to tag', () => {
  assert.deepEqual(tokenizeSearch('tags:foo'), [
    { field: 'tag', op: ':', value: 'foo', neg: false },
  ]);
});

// ---- tag: matcher ----

const TAG_FIXTURES = {
  edhStaple: { name: 'A', resolvedName: 'A', tags: ['edh staple'] },
  edhAndTrade: { name: 'B', resolvedName: 'B', tags: ['edh staple', 'trade pile'] },
  tradeOnly: { name: 'C', resolvedName: 'C', tags: ['trade pile'] },
  empty: { name: 'D', resolvedName: 'D', tags: [] },
  noTagsField: { name: 'E', resolvedName: 'E' },
  upper: { name: 'F', resolvedName: 'F', tags: ['EDH Staple'] },
};

test('match: tag exact match', () => {
  const tokens = tokenizeSearch('tag:"edh staple"');
  assert.equal(matchSearch(TAG_FIXTURES.edhStaple, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.tradeOnly, tokens), false);
});

test('match: tag substring match (edh matches "edh staple")', () => {
  const tokens = tokenizeSearch('tag:edh');
  assert.equal(matchSearch(TAG_FIXTURES.edhStaple, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.edhAndTrade, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.tradeOnly, tokens), false);
});

test('match: tag is case-insensitive', () => {
  assert.equal(matchSearch(TAG_FIXTURES.upper, tokenizeSearch('tag:edh')), true);
  assert.equal(matchSearch(TAG_FIXTURES.upper, tokenizeSearch('tag:EDH')), true);
  assert.equal(matchSearch(TAG_FIXTURES.edhStaple, tokenizeSearch('tag:STAPLE')), true);
});

test('match: card with empty tags array does not match tag:', () => {
  assert.equal(matchSearch(TAG_FIXTURES.empty, tokenizeSearch('tag:edh')), false);
});

test('match: card with undefined tags is defensive (no throw, no match)', () => {
  assert.equal(matchSearch(TAG_FIXTURES.noTagsField, tokenizeSearch('tag:edh')), false);
});

test('match: -tag:foo excludes cards with that tag, includes those without', () => {
  const tokens = tokenizeSearch('-tag:edh');
  assert.equal(matchSearch(TAG_FIXTURES.edhStaple, tokens), false);
  assert.equal(matchSearch(TAG_FIXTURES.edhAndTrade, tokens), false);
  assert.equal(matchSearch(TAG_FIXTURES.tradeOnly, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.empty, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.noTagsField, tokens), true);
});

test('match: multi-clause AND requires both tag substrings present', () => {
  const tokens = tokenizeSearch('tag:edh tag:trade');
  assert.equal(matchSearch(TAG_FIXTURES.edhAndTrade, tokens), true);
  assert.equal(matchSearch(TAG_FIXTURES.edhStaple, tokens), false);
  assert.equal(matchSearch(TAG_FIXTURES.tradeOnly, tokens), false);
});

// ---- passesMultiselectFilters ----

test('multiselect: empty filters pass everything', () => {
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, {}), true);
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, { sets: [], rarities: [], finishes: [], locations: [], tags: [] }), true);
});

test('multiselect: single-rarity filter selects matches', () => {
  const args = { rarities: ['mythic'] };
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.breya, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), false);
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, args), false);
});

test('multiselect: multi-rarity filter is OR within the field', () => {
  const args = { rarities: ['common', 'mythic'] };
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, args), true); // common
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), true); // mythic
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), false); // uncommon
});

test('multiselect: multi-set filter is OR within the field', () => {
  const args = { sets: ['cmm', 'clb'] };
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), false); // mh2
});

test('multiselect: combining rarities and finishes is AND across fields', () => {
  // Want: mythic AND foil
  const args = { rarities: ['mythic'], finishes: ['foil'] };
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), true); // mythic + foil
  assert.equal(passesMultiselectFilters(FIXTURES.breya, args), true);   // mythic + foil
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, args), false);   // common + normal
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), false); // uncommon + normal
});

test('multiselect: location filter uses normalized exact match', () => {
  // FIXTURES.solRing.location is "Breya Deck" (normalized to "breya deck")
  const args = { locations: ['breya deck'] };
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.breya, args), true); // already lowercase
  assert.equal(passesMultiselectFilters(FIXTURES.bolt, args), false); // 'binder'
});

test('multiselect: tags filter is OR — card passes if any of its tags is selected', () => {
  const card = { tags: ['edh', 'commander'] };
  assert.equal(passesMultiselectFilters(card, { tags: ['edh'] }), true);
  assert.equal(passesMultiselectFilters(card, { tags: ['commander', 'trade'] }), true);
  assert.equal(passesMultiselectFilters(card, { tags: ['trade', 'modern'] }), false);
  // Card with no tags should fail when tag filter is non-empty
  assert.equal(passesMultiselectFilters({ tags: [] }, { tags: ['edh'] }), false);
  assert.equal(passesMultiselectFilters({}, { tags: ['edh'] }), false);
});

test('multiselect: finish filter handles missing/empty finish', () => {
  const args = { finishes: ['foil'] };
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), true);
  assert.equal(passesMultiselectFilters(FIXTURES.solRing, args), false);
  // Card with undefined finish never matches a non-empty finish filter
  assert.equal(passesMultiselectFilters({}, args), false);
});

test('multiselect: every selection unmatched -> card fails', () => {
  const args = { sets: ['xxx'], rarities: ['mythic'] };
  assert.equal(passesMultiselectFilters(FIXTURES.ragavan, args), false); // mythic but wrong set
});
