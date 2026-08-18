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
  assert.ok(Object.keys(data.cards).length > 300);

  for (const draft of data.drafts) {
    assert.match(draft.record, /^7-[012]$/);
    assert.ok(draft.picks.length >= 40);
    assert.ok(draft.deck.main.length > 0);
    for (const pick of draft.picks) {
      assert.ok(data.cards[pick.choice], `metadata exists for ${pick.choice}`);
    }
  }
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
  const { groupDeckCards } = await modelPromise;
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
  assert.deepEqual(groups.map(group => group.cards.length), [1, 0, 2, 0, 0, 0, 3]);
});

test('CSV parsing keeps quoted Magic card names intact', async () => {
  const { parseCsvLine } = await import('../scripts/build-data.mjs');
  assert.deepEqual(
    parseCsvLine('SOS,"Abigale, Poet Laureate","a ""quoted"" card"'),
    ['SOS', 'Abigale, Poet Laureate', 'a "quoted" card'],
  );
});
