import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalog, discoverSets, mergeDatasets, refreshDataset, NoCompleteSeatsError, sourceImageIndex, cardImages, fetchSeat, IncompleteSeatError } from '../scripts/build-data.mjs';

const catalog = { sets: [{ code: 'OLD', name: 'Existing format' }] };
const sets = [
  { code: 'old', name: 'Existing format', released_at: '2026-06-01', set_type: 'expansion' },
  { code: 'new', name: 'New format', released_at: '2026-10-01', set_type: 'expansion' },
  { code: 'past', name: 'Older format', released_at: '2025-01-01', set_type: 'expansion' },
  { code: 'soon', name: 'Future format', released_at: '2026-12-01', set_type: 'expansion' },
  { code: 'digital', name: 'Alchemy format', released_at: '2026-10-01', set_type: 'alchemy' },
  { code: 'sealed', name: 'Sealed only', released_at: '2026-10-01', set_type: 'expansion' },
];

test('discovery includes newly released Premier Draft formats and preserves existing formats', () => {
  const formats_by_expansion = Object.fromEntries(sets.map(set => [set.code.toUpperCase(), ['PremierDraft']]));
  delete formats_by_expansion.OLD;
  formats_by_expansion.SEALED = ['Sealed'];
  assert.deepEqual(
    discoverSets({ formats_by_expansion }, sets, catalog, '2026-11-02').map(set => set.code),
    ['NEW', 'OLD'],
  );
});

test('a partial discovery response fails instead of erasing the catalog', () => {
  assert.throws(() => discoverSets({}, sets, catalog), /discovery is unavailable/);
  assert.throws(() => discoverSets({ formats_by_expansion: {} }, [], catalog), /release dates/);
});

test('catalog defaults to the newest available dataset and versions changed content', () => {
  const dataset = { set: { code: 'NEW', name: 'New format' }, drafts: [{ id: 'one' }] };
  const initial = buildCatalog([dataset]);
  assert.equal(initial.defaultSet, 'NEW');
  assert.equal(initial.sets[0].draftCount, 1);
  assert.deepEqual(buildCatalog([dataset], initial), initial);
  const changed = buildCatalog([{ ...dataset, drafts: [{ id: 'two' }] }], initial);
  assert.notEqual(changed.sets[0].dataUrl, initial.sets[0].dataUrl);
  assert.throws(() => buildCatalog([]), /empty catalog/);
});


test('top-ups preserve published drafts and card metadata while adding unique seats to the limit', () => {
  const originalDraft = { id: 'old', sourceUrl: 'source-old', picks: ['original'], deck: ['original deck'] };
  const existing = { generatedAt: 'old-date', set: { code: 'OLD' }, cards: { Card: { name: 'original' } }, drafts: [originalDraft] };
  const incoming = { generatedAt: 'new-date', cards: { Card: { name: 'changed' }, Extra: { name: 'extra' } }, drafts: [
    { ...originalDraft, picks: ['changed'] },
    { id: 'different-id', sourceUrl: 'source-old' },
    { id: 'new', sourceUrl: 'source-new' },
    { id: 'extra', sourceUrl: 'source-extra' },
  ] };
  const merged = mergeDatasets(existing, incoming, 2);
  assert.equal(merged.drafts.length, 2);
  assert.equal(merged.drafts[0], originalDraft);
  assert.equal(JSON.stringify(merged.drafts[0]), JSON.stringify(originalDraft));
  assert.equal(merged.drafts[1].id, 'new');
  assert.equal(merged.cards.Card, existing.cards.Card);
  assert.deepEqual(merged.cards.Extra, incoming.cards.Extra);
  assert.equal(mergeDatasets(existing, { ...incoming, drafts: [originalDraft] }, 2), existing);
});

test('complete sets do not fetch again; partial sets request a top-up', async () => {
  const existing = { drafts: [{ id: 'old', sourceUrl: 'old' }], cards: {} };
  let calls = 0;
  const build = async (config, limit, published) => {
    calls += 1;
    assert.equal(published, existing);
    return { drafts: [{ id: 'new', sourceUrl: 'new' }], cards: {} };
  };
  assert.equal(await refreshDataset({ code: 'OLD' }, 1, existing, build), existing);
  assert.equal(calls, 0);
  assert.equal((await refreshDataset({ code: 'OLD' }, 2, existing, build)).drafts.length, 2);
  assert.equal(calls, 1);
});

test('no complete seats skips only the unavailable new format and preserves partial published sets', async () => {
  const noComplete = async () => { throw new NoCompleteSeatsError('opening packs absent'); };
  assert.equal(await refreshDataset({ code: 'NEW' }, 50, null, noComplete), null);
  const existing = { drafts: [{ id: 'old' }] };
  assert.equal(await refreshDataset({ code: 'OLD' }, 50, existing, noComplete), existing);
  const imported = await refreshDataset({ code: 'NEXT' }, 50, null, async () => ({ drafts: [{ id: 'next' }] }));
  assert.equal(imported.drafts[0].id, 'next');
  await assert.rejects(refreshDataset({ code: 'NEW' }, 50, null, async () => { throw new Error('provider failed'); }), /provider failed/);
  await assert.rejects(refreshDataset({ code: 'OLD' }, 50, existing, async () => { throw new Error('malformed data'); }), /malformed data/);
});


test('draft images use exact logged card names and retain Scryfall fallback for unobserved names', () => {
  const url = 'https://cards.17landscapes.com/display/front/exact.webp?v=1';
  const images = sourceImageIndex([{ draft: { picks: [{ pick: { name: 'Front Face', image_url: url }, available: [] }] }, preview: { cards: {} } }]);
  assert.deepEqual(cardImages('Front Face', { small: 'small', normal: 'normal' }, images), { imageSmall: url, imageNormal: url });
  assert.deepEqual(cardImages('Back Face', { small: 'small', normal: 'normal' }, images), { imageSmall: 'small', imageNormal: 'normal' });
});


test('permanent individual-seat issues skip only that candidate', async () => {
  const candidate = { sourceId: 'test', firstPick: 'Card', firstPickCards: Array(14).fill('Card') };
  function fixture() {
    return {
      draft: { expansion: 'NEW', picks: Array.from({ length: 42 }, (_, index) => ({ pack_number: Math.floor(index / 14), pick_number: index % 14, pick: { name: 'Card' }, available: [{ name: 'Card' }] })) },
      preview: { expansion: 'NEW', wins: 7, losses: 1, first_pick_time: '2026-10-01', cards: { 1: { name: 'Card' } }, decks: [{ groups: [{ name: 'Maindeck', cards: [1] }] }] },
    };
  }
  const read = data => async url => url.includes('event_preview') ? data.preview : data.draft;
  assert.equal((await fetchSeat('NEW', candidate, read(fixture()))).sourceId, 'test');
  for (const mutate of [
    data => { data.draft.expansion = 'WRONG'; },
    data => { data.preview.wins = 6; },
    data => { data.draft.picks[0].pick.name = 'Wrong'; },
    data => { data.preview.cards = {}; },
    data => { data.draft.picks[35] = null; },
    data => { data.draft.picks[35].available = null; },
    data => { data.draft.picks[35].available = [null]; },
  ]) {
    const data = fixture();
    mutate(data);
    await assert.rejects(fetchSeat('NEW', candidate, read(data)), IncompleteSeatError);
  }
  await assert.rejects(fetchSeat('NEW', candidate, async () => { throw Object.assign(new Error('gone'), { status: 404 }); }), IncompleteSeatError);
});

test('provider failures stay fatal instead of being classified as unusable seats', async () => {
  for (const status of [429, 500, 503, undefined]) {
    const failure = Object.assign(new Error('provider or network failure'), { status });
    await assert.rejects(fetchSeat('NEW', { sourceId: 'test' }, async () => { throw failure; }), error => error === failure && !(error instanceof IncompleteSeatError));
  }
});
