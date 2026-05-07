import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { collectionKey, ensureContainer } from '../collection.js';
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

test('history empty state renders a tiny draw widget and hides clear actions', () => {
  const win = new Window();
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  win.document.body.innerHTML = `
    <section class="history-details sidebar-history">
      <ol class="history-list"></ol>
      <div class="history-actions"><button class="history-clear-btn" type="button">clear history</button></div>
    </section>
  `;

  initChangelog();

  const details = win.document.querySelector('.history-details');
  const empty = win.document.querySelector('.history-empty');
  assert.ok(empty);
  assert.equal(details.classList.contains('history-is-empty'), true);
  assert.match(empty.textContent, /no changes yet/i);
  assert.doesNotMatch(empty.textContent, /today's draw/i);

  recordEvent({ type: 'add', summary: 'Added Island', scope: 'collection' });
  assert.equal(details.classList.contains('history-is-empty'), false);
  assert.equal(win.document.querySelector('.history-empty'), null);
});

test('storage changelog events undo create, rename, and delete', () => {
  resetState();
  const commits = [];
  configureChangelogActions({ commitCollectionChangeImpl: () => commits.push('commit') });

  ensureContainer({ type: 'binder', name: 'trade' });
  const create = recordEvent({
    type: 'storage-create',
    summary: 'Created {loc:binder:trade}',
    containerAfter: { type: 'binder', name: 'trade' },
  });
  undoEvent(create.id);
  assert.equal(state.containers['binder:trade'], undefined);

  ensureContainer({ type: 'box', name: 'bulk' });
  state.containers['box:archive'] = state.containers['box:bulk'];
  state.containers['box:archive'].name = 'archive';
  delete state.containers['box:bulk'];
  const rename = recordEvent({
    type: 'storage-rename',
    summary: 'Renamed box bulk to {loc:box:archive}',
    containerBefore: { type: 'box', name: 'bulk' },
    containerAfter: { type: 'box', name: 'archive' },
  });
  undoEvent(rename.id);
  assert.ok(state.containers['box:bulk']);
  assert.equal(state.containers['box:archive'], undefined);

  const deleted = recordEvent({
    type: 'storage-delete',
    summary: 'Deleted {loc:box:bulk}',
    containerBefore: { type: 'box', name: 'bulk' },
  });
  delete state.containers['box:bulk'];
  undoEvent(deleted.id);
  assert.ok(state.containers['box:bulk']);
  assert.equal(commits.length, 3);
});

test('storage history scope shows container events and card changes touching binders or boxes', () => {
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
  const binderCard = { name: 'Island', scryfallId: 'island', finish: 'normal', condition: 'near_mint', language: 'en', location: { type: 'binder', name: 'trade' } };
  state.collection = [binderCard];
  recordEvent({ type: 'add', summary: 'Added Lightning Bolt', scope: 'collection' });
  recordEvent({
    type: 'add',
    summary: 'Added Island',
    affectedKeys: [collectionKey(binderCard)],
    cards: [{ name: 'Island' }],
  });
  recordEvent({
    type: 'storage-create',
    summary: 'Created {loc:box:bulk}',
    containerAfter: { type: 'box', name: 'bulk' },
  });

  setHistoryScope({ kind: 'storage' });
  const text = win.document.querySelector('.history-list').textContent;
  assert.match(text, /Created/);
  assert.match(text, /Added Island/);
  assert.doesNotMatch(text, /Lightning Bolt/);

  setHistoryScope({ type: 'binder', name: 'trade' });
  assert.match(win.document.querySelector('.history-list').textContent, /Added Island/);
  assert.doesNotMatch(win.document.querySelector('.history-list').textContent, /Created/);
});

test('history summary does not append a card name that is already in the event text', () => {
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
  setHistoryScope(null);
  recordEvent({
    type: 'edit',
    summary: 'moved 1 lotho, corrupt shirriff to {loc:box:bulk}',
    cards: [{ name: 'Lotho, Corrupt Shirriff' }],
  });

  const text = win.document.querySelector('.history-list').textContent;
  assert.equal(text.match(/Lotho, Corrupt Shirriff/g)?.length, 1);
  assert.equal(win.document.querySelectorAll('.history-card-name').length, 1);
  assert.equal(win.document.querySelector('.loc-link')?.textContent, 'bulk');
  const undo = win.document.querySelector('.history-undo');
  assert.equal(undo?.getAttribute('title'), 'undo this change');
  assert.equal(undo?.getAttribute('aria-label'), 'undo this change');
  assert.equal(undo?.textContent, '\u21b6');
});

test('history add summaries hide printing metadata and keep the card link', () => {
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
  setHistoryScope(null);
  recordEvent({
    type: 'add',
    summary: 'Added (FUT #39)',
    cards: [{ name: 'Maelstrom Djinn' }],
  });

  const text = win.document.querySelector('.history-list').textContent;
  assert.match(text, /Added Maelstrom Djinn/);
  assert.doesNotMatch(text, /FUT|#39|\(/);
  assert.equal(win.document.querySelector('.history-card-name')?.textContent, 'Maelstrom Djinn');
});
