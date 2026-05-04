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

function renderStatus(status) {
  if (!root) return;
  const signedIn = !!status.user;
  const showManualSync = signedIn && (status.pending || status.mode === 'queued' || status.mode === 'error');
  const accountActions = signedIn
    ? '<button type="button" data-sync-action="account">account</button>'
      + (showManualSync ? '<button type="button" data-sync-action="sync">retry sync</button>' : '')
      + '<button type="button" data-sync-action="sign-out">sign out</button>'
    : '<button type="button" data-sync-action="sign-in">sign in</button>';
  const pendingText = status.pending ? ' · ' + status.pending + ' queued' : '';
  const detailText = (status.mode === 'synced' && !status.pending) ? '' : (status.detail || '');
  const detailHtml = detailText || pendingText ? `<span>${detailText}${pendingText}</span>` : '';
  root.innerHTML = `
    <button class="sync-chip sync-chip-${status.mode}" type="button" data-sync-action="toggle" aria-expanded="false">
      <span class="sync-dot" aria-hidden="true"></span>
      <span class="sync-label">${status.label || 'local'}</span>
    </button>
    <div class="sync-menu" hidden>
      <div class="sync-menu-meta">
        <strong>${signedIn ? status.user.label : 'local collection'}</strong>
        ${detailHtml}
      </div>
      ${accountActions}
      <button type="button" data-sync-action="export">export data</button>
    </div>
  `;
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
