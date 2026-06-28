// Command-level tests: drive each read command with an injected fake session
// (no network) and assert the --json envelope. Covers search/summary/ls/show/
// deck show/deck export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutput } from '../src/output.mjs';
import { normalizeCollectionEntry } from '../vendor/collection.js';
import search from '../src/commands/search.mjs';
import summary from '../src/commands/summary.mjs';
import ls from '../src/commands/ls.mjs';
import show from '../src/commands/show.mjs';
import deck from '../src/commands/deck.mjs';

function entry(data) {
  return normalizeCollectionEntry(data, { preserveResolvedFields: true });
}

function fixtureSnapshot() {
  const collection = [
    entry({ name: 'Sol Ring', setCode: 'c21', cn: '263', scryfallId: 'sol', qty: 2, rarity: 'uncommon', price: 1.5, typeLine: 'Artifact', cmc: 1, colors: [], location: { type: 'box', name: 'bulk' } }),
    entry({ name: 'Llanowar Elves', setCode: 'm19', cn: '314', scryfallId: 'llan', qty: 4, rarity: 'common', price: 0.25, typeLine: 'Creature — Elf Druid', cmc: 1, colors: ['G'], location: { type: 'deck', name: 'breya' }, deckBoard: 'main' }),
    entry({ name: 'Breya, Etherium Shaper', setCode: 'c16', cn: '1', scryfallId: 'breya', qty: 1, rarity: 'mythic', price: 4.0, typeLine: 'Legendary Creature', cmc: 4, colors: ['W', 'U', 'B', 'R'], location: { type: 'deck', name: 'breya' }, deckBoard: 'main' }),
  ];
  return {
    app: {
      schemaVersion: 1,
      collection,
      containers: {
        'deck:breya': { type: 'deck', name: 'breya', deck: { title: 'Breya', format: 'commander', commander: { name: 'Breya, Etherium Shaper' } } },
        'box:bulk': { type: 'box', name: 'bulk' },
      },
      ui: { selectedFormat: '' },
    },
    history: [],
    shares: [],
  };
}

function run(command, { args = [], flags = {}, snapshot }) {
  const out = createOutput({ json: true, color: false });
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  const ctx = { out, flags: { json: true, ...flags }, args, apiBase: 'https://x', makeSession: () => ({ async bootstrap() { return { hasCloudData: true, revision: 1, snapshot, collectionId: 'c' }; } }) };
  return command.run(ctx).then((code) => {
    process.stdout.write = original;
    const stdout = chunks.join('');
    return { code, json: stdout.trim() ? JSON.parse(stdout) : null };
  }).catch((e) => { process.stdout.write = original; throw e; });
}

test('search: query grammar filters creatures', async () => {
  const { json } = await run(search, { args: ['t:creature'], snapshot: fixtureSnapshot() });
  assert.equal(json.ok, true);
  assert.equal(json.data.count, 2);
  assert.ok(json.data.cards.every(c => /Creature/.test(c.typeLine)));
});

test('search: color + cmc filters', async () => {
  const { json } = await run(search, { args: ['c:g', 'cmc<=1'], snapshot: fixtureSnapshot() });
  assert.equal(json.data.count, 1);
  assert.equal(json.data.cards[0].name, 'Llanowar Elves');
});

test('summary: totals and top value', async () => {
  const { json } = await run(summary, { snapshot: fixtureSnapshot() });
  assert.equal(json.data.unique, 3);
  assert.equal(json.data.total, 7);
  // 2*1.5 + 4*0.25 + 1*4 = 8
  assert.equal(json.data.value, 8);
  assert.equal(json.data.containers, 2);
  assert.equal(json.data.topValue[0].name, 'Breya, Etherium Shaper');
});

test('ls decks: lists the deck container', async () => {
  const { json } = await run(ls, { args: ['decks'], snapshot: fixtureSnapshot() });
  assert.equal(json.data.containers.length, 1);
  assert.equal(json.data.containers[0].name, 'breya');
  assert.equal(json.data.containers[0].total, 5);
});

test('show: container cards', async () => {
  const { json } = await run(show, { args: ['deck:breya'], snapshot: fixtureSnapshot() });
  assert.equal(json.data.container.name, 'breya');
  assert.equal(json.data.count, 2);
});

test('deck show: groups by board', async () => {
  const { json } = await run(deck, { args: ['show', 'breya'], snapshot: fixtureSnapshot() });
  assert.equal(json.data.deck.name, 'breya');
  assert.equal(json.data.boards.main.length, 2);
});

test('deck export: plain preset body', async () => {
  const { json } = await run(deck, { args: ['export', 'breya'], flags: { preset: 'plain' }, snapshot: fixtureSnapshot() });
  assert.match(json.data.body, /Llanowar Elves/);
  assert.equal(json.data.preset, 'plain');
});
