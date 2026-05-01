import { state } from './state.js';
import { collectionKey } from './collection.js';
import { commitCollectionChange } from './persistence.js';
import { esc } from './feedback.js';

const CHANGELOG_KEY = 'mtgcollection_changelog_v1';
const CAP = 200;
const ACTIVE_BANNERS = 5;

let log = [];
let bannersEl;
let historyDetailsEl;
let historyListEl;

function persist() {
  try {
    localStorage.setItem(CHANGELOG_KEY, JSON.stringify(log));
  } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem(CHANGELOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return [];
}

function genId() {
  return 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function cloneEntry(c) {
  if (!c) return null;
  const copy = { ...c };
  if (Array.isArray(c.tags)) copy.tags = [...c.tags];
  return copy;
}

// Capture before-snapshots for the entries whose CURRENT collectionKey matches
// any of the requested keys. Returns array of { key, card } where `card` is a
// shallow clone (with tags array also cloned). The `key` stored is the
// *pre-mutation* key — undo logic resolves live targets by scryfallId+name
// rather than by post-mutation key, since mutations can change the key.
export function captureBefore(keys) {
  const wanted = new Set(keys);
  const out = [];
  for (const c of state.collection) {
    const k = collectionKey(c);
    if (wanted.has(k)) {
      out.push({ key: k, card: cloneEntry(c) });
    }
  }
  return out;
}

// Build a "soft identity" for an entry — fields that don't change in any of
// our edit paths. Used during undo to find the post-mutation versions of the
// captured cards in the live collection.
function softIdentity(c) {
  return (c.scryfallId || '') + '|' + (c.setCode || '') + '|' + (c.cn || '') + '|' + (c.name || '');
}

const CARDS_PREVIEW_LIMIT = 5;

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .filter(c => c && (c.name || c.imageUrl))
    .map(c => ({
      name: c.name || '',
      imageUrl: c.imageUrl || '',
      backImageUrl: c.backImageUrl || '',
    }));
}

export function recordEvent({ type, summary, before = [], created = [], affectedKeys = [], cards = [] }) {
  const normCards = normalizeCards(cards);
  const ev = {
    id: genId(),
    ts: Date.now(),
    type,
    summary: summary || '',
    before: before.map(b => ({ key: b.key, card: cloneEntry(b.card) })),
    created: [...created],
    affectedKeys: [...affectedKeys],
    cards: normCards,
    dismissed: false,
    undone: false,
  };
  log.unshift(ev);
  if (log.length > CAP) log.length = CAP;
  persist();
  renderBannerStack();
  if (historyDetailsEl && historyDetailsEl.open) renderHistoryList();
  return ev;
}

export function undoEvent(id) {
  const ev = log.find(e => e.id === id);
  if (!ev || ev.undone) return;

  // Remove created cards (these still match by collectionKey since they
  // weren't mutated after creation)
  if (ev.created && ev.created.length) {
    const createdSet = new Set(ev.created);
    state.collection = state.collection.filter(c => !createdSet.has(collectionKey(c)));
  }

  // Restore before-entries. The pre-mutation key may differ from the
  // post-mutation key (e.g. bulk-edit changed location), so we drop one live
  // entry per before-card by matching soft identity (scryfallId + setCode +
  // cn + name). Drops at most one live entry per before-entry to avoid
  // collateral damage when multiple entries share the same printing.
  if (ev.before && ev.before.length) {
    const remove = new Set();
    for (const b of ev.before) {
      if (!b.card) continue;
      const sid = softIdentity(b.card);
      const beforeKey = b.key;
      let matchIdx = -1;
      // Prefer an exact key match (untouched entry); fall back to soft id.
      for (let i = 0; i < state.collection.length; i++) {
        if (remove.has(i)) continue;
        if (collectionKey(state.collection[i]) === beforeKey) { matchIdx = i; break; }
      }
      if (matchIdx === -1) {
        for (let i = 0; i < state.collection.length; i++) {
          if (remove.has(i)) continue;
          if (softIdentity(state.collection[i]) === sid) { matchIdx = i; break; }
        }
      }
      if (matchIdx !== -1) remove.add(matchIdx);
    }
    state.collection = state.collection.filter((_, i) => !remove.has(i));
    for (const b of ev.before) {
      if (b.card) state.collection.push(cloneEntry(b.card));
    }
  }

  ev.undone = true;
  persist();
  commitCollectionChange();
  renderBannerStack();
  if (historyDetailsEl && historyDetailsEl.open) renderHistoryList();
}

export function dismissEvent(id) {
  const ev = log.find(e => e.id === id);
  if (!ev) return;
  ev.dismissed = true;
  persist();
  renderBannerStack();
  if (historyDetailsEl && historyDetailsEl.open) renderHistoryList();
}

export function clearLog() {
  log = [];
  persist();
  renderBannerStack();
  if (historyDetailsEl && historyDetailsEl.open) renderHistoryList();
}

export function getLog({ activeOnly = false } = {}) {
  if (activeOnly) return log.filter(e => !e.dismissed && !e.undone);
  return [...log];
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatTs(ts) {
  const d = new Date(ts);
  return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatTsIso(ts) {
  return new Date(ts).toISOString();
}

function renderCardNamesHtml(cards, className) {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  const shown = cards.slice(0, CARDS_PREVIEW_LIMIT);
  const remaining = cards.length - shown.length;
  const parts = shown.map(c => {
    const previewAttr = c.imageUrl ? ' data-preview-url="' + esc(c.imageUrl) + '"' : '';
    const cls = c.imageUrl ? className + ' card-preview-link' : className;
    return '<span class="' + esc(cls) + '"' + previewAttr + '>' + esc(c.name) + '</span>';
  });
  let html = ' ' + parts.join(', ');
  if (remaining > 0) {
    html += '<span class="changelog-more-muted"> · +' + remaining + ' more</span>';
  }
  return html;
}

export function renderBannerStack() {
  if (!bannersEl) return;
  const active = log.filter(e => !e.dismissed && !e.undone).slice(0, ACTIVE_BANNERS);
  if (active.length === 0) {
    bannersEl.innerHTML = '';
    bannersEl.classList.remove('active');
    return;
  }
  bannersEl.classList.add('active');
  bannersEl.innerHTML = active.map(ev => {
    const cardsHtml = renderCardNamesHtml(ev.cards, 'changelog-card-name');
    return '<div class="changelog-banner" data-event-id="' + esc(ev.id) + '">' +
      '<span class="changelog-summary">' + esc(ev.summary) + cardsHtml + '</span>' +
      '<span class="changelog-banner-actions">' +
        '<button class="changelog-undo" type="button" data-action="undo">undo</button>' +
        '<button class="changelog-dismiss" type="button" data-action="dismiss" aria-label="dismiss">×</button>' +
      '</span>' +
    '</div>';
  }).join('');
}

function renderHistoryList() {
  if (!historyListEl) return;
  if (log.length === 0) {
    historyListEl.innerHTML = '<li class="history-empty">no changes yet</li>';
    return;
  }
  historyListEl.innerHTML = log.map(ev => {
    const cls = ev.undone ? 'history-undone' : (ev.dismissed ? 'history-dismissed' : '');
    const cardsHtml = renderCardNamesHtml(ev.cards, 'history-card-name');
    return '<li class="' + cls + '">' +
      '<time datetime="' + esc(formatTsIso(ev.ts)) + '">' + esc(formatTs(ev.ts)) + '</time> ' +
      '<span class="history-summary-text">' + esc(ev.summary) + cardsHtml + '</span>' +
    '</li>';
  }).join('');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportLogCsv() {
  const header = 'timestamp,iso,type,summary,affected_count,undone,dismissed';
  const rows = log.map(ev => [
    csvCell(ev.ts),
    csvCell(formatTsIso(ev.ts)),
    csvCell(ev.type),
    csvCell(ev.summary),
    csvCell((ev.affectedKeys || []).length || (ev.before || []).length || (ev.created || []).length),
    csvCell(ev.undone ? 'true' : 'false'),
    csvCell(ev.dismissed ? 'true' : 'false'),
  ].join(','));
  return header + '\n' + rows.join('\n');
}

function downloadCsv() {
  const csv = exportLogCsv();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mtgcollection-history-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function initChangelog() {
  bannersEl = document.getElementById('changelogBanners');
  historyDetailsEl = document.getElementById('historyDetails');
  historyListEl = document.getElementById('historyList');

  log = load();

  if (bannersEl) {
    bannersEl.addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const banner = btn.closest('.changelog-banner');
      if (!banner) return;
      const id = banner.dataset.eventId;
      if (!id) return;
      if (btn.dataset.action === 'undo') undoEvent(id);
      else if (btn.dataset.action === 'dismiss') dismissEvent(id);
    });
  }

  if (historyDetailsEl) {
    historyDetailsEl.addEventListener('toggle', () => {
      if (historyDetailsEl.open) renderHistoryList();
    });
  }

  const exportBtn = document.getElementById('exportHistoryBtn');
  if (exportBtn) exportBtn.addEventListener('click', downloadCsv);

  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (log.length === 0) return;
      if (!confirm('clear ' + log.length + ' history ' + (log.length === 1 ? 'entry' : 'entries') + '?')) return;
      clearLog();
    });
  }

  renderBannerStack();
}
