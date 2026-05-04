import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { resetState, state, DECK_GROUP_KEY, DECK_VIEW_PREFS_KEY } from '../state.js';
import {
  currentDeckPrefs,
  deckExportOptionsFromForm,
  loadDeckGroup,
  loadDeckPrefs,
  saveDeckGroup,
  saveDeckPrefs,
} from '../deckPreferences.js';

const previousFormData = globalThis.FormData;

afterEach(() => {
  resetState();
  globalThis.FormData = previousFormData;
});

function fakeStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('deck group preference loads only known grouping values', () => {
  loadDeckGroup(fakeStorage([[DECK_GROUP_KEY, 'cmc']]));
  assert.equal(state.deckGroupBy, 'cmc');

  loadDeckGroup(fakeStorage([[DECK_GROUP_KEY, 'not-real']]));
  assert.equal(state.deckGroupBy, 'cmc');
});

test('deck preferences load, expose current prefs, and save as one payload', () => {
  const storage = fakeStorage([
    [DECK_VIEW_PREFS_KEY, JSON.stringify({
      mode: 'text',
      boardFilter: 'main',
      cardSize: 'large',
      showPrices: false,
      ownershipView: 'decklist',
    })],
  ]);

  loadDeckPrefs(storage);
  assert.deepEqual(currentDeckPrefs(), {
    cardSize: 'large',
    showPrices: false,
    ownershipView: 'decklist',
  });
  assert.equal(state.deckMode, 'visual');
  assert.equal(state.deckBoardFilter, 'all');

  state.deckMode = 'stats';
  saveDeckPrefs(storage);
  assert.deepEqual(JSON.parse(storage.values.get(DECK_VIEW_PREFS_KEY)), {
    cardSize: 'large',
    showPrices: false,
    ownershipView: 'decklist',
  });
});

test('saveDeckGroup writes the current group key', () => {
  const storage = fakeStorage();
  state.deckGroupBy = 'color';

  saveDeckGroup(storage);

  assert.equal(storage.values.get(DECK_GROUP_KEY), 'color');
});

test('deckExportOptionsFromForm reads selected boards and export toggles', () => {
  const win = new Window();
  globalThis.FormData = win.FormData;
  win.document.body.innerHTML = `
    <form id="deckExportForm">
      <input name="preset" value="moxfield">
      <input type="checkbox" name="board" value="main" checked>
      <input type="checkbox" name="board" value="sideboard" checked>
      <input type="checkbox" name="board" value="bogus" checked>
      <input type="checkbox" name="includeCommander" checked>
      <input type="checkbox" name="collapsePrintings" checked>
    </form>
  `;

  assert.deepEqual(deckExportOptionsFromForm(win.document.getElementById('deckExportForm')), {
    preset: 'moxfield',
    boards: ['main', 'sideboard'],
    includeCommander: true,
    collapsePrintings: true,
  });
});
