import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetState, state } from '../state.js';
import { renderDeckVisualMode } from '../views/deckBodyView.js';
import { renderDeckExportPanel, renderDeckWorkspaceControls } from '../views/deckHeaderView.js';

afterEach(() => resetState());

test('renderDeckWorkspaceControls: reflects saved deck mode, board, and view prefs', () => {
  state.deckMode = 'stats';
  state.deckBoardFilter = 'sideboard';
  state.deckGroupBy = 'cmc';
  state.deckCardSize = 'large';
  state.deckShowPrices = false;

  const html = renderDeckWorkspaceControls();

  assert.match(html, /data-deck-mode="stats" aria-pressed="true"/);
  assert.match(html, /data-deck-board-filter="sideboard" aria-pressed="true"/);
  assert.doesNotMatch(html, /deck-view-settings/);
  assert.doesNotMatch(html, /data-deck-card-size/);
  assert.doesNotMatch(html, /data-deck-show-prices/);
  // group-by lives inline with the visual mode now, not in the cross-mode
  // workspace controls — assert that.
  assert.doesNotMatch(html, /data-deck-group/);
});

test('renderDeckVisualMode: owns visual-only card size and price controls', () => {
  state.deckGroupBy = 'cmc';
  state.deckCardSize = 'large';
  state.deckShowPrices = false;

  const html = renderDeckVisualMode({ main: [], sideboard: [], maybe: [] });

  assert.match(html, /data-deck-group/);
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

