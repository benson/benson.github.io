// Write commands end-to-end against the real worker + durable object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BIBLIOPLEX_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), 'bp-')), 'cfg');

const { makeEnv, loginSession, runCmd, entry } = await import('./_helpers.mjs');
const { applyMutation, loadSnapshot } = await import('../src/mutate.mjs');
const { collectionOf, containersOf, summarize } = await import('../src/snapshot.mjs');
const rm = (await import('../src/commands/rm.mjs')).default;
const move = (await import('../src/commands/move.mjs')).default;
const editCmd = (await import('../src/commands/edit.mjs')).default;
const tag = (await import('../src/commands/tag.mjs')).default;
const container = (await import('../src/commands/container.mjs')).default;
const undo = (await import('../src/commands/undo.mjs')).default;
const importCmd = (await import('../src/commands/import.mjs')).default;
const exportCmd = (await import('../src/commands/export.mjs')).default;

async function seed(session) {
  await applyMutation(session, (draft) => {
    draft.app.collection.push(entry({ name: 'Sol Ring', setCode: 'c21', cn: '263', scryfallId: 'sol', qty: 2, location: { type: 'box', name: 'bulk' } }));
    draft.app.collection.push(entry({ name: 'Llanowar Elves', setCode: 'm19', cn: '314', scryfallId: 'llan', qty: 4, location: { type: 'box', name: 'bulk' } }));
  });
}

async function cards(session) {
  return collectionOf((await loadSnapshot(session)).snapshot);
}

test('rm removes a stack', async () => {
  const session = await loginSession(makeEnv());
  await seed(session);
  const { json } = await runCmd(rm, { args: ['Sol Ring'], session });
  assert.equal(json.ok, true);
  const c = await cards(session);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'Llanowar Elves');
});

test('move changes location and creates the deck container', async () => {
  const session = await loginSession(makeEnv());
  await seed(session);
  await runCmd(move, { args: ['Llanowar'], flags: { to: 'deck:elves', board: 'main' }, session });
  const snap = (await loadSnapshot(session)).snapshot;
  const elf = collectionOf(snap).find(c => c.name === 'Llanowar Elves');
  assert.deepEqual(elf.location, { type: 'deck', name: 'elves' });
  assert.equal(elf.deckBoard, 'main');
  assert.ok(containersOf(snap)['deck:elves'], 'deck container auto-created');
});

test('move into an existing identical stack sums qty (no copy loss)', async () => {
  const session = await loginSession(makeEnv());
  await applyMutation(session, (draft) => {
    draft.app.collection.push(entry({ name: 'Sol Ring', setCode: 'c21', cn: '263', scryfallId: 'sol', qty: 3, location: { type: 'deck', name: 'breya' }, deckBoard: 'main' }));
    draft.app.collection.push(entry({ name: 'Sol Ring', setCode: 'c21', cn: '263', scryfallId: 'sol', qty: 2, location: { type: 'box', name: 'bulk' } }));
    draft.app.containers['deck:breya'] = { type: 'deck', name: 'breya' };
  });
  await runCmd(move, { args: ['Sol Ring'], flags: { to: 'deck:breya', board: 'main', location: 'box:bulk' }, session });
  const c = await cards(session);
  const inDeck = c.filter(x => x.location?.name === 'breya');
  assert.equal(inDeck.length, 1, 'one coalesced stack in the deck');
  assert.equal(inDeck[0].qty, 5, 'quantities summed, no copies lost');
  assert.equal(c.filter(x => x.location?.name === 'bulk').length, 0, 'box copy moved out');
});

test('edit updates qty', async () => {
  const session = await loginSession(makeEnv());
  await seed(session);
  await runCmd(editCmd, { args: ['Sol Ring'], flags: { qty: '5' }, session });
  const sol = (await cards(session)).find(c => c.name === 'Sol Ring');
  assert.equal(sol.qty, 5);
});

test('tag add then undo restores', async () => {
  const session = await loginSession(makeEnv());
  await seed(session);
  await runCmd(tag, { args: ['add', 'trade', 'Sol Ring'], session });
  let sol = (await cards(session)).find(c => c.name === 'Sol Ring');
  assert.deepEqual(sol.tags, ['trade']);

  const u = await runCmd(undo, { session });
  assert.equal(u.json.ok, true);
  sol = (await cards(session)).find(c => c.name === 'Sol Ring');
  assert.deepEqual(sol.tags, []);
});

test('container create / rename / delete', async () => {
  const session = await loginSession(makeEnv());
  await seed(session);
  await runCmd(container, { args: ['create', 'container:rares'], session });
  assert.ok(containersOf((await loadSnapshot(session)).snapshot)['container:rares']);
  const ren = await runCmd(container, { args: ['rename', 'container:rares', 'mythics'], session });
  assert.equal(ren.json.ok, true);
  const after = containersOf((await loadSnapshot(session)).snapshot);
  assert.ok(after['container:mythics']);
  assert.ok(!after['container:rares']);
});

test('import (no-resolve) then export json', async () => {
  const session = await loginSession(makeEnv());
  const csv = 'Name,Set code,Collector number,Quantity,Condition,Language\nCounterspell,tmp,1,3,near_mint,en\n';
  const file = join(process.env.BIBLIOPLEX_CONFIG_DIR, 'imp.csv');
  writeFileSync(file, csv);
  const imp = await runCmd(importCmd, { args: [file], flags: { 'no-resolve': true }, session });
  assert.equal(imp.json.ok, true);
  assert.equal(imp.json.data.imported, 1);

  const c = await cards(session);
  assert.equal(summarize(c).total, 3);
  assert.equal(c[0].name, 'Counterspell');

  const exp = await runCmd(exportCmd, { flags: { format: 'json' }, session });
  assert.match(exp.json.data.body, /Counterspell/);
});

test('read-only session cannot rm', async () => {
  const session = await loginSession(makeEnv(), { write: false });
  const r = await runCmd(rm, { args: ['Anything'], session }).catch(e => ({ error: e }));
  assert.ok(r.error, 'expected a thrown error');
  assert.match(r.error.message, /read-only|write/);
});
