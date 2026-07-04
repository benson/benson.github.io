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
  redoEvent,
  replaceLog,
  setHistoryScope,
  undoEvent,
} from '../changelog.js';
import { resetState, state } from '../state.js';
import {
  moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommand,
} from '../commands.js';

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

  ensureContainer({ type: 'container', name: 'trade' });
  const create = recordEvent({
    type: 'storage-create',
    summary: 'Created {loc:container:trade}',
    containerAfter: { type: 'container', name: 'trade' },
  });
  undoEvent(create.id);
  assert.equal(state.containers['container:trade'], undefined);

  ensureContainer({ type: 'container', name: 'bulk' });
  state.containers['container:archive'] = state.containers['container:bulk'];
  state.containers['container:archive'].name = 'archive';
  delete state.containers['container:bulk'];
  const rename = recordEvent({
    type: 'storage-rename',
    summary: 'Renamed container bulk to {loc:container:archive}',
    containerBefore: { type: 'container', name: 'bulk' },
    containerAfter: { type: 'container', name: 'archive' },
  });
  undoEvent(rename.id);
  assert.ok(state.containers['container:bulk']);
  assert.equal(state.containers['container:archive'], undefined);

  const deleted = recordEvent({
    type: 'storage-delete',
    summary: 'Deleted {loc:container:bulk}',
    containerBefore: { type: 'container', name: 'bulk' },
  });
  delete state.containers['container:bulk'];
  undoEvent(deleted.id);
  assert.ok(state.containers['container:bulk']);
  assert.equal(commits.length, 3);
});

test('storage history scope shows container events and card changes touching containers', () => {
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
  const binderCard = { name: 'Island', scryfallId: 'island', finish: 'normal', condition: 'near_mint', language: 'en', location: { type: 'container', name: 'trade' } };
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
    summary: 'Created {loc:container:bulk}',
    containerAfter: { type: 'container', name: 'bulk' },
  });

  setHistoryScope({ kind: 'storage' });
  const text = win.document.querySelector('.history-list').textContent;
  assert.match(text, /Created/);
  assert.match(text, /Added Island/);
  assert.doesNotMatch(text, /Lightning Bolt/);

  setHistoryScope({ type: 'container', name: 'trade' });
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
    summary: 'moved 1 lotho, corrupt shirriff to {loc:container:bulk}',
    cards: [{ name: 'Lotho, Corrupt Shirriff' }],
    // BEN-696: the undo affordance now only renders for restorable events, so
    // this fixture carries the before-snapshot a real move event records.
    before: [{ card: { name: 'Lotho, Corrupt Shirriff', scryfallId: 'lotho', location: null } }],
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

test('history undone entries expose redo and reapply the change', () => {
  const win = new Window();
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  win.document.body.innerHTML = `
    <details class="history-details" open>
      <summary>collection history</summary>
      <ol class="history-list"></ol>
    </details>
  `;
  const commits = [];
  configureChangelogActions({ commitCollectionChangeImpl: () => commits.push('commit') });
  initChangelog();
  setHistoryScope(null);

  const card = {
    name: 'Force of Will',
    scryfallId: 'force',
    setCode: '2xm',
    cn: '51',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'binder', name: 'trade binder' },
  };
  state.collection = [card];
  const beforeKey = collectionKey(card);
  const before = [{ key: beforeKey, card: { ...card, location: { ...card.location } } }];
  card.location = null;
  const ev = recordEvent({
    type: 'edit',
    summary: '{card} removed from {loc:binder:trade binder}',
    before,
    affectedKeys: [beforeKey],
    cards: [{ name: 'Force of Will' }],
  });

  undoEvent(ev.id);
  assert.deepEqual(state.collection[0].location, { type: 'binder', name: 'trade binder' });
  const redo = win.document.querySelector('.history-redo');
  assert.equal(redo?.getAttribute('title'), 'redo this change');
  assert.equal(redo?.getAttribute('aria-label'), 'redo this change');
  assert.equal(redo?.textContent, '\u21b7');

  redoEvent(ev.id);
  assert.equal(state.collection[0].location, null);
  assert.equal(getLog()[0].undone, false);
  assert.equal(win.document.querySelector('.history-redo'), null);
  assert.ok(win.document.querySelector('.history-undo'));
  assert.equal(commits.length, 2);
});

test('redo can infer older undone location-removal entries without after snapshots', () => {
  resetState();
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

  const card = {
    name: 'Force of Will',
    scryfallId: 'force',
    setCode: '2xm',
    cn: '51',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    location: { type: 'binder', name: 'trade binder' },
  };
  const key = collectionKey(card);
  state.collection = [{ ...card, location: { ...card.location } }];
  replaceLog([{
    id: 'legacy-undone',
    ts: Date.now(),
    type: 'edit',
    summary: '{card} removed from {loc:binder:trade binder}',
    before: [{ key, card }],
    created: [],
    affectedKeys: [key],
    cards: [{ name: 'Force of Will' }],
    scope: 'collection',
    undone: true,
  }]);

  assert.ok(win.document.querySelector('.history-redo'));
  redoEvent('legacy-undone');
  assert.equal(state.collection[0].location, null);
  assert.equal(getLog()[0].undone, false);
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

// BEN-696: deck-removal and board-move history entries carry deckListBefore/
// deckListAfter and undo/redo restore deck membership for real.
test('removing a deck card records deckList snapshots and undo/redo restore membership', () => {
  resetState();
  configureChangelogActions({ commitCollectionChangeImpl: () => {} });
  const deck = ensureContainer({ type: 'deck', name: 'breya' });
  deck.deckList = [
    { scryfallId: 'sol-ring', qty: 1, board: 'main', name: 'Sol Ring', imageUrl: '', backImageUrl: '' },
    { scryfallId: 'island', qty: 2, board: 'main', name: 'Island', imageUrl: '', backImageUrl: '' },
  ];

  const result = removeDeckCardFromDeckCommand(deck, 'sol-ring', 'main', { commit: () => {} });
  assert.equal(result.ok, true);
  assert.equal(state.containers['deck:breya'].deckList.length, 1);

  const ev = getLog()[0];
  assert.equal(ev.deckListBefore.length, 2);
  assert.equal(ev.deckListAfter.length, 1);
  assert.deepEqual(ev.containerAfter, { type: 'deck', name: 'breya' });

  undoEvent(ev.id);
  const restored = state.containers['deck:breya'].deckList;
  assert.equal(restored.length, 2);
  assert.ok(restored.some(e => e.scryfallId === 'sol-ring' && e.board === 'main'));
  assert.equal(getLog()[0].undone, true);

  redoEvent(ev.id);
  const redone = state.containers['deck:breya'].deckList;
  assert.equal(redone.length, 1);
  assert.equal(redone.some(e => e.scryfallId === 'sol-ring'), false);
  assert.equal(getLog()[0].undone, false);
});

test('undoing a board move reverses even a qty merge on the target board', () => {
  resetState();
  configureChangelogActions({ commitCollectionChangeImpl: () => {} });
  const deck = ensureContainer({ type: 'deck', name: 'breya' });
  deck.deckList = [
    { scryfallId: 'sol-ring', qty: 1, board: 'main', name: 'Sol Ring', imageUrl: '', backImageUrl: '' },
    { scryfallId: 'sol-ring', qty: 2, board: 'sideboard', name: 'Sol Ring', imageUrl: '', backImageUrl: '' },
  ];

  const result = moveDeckCardToBoardCommand(deck, 'sol-ring', 'main', 'sideboard', { commit: () => {} });
  assert.equal(result.ok, true);
  const merged = state.containers['deck:breya'].deckList;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].qty, 3); // merged into the existing side entry

  const ev = getLog()[0];
  undoEvent(ev.id);
  const restored = state.containers['deck:breya'].deckList;
  assert.equal(restored.length, 2);
  assert.deepEqual(
    restored.map(e => e.board + ':' + e.qty).sort(),
    ['main:1', 'sideboard:2'],
  );

  redoEvent(ev.id);
  const redone = state.containers['deck:breya'].deckList;
  assert.equal(redone.length, 1);
  assert.equal(redone[0].qty, 3);
});

test('a legacy deck event with no restorable state gets no undo button and undoEvent no-ops', () => {
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
  resetState();
  configureChangelogActions({ commitCollectionChangeImpl: () => {} });

  // The pre-BEN-696 event shape: cosmetic cards payload only.
  const legacy = recordEvent({
    type: 'edit',
    summary: 'Removed {card} from {loc:deck:breya}',
    cards: [{ name: 'Sol Ring', imageUrl: '', backImageUrl: '' }],
    scope: 'deck',
    deckLocation: 'deck:breya',
  });

  assert.equal(win.document.querySelectorAll('.history-undo').length, 0);

  undoEvent(legacy.id);
  assert.equal(getLog()[0].undone, false); // honest no-op, not a grey-out lie

  // A restorable event still gets its button.
  ensureContainer({ type: 'deck', name: 'breya' }).deckList = [
    { scryfallId: 'sol-ring', qty: 1, board: 'main', name: 'Sol Ring', imageUrl: '', backImageUrl: '' },
  ];
  removeDeckCardFromDeckCommand(state.containers['deck:breya'], 'sol-ring', 'main', { commit: () => {} });
  assert.equal(win.document.querySelectorAll('.history-undo').length, 1);
});
