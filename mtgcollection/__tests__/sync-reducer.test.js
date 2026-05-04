import test from 'node:test';
import assert from 'node:assert/strict';
import { applySyncOps } from '../syncReducer.js';
import { makeSyncOp } from '../syncOps.js';

function snapshot(collection = []) {
  return {
    app: {
      collection,
      containers: {},
      ui: { viewMode: 'collection', viewAsList: false, selectedFormat: '', sortField: null, sortDir: 'asc' },
    },
    history: [],
  };
}

const sol = {
  name: 'Sol Ring',
  scryfallId: 'sol',
  finish: 'normal',
  condition: 'near_mint',
  language: 'en',
  qty: 1,
  location: { type: 'box', name: 'bulk' },
};

test('applySyncOps: applies queued quantity deltas deterministically', () => {
  const next = applySyncOps(snapshot([sol]), [
    makeSyncOp('collection.qtyDelta', { key: 'sol:normal:near_mint:en:box:bulk', delta: 2, entry: sol }, { id: 'op_1' }),
    makeSyncOp('collection.qtyDelta', { key: 'sol:normal:near_mint:en:box:bulk', delta: -1, entry: sol }, { id: 'op_2' }),
  ]);

  assert.equal(next.app.collection[0].qty, 2);
});

test('applySyncOps: latest scalar ui patch wins', () => {
  const next = applySyncOps(snapshot([sol]), [
    makeSyncOp('ui.patch', { patch: { selectedFormat: 'modern' } }, { id: 'op_1' }),
    makeSyncOp('ui.patch', { patch: { selectedFormat: 'commander' } }, { id: 'op_2' }),
  ]);

  assert.equal(next.app.ui.selectedFormat, 'commander');
});

test('applySyncOps: snapshot replace restores full portable state', () => {
  const replacement = snapshot([{ ...sol, name: 'Arcane Signet', scryfallId: 'signet' }]);
  const next = applySyncOps(snapshot([sol]), [
    makeSyncOp('snapshot.replace', { snapshot: replacement }, { id: 'op_1' }),
  ]);

  assert.equal(next.app.collection[0].name, 'Arcane Signet');
});
