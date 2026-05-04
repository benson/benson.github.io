import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSyncSnapshots } from '../syncOps.js';

function snapshot(collection, extras = {}) {
  return {
    app: {
      collection,
      containers: extras.containers || {},
      ui: { viewMode: 'collection', viewAsList: false, selectedFormat: '', sortField: null, sortDir: 'asc', ...(extras.ui || {}) },
    },
    history: extras.history || [],
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

test('diffSyncSnapshots: quantity changes become qtyDelta operations', () => {
  const ops = diffSyncSnapshots(snapshot([sol]), snapshot([{ ...sol, qty: 3 }]));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'collection.qtyDelta');
  assert.equal(ops[0].payload.delta, 2);
});

test('diffSyncSnapshots: location changes become replace operations', () => {
  const moved = { ...sol, location: { type: 'deck', name: 'breya' }, deckBoard: 'main' };
  const ops = diffSyncSnapshots(snapshot([sol]), snapshot([moved]));
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'collection.replace');
  assert.equal(ops[0].payload.entry.location.type, 'deck');
});

test('diffSyncSnapshots: ui and history changes are semantic operations', () => {
  const ops = diffSyncSnapshots(
    snapshot([sol]),
    snapshot([sol], {
      ui: { selectedFormat: 'commander' },
      history: [{ id: 'ev_1', summary: 'changed format' }],
    })
  );
  assert.deepEqual(ops.map(op => op.type).sort(), ['history.append', 'ui.patch']);
});

test('diffSyncSnapshots: top-level navigation does not create sync operations', () => {
  const ops = diffSyncSnapshots(
    snapshot([sol], {
      ui: { viewMode: 'collection', viewAsList: true, sortField: 'name', sortDir: 'desc' },
    }),
    snapshot([sol], {
      ui: { viewMode: 'decks', viewAsList: false, sortField: null, sortDir: 'asc' },
    })
  );
  assert.deepEqual(ops, []);
});
