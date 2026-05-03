// Snapshot sharing — auto-mirror model.
// ---------------------------------------
// Sharing flow:
//   1. Creator clicks "share" on a deck → POST to worker → URL with ?share=ID.
//   2. The share ID is stashed on the deck container (`container.shareId`).
//   3. Every subsequent commitCollectionChange() in the deck workspace
//      schedules a debounced PUT to the same ID — viewers see the update
//      within ~1.5s of the creator's last edit.
//   4. "Stop sharing" issues a DELETE and clears `container.shareId`.
//
// Viewer flow:
//   1. App boots with `?share=ID` in the URL → fetch the payload BEFORE
//      reading localStorage, populate `state.shareSnapshot` and synthesize
//      `state.collection`/`state.containers` from the snapshot.
//   2. `body.share-mode` class hides write affordances; `save()` is also
//      guarded in persistence.js so any stray write is a no-op.
//   3. Exit returns to the user's own collection via `location.pathname`.

import { state } from './state.js';
import { showFeedback } from './feedback.js';

// Override via window.MTGCOLLECTION_SHARE_API_URL during dev to point at
// `wrangler dev` (e.g. http://127.0.0.1:8787). Production URL is whatever
// the worker is deployed to.
export const SHARE_API_URL = (typeof window !== 'undefined' && window.MTGCOLLECTION_SHARE_API_URL)
  || 'https://mtgcollection-share.bensonperry.workers.dev';

const PUSH_DEBOUNCE_MS = 1500;
let pushTimer = null;
let pushInFlight = null;

// ---- Pure payload pickers (testable) ----
//
// Whitelist field copy. We deliberately drop:
//   - `_source`        : per-format raw rows (re-export only, not viewer-relevant)
//   - `oracleText`     : search-only, large; viewer doesn't search shared decks
//   - `colorIdentity`  : computable from `colors` if needed
//   - `legalities`     : not used in deck workspace render
//   - `priceFallback`  : internal price-fetch metadata
//   - `cmc`/`typeLine` : kept (used for grouping in deck view)

function pickDeckListEntry(e, { includeTags = false } = {}) {
  const out = {
    scryfallId: e.scryfallId || '',
    qty: e.qty || 1,
    board: e.board || 'main',
    name: e.name || '',
    setCode: e.setCode || '',
    cn: e.cn || '',
    imageUrl: e.imageUrl || '',
    backImageUrl: e.backImageUrl || '',
    rarity: e.rarity || '',
    cmc: e.cmc ?? null,
    typeLine: e.typeLine || '',
    colors: Array.isArray(e.colors) ? [...e.colors] : [],
  };
  if (includeTags && Array.isArray(e.tags) && e.tags.length) out.tags = [...e.tags];
  return out;
}

function pickDeckMetadata(meta = {}) {
  // Only the fields the viewer actually renders.
  return {
    title: meta.title || '',
    description: meta.description || '',
    format: meta.format || '',
    commander: meta.commander || '',
    commanderScryfallId: meta.commanderScryfallId || '',
    commanderImageUrl: meta.commanderImageUrl || '',
    commanderBackImageUrl: meta.commanderBackImageUrl || '',
    partner: meta.partner || '',
    partnerScryfallId: meta.partnerScryfallId || '',
    partnerImageUrl: meta.partnerImageUrl || '',
    partnerBackImageUrl: meta.partnerBackImageUrl || '',
    companion: meta.companion || '',
  };
}

export function pickDeckSharePayload(container, { includeTags = false } = {}) {
  if (!container || container.type !== 'deck') return null;
  const list = Array.isArray(container.deckList) ? container.deckList : [];
  return {
    kind: 'deck',
    version: 1,
    createdAt: Date.now(),
    container: {
      type: 'deck',
      name: container.name,
      deck: pickDeckMetadata(container.deck || {}),
      deckList: list.map(e => pickDeckListEntry(e, { includeTags })),
    },
  };
}

// Synthesize fake inventory entries from the deckList so the existing render
// path (which joins decklist → inventory by scryfallId) finds matches and
// renders cards without "placeholder" greying. Each entry is located in the
// snapshot's deck container so location-filter logic still works.
export function synthesizeInventoryFromSnapshot(snapshot) {
  if (!snapshot || snapshot.kind !== 'deck' || !snapshot.container) return [];
  const deck = snapshot.container;
  const list = Array.isArray(deck.deckList) ? deck.deckList : [];
  return list.map(e => ({
    name: e.name,
    resolvedName: e.name,
    setCode: e.setCode,
    cn: e.cn,
    finish: 'normal',
    qty: e.qty || 1,
    condition: 'near_mint',
    language: 'en',
    scryfallId: e.scryfallId,
    rarity: e.rarity || '',
    imageUrl: e.imageUrl || '',
    backImageUrl: e.backImageUrl || '',
    cmc: e.cmc ?? null,
    colors: e.colors || [],
    colorIdentity: e.colors || [],
    typeLine: e.typeLine || '',
    location: { type: 'deck', name: deck.name },
    deckBoard: e.board || 'main',
    tags: Array.isArray(e.tags) ? [...e.tags] : [],
    price: 0,
    priceFallback: false,
  }));
}

// ---- Worker client ----

export async function createShare(payload) {
  const res = await fetch(SHARE_API_URL + '/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('create share failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}

export async function updateShare(id, payload) {
  const res = await fetch(SHARE_API_URL + '/share/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('update share failed: ' + res.status);
  return res.json();
}

export async function deleteShare(id) {
  const res = await fetch(SHARE_API_URL + '/share/' + encodeURIComponent(id), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('delete share failed: ' + res.status);
  return res.json();
}

export async function loadSnapshot(id) {
  const res = await fetch(SHARE_API_URL + '/share/' + encodeURIComponent(id));
  if (res.status === 404) {
    const err = new Error('snapshot not found');
    err.code = 'not_found';
    throw err;
  }
  if (!res.ok) throw new Error('load snapshot failed: ' + res.status);
  return res.json();
}

export function shareUrlForId(id) {
  // Build off the current location so dev (localhost:8765) and prod
  // (bensonperry.com) both work without hard-coding.
  const base = location.protocol + '//' + location.host + location.pathname;
  return base + '?share=' + encodeURIComponent(id);
}

// ---- Auto-mirror push (debounced) ----
//
// Called from view.js after deck mutations. If the deck has a shareId set,
// schedule a PUT to the worker. Coalesces rapid edits into a single push.

export function schedulePushForDeck(container) {
  if (!container || container.type !== 'deck' || !container.shareId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushDeckNow(container);
  }, PUSH_DEBOUNCE_MS);
}

async function pushDeckNow(container) {
  // Re-pick the current includeTags preference from the share record on the
  // container (set when the share was created or updated).
  const includeTags = !!container.shareIncludeTags;
  const payload = pickDeckSharePayload(container, { includeTags });
  if (!payload) return;
  pushInFlight = updateShare(container.shareId, payload)
    .catch(e => {
      // Don't show a feedback banner on every failed push — would be very
      // noisy if the worker is briefly down. Log and move on; the next save
      // will retry.
      console.warn('[share] push failed:', e.message);
    })
    .finally(() => { pushInFlight = null; });
  return pushInFlight;
}

// Exposed for tests + for manual flush from "stop sharing" before deletion.
export function _pendingPush() { return { pushTimer, pushInFlight }; }
export function _flushPushTimer() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
}

// ---- Viewer init ----
//
// Called from app.js boot when ?share=ID is present. Returns true on
// success (state populated, render-ready) or false on failure (caller falls
// back to normal boot or shows an error).

export async function initShareViewer(id) {
  try {
    const snapshot = await loadSnapshot(id);
    if (!snapshot || snapshot.kind !== 'deck' || !snapshot.container) {
      throw new Error('unrecognized snapshot kind');
    }
    state.shareSnapshot = { id, ...snapshot };
    // Populate the existing render path's data sources from the snapshot.
    // The render path is unchanged — it just sees a single-deck collection.
    const deck = snapshot.container;
    state.containers = { ['deck:' + deck.name]: deck };
    state.collection = synthesizeInventoryFromSnapshot(snapshot);
    state.viewMode = 'decks';
    return true;
  } catch (e) {
    console.warn('[share] viewer load failed:', e.message);
    return false;
  }
}

export function isShareViewer() {
  return !!state.shareSnapshot;
}

// ---- Share modal (creator-side UI) ----
//
// Lives in this module so the modal markup + handlers + payload picker are
// colocated. The modal element itself is in index.html — we just toggle
// classes and rewrite the body html on open.

let modalEl = null;
let modalCurrentDeck = null;

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function modalCreatedBodyHtml(url) {
  return `<div class="share-modal-row">
    <span class="share-modal-label">share url</span>
    <input class="share-modal-url" type="text" id="shareModalUrl" readonly value="${escHtml(url)}">
    <button class="btn" type="button" data-share-action="copy">copy</button>
  </div>
  <div class="share-modal-meta">
    auto-updates whenever you edit this deck. expires after 30 days of inactivity.
  </div>
  <div class="share-modal-actions">
    <button class="btn btn-secondary" type="button" data-share-action="close">done</button>
    <button class="btn btn-danger" type="button" data-share-action="stop">stop sharing</button>
  </div>`;
}

function modalCreateFormHtml(container) {
  const includeTags = !!container.shareIncludeTags;
  return `<div class="share-modal-meta">
    creates a read-only link anyone can open. updates push automatically as you edit. tags carry private notes — strip them by default.
  </div>
  <label class="share-modal-row share-modal-checkbox">
    <input type="checkbox" id="shareIncludeTags"${includeTags ? ' checked' : ''}>
    <span>include tags</span>
  </label>
  <div class="share-modal-actions">
    <button class="btn btn-secondary" type="button" data-share-action="close">cancel</button>
    <button class="btn" type="button" data-share-action="create">create link</button>
  </div>`;
}

function rerenderModal() {
  if (!modalEl || !modalCurrentDeck) return;
  const titleEl = modalEl.querySelector('.share-modal-title');
  const bodyEl = modalEl.querySelector('.share-modal-body');
  if (modalCurrentDeck.shareId) {
    titleEl.textContent = 'sharing ' + modalCurrentDeck.name;
    bodyEl.innerHTML = modalCreatedBodyHtml(shareUrlForId(modalCurrentDeck.shareId));
  } else {
    titleEl.textContent = 'share ' + modalCurrentDeck.name;
    bodyEl.innerHTML = modalCreateFormHtml(modalCurrentDeck);
  }
}

export function openShareModal(deckContainer) {
  if (!modalEl || !deckContainer || deckContainer.type !== 'deck') return;
  modalCurrentDeck = deckContainer;
  rerenderModal();
  modalEl.classList.add('visible');
  modalEl.setAttribute('aria-hidden', 'false');
}

export function closeShareModal() {
  if (!modalEl) return;
  modalEl.classList.remove('visible');
  modalEl.setAttribute('aria-hidden', 'true');
  modalCurrentDeck = null;
}

async function handleCreate() {
  if (!modalCurrentDeck) return;
  const includeTagsEl = modalEl.querySelector('#shareIncludeTags');
  const includeTags = !!(includeTagsEl && includeTagsEl.checked);
  const payload = pickDeckSharePayload(modalCurrentDeck, { includeTags });
  if (!payload) {
    showFeedback('cannot share an empty deck', 'error');
    return;
  }
  try {
    const { id } = await createShare(payload);
    modalCurrentDeck.shareId = id;
    if (includeTags) modalCurrentDeck.shareIncludeTags = true;
    // Persist + re-render the deck header so the button label flips to
    // "sharing". Lazy-import to dodge the circular dep with persistence.
    const { commitCollectionChange } = await import('./persistence.js');
    commitCollectionChange();
    rerenderModal();
    showFeedback('share link ready', 'success');
  } catch (e) {
    showFeedback('share failed: ' + e.message, 'error');
  }
}

async function handleStop() {
  if (!modalCurrentDeck || !modalCurrentDeck.shareId) return;
  if (!confirm('stop sharing this deck? the link will 404 immediately.')) return;
  const id = modalCurrentDeck.shareId;
  try {
    await deleteShare(id);
  } catch (e) {
    // Even if delete fails (network down), clear locally so the user isn't
    // stuck. The KV entry will TTL out in 30 days.
    console.warn('[share] delete failed (clearing locally):', e.message);
  }
  delete modalCurrentDeck.shareId;
  delete modalCurrentDeck.shareIncludeTags;
  _flushPushTimer();
  const { commitCollectionChange } = await import('./persistence.js');
  commitCollectionChange();
  closeShareModal();
  showFeedback('stopped sharing', 'success');
}

function handleCopy() {
  const urlInput = modalEl?.querySelector('#shareModalUrl');
  if (!urlInput) return;
  urlInput.select();
  navigator.clipboard.writeText(urlInput.value)
    .then(() => showFeedback('link copied', 'success'))
    .catch(() => showFeedback('couldn\'t copy — select and copy manually', 'error'));
}

export function initShare() {
  modalEl = document.getElementById('shareModal');
  if (!modalEl) return;

  // Delegated click: close on backdrop, route action buttons.
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) { closeShareModal(); return; }
    const btn = e.target.closest('[data-share-action]');
    if (!btn) return;
    const action = btn.dataset.shareAction;
    if (action === 'close') closeShareModal();
    else if (action === 'copy') handleCopy();
    else if (action === 'create') handleCreate();
    else if (action === 'stop') handleStop();
  });

  // Escape closes the modal.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modalEl.classList.contains('visible')) closeShareModal();
  });

  // Banner exit (viewer mode).
  const banner = document.getElementById('shareBanner');
  if (banner) {
    banner.addEventListener('click', e => {
      if (e.target.closest('[data-share-banner-action="exit"]')) {
        location.href = location.pathname;
      }
    });
  }
}
