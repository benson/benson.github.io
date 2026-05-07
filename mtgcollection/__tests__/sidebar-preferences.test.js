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
  win.document.body.innerHTML = `
    <button id="sidebarEdgeToggleBtn" data-sidebar-edge-toggle aria-expanded="true">&lt;</button>
  `;
  return { win, document: win.document };
}

test('applySidebarCollapsed: toggles body class and button state', () => {
  const { document } = setup();

  applySidebarCollapsed(true, { documentObj: document });

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);
  assert.ok(document.getElementById('sidebarEdgeToggleBtn').querySelector('.drawer-toggle-chevron'));
  assert.equal(document.getElementById('sidebarEdgeToggleBtn').getAttribute('aria-label'), 'show filters');

  applySidebarCollapsed(false, { documentObj: document });

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), false);
  assert.equal(document.getElementById('sidebarEdgeToggleBtn').getAttribute('aria-label'), 'hide filters');
});

test('loadSidebarPreference and bindSidebarToggle persist collapsed state', () => {
  const { win, document } = setup();
  const storage = createFakeStorage([[SIDEBAR_COLLAPSED_KEY, '1']]);

  loadSidebarPreference({ documentObj: document, storage });
  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);

  bindSidebarToggle({ documentObj: document, storage });
  document.getElementById('sidebarEdgeToggleBtn')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), false);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_KEY), '0');

  document.getElementById('sidebarEdgeToggleBtn')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_KEY), '1');
});

test('edge toggle hover peeks collapsed sidebar', () => {
  const { win, document } = setup();
  const storage = createFakeStorage([[SIDEBAR_COLLAPSED_KEY, '1']]);
  const button = document.getElementById('sidebarEdgeToggleBtn');

  loadSidebarPreference({ documentObj: document, storage });
  bindSidebarToggle({ documentObj: document, storage });

  button.dispatchEvent(new win.Event('pointerenter', { bubbles: true }));
  assert.equal(document.body.classList.contains('left-sidebar-peeking'), true);

  button.dispatchEvent(new win.Event('pointerleave', { bubbles: true }));
  assert.equal(document.body.classList.contains('left-sidebar-peeking'), false);

  document.body.classList.add('left-drawer-open');
  button.dispatchEvent(new win.Event('pointerenter', { bubbles: true }));
  assert.equal(document.body.classList.contains('left-sidebar-peeking'), false);
});

test('edge toggle opens mobile drawer without changing collapsed preference', () => {
  const { win, document } = setup();
  win.matchMedia = () => ({ matches: true });
  const storage = createFakeStorage([[SIDEBAR_COLLAPSED_KEY, '1']]);

  loadSidebarPreference({ documentObj: document, storage });
  bindSidebarToggle({ documentObj: document, storage });

  document.getElementById('sidebarEdgeToggleBtn')
    .dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.equal(document.body.classList.contains('left-drawer-open'), true);
  assert.equal(document.body.classList.contains('left-sidebar-collapsed'), true);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_KEY), '1');
  assert.equal(document.getElementById('sidebarEdgeToggleBtn').getAttribute('aria-expanded'), 'true');
});
