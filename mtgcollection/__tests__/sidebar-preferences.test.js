import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  applySidebarCollapsed,
  bindSidebarToggle,
  loadSidebarPreference,
  SIDEBAR_COLLAPSED_KEY,
} from '../sidebarPreferences.js';
import { createFakeStorage } from './testUtils.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = '<button id="sidebarToggleBtn" aria-expanded="true">filters</button>';
  return { win, document: win.document };
}

test('applySidebarCollapsed: toggles body class and button state', () => {
  const { document } = setup();

  applySidebarCollapsed(true, { documentObj: document });

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);
  assert.equal(document.getElementById('sidebarToggleBtn').getAttribute('aria-expanded'), 'false');
  assert.equal(document.getElementById('sidebarToggleBtn').getAttribute('aria-pressed'), 'true');

  applySidebarCollapsed(false, { documentObj: document });

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), false);
  assert.equal(document.getElementById('sidebarToggleBtn').getAttribute('aria-expanded'), 'true');
  assert.equal(document.getElementById('sidebarToggleBtn').getAttribute('aria-pressed'), 'false');
});

test('loadSidebarPreference and bindSidebarToggle persist collapsed state', () => {
  const { win, document } = setup();
  const storage = createFakeStorage([[SIDEBAR_COLLAPSED_KEY, '1']]);

  loadSidebarPreference({ documentObj: document, storage });
  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);

  bindSidebarToggle({ documentObj: document, storage });
  document.getElementById('sidebarToggleBtn')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), false);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_KEY), '0');
});
