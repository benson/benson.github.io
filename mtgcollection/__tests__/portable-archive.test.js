import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTABLE_ARCHIVE_KIND,
  buildPortableArchive,
  normalizePortableArchive,
  parsePortableArchiveJson,
  portableArchiveToJson,
} from '../portableArchive.js';
import { state } from '../state.js';
import { resetStateAfterEach } from './testUtils.js';

resetStateAfterEach();

test('buildPortableArchive: captures app data, history, and share metadata', () => {
  state.collection = [{ name: 'Sol Ring', qty: 1, finish: 'normal', condition: 'near_mint', language: 'en' }];
  state.containers = {
    'deck:breya': { type: 'deck', name: 'breya', shareId: 'abc123', deck: { title: 'breya' }, deckList: [] },
  };
  state.viewMode = 'decks';

  const archive = buildPortableArchive({
    stateRef: state,
    history: [{ id: 'ev_1', summary: 'added sol ring' }],
  });

  assert.equal(archive.kind, PORTABLE_ARCHIVE_KIND);
  assert.equal(archive.snapshot.app.collection[0].name, 'Sol Ring');
  assert.equal(archive.snapshot.history[0].id, 'ev_1');
  assert.equal(archive.snapshot.shares[0].shareId, 'abc123');
});

test('parsePortableArchiveJson: reads archive JSON and legacy app payloads', () => {
  const archive = buildPortableArchive({
    snapshot: {
      app: { collection: [{ name: 'Island', qty: 2 }], containers: {}, ui: {} },
      history: [],
    },
  });

  const parsed = parsePortableArchiveJson(portableArchiveToJson(archive));
  assert.equal(parsed.snapshot.app.collection[0].name, 'Island');

  const legacy = normalizePortableArchive({ collection: [{ name: 'Mountain', qty: 3 }], containers: {} });
  assert.equal(legacy.snapshot.app.collection[0].name, 'Mountain');
});

test('normalizePortableArchive: rejects unknown archive versions', () => {
  assert.equal(normalizePortableArchive({ kind: PORTABLE_ARCHIVE_KIND, version: 999 }), null);
});
