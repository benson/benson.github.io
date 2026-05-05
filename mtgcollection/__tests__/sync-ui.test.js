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
  assert.ok(chip);
  assert.ok(menu);
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
  assert.equal(chip.querySelector('.sync-label').textContent, 'synced');
  assert.equal(root.querySelector('[data-sync-action="sync"]'), null);
});
