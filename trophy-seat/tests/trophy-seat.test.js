import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const modelPromise = import('../model.js');
const dataPromise = readFile(new URL('../data/drafts.json', import.meta.url), 'utf8')
  .then(JSON.parse);

test('the shipped dataset contains only complete trophy drafts', async () => {
  const { validateDataset } = await modelPromise;
  const data = await dataPromise;
  assert.equal(validateDataset(data), data);
  assert.equal(data.drafts.length, 32);
  assert.equal(data.set.code, 'HOB');
  assert.equal(data.set.name, 'The Hobbit');
  assert.ok(Object.keys(data.cards).length > 180);

  for (const draft of data.drafts) {
    assert.match(draft.record, /^7-[012]$/);
    assert.match(draft.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(draft.picks.length >= 40);
    assert.ok(draft.deck.main.length > 0);
    assert.match(draft.sourceUrl, /^https:\/\/www\.17lands\.com\/draft\/[a-f0-9]+$/);
    for (const pick of draft.picks) {
      assert.ok(data.cards[pick.choice], `metadata exists for ${pick.choice}`);
    }
  }
});

test('comparisonStats describes the shape of the first eight choices', async () => {
  const { comparisonStats } = await modelPromise;
  const reference = Array.from({ length: 10 }, (_, index) => ({ choice: `card ${index}` }));
  const user = ['card 0', 'different 1', 'card 2', 'card 3', 'different 4', 'card 5', 'different 6', 'different 7'];

  assert.deepEqual(comparisonStats(user, reference), {
    total: 8,
    matches: 4,
    firstSplit: 2,
    outcomes: [true, false, true, true, false, true, false, false],
  });
});

test('formatDraftDate turns the stored ISO day into readable proof copy', async () => {
  const { formatDraftDate } = await modelPromise;
  assert.equal(formatDraftDate('2026-08-13'), 'August 13, 2026');
  assert.equal(formatDraftDate('not-a-date'), 'date unavailable');
});

test('scorePicks compares only the reproducible first eight picks', async () => {
  const { scorePicks } = await modelPromise;
  const reference = Array.from({ length: 10 }, (_, index) => ({ choice: `card ${index}` }));
  const user = reference.map(pick => pick.choice);
  user[2] = 'something else';
  user[9] = 'also different';
  assert.equal(scorePicks(user, reference), 7);
});

test('chooseDraft avoids already seen seats until the pool is exhausted', async () => {
  const { chooseDraft } = await modelPromise;
  const drafts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(chooseDraft(drafts, ['a', 'b'], () => 0).id, 'c');
  assert.equal(chooseDraft(drafts, ['a', 'b', 'c'], () => 0).id, 'a');
});

test('groupDeckCards places spells on curve and lands at the end', async () => {
  const { deckGroupCount, groupDeckCards } = await modelPromise;
  const groups = groupDeckCards({
    main: [
      { name: 'One', count: 1 },
      { name: 'Three', count: 2 },
      { name: 'Plains', count: 3 },
    ],
  }, {
    One: { name: 'One', manaValue: 1, typeLine: 'Creature' },
    Three: { name: 'Three', manaValue: 3, typeLine: 'Sorcery' },
    Plains: { name: 'Plains', basic: true, manaValue: 0, typeLine: 'Basic Land — Plains' },
  });
  assert.deepEqual(groups.map(group => group.cards.length), [1, 0, 2, 0, 0, 0, 1]);
  assert.equal(deckGroupCount(groups.at(-1)), 3);
  assert.equal(groups.at(-1).cards[0].count, 3);
});

test('sortPackCards follows booster rarity order and leaves each rarity stable', async () => {
  const { sortPackCards } = await modelPromise;
  assert.deepEqual(
    sortPackCards(['common a', 'uncommon a', 'rare', 'common b', 'mythic', 'basic'], {
      'common a': { rarity: 'common' },
      'uncommon a': { rarity: 'uncommon' },
      rare: { rarity: 'rare' },
      'common b': { rarity: 'common' },
      mythic: { rarity: 'mythic' },
      basic: { rarity: 'common', basic: true },
    }),
    ['mythic', 'rare', 'uncommon a', 'common a', 'common b', 'basic'],
  );
});
