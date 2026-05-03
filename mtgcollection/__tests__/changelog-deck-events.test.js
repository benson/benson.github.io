import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { ensureContainer } from '../collection.js';
import {
  clearLog,
  configureChangelogActions,
  getLog,
  initChangelog,
  recordEvent,
  setHistoryScope,
  undoEvent,
} from '../changelog.js';
import { resetState, state } from '../state.js';

const previousDocument = globalThis.document;
const previousLocalStorage = globalThis.localStorage;

afterEach(() => {
  clearLog();
  resetState();
  globalThis.document = previousDocument;
  globalThis.localStorage = previousLocalStorage;
  configureChangelogActions({ commitCollectionChangeImpl: () => {} });
});

test('deck changelog events undo create, rename, and metadata update', () => {
  resetState();
  const commits = [];
  configureChangelogActions({ commitCollectionChangeImpl: () => commits.push('commit') });

  ensureContainer({ type: 'deck', name: 'breya' });
  const create = recordEvent({
    type: 'deck-create',
    summary: 'Created {loc:deck:breya}',
    scope: 'deck',
    deckLocation: 'deck:breya',
    containerAfter: { type: 'deck', name: 'breya' },
  });
  undoEvent(create.id);
  assert.equal(state.containers['deck:breya'], undefined);

  const deck = ensureContainer({ type: 'deck', name: 'esper' });
  deck.deck.description = 'new text';
  const update = recordEvent({
    type: 'deck-update',
    summary: 'Updated details for {loc:deck:esper}',
    scope: 'deck',
    deckLocation: 'deck:esper',
    containerAfter: { type: 'deck', name: 'esper' },
    deckBefore: { ...deck.deck, description: 'old text' },
    deckAfter: deck.deck,
  });
  undoEvent(update.id);
  assert.equal(state.containers['deck:esper'].deck.description, 'old text');

  const rename = recordEvent({
    type: 'deck-rename',
    summary: 'Renamed deck esper to {loc:deck:breya}',
    scope: 'deck',
    deckLocation: 'deck:breya',
    containerBefore: { type: 'deck', name: 'esper' },
    containerAfter: { type: 'deck', name: 'breya' },
  });
  state.containers['deck:breya'] = state.containers['deck:esper'];
  state.containers['deck:breya'].name = 'breya';
  delete state.containers['deck:esper'];
  undoEvent(rename.id);
  assert.ok(state.containers['deck:esper']);
  assert.equal(state.containers['deck:breya'], undefined);
  assert.equal(commits.length, 3);
});

test('deck history scope shows deck-related events while collection scope shows all', () => {
  const win = new Window();
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  win.document.body.innerHTML = `
    <details class="history-details" open>
      <summary>collection history</summary>
      <ol class="history-list"></ol>
    </details>
  `;
  initChangelog();
  recordEvent({ type: 'add', summary: 'Added Island', scope: 'collection' });
  recordEvent({
    type: 'deck-create',
    summary: 'Created {loc:deck:breya}',
    scope: 'deck',
    deckLocation: 'deck:breya',
    containerAfter: { type: 'deck', name: 'breya' },
  });

  setHistoryScope({ kind: 'decks' });
  assert.match(win.document.querySelector('.history-list').textContent, /Created/);
  assert.doesNotMatch(win.document.querySelector('.history-list').textContent, /Added Island/);

  setHistoryScope(null);
  assert.match(win.document.querySelector('.history-list').textContent, /Created/);
  assert.match(win.document.querySelector('.history-list').textContent, /Added Island/);
  assert.equal(getLog().length, 2);
});
