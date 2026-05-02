import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../state.js';
import { renderDeckExportPanel, renderDeckWorkspaceControls } from '../view.js';

afterEach(() => {
  state.deckMode = 'visual';
  state.deckBoardFilter = 'all';
  state.deckGroupBy = 'type';
  state.deckCardSize = 'medium';
  state.deckShowPrices = true;
});

test('renderDeckWorkspaceControls: reflects saved deck mode, board, and view prefs', () => {
  state.deckMode = 'stats';
  state.deckBoardFilter = 'sideboard';
  state.deckGroupBy = 'cmc';
  state.deckCardSize = 'large';
  state.deckShowPrices = false;

  const html = renderDeckWorkspaceControls();

  assert.match(html, /data-deck-mode="stats" aria-pressed="true"/);
  assert.match(html, /data-deck-board-filter="sideboard" aria-pressed="true"/);
  assert.match(html, /<option value="cmc" selected>/);
  assert.match(html, /data-deck-card-size="large"[^>]*aria-pressed="true"/);
  assert.match(html, /data-deck-show-prices>/);
  assert.doesNotMatch(html, /data-deck-show-prices checked/);
});

test('renderDeckExportPanel: exposes portable deck export presets and boards', () => {
  const html = renderDeckExportPanel();

  assert.match(html, /id="deckExportForm"/);
  assert.match(html, /value="moxfield" selected/);
  assert.match(html, /value="arena"/);
  assert.match(html, /value="mtgo"/);
  assert.match(html, /name="board" value="main" checked/);
  assert.match(html, /name="board" value="sideboard" checked/);
  assert.match(html, /name="board" value="maybe" checked/);
  assert.match(html, /name="collapsePrintings"/);
  assert.match(html, /data-export-action="copy"/);
  assert.match(html, /data-export-action="download"/);
});

