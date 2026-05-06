import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderSyncStatusForTest } from '../syncUi.js';

test('sync status updates preserve existing chip and menu nodes', () => {
  const win = new Window();
  const root = win.document.createElement('div');
  root.id = 'syncAccountSlot';
  win.document.body.append(root);

  renderSyncStatusForTest({
    mode: 'queued',
    label: 'queued',
    detail: 'changes waiting to sync',
    user: { label: 'benson' },
    pending: 1,
  }, root);

  const chip = root.querySelector('.sync-chip');
  const menu = root.querySelector('.sync-menu');
  const actions = root.querySelector('.sync-menu-actions');
  const menuStatus = root.querySelector('.sync-menu-status');
  assert.ok(chip);
  assert.ok(menu);
  assert.ok(menuStatus);
  assert.equal(chip.classList.contains('sync-chip-needs-attention'), true);
  assert.equal(menuStatus.querySelector('.sync-menu-status-label').textContent, 'queued');
  assert.equal(menuStatus.querySelector('.sync-menu-status-detail').textContent, 'changes waiting to sync - 1 queued');
  assert.equal(root.querySelector('[data-sync-action="sync"]').textContent, 'retry sync');

  renderSyncStatusForTest({
    mode: 'synced',
    label: 'synced',
    detail: 'up to date',
    user: { label: 'benson' },
    pending: 0,
  }, root);

  assert.equal(root.querySelector('.sync-chip'), chip);
  assert.equal(root.querySelector('.sync-menu'), menu);
  assert.equal(root.querySelector('.sync-menu-actions'), actions);
  assert.equal(chip.querySelector('.sync-label').textContent, 'my account');
  assert.equal(chip.getAttribute('aria-label'), 'my account - synced');
  assert.equal(chip.classList.contains('sync-chip-needs-attention'), false);
  assert.equal(menuStatus.querySelector('.sync-menu-status-label').textContent, 'synced');
  assert.equal(menuStatus.querySelector('.sync-menu-status-detail').textContent, 'up to date');
  assert.equal(root.querySelector('[data-sync-action="sync"]'), null);
});

test('signed-out status stays in the header and account menu status', () => {
  const win = new Window();
  const root = win.document.createElement('div');
  root.id = 'syncAccountSlot';
  win.document.body.append(root);

  renderSyncStatusForTest({
    mode: 'local',
    label: 'local',
    detail: 'signed out local collection',
    user: null,
    pending: 0,
  }, root);

  const chip = root.querySelector('.sync-chip');
  assert.equal(chip.querySelector('.sync-label').textContent, 'local');
  assert.equal(chip.classList.contains('sync-chip-account'), false);
  assert.equal(root.querySelector('.sync-menu-status-label').textContent, 'local');
  assert.equal(root.querySelector('.sync-menu-status-detail').textContent, 'signed out local collection');
});
