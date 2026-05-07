import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  applyHistoryDrawerCollapsed,
  bindHistoryDrawerToggle,
  loadHistoryDrawerPreference,
  HISTORY_DRAWER_COLLAPSED_KEY,
} from '../historyDrawer.js';
import { createFakeStorage } from './testUtils.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <section class="history-details sidebar-history history-drawer history-drawer-open" data-history-drawer>
      <button class="history-drawer-header" type="button" data-history-drawer-toggle aria-controls="historyDrawerBody" aria-expanded="true" aria-label="hide history">
        <span class="history-drawer-title">collection history</span>
        <span class="history-drawer-toggle" aria-hidden="true"></span>
      </button>
      <div id="historyDrawerBody" data-history-drawer-body aria-hidden="false"></div>
    </section>
  `;
  return { win, document: win.document };
}

test('applyHistoryDrawerCollapsed: syncs drawer classes and button state', () => {
  const { document } = setup();
  const drawer = document.querySelector('[data-history-drawer]');
  const button = document.querySelector('[data-history-drawer-toggle]');
  const body = document.querySelector('[data-history-drawer-body]');

  applyHistoryDrawerCollapsed(true, { documentObj: document });

  assert.equal(drawer.classList.contains('history-drawer-collapsed'), true);
  assert.equal(drawer.classList.contains('history-drawer-open'), false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'show history');
  assert.equal(body.getAttribute('aria-hidden'), 'true');

  applyHistoryDrawerCollapsed(false, { documentObj: document });

  assert.equal(drawer.classList.contains('history-drawer-collapsed'), false);
  assert.equal(drawer.classList.contains('history-drawer-open'), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'hide history');
  assert.equal(body.getAttribute('aria-hidden'), 'false');
});

test('loadHistoryDrawerPreference and bindHistoryDrawerToggle persist collapsed state from the whole header', () => {
  const { win, document } = setup();
  const storage = createFakeStorage([[HISTORY_DRAWER_COLLAPSED_KEY, '1']]);
  const header = document.querySelector('[data-history-drawer-toggle]');

  loadHistoryDrawerPreference({ documentObj: document, storage });
  assert.equal(document.querySelector('[data-history-drawer]').classList.contains('history-drawer-collapsed'), true);

  bindHistoryDrawerToggle({ documentObj: document, storage });

  header.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('[data-history-drawer]').classList.contains('history-drawer-collapsed'), false);
  assert.equal(storage.getItem(HISTORY_DRAWER_COLLAPSED_KEY), '0');

  header.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('[data-history-drawer]').classList.contains('history-drawer-collapsed'), true);
  assert.equal(storage.getItem(HISTORY_DRAWER_COLLAPSED_KEY), '1');
});
