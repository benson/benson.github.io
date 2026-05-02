import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinish,
  normalizeCondition,
  normalizeLocation,
  normalizeLanguage,
  normalizeTag,
  normalizeTags,
  makeEntry,
  collectionKey,
  coalesceCollection,
  allCollectionTags,
  ensureContainer,
  allContainers,
  containerStats,
  renameContainer,
  deleteEmptyContainer,
  getUsdPrice,
  biggerImageUrl,
} from '../collection.js';
import { state } from '../state.js';

// ---- normalizeFinish ----

test('normalizeFinish: foil-like values map to foil', () => {
  assert.equal(normalizeFinish('foil'), 'foil');
  assert.equal(normalizeFinish('true'), 'foil');
  assert.equal(normalizeFinish('yes'), 'foil');
  assert.equal(normalizeFinish('1'), 'foil');
});

test('normalizeFinish: etched variants map to etched', () => {
  assert.equal(normalizeFinish('etched'), 'etched');
  assert.equal(normalizeFinish('etched foil'), 'etched');
});

test('normalizeFinish: normal/nonfoil/empty map to normal', () => {
  assert.equal(normalizeFinish('normal'), 'normal');
  assert.equal(normalizeFinish('nonfoil'), 'normal');
  assert.equal(normalizeFinish('non-foil'), 'normal');
  assert.equal(normalizeFinish(''), 'normal');
  assert.equal(normalizeFinish(null), 'normal');
});

test('normalizeFinish: unknown free text falls through to normal', () => {
  assert.equal(normalizeFinish('random text'), 'normal');
});

// ---- normalizeCondition ----

test('normalizeCondition: NM aliases', () => {
  assert.equal(normalizeCondition('NM'), 'near_mint');
  assert.equal(normalizeCondition('near mint'), 'near_mint');
  assert.equal(normalizeCondition('m'), 'near_mint');
  assert.equal(normalizeCondition('mint'), 'near_mint');
});

test('normalizeCondition: lp / mp / damaged / poor', () => {
  assert.equal(normalizeCondition('lp'), 'lightly_played');
  assert.equal(normalizeCondition('mp'), 'moderately_played');
  assert.equal(normalizeCondition('damaged'), 'damaged');
  assert.equal(normalizeCondition('poor'), 'damaged');
});

test('normalizeCondition: empty and null default to near_mint', () => {
  assert.equal(normalizeCondition(''), 'near_mint');
  assert.equal(normalizeCondition(null), 'near_mint');
  assert.equal(normalizeCondition(undefined), 'near_mint');
});

test('normalizeCondition: whitespace handling and snake_case preservation', () => {
  assert.equal(normalizeCondition('  NM  '), 'near_mint');
  assert.equal(normalizeCondition('lightly_played'), 'lightly_played');
  assert.equal(normalizeCondition('Heavily Played'), 'heavily_played');
});

// ---- normalizeLocation ----

test('normalizeLocation: bare name defaults to box type', () => {
  assert.deepEqual(normalizeLocation('  Breya  '), { type: 'box', name: 'breya' });
  assert.deepEqual(normalizeLocation('BINDER stuff'), { type: 'binder', name: 'stuff' });
});

test('normalizeLocation: typed prefix syntax (deck/binder/box)', () => {
  assert.deepEqual(normalizeLocation('deck breya'), { type: 'deck', name: 'breya' });
  assert.deepEqual(normalizeLocation('deck:breya'), { type: 'deck', name: 'breya' });
  assert.deepEqual(normalizeLocation('binder rares'), { type: 'binder', name: 'rares' });
  assert.deepEqual(normalizeLocation('box bulk'), { type: 'box', name: 'bulk' });
});

test('normalizeLocation: object input is validated', () => {
  assert.deepEqual(normalizeLocation({ type: 'deck', name: 'Breya' }), { type: 'deck', name: 'breya' });
  assert.deepEqual(normalizeLocation({ type: 'invalid', name: 'foo' }), { type: 'box', name: 'foo' });
});

test('normalizeLocation: null/undefined/empty become null', () => {
  assert.equal(normalizeLocation(null), null);
  assert.equal(normalizeLocation(undefined), null);
  assert.equal(normalizeLocation(''), null);
  assert.equal(normalizeLocation({ type: 'deck', name: '' }), null);
});

// ---- containers ----

test('ensureContainer: creates a persisted flat container keyed by typed location', () => {
  state.collection = [];
  state.containers = {};
  const c = ensureContainer({ type: 'deck', name: 'Breya' }, 123);
  assert.deepEqual(c, {
    type: 'deck',
    name: 'breya',
    createdAt: 123,
    updatedAt: 123,
    deck: { title: 'breya', description: '', format: '', commander: '', partner: '', companion: '' },
  });
  assert.deepEqual(Object.keys(state.containers), ['deck:breya']);
  state.containers = {};
});

test('allContainers: derives missing containers from collection locations', () => {
  state.collection = [
    { location: { type: 'binder', name: 'rares' }, qty: 2 },
    { location: 'deck breya', qty: 1 },
  ];
  state.containers = {};
  assert.deepEqual(allContainers().map(c => c.type + ':' + c.name), ['binder:rares', 'deck:breya']);
  state.collection = [];
  state.containers = {};
});

test('containerStats: counts unique, total, and value for a container', () => {
  state.collection = [
    { location: 'box bulk', qty: 2, price: 1.5 },
    { location: 'box bulk', qty: 3, price: 2 },
    { location: 'box other', qty: 1, price: 100 },
  ];
  assert.deepEqual(containerStats({ type: 'box', name: 'bulk' }), { unique: 2, total: 5, value: 9 });
  state.collection = [];
});

test('renameContainer: updates registry and card locations', () => {
  state.collection = [{ location: { type: 'deck', name: 'breya' }, qty: 1 }];
  state.containers = {};
  ensureContainer({ type: 'deck', name: 'breya' }, 123);
  assert.equal(renameContainer({ type: 'deck', name: 'breya' }, { type: 'deck', name: 'esper' }), true);
  assert.deepEqual(Object.keys(state.containers), ['deck:esper']);
  assert.deepEqual(state.collection[0].location, { type: 'deck', name: 'esper' });
  state.collection = [];
  state.containers = {};
});

test('deleteEmptyContainer: only deletes containers with no cards', () => {
  state.collection = [{ location: { type: 'box', name: 'bulk' }, qty: 1 }];
  state.containers = {};
  ensureContainer({ type: 'box', name: 'bulk' });
  ensureContainer({ type: 'box', name: 'empty' });
  assert.equal(deleteEmptyContainer({ type: 'box', name: 'bulk' }), false);
  assert.equal(deleteEmptyContainer({ type: 'box', name: 'empty' }), true);
  assert.deepEqual(Object.keys(state.containers), ['box:bulk']);
  state.collection = [];
  state.containers = {};
});

// ---- normalizeLanguage ----

test('normalizeLanguage: defaults to en', () => {
  assert.equal(normalizeLanguage(undefined), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(normalizeLanguage(''), 'en');
});

test('normalizeLanguage: lowercases provided', () => {
  assert.equal(normalizeLanguage('EN'), 'en');
  assert.equal(normalizeLanguage('  JA  '), 'ja');
});

// ---- makeEntry ----

test('makeEntry: qty clamp - negative becomes 1', () => {
  const e = makeEntry({ name: 'X', qty: -3 });
  assert.equal(e.qty, 1);
});

test('makeEntry: qty clamp - 0 becomes 1', () => {
  const e = makeEntry({ name: 'X', qty: 0 });
  assert.equal(e.qty, 1);
});

test('makeEntry: undefined qty becomes 1', () => {
  const e = makeEntry({ name: 'X' });
  assert.equal(e.qty, 1);
});

test('makeEntry: parses string qty as int', () => {
  assert.equal(makeEntry({ qty: '4' }).qty, 4);
  assert.equal(makeEntry({ qty: '4.9' }).qty, 4); // parseInt
});

test('makeEntry: defaults for missing fields', () => {
  const e = makeEntry({});
  assert.equal(e.name, '');
  assert.equal(e.setCode, '');
  assert.equal(e.cn, '');
  assert.equal(e.finish, 'normal');
  assert.equal(e.condition, 'near_mint');
  assert.equal(e.language, 'en');
  assert.equal(e.location, null);
  assert.equal(e.scryfallId, '');
  assert.equal(e.rarity, '');
  assert.equal(e.price, null);
  assert.equal(e.priceFallback, false);
  assert.equal(e.imageUrl, null);
});

test('makeEntry: lowercases setCode', () => {
  assert.equal(makeEntry({ setCode: 'CMM' }).setCode, 'cmm');
});

// ---- collectionKey ----

test('collectionKey: same scryfallId+finish+condition+language+location yields same key', () => {
  const a = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: 'Binder', name: 'X', setCode: 's', cn: '1' };
  const b = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '  binder  ', name: 'Y', setCode: 't', cn: '2' };
  assert.equal(collectionKey(a), collectionKey(b));
});

test('collectionKey: differing finish yields different key', () => {
  const a = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '' };
  const b = { ...a, finish: 'foil' };
  assert.notEqual(collectionKey(a), collectionKey(b));
});

test('collectionKey: differing condition/language/location yields different keys', () => {
  const base = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '' };
  assert.notEqual(collectionKey(base), collectionKey({ ...base, condition: 'lightly_played' }));
  assert.notEqual(collectionKey(base), collectionKey({ ...base, language: 'ja' }));
  assert.notEqual(collectionKey(base), collectionKey({ ...base, location: 'binder' }));
});

test('collectionKey: falls back to setCode:cn:name when no scryfallId', () => {
  const a = { scryfallId: '', setCode: 'cmm', cn: '410', name: 'Sol Ring', finish: 'normal', condition: 'near_mint', language: 'en', location: '' };
  const b = { scryfallId: '', setCode: 'cmm', cn: '411', name: 'Sol Ring', finish: 'normal', condition: 'near_mint', language: 'en', location: '' };
  assert.notEqual(collectionKey(a), collectionKey(b));
  assert.match(collectionKey(a), /^cmm:410:Sol Ring:/);
});

// ---- coalesceCollection (mutates state.collection) ----

test('coalesceCollection: dedupes and sums qty', () => {
  state.collection = [];
  const base = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '', name: 'Sol Ring', setCode: 'cmm', cn: '410' };
  state.collection = [
    { ...base, qty: 2 },
    { ...base, qty: 3 },
    { ...base, finish: 'foil', qty: 1 }, // different key
  ];
  coalesceCollection();
  assert.equal(state.collection.length, 2);
  const normal = state.collection.find(c => c.finish === 'normal');
  const foil = state.collection.find(c => c.finish === 'foil');
  assert.equal(normal.qty, 5);
  assert.equal(foil.qty, 1);
  state.collection = [];
});

test('coalesceCollection: leaves distinct entries untouched', () => {
  state.collection = [];
  state.collection = [
    { scryfallId: 'a', finish: 'normal', condition: 'near_mint', language: 'en', location: '', qty: 1 },
    { scryfallId: 'b', finish: 'normal', condition: 'near_mint', language: 'en', location: '', qty: 1 },
  ];
  coalesceCollection();
  assert.equal(state.collection.length, 2);
  state.collection = [];
});

test('coalesceCollection: empty collection stays empty', () => {
  state.collection = [];
  coalesceCollection();
  assert.deepEqual(state.collection, []);
  state.collection = [];
});

// ---- getUsdPrice ----

test('getUsdPrice: exact-finish hit (foil)', () => {
  const card = { prices: { usd: '1.50', usd_foil: '5.00' } };
  assert.deepEqual(getUsdPrice(card, 'foil'), { price: 5.0, fallback: false });
});

test('getUsdPrice: exact-finish hit (etched)', () => {
  const card = { prices: { usd: '1.50', usd_etched: '12.00' } };
  assert.deepEqual(getUsdPrice(card, 'etched'), { price: 12.0, fallback: false });
});

test('getUsdPrice: normal finish picks usd', () => {
  const card = { prices: { usd: '0.25' } };
  assert.deepEqual(getUsdPrice(card, 'normal'), { price: 0.25, fallback: false });
});

test('getUsdPrice: foil missing falls back to usd', () => {
  const card = { prices: { usd: '1.00' } };
  assert.deepEqual(getUsdPrice(card, 'foil'), { price: 1.0, fallback: true });
});

test('getUsdPrice: etched missing falls back to usd', () => {
  const card = { prices: { usd: '0.99' } };
  assert.deepEqual(getUsdPrice(card, 'etched'), { price: 0.99, fallback: true });
});

test('getUsdPrice: no price at all', () => {
  const card = { prices: {} };
  assert.deepEqual(getUsdPrice(card, 'normal'), { price: null, fallback: false });
  assert.deepEqual(getUsdPrice(card, 'foil'), { price: null, fallback: false });
});

test('getUsdPrice: missing prices object', () => {
  assert.deepEqual(getUsdPrice({}, 'normal'), { price: null, fallback: false });
  assert.deepEqual(getUsdPrice(null, 'normal'), { price: null, fallback: false });
});

// ---- biggerImageUrl ----

test('biggerImageUrl: replaces /normal/ with /large/', () => {
  assert.equal(
    biggerImageUrl('https://cards.scryfall.io/normal/front/a/b/abc.jpg'),
    'https://cards.scryfall.io/large/front/a/b/abc.jpg',
  );
});

test('biggerImageUrl: passes through urls without /normal/', () => {
  assert.equal(
    biggerImageUrl('https://example.com/png/a.png'),
    'https://example.com/png/a.png',
  );
});

test('biggerImageUrl: null/empty pass through', () => {
  assert.equal(biggerImageUrl(null), null);
  assert.equal(biggerImageUrl(''), '');
});

// ---- normalizeTag ----

test('normalizeTag: lowercases, trims, collapses internal whitespace', () => {
  assert.equal(normalizeTag('EDH Staple'), 'edh staple');
  assert.equal(normalizeTag('  Trade Pile  '), 'trade pile');
  assert.equal(normalizeTag('foo   bar\t\tbaz'), 'foo bar baz');
});

test('normalizeTag: empty / whitespace-only / null / undefined return empty string', () => {
  assert.equal(normalizeTag(''), '');
  assert.equal(normalizeTag('   '), '');
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag(undefined), '');
});

test('normalizeTag: coerces non-string', () => {
  assert.equal(normalizeTag(42), '42');
});

// ---- normalizeTags ----

test('normalizeTags: dedupes across whitespace + casing variants', () => {
  const out = normalizeTags(['EDH Staple', 'edh staple', '  EDH   Staple ']);
  assert.deepEqual(out, ['edh staple']);
});

test('normalizeTags: drops empties', () => {
  const out = normalizeTags(['', '   ', 'foo', null, undefined, 'foo']);
  assert.deepEqual(out, ['foo']);
});

test('normalizeTags: accepts undefined', () => {
  assert.deepEqual(normalizeTags(undefined), []);
  assert.deepEqual(normalizeTags(null), []);
});

test('normalizeTags: preserves order of first occurrence', () => {
  const out = normalizeTags(['b', 'a', 'B', 'A']);
  assert.deepEqual(out, ['b', 'a']);
});

// ---- makeEntry tags ----

test('makeEntry: tags are normalized and deduped', () => {
  const e = makeEntry({ tags: ['EDH Staple', 'edh staple', '  Trade Pile '] });
  assert.deepEqual([...e.tags].sort(), ['edh staple', 'trade pile']);
});

test('makeEntry: missing tags defaults to empty array', () => {
  const e = makeEntry({});
  assert.deepEqual(e.tags, []);
  assert.ok(Array.isArray(e.tags));
});

// ---- collectionKey ignores tags ----

test('collectionKey: ignores tags', () => {
  const a = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '', tags: ['x'] };
  const b = { ...a, tags: ['y', 'z'] };
  assert.equal(collectionKey(a), collectionKey(b));
});

// ---- coalesceCollection unions tags ----

test('coalesceCollection: unions tags when collapsing duplicates', () => {
  state.collection = [];
  const base = { scryfallId: 'abc', finish: 'normal', condition: 'near_mint', language: 'en', location: '', name: 'Sol Ring', setCode: 'cmm', cn: '410' };
  state.collection = [
    { ...base, qty: 2, tags: ['edh staple', 'shared'] },
    { ...base, qty: 3, tags: ['trade pile', 'shared'] },
  ];
  coalesceCollection();
  assert.equal(state.collection.length, 1);
  assert.equal(state.collection[0].qty, 5);
  assert.deepEqual([...state.collection[0].tags].sort(), ['edh staple', 'shared', 'trade pile']);
  state.collection = [];
});

// ---- allCollectionTags ----

test('allCollectionTags: returns sorted unique tags across state.collection', () => {
  state.collection = [];
  state.collection = [
    { tags: ['zebra', 'apple'] },
    { tags: ['mango', 'apple'] },
    { tags: [] },
    { tags: undefined },
  ];
  assert.deepEqual(allCollectionTags(), ['apple', 'mango', 'zebra']);
  state.collection = [];
});

test('allCollectionTags: empty state returns empty array', () => {
  state.collection = [];
  assert.deepEqual(allCollectionTags(), []);
});
