import { onSyncStatus, openAccount, signIn, signOut, syncNow } from './syncEngine.js';
import { exportCsv } from './import.js';
import { showFeedback } from './feedback.js';

let root = null;
let exportModal = null;

function closeExportModal() {
  if (!exportModal) return;
  exportModal.hidden = true;
  exportModal.setAttribute('aria-hidden', 'true');
}

function ensureExportModal(documentObj = document) {
  if (exportModal) return exportModal;
  exportModal = documentObj.createElement('div');
  exportModal.className = 'export-modal';
  exportModal.hidden = true;
  exportModal.setAttribute('aria-hidden', 'true');
  exportModal.innerHTML = `
    <div class="export-modal-card" role="dialog" aria-modal="true" aria-labelledby="exportModalTitle">
      <h3 class="export-modal-title" id="exportModalTitle">export data</h3>
      <div class="export-modal-body">
        <div class="export-choice-row">
          <select class="export-choice-select" data-export-format>
            <option value="canonical">canonical csv</option>
            <option value="moxfield">moxfield csv</option>
            <option value="manabox">manabox csv</option>
            <option value="deckbox">deckbox csv</option>
          </select>
          <button class="export-choice-btn" type="button" data-export-choice="collection-csv">collection csv</button>
        </div>
        <div class="export-modal-actions">
          <button class="btn btn-secondary" type="button" data-export-choice="close">close</button>
        </div>
      </div>
    </div>
  `;
  documentObj.body.appendChild(exportModal);
  exportModal.addEventListener('click', event => {
    if (event.target === exportModal || event.target.closest('[data-export-choice="close"]')) {
      closeExportModal();
      return;
    }
    const action = event.target.closest('[data-export-choice]')?.dataset.exportChoice;
    if (action === 'collection-csv') {
      const format = exportModal.querySelector('[data-export-format]')?.value || 'canonical';
      exportCsv(format);
      closeExportModal();
    }
  });
  documentObj.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeExportModal();
  });
  return exportModal;
}

function openExportModal() {
  if (!exportModal) ensureExportModal();
  exportModal.hidden = false;
  exportModal.setAttribute('aria-hidden', 'false');
  exportModal.querySelector('[data-export-choice="collection-csv"]')?.focus();
}

function createSyncActionButton(documentObj, action, label) {
  const button = documentObj.createElement('button');
  button.type = 'button';
  button.dataset.syncAction = action;
  button.textContent = label;
  return button;
}

function ensureStatusDom(documentObj = document) {
  if (!root || root.querySelector('.sync-chip')) return;

  const chip = documentObj.createElement('button');
  chip.className = 'sync-chip sync-chip-local';
  chip.type = 'button';
  chip.dataset.syncAction = 'toggle';
  chip.setAttribute('aria-expanded', 'false');

  const dot = documentObj.createElement('span');
  dot.className = 'sync-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = documentObj.createElement('span');
  label.className = 'sync-label';
  chip.append(dot, label);

  const menu = documentObj.createElement('div');
  menu.className = 'sync-menu';
  menu.hidden = true;

  const meta = documentObj.createElement('div');
  meta.className = 'sync-menu-meta';
  const owner = documentObj.createElement('strong');
  const detail = documentObj.createElement('span');
  detail.className = 'sync-menu-detail';
  meta.append(owner, detail);

  const actions = documentObj.createElement('div');
  actions.className = 'sync-menu-actions';
  const exportButton = createSyncActionButton(documentObj, 'export', 'export data');

  const menuStatus = documentObj.createElement('div');
  menuStatus.className = 'sync-menu-status';
  menuStatus.setAttribute('aria-live', 'polite');
  const statusDot = documentObj.createElement('span');
  statusDot.className = 'sync-menu-status-dot';
  statusDot.setAttribute('aria-hidden', 'true');
  const statusText = documentObj.createElement('div');
  statusText.className = 'sync-menu-status-text';
  const statusLabel = documentObj.createElement('strong');
  statusLabel.className = 'sync-menu-status-label';
  const statusDetail = documentObj.createElement('span');
  statusDetail.className = 'sync-menu-status-detail';
  statusText.append(statusLabel, statusDetail);
  menuStatus.append(statusDot, statusText);

  menu.append(meta, actions, exportButton, menuStatus);
  const settingsEl = root.querySelector('.header-settings');
  if (settingsEl) root.insertBefore(chip, settingsEl);
  else root.append(chip);
  root.append(menu);
}

function syncAccountActions(menu, { signedIn, showManualSync }) {
  const actions = menu.querySelector('.sync-menu-actions');
  if (!actions) return;
  const key = `${signedIn ? 'in' : 'out'}:${showManualSync ? 'manual' : 'auto'}`;
  if (actions.dataset.actionsKey === key) return;
  actions.dataset.actionsKey = key;
  actions.replaceChildren();

  const documentObj = menu.ownerDocument;
  if (signedIn) {
    actions.append(createSyncActionButton(documentObj, 'account', 'account'));
    if (showManualSync) actions.append(createSyncActionButton(documentObj, 'sync', 'retry sync'));
    actions.append(createSyncActionButton(documentObj, 'sign-out', 'sign out'));
  } else {
    actions.append(createSyncActionButton(documentObj, 'sign-in', 'sign in'));
  }
}

function renderStatus(status) {
  if (!root) return;
  ensureStatusDom(root.ownerDocument || document);
  const signedIn = !!status.user;
  const showManualSync = signedIn && (status.pending || status.mode === 'queued' || status.mode === 'error');
  const pendingText = status.pending ? ' - ' + status.pending + ' queued' : '';
  const chip = root.querySelector('.sync-chip');
  const menu = root.querySelector('.sync-menu');
  const mode = status.mode || 'local';
  const needsAttention = signedIn && (status.pending || mode === 'queued' || mode === 'error');
  chip.className = `sync-chip sync-chip-${mode}${signedIn ? ' sync-chip-account' : ''}${needsAttention ? ' sync-chip-needs-attention' : ''}`;
  chip.querySelector('.sync-label').textContent = signedIn ? 'my account' : (status.label || 'local');
  chip.setAttribute('aria-label', signedIn
    ? 'my account - ' + (status.label || 'sync')
    : status.label || 'local');
  chip.setAttribute('aria-expanded', String(!menu.hidden));

  menu.querySelector('strong').textContent = signedIn ? status.user.label : 'local collection';
  const detailEl = menu.querySelector('.sync-menu-detail');
  detailEl.textContent = '';
  detailEl.hidden = true;
  syncAccountActions(menu, { signedIn, showManualSync });

  const menuStatus = menu.querySelector('.sync-menu-status');
  if (menuStatus) {
    const statusDetail = status.detail || (signedIn ? 'up to date' : 'signed out local collection');
    menuStatus.className = `sync-menu-status sync-menu-status-${mode}`;
    menuStatus.querySelector('.sync-menu-status-label').textContent = status.label || (signedIn ? 'sync' : 'local');
    menuStatus.querySelector('.sync-menu-status-detail').textContent = statusDetail + pendingText;
  }
}

export function renderSyncStatusForTest(status, rootEl, footerStatusEl = null) {
  const previousRoot = root;
  root = rootEl;
  void footerStatusEl;
  try {
    renderStatus(status);
  } finally {
    root = previousRoot;
  }
}

export function initSyncUi({ documentObj = document } = {}) {
  root = documentObj.getElementById('syncAccountSlot');
  if (!root) return;
  ensureExportModal(documentObj);

  root.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-sync-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.syncAction;
    const menu = root.querySelector('.sync-menu');
    if (action === 'toggle') {
      const hidden = !menu.hidden;
      menu.hidden = hidden;
      actionEl.setAttribute('aria-expanded', String(!hidden));
      const settingsPopover = root.querySelector('#settingsPopover');
      const settingsToggle = root.querySelector('#settingsToggleBtn');
      if (!hidden && settingsPopover) {
        settingsPopover.hidden = true;
        settingsToggle?.setAttribute('aria-expanded', 'false');
      }
      return;
    }
    if (action === 'sign-in') signIn().catch(e => showFeedback(e.message, 'error'));
    else if (action === 'sign-out') signOut().catch(e => showFeedback(e.message, 'error'));
    else if (action === 'account') openAccount().catch(e => showFeedback(e.message, 'error'));
    else if (action === 'sync') syncNow().catch(e => showFeedback(e.message, 'error'));
    else if (action === 'export') openExportModal();
    if (menu) menu.hidden = true;
  });

  documentObj.addEventListener('click', event => {
    if (!root || root.contains(event.target)) return;
    const menu = root.querySelector('.sync-menu');
    if (menu) menu.hidden = true;
  });

  onSyncStatus(renderStatus);
}
