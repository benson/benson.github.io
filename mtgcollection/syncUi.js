import { onSyncStatus, openAccount, signIn, signOut, syncNow } from './syncEngine.js';
import { exportCsv } from './import.js';
import { showFeedback } from './feedback.js';

let root = null;
let exportModal = null;
let syncDetailsWindow = null;
let syncDetailsDragHandle = null;
let syncDetailsDragState = null;
let syncDetailsResizeState = null;
let syncDetailsResizeObserver = null;

const SYNC_DETAILS_POSITION_KEY = 'mtgcollection_sync_details_position_v1';
const SYNC_DETAILS_SIZE_KEY = 'mtgcollection_sync_details_size_v1';
const SYNC_DETAILS_EDGE_MARGIN = 12;
const SYNC_DETAILS_RESIZE_HANDLES = ['left', 'right', 'bottom', 'bottom-left', 'bottom-right'];

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

function syncDetailsStorage(documentObj = document) {
  try {
    return documentObj?.defaultView?.localStorage || globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

function readStoredSyncDetailsPosition(documentObj = document) {
  try {
    const raw = syncDetailsStorage(documentObj)?.getItem(SYNC_DETAILS_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.left)) || !Number.isFinite(Number(parsed?.top))) return null;
    return { left: Number(parsed.left), top: Number(parsed.top) };
  } catch (e) {
    return null;
  }
}

function writeStoredSyncDetailsPosition(position, documentObj = document) {
  try {
    syncDetailsStorage(documentObj)?.setItem(SYNC_DETAILS_POSITION_KEY, JSON.stringify({
      left: Math.round(position.left),
      top: Math.round(position.top),
    }));
  } catch (e) {}
}

function readStoredSyncDetailsSize(documentObj = document) {
  try {
    const raw = syncDetailsStorage(documentObj)?.getItem(SYNC_DETAILS_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.width)) || !Number.isFinite(Number(parsed?.height))) return null;
    return { width: Number(parsed.width), height: Number(parsed.height) };
  } catch (e) {
    return null;
  }
}

function writeStoredSyncDetailsSize(size, documentObj = document) {
  try {
    syncDetailsStorage(documentObj)?.setItem(SYNC_DETAILS_SIZE_KEY, JSON.stringify({
      width: Math.round(size.width),
      height: Math.round(size.height),
    }));
  } catch (e) {}
}

function syncDetailsViewport(documentObj = document) {
  const win = documentObj?.defaultView || globalThis;
  const docEl = documentObj?.documentElement;
  return {
    width: win?.innerWidth || docEl?.clientWidth || 1024,
    height: win?.innerHeight || docEl?.clientHeight || 768,
  };
}

function syncDetailsResizeBounds(viewport, margin = SYNC_DETAILS_EDGE_MARGIN) {
  const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
  const maxWidth = Math.max(320, viewportWidth - (margin * 2));
  const maxHeight = Math.max(300, viewportHeight - (margin * 2));
  return {
    maxWidth,
    maxHeight,
    minWidth: Math.min(340, maxWidth),
    minHeight: Math.min(300, maxHeight),
    viewportWidth,
    viewportHeight,
  };
}

function clampNumber(value, min, max, fallback) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : fallback;
  return Math.min(Math.max(next, min), max);
}

function clampSyncDetailsSize(size, viewport, margin = SYNC_DETAILS_EDGE_MARGIN) {
  const { minWidth, minHeight, maxWidth, maxHeight } = syncDetailsResizeBounds(viewport, margin);
  return {
    width: clampNumber(size?.width, minWidth, maxWidth, 440),
    height: clampNumber(size?.height, minHeight, maxHeight, 430),
  };
}

function clampSyncDetailsPosition(position, viewport, size, margin = SYNC_DETAILS_EDGE_MARGIN) {
  const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const minLeft = margin;
  const minTop = margin;
  const maxLeft = Math.max(minLeft, viewportWidth - width - margin);
  const maxTop = Math.max(minTop, viewportHeight - height - margin);
  const rawLeft = Number(position?.left);
  const rawTop = Number(position?.top);
  return {
    left: Math.min(Math.max(Number.isFinite(rawLeft) ? rawLeft : minLeft, minLeft), maxLeft),
    top: Math.min(Math.max(Number.isFinite(rawTop) ? rawTop : minTop, minTop), maxTop),
  };
}

function syncDetailsSize() {
  const rect = syncDetailsWindow?.getBoundingClientRect?.();
  return {
    width: rect?.width || syncDetailsWindow?.offsetWidth || 440,
    height: rect?.height || syncDetailsWindow?.offsetHeight || 430,
  };
}

function setSyncDetailsSize(size, { persist = false, documentObj = document } = {}) {
  if (!syncDetailsWindow) return null;
  const next = clampSyncDetailsSize(size, syncDetailsViewport(documentObj));
  syncDetailsWindow.style.setProperty('--sync-details-width', Math.round(next.width) + 'px');
  syncDetailsWindow.style.setProperty('--sync-details-height', Math.round(next.height) + 'px');
  if (persist) writeStoredSyncDetailsSize(next, documentObj);
  return next;
}

function applyStoredSyncDetailsSize(documentObj = document) {
  const stored = readStoredSyncDetailsSize(documentObj);
  if (stored) setSyncDetailsSize(stored, { documentObj });
}

function currentSyncDetailsPosition() {
  const left = parseFloat(syncDetailsWindow?.style.getPropertyValue('--sync-details-left') || '');
  const top = parseFloat(syncDetailsWindow?.style.getPropertyValue('--sync-details-top') || '');
  if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
  const rect = syncDetailsWindow?.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) return { left: rect.left, top: rect.top };
  return null;
}

function setSyncDetailsPosition(position, { persist = false, size = null, documentObj = document } = {}) {
  if (!syncDetailsWindow) return null;
  const next = clampSyncDetailsPosition(position, syncDetailsViewport(documentObj), size || syncDetailsSize());
  syncDetailsWindow.style.setProperty('--sync-details-left', Math.round(next.left) + 'px');
  syncDetailsWindow.style.setProperty('--sync-details-top', Math.round(next.top) + 'px');
  syncDetailsWindow.classList.add('is-positioned');
  if (persist) writeStoredSyncDetailsPosition(next, documentObj);
  return next;
}

function applyStoredSyncDetailsPosition(documentObj = document) {
  const stored = readStoredSyncDetailsPosition(documentObj);
  if (stored) setSyncDetailsPosition(stored, { documentObj });
}

function ensureSyncDetailsPositioned(documentObj = document) {
  const current = currentSyncDetailsPosition();
  if (current) setSyncDetailsPosition(current, { documentObj });
}

function clampCurrentSyncDetailsPosition({ persist = false, documentObj = document } = {}) {
  const current = currentSyncDetailsPosition();
  if (current && syncDetailsWindow?.classList.contains('is-positioned')) {
    setSyncDetailsPosition(current, { persist, documentObj });
  }
}

function shouldIgnoreSyncDetailsDragTarget(target) {
  return Boolean(target?.closest?.('button, input, textarea, select, a, [data-sync-details-resize-handle]'));
}

function startSyncDetailsDrag(event) {
  if (!syncDetailsWindow || shouldIgnoreSyncDetailsDragTarget(event.target)) return;
  if (event.button !== undefined && event.button !== 0) return;
  const documentObj = syncDetailsWindow.ownerDocument || document;
  const start = setSyncDetailsPosition(
    currentSyncDetailsPosition() || readStoredSyncDetailsPosition(documentObj) || { left: SYNC_DETAILS_EDGE_MARGIN, top: SYNC_DETAILS_EDGE_MARGIN },
    { documentObj },
  );
  if (!start) return;
  syncDetailsDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: start.left,
    startTop: start.top,
  };
  syncDetailsWindow.classList.add('is-dragging');
  if (event.pointerId !== undefined && typeof syncDetailsDragHandle?.setPointerCapture === 'function') {
    syncDetailsDragHandle.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function moveSyncDetailsDrag(event) {
  if (!syncDetailsDragState || !syncDetailsWindow) return;
  setSyncDetailsPosition({
    left: syncDetailsDragState.startLeft + event.clientX - syncDetailsDragState.startX,
    top: syncDetailsDragState.startTop + event.clientY - syncDetailsDragState.startY,
  }, { documentObj: syncDetailsWindow.ownerDocument || document });
}

function endSyncDetailsDrag(event) {
  if (!syncDetailsDragState || !syncDetailsWindow) return;
  if (
    event?.pointerId !== undefined
    && syncDetailsDragState.pointerId !== undefined
    && event.pointerId !== syncDetailsDragState.pointerId
  ) return;
  const documentObj = syncDetailsWindow.ownerDocument || document;
  syncDetailsDragState = null;
  syncDetailsWindow.classList.remove('is-dragging');
  const current = currentSyncDetailsPosition();
  if (current) setSyncDetailsPosition(current, { persist: true, documentObj });
  if (event?.pointerId !== undefined && typeof syncDetailsDragHandle?.releasePointerCapture === 'function') {
    syncDetailsDragHandle.releasePointerCapture(event.pointerId);
  }
}

function calculateSyncDetailsResize({ edge, startRect, delta, viewport, margin = SYNC_DETAILS_EDGE_MARGIN } = {}) {
  const bounds = syncDetailsResizeBounds(viewport, margin);
  const startLeft = clampNumber(startRect?.left, margin, Math.max(margin, bounds.viewportWidth - margin), margin);
  const startTop = clampNumber(startRect?.top, margin, Math.max(margin, bounds.viewportHeight - margin), margin);
  const startWidth = clampNumber(startRect?.width, bounds.minWidth, bounds.maxWidth, 440);
  const startHeight = clampNumber(startRect?.height, bounds.minHeight, bounds.maxHeight, 430);
  const dx = Number(delta?.x);
  const dy = Number(delta?.y);
  const moveX = Number.isFinite(dx) ? dx : 0;
  const moveY = Number.isFinite(dy) ? dy : 0;
  const name = String(edge || '');
  let left = startLeft;
  let top = startTop;
  let width = startWidth;
  let height = startHeight;

  if (name === 'left' || name === 'bottom-left') {
    const fixedRight = clampNumber(startLeft + startWidth, margin + bounds.minWidth, bounds.viewportWidth - margin, startLeft + startWidth);
    const maxWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, fixedRight - margin));
    width = clampNumber(startWidth - moveX, bounds.minWidth, maxWidth, startWidth);
    left = fixedRight - width;
  } else if (name === 'right' || name === 'bottom-right') {
    const maxWidth = Math.max(bounds.minWidth, Math.min(bounds.maxWidth, bounds.viewportWidth - margin - startLeft));
    width = clampNumber(startWidth + moveX, bounds.minWidth, maxWidth, startWidth);
  }

  if (name === 'bottom' || name === 'bottom-left' || name === 'bottom-right') {
    const maxHeight = Math.max(bounds.minHeight, Math.min(bounds.maxHeight, bounds.viewportHeight - margin - startTop));
    height = clampNumber(startHeight + moveY, bounds.minHeight, maxHeight, startHeight);
  }

  return {
    position: { left: Math.round(left), top: Math.round(top) },
    size: { width: Math.round(width), height: Math.round(height) },
  };
}

function startSyncDetailsResize(event) {
  if (!syncDetailsWindow) return;
  if (event.button !== undefined && event.button !== 0) return;
  const handle = event.currentTarget?.dataset?.syncDetailsResizeHandle
    ? event.currentTarget
    : event.target?.closest?.('[data-sync-details-resize-handle]');
  const edge = handle?.dataset?.syncDetailsResizeHandle;
  if (!edge) return;
  const documentObj = syncDetailsWindow.ownerDocument || document;
  const currentSize = setSyncDetailsSize(syncDetailsSize(), { documentObj }) || syncDetailsSize();
  const currentPosition = setSyncDetailsPosition(
    currentSyncDetailsPosition() || readStoredSyncDetailsPosition(documentObj) || { left: SYNC_DETAILS_EDGE_MARGIN, top: SYNC_DETAILS_EDGE_MARGIN },
    { size: currentSize, documentObj },
  );
  if (!currentPosition) return;
  syncDetailsResizeState = {
    pointerId: event.pointerId,
    edge,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startRect: {
      left: currentPosition.left,
      top: currentPosition.top,
      width: currentSize.width,
      height: currentSize.height,
    },
    next: null,
  };
  syncDetailsWindow.classList.add('is-resizing');
  if (event.pointerId !== undefined && typeof handle.setPointerCapture === 'function') {
    handle.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function moveSyncDetailsResize(event) {
  if (!syncDetailsResizeState || !syncDetailsWindow) return;
  if (
    event?.pointerId !== undefined
    && syncDetailsResizeState.pointerId !== undefined
    && event.pointerId !== syncDetailsResizeState.pointerId
  ) return;
  const documentObj = syncDetailsWindow.ownerDocument || document;
  const next = calculateSyncDetailsResize({
    edge: syncDetailsResizeState.edge,
    startRect: syncDetailsResizeState.startRect,
    delta: {
      x: event.clientX - syncDetailsResizeState.startX,
      y: event.clientY - syncDetailsResizeState.startY,
    },
    viewport: syncDetailsViewport(documentObj),
  });
  syncDetailsResizeState.next = next;
  setSyncDetailsSize(next.size, { documentObj });
  setSyncDetailsPosition(next.position, { size: next.size, documentObj });
  event.preventDefault();
}

function endSyncDetailsResize(event) {
  if (!syncDetailsResizeState || !syncDetailsWindow) return;
  if (
    event?.pointerId !== undefined
    && syncDetailsResizeState.pointerId !== undefined
    && event.pointerId !== syncDetailsResizeState.pointerId
  ) return;
  const documentObj = syncDetailsWindow.ownerDocument || document;
  const state = syncDetailsResizeState;
  syncDetailsResizeState = null;
  syncDetailsWindow.classList.remove('is-resizing');
  if (state.next) {
    setSyncDetailsSize(state.next.size, { persist: true, documentObj });
    setSyncDetailsPosition(state.next.position, { persist: true, size: state.next.size, documentObj });
  } else {
    setSyncDetailsSize(syncDetailsSize(), { persist: true, documentObj });
    clampCurrentSyncDetailsPosition({ persist: true, documentObj });
  }
  if (event?.pointerId !== undefined && typeof state.handle?.releasePointerCapture === 'function') {
    state.handle.releasePointerCapture(event.pointerId);
  }
}

function ensureSyncDetailsResizeHandles(documentObj = document) {
  if (!syncDetailsWindow) return;
  SYNC_DETAILS_RESIZE_HANDLES.forEach(edge => {
    let handle = syncDetailsWindow.querySelector(`[data-sync-details-resize-handle="${edge}"]`);
    if (!handle) {
      handle = documentObj.createElement('div');
      handle.className = `sync-details-resize-handle sync-details-resize-${edge}`;
      handle.dataset.syncDetailsResizeHandle = edge;
      handle.setAttribute('aria-hidden', 'true');
      syncDetailsWindow.appendChild(handle);
    }
    if (!handle.dataset.syncDetailsResizeBound) {
      handle.dataset.syncDetailsResizeBound = '1';
      handle.addEventListener('pointerdown', startSyncDetailsResize);
    }
  });
}

function observeSyncDetailsResize(documentObj = document) {
  syncDetailsResizeObserver?.disconnect?.();
  const ResizeObserverCtor = documentObj?.defaultView?.ResizeObserver || globalThis.ResizeObserver;
  if (!syncDetailsWindow || typeof ResizeObserverCtor !== 'function') return;
  syncDetailsResizeObserver = new ResizeObserverCtor(entries => {
    const entry = entries?.[0];
    const box = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
    const width = box?.inlineSize || entry?.contentRect?.width || syncDetailsWindow?.getBoundingClientRect?.().width || 0;
    const height = box?.blockSize || entry?.contentRect?.height || syncDetailsWindow?.getBoundingClientRect?.().height || 0;
    if (!width || !height || syncDetailsWindow.getAttribute('aria-hidden') === 'true') return;
    writeStoredSyncDetailsSize(clampSyncDetailsSize({ width, height }, syncDetailsViewport(documentObj)), documentObj);
    clampCurrentSyncDetailsPosition({ persist: true, documentObj });
  });
  syncDetailsResizeObserver.observe(syncDetailsWindow);
}

function setSyncDetailsOpen(open, { focus = false, documentObj = document } = {}) {
  ensureSyncDetailsWindow(documentObj);
  if (!syncDetailsWindow) return;
  documentObj.body.classList.toggle('sync-details-open', open);
  syncDetailsWindow.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    applyStoredSyncDetailsSize(documentObj);
    ensureSyncDetailsPositioned(documentObj);
    clampCurrentSyncDetailsPosition({ documentObj });
  }
  if (open && focus) {
    globalThis.setTimeout(() => {
      syncDetailsWindow?.querySelector('.sync-details-close')?.focus();
    }, 0);
  }
}

function closeSyncDetailsWindow(documentObj = document) {
  setSyncDetailsOpen(false, { documentObj });
}

function openSyncDetailsWindow(documentObj = document) {
  setSyncDetailsOpen(true, { focus: true, documentObj });
}

function ensureSyncDetailsWindow(documentObj = document) {
  if (syncDetailsWindow && syncDetailsWindow.ownerDocument === documentObj) return syncDetailsWindow;
  syncDetailsResizeObserver?.disconnect?.();
  syncDetailsResizeObserver = null;
  syncDetailsDragState = null;
  syncDetailsResizeState = null;
  syncDetailsWindow = documentObj.createElement('section');
  syncDetailsWindow.className = 'sync-details-window';
  syncDetailsWindow.id = 'syncDetailsWindow';
  syncDetailsWindow.setAttribute('role', 'dialog');
  syncDetailsWindow.setAttribute('aria-label', 'sync details');
  syncDetailsWindow.setAttribute('aria-hidden', 'true');
  syncDetailsWindow.innerHTML = `
    <header class="sync-details-head" id="syncDetailsDragHandle" data-sync-details-drag-handle title="drag sync details">
      <h2>how sync works</h2>
      <button class="sync-details-close" type="button" aria-label="close sync details">x</button>
    </header>
    <div class="sync-details-body">
      <p>Your collection is local first. The app keeps a full snapshot in this browser, then syncs small changes to your account when you are signed in.</p>
      <section class="sync-details-section">
        <h3>local state</h3>
        <p>The browser stores the latest snapshot, account metadata, and any unsent changes in IndexedDB. You can keep editing while offline or while the cloud service is unavailable.</p>
      </section>
      <section class="sync-details-section">
        <h3>change queue</h3>
        <p>After each edit, the app compares the current collection to the last synced baseline and records small operations for cards, containers, format settings, and history entries.</p>
      </section>
      <section class="sync-details-section">
        <h3>cloud revisions</h3>
        <p>Signed-in devices push queued operations with a client id and base revision. The cloud applies each operation once, advances the revision number, and returns the latest snapshot.</p>
      </section>
      <section class="sync-details-section">
        <h3>other devices</h3>
        <p>Open devices keep a lightweight live connection. When another device changes the collection, this app receives a revision notice, pulls the latest cloud state, and redraws from that snapshot.</p>
      </section>
      <section class="sync-details-section">
        <h3>first sign in</h3>
        <p>If your account has no cloud collection yet, the current local collection becomes the account collection. If cloud data already exists, the app loads it and keeps the local snapshot available for import.</p>
      </section>
    </div>
  `;
  documentObj.body.appendChild(syncDetailsWindow);
  syncDetailsDragHandle = syncDetailsWindow.querySelector('[data-sync-details-drag-handle]');
  syncDetailsWindow.querySelector('.sync-details-close')?.addEventListener('click', () => closeSyncDetailsWindow(documentObj));
  syncDetailsDragHandle?.addEventListener('pointerdown', startSyncDetailsDrag);
  documentObj.addEventListener('pointermove', moveSyncDetailsDrag);
  documentObj.addEventListener('pointermove', moveSyncDetailsResize);
  documentObj.addEventListener('pointerup', endSyncDetailsDrag);
  documentObj.addEventListener('pointerup', endSyncDetailsResize);
  documentObj.addEventListener('pointercancel', endSyncDetailsDrag);
  documentObj.addEventListener('pointercancel', endSyncDetailsResize);
  documentObj.defaultView?.addEventListener('resize', () => {
    setSyncDetailsSize(syncDetailsSize(), { persist: true, documentObj });
    clampCurrentSyncDetailsPosition({ persist: true, documentObj });
  });
  documentObj.addEventListener('keydown', event => {
    if (event.key === 'Escape' && documentObj.body.classList.contains('sync-details-open')) {
      closeSyncDetailsWindow(documentObj);
    }
  });
  applyStoredSyncDetailsSize(documentObj);
  applyStoredSyncDetailsPosition(documentObj);
  ensureSyncDetailsResizeHandles(documentObj);
  observeSyncDetailsResize(documentObj);
  return syncDetailsWindow;
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
  const learnMore = documentObj.createElement('button');
  learnMore.className = 'sync-menu-learn-link';
  learnMore.type = 'button';
  learnMore.dataset.syncAction = 'learn-sync';
  learnMore.setAttribute('aria-controls', 'syncDetailsWindow');
  learnMore.setAttribute('aria-haspopup', 'dialog');
  learnMore.textContent = 'learn more';
  statusText.append(statusLabel, statusDetail, learnMore);
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
    else if (action === 'learn-sync') openSyncDetailsWindow(documentObj);
    if (menu) {
      menu.hidden = true;
      root.querySelector('.sync-chip')?.setAttribute('aria-expanded', 'false');
    }
  });

  documentObj.addEventListener('click', event => {
    if (!root || root.contains(event.target)) return;
    const menu = root.querySelector('.sync-menu');
    if (menu) menu.hidden = true;
  });

  onSyncStatus(renderStatus);
}
