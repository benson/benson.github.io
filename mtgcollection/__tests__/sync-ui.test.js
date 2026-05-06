import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderSyncStatusForTest } from '../syncUi.js';

test('sync status updates preserve existing chip and menu nodes', () => {
  const win = new Window();
  const root = win.document.createElement('div');
  root.id = 'syncAccountSlot';
  const footerStatus = win.document.createElement('span');
  footerStatus.id = 'footerSyncStatus';
  win.document.body.append(root, footerStatus);

  renderSyncStatusForTest({
    mode: 'queued',
    label: 'queued',
    detail: 'changes waiting to sync',
    user: { label: 'benson' },
    pending: 1,
  }, root, footerStatus);

  const chip = root.querySelector('.sync-chip');
  const menu = root.querySelector('.sync-menu');
  const actions = root.querySelector('.sync-menu-actions');
  assert.ok(chip);
  assert.ok(menu);
  assert.equal(root.querySelector('[data-sync-action="sync"]').textContent, 'retry sync');

  renderSyncStatusForTest({
    mode: 'synced',
    label: 'synced',
    detail: 'up to date',
    user: { label: 'benson' },
    pending: 0,
  }, root, footerStatus);

  assert.equal(root.querySelector('.sync-chip'), chip);
  assert.equal(root.querySelector('.sync-menu'), menu);
  assert.equal(root.querySelector('.sync-menu-actions'), actions);
  assert.equal(chip.querySelector('.sync-label').textContent, 'my account');
  assert.equal(chip.getAttribute('aria-label'), 'my account - synced');
  assert.equal(footerStatus.querySelector('.footer-sync-label').textContent, 'synced');
  assert.equal(footerStatus.hidden, false);
  assert.equal(root.querySelector('[data-sync-action="sync"]'), null);
});

test('signed-out status stays in the header and hides footer sync', () => {
  const win = new Window();
  const root = win.document.createElement('div');
  const footerStatus = win.document.createElement('span');
  root.id = 'syncAccountSlot';
  footerStatus.id = 'footerSyncStatus';
  win.document.body.append(root, footerStatus);

  renderSyncStatusForTest({
    mode: 'local',
    label: 'local',
    detail: 'signed out local collection',
    user: null,
    pending: 0,
  }, root, footerStatus);

  const chip = root.querySelector('.sync-chip');
  assert.equal(chip.querySelector('.sync-label').textContent, 'local');
  assert.equal(chip.classList.contains('sync-chip-account'), false);
  assert.equal(footerStatus.hidden, true);
});
