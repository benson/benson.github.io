import { state } from './state.js';
import { runSyncChangeHooks } from './syncRuntime.js';
import {
  collectionKey,
  deleteEmptyContainer,
  ensureContainer,
  formatLocationLabel,
  locationKey,
  normalizeLocation,
  renameContainer,
} from './collection.js';
import { esc } from './feedback.js';
import { LOC_ICONS } from './ui/locationUi.js';

const CHANGELOG_KEY = 'mtgcollection_changelog_v1';
const CAP = 200;
let log = [];
let historyTargets = [];
let commitCollectionChangeHandler = () => {};
let navigateToLocationHandler = () => {};

export function configureChangelogActions({ commitCollectionChangeImpl, navigateToLocationImpl } = {}) {
  if (typeof commitCollectionChangeImpl === 'function') commitCollectionChangeHandler = commitCollectionChangeImpl;
  if (typeof navigateToLocationImpl === 'function') navigateToLocationHandler = navigateToLocationImpl;
}

function persist() {
  try {
    localStorage.setItem(CHANGELOG_KEY, JSON.stringify(log));
    runSyncChangeHooks({ reason: 'history-save', history: getLog() });
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

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value || null;
  return JSON.parse(JSON.stringify(value));
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

export function recordEvent({
  type,
  summary,
  before = [],
  created = [],
  affectedKeys = [],
  cards = [],
  scope,
  deckLocation,
  containerBefore = null,
  containerAfter = null,
  deckBefore = null,
  deckAfter = null,
}) {
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
    scope: scope === 'deck' ? 'deck' : 'collection',
    deckLocation: deckLocation || '',
    containerBefore: clonePlain(containerBefore),
    containerAfter: clonePlain(containerAfter),
    deckBefore: clonePlain(deckBefore),
    deckAfter: clonePlain(deckAfter),
    dismissed: false,
    undone: false,
  };
  log.unshift(ev);
  if (log.length > CAP) log.length = CAP;
  persist();
  renderHistoryList();
  return ev;
}

let currentScope = null;

export function setHistoryScope(scope) {
  const next = scope?.kind === 'decks'
    ? { kind: 'decks' }
    : scope?.kind === 'storage' ? { kind: 'storage' }
    : scope && scope.type && scope.name ? { type: scope.type, name: scope.name } : null;
  const same = (!next && !currentScope) ||
    (next?.kind === 'decks' && currentScope?.kind === 'decks') ||
    (next?.kind === 'storage' && currentScope?.kind === 'storage') ||
    (next && currentScope && next.type === currentScope.type && next.name === currentScope.name);
  if (same) return;
  currentScope = next;
  renderHistoryList();
}

function eventTouchesLocation(ev, type, name) {
  const key = type + ':' + name;
  if (locationKey(ev.containerBefore) === key || locationKey(ev.containerAfter) === key) return true;
  if (ev.deckLocation === key) return true;
  if (Array.isArray(ev.affectedKeys) && ev.affectedKeys.length) {
    const keys = new Set(ev.affectedKeys);
    if (state.collection.some(c => keys.has(collectionKey(c)) && locationKey(c.location) === key)) return true;
  }
  if (Array.isArray(ev.before)) {
    for (const b of ev.before) {
      const loc = normalizeLocation(b.card?.location);
      if (loc?.type === type && loc?.name === name) return true;
    }
  }
  return false;
}

function affectedKeysTouchTypes(ev, types) {
  if (!Array.isArray(ev.affectedKeys) || ev.affectedKeys.length === 0) return false;
  const keys = new Set(ev.affectedKeys);
  return state.collection.some(c => keys.has(collectionKey(c)) && types.includes(normalizeLocation(c.location)?.type));
}

function eventIsDeckRelated(ev) {
  if (!ev) return false;
  if (['deck-create', 'deck-rename', 'deck-update'].includes(ev.type)) return true;
  if (ev.scope === 'deck' || ev.deckLocation) return true;
  if (normalizeLocation(ev.containerBefore)?.type === 'deck' || normalizeLocation(ev.containerAfter)?.type === 'deck') return true;
  return affectedKeysTouchTypes(ev, ['deck']);
}

function eventIsStorageRelated(ev) {
  if (!ev) return false;
  const storageTypes = ['binder', 'box'];
  if (['storage-create', 'storage-rename', 'storage-delete'].includes(ev.type)) return true;
  if (storageTypes.includes(normalizeLocation(ev.containerBefore)?.type)) return true;
  if (storageTypes.includes(normalizeLocation(ev.containerAfter)?.type)) return true;
  if (Array.isArray(ev.before)) {
    for (const b of ev.before) {
      if (storageTypes.includes(normalizeLocation(b.card?.location)?.type)) return true;
    }
  }
  return affectedKeysTouchTypes(ev, storageTypes);
}

function eventVisibleInScope(ev) {
  if (currentScope?.kind === 'decks') return eventIsDeckRelated(ev);
  if (currentScope?.kind === 'storage') return eventIsStorageRelated(ev);
  if (!currentScope) return true;
  return eventTouchesLocation(ev, currentScope.type, currentScope.name);
}

export function undoEvent(id) {
  const ev = log.find(e => e.id === id);
  if (!ev || ev.undone) return;

  if ((ev.type === 'deck-create' || ev.type === 'storage-create') && ev.containerAfter) {
    deleteEmptyContainer(ev.containerAfter);
  } else if ((ev.type === 'deck-rename' || ev.type === 'storage-rename') && ev.containerBefore && ev.containerAfter) {
    renameContainer(ev.containerAfter, ev.containerBefore);
  } else if (ev.type === 'storage-delete' && ev.containerBefore) {
    ensureContainer(ev.containerBefore);
  } else if (ev.type === 'deck-update' && ev.containerAfter && ev.deckBefore) {
    const deck = ensureContainer(ev.containerAfter);
    if (deck && deck.type === 'deck') deck.deck = clonePlain(ev.deckBefore);
  }

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
  commitCollectionChangeHandler();
  renderHistoryList();
}

export function dismissEvent(id) {
  const ev = log.find(e => e.id === id);
  if (!ev) return;
  ev.dismissed = true;
  persist();
  renderHistoryList();
}

export function clearLog() {
  log = [];
  persist();
  renderHistoryList();
}

export function getLog({ activeOnly = false } = {}) {
  if (activeOnly) return log.filter(e => !e.dismissed && !e.undone);
  return [...log];
}

export function replaceLog(nextLog = []) {
  log = Array.isArray(nextLog)
    ? nextLog.filter(e => e && typeof e === 'object').map(e => JSON.parse(JSON.stringify(e)))
    : [];
  if (log.length > CAP) log.length = CAP;
  persist();
  renderHistoryList();
}

export function serializeHistory() {
  return getLog();
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatTs(ts) {
  const d = new Date(ts);
  const h24 = d.getHours();
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'am' : 'pm';
  return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' +
    h12 + ':' + pad(d.getMinutes()) + ampm;
}

function formatTsIso(ts) {
  return new Date(ts).toISOString();
}

function cardSpanHtml(c, className) {
  if (!c) return '';
  const previewAttr = c.imageUrl ? ' data-preview-url="' + esc(c.imageUrl) + '"' : '';
  const cls = c.imageUrl ? className + ' card-preview-link' : className;
  return '<span class="' + esc(cls) + '"' + previewAttr + '>' + esc(c.name) + '</span>';
}

function locLinkHtml(type, name) {
  const icon = LOC_ICONS[type] || LOC_ICONS.box;
  return '<button type="button" class="loc-link loc-link-' + esc(type) + '"' +
    ' data-loc-type="' + esc(type) + '" data-loc-name="' + esc(name) + '"' +
    ' title="' + esc(type) + ':' + esc(name) + '">' +
    icon + '<span class="loc-link-name">' + esc(name) + '</span>' +
  '</button>';
}

function substituteLocTokens(html) {
  return html.replace(/\{loc:(deck|binder|box):([^}]+)\}/g, (_, type, name) => locLinkHtml(type, name));
}

function normalizeSummaryText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function summaryIncludesCard(summary, card) {
  const name = normalizeSummaryText(card?.name || '');
  if (!name) return false;
  return normalizeSummaryText(summary).includes(name);
}

// Compose a summary line: substitutes `{card}` with the first card's clickable
// span when present; otherwise appends the card list after the summary text
// (legacy behavior, used by older events and multi-card events).
// Also substitutes `{loc:type:name}` tokens with clickable view-switch buttons.
function composeSummary(summary, cards, className) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const missingCards = safeCards.filter(card => !summaryIncludesCard(summary, card));
  const escapedSummary = esc(summary || '');

  let html;
  if (escapedSummary.includes('{card}') && safeCards.length > 0) {
    html = escapedSummary.replace('{card}', cardSpanHtml(safeCards[0], className));
    if (safeCards.length > 1) {
      const rest = safeCards.slice(1, CARDS_PREVIEW_LIMIT);
      const restHtml = rest.map(c => cardSpanHtml(c, className)).join(', ');
      const remaining = safeCards.length - 1 - rest.length;
      html += ' (' + restHtml + (remaining > 0 ? ', +' + remaining + ' more' : '') + ')';
    }
  } else if (missingCards.length === 0) {
    html = escapedSummary;
  } else {
    const shown = missingCards.slice(0, CARDS_PREVIEW_LIMIT);
    const remaining = missingCards.length - shown.length;
    html = escapedSummary + ' ' + shown.map(c => cardSpanHtml(c, className)).join(', ');
    if (remaining > 0) {
      html += '<span class="changelog-more-muted"> · +' + remaining + ' more</span>';
    }
  }
  return substituteLocTokens(html);
}

// Helpers for building natural-language summaries — exported so call sites
// (view.js inline edits, detail.js drawer save) stay consistent.
function locToken(loc) {
  const n = normalizeLocation(loc);
  return n ? '{loc:' + n.type + ':' + n.name + '}' : '';
}

export function locationDiffSummary(before, after) {
  const b = locToken(before);
  const a = locToken(after);
  if (b && a) return '{card} moved from ' + b + ' to ' + a;
  if (a) return '{card} moved to ' + a;
  if (b) return '{card} removed from ' + b;
  return '{card} location unchanged';
}

export function qtyDiffSummary(before, after) {
  const delta = (after || 0) - (before || 0);
  return (delta > 0 ? '+' : '') + delta + ' {card}';
}

function renderHistoryList() {
  if (!historyTargets.length) return;
  const visible = log.filter(eventVisibleInScope);
  let html;
  if (visible.length === 0) {
    const msg = currentScope?.kind === 'decks'
      ? 'No deck changes yet'
      : currentScope?.kind === 'storage'
        ? 'No storage changes yet'
        : currentScope ? 'No changes for this container yet' : 'No changes yet';
    html = '<li class="history-empty">' + msg + '</li>';
  } else {
    html = visible.map(ev => {
      const cls = ev.undone ? 'history-undone' : (ev.dismissed ? 'history-dismissed' : '');
      const undoBtn = ev.undone
        ? ''
        : '<button class="history-undo" type="button" data-action="undo" data-event-id="' + esc(ev.id) + '">undo</button>';
      return '<li class="' + cls + '">' +
        '<div class="history-row-meta">' +
          '<time datetime="' + esc(formatTsIso(ev.ts)) + '">' + esc(formatTs(ev.ts)) + '</time>' +
          undoBtn +
        '</div>' +
        '<span class="history-summary-text">' + composeSummary(ev.summary, ev.cards, 'history-card-name') + '</span>' +
      '</li>';
    }).join('');
  }
  for (const t of historyTargets) t.list.innerHTML = html;
}

export function initChangelog(options = {}) {
  configureChangelogActions(options);
  historyTargets = [];
  document.querySelectorAll('.history-details').forEach(details => {
    const list = details.querySelector('.history-list');
    if (!list) return;
    historyTargets.push({ details, list });
    details.addEventListener('toggle', () => {
      if (details.open) renderHistoryList();
    });
    list.addEventListener('click', e => {
      const undoBtn = e.target.closest('button.history-undo');
      if (undoBtn) {
        const id = undoBtn.dataset.eventId;
        if (id) undoEvent(id);
        return;
      }
      const locBtn = e.target.closest('button.loc-link');
      if (locBtn) {
        const { locType, locName } = locBtn.dataset;
        if (locType && locName) navigateToLocationHandler(locType, locName);
      }
    });
    const clearBtn = details.querySelector('.history-clear-btn, #clearHistoryBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (log.length === 0) return;
        if (!confirm('clear ' + log.length + ' history ' + (log.length === 1 ? 'entry' : 'entries') + '?')) return;
        clearLog();
      });
    }
  });

  log = load();
  renderHistoryList();
}
