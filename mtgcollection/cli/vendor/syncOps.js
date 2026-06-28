import { collectionKey, containerKey, normalizeContainers } from './collection.js';
import { makeSyncSnapshot } from './portableArchive.js';

export const SYNC_OP_SCHEMA_VERSION = 1;
const SYNCED_UI_KEYS = new Set(['selectedFormat']);

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => (
      JSON.stringify(key) + ':' + stableStringify(value[key])
    )).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function entrySoftIdentity(entry) {
  if (!entry) return '';
  return [
    entry.scryfallId || '',
    entry.setCode || '',
    entry.cn || '',
    entry.name || entry.resolvedName || '',
    entry.finish || '',
    entry.condition || '',
    entry.language || '',
  ].join('|');
}

function opId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export function makeSyncOp(type, payload = {}, options = {}) {
  return {
    schemaVersion: SYNC_OP_SCHEMA_VERSION,
    id: options.id || opId('op'),
    type,
    ts: options.ts || Date.now(),
    payload: cloneJson(payload, {}),
  };
}

function collectionMap(collection = []) {
  const out = new Map();
  for (const entry of collection || []) out.set(collectionKey(entry), entry);
  return out;
}

function containersMap(containers = {}) {
  const out = new Map();
  for (const container of Object.values(normalizeContainers(containers))) {
    out.set(containerKey(container), container);
  }
  return out;
}

function diffCollection(beforeCollection = [], afterCollection = []) {
  const ops = [];
  const before = collectionMap(beforeCollection);
  const after = collectionMap(afterCollection);
  const removed = new Map();
  const added = new Map();

  for (const [key, entry] of before.entries()) {
    if (!after.has(key)) removed.set(key, entry);
  }
  for (const [key, entry] of after.entries()) {
    if (!before.has(key)) added.set(key, entry);
  }

  for (const [key, beforeEntry] of before.entries()) {
    if (!after.has(key)) continue;
    const afterEntry = after.get(key);
    if (sameJson(beforeEntry, afterEntry)) continue;
    const beforeSansQty = { ...beforeEntry, qty: afterEntry.qty };
    if (sameJson(beforeSansQty, afterEntry)) {
      ops.push(makeSyncOp('collection.qtyDelta', {
        key,
        delta: (parseInt(afterEntry.qty, 10) || 0) - (parseInt(beforeEntry.qty, 10) || 0),
        entry: afterEntry,
      }));
    } else {
      ops.push(makeSyncOp('collection.replace', {
        beforeKey: key,
        afterKey: key,
        entry: afterEntry,
      }));
    }
  }

  const matchedRemoved = new Set();
  const matchedAdded = new Set();
  for (const [addedKey, addedEntry] of added.entries()) {
    const addedIdentity = entrySoftIdentity(addedEntry);
    if (!addedIdentity) continue;
    for (const [removedKey, removedEntry] of removed.entries()) {
      if (matchedRemoved.has(removedKey)) continue;
      if (entrySoftIdentity(removedEntry) !== addedIdentity) continue;
      matchedRemoved.add(removedKey);
      matchedAdded.add(addedKey);
      ops.push(makeSyncOp('collection.replace', {
        beforeKey: removedKey,
        afterKey: addedKey,
        entry: addedEntry,
      }));
      break;
    }
  }

  for (const [key, entry] of added.entries()) {
    if (matchedAdded.has(key)) continue;
    ops.push(makeSyncOp('collection.upsert', { key, entry }));
  }
  for (const [key] of removed.entries()) {
    if (matchedRemoved.has(key)) continue;
    ops.push(makeSyncOp('collection.remove', { key }));
  }
  return ops;
}

function diffContainers(beforeContainers = {}, afterContainers = {}) {
  const ops = [];
  const before = containersMap(beforeContainers);
  const after = containersMap(afterContainers);
  for (const [key, container] of after.entries()) {
    if (!before.has(key) || !sameJson(before.get(key), container)) {
      ops.push(makeSyncOp('container.upsert', { key, container }));
    }
  }
  for (const [key] of before.entries()) {
    if (!after.has(key)) ops.push(makeSyncOp('container.remove', { key }));
  }
  return ops;
}

function diffUi(beforeUi = {}, afterUi = {}) {
  const patch = {};
  for (const key of Object.keys(afterUi || {})) {
    if (!SYNCED_UI_KEYS.has(key)) continue;
    if (!sameJson(beforeUi?.[key], afterUi[key])) patch[key] = cloneJson(afterUi[key], afterUi[key]);
  }
  return Object.keys(patch).length ? [makeSyncOp('ui.patch', { patch })] : [];
}

function diffHistory(beforeHistory = [], afterHistory = []) {
  if (sameJson(beforeHistory, afterHistory)) return [];
  const beforeIds = new Set(beforeHistory.map(ev => ev?.id).filter(Boolean));
  const appended = afterHistory.filter(ev => ev?.id && !beforeIds.has(ev.id));
  if (appended.length && beforeHistory.length + appended.length === afterHistory.length) {
    return appended.map(event => makeSyncOp('history.append', { event }));
  }
  return [makeSyncOp('history.replace', { history: afterHistory })];
}

export function diffSyncSnapshots(beforeRaw, afterRaw) {
  const before = makeSyncSnapshot(beforeRaw);
  const after = makeSyncSnapshot(afterRaw);
  if (!after) return [];
  if (!before) return [makeSyncOp('snapshot.replace', { snapshot: after })];

  const ops = [
    ...diffCollection(before.app.collection, after.app.collection),
    ...diffContainers(before.app.containers, after.app.containers),
    ...diffUi(before.app.ui, after.app.ui),
    ...diffHistory(before.history, after.history),
  ];

  // Shares are derived from containers today. If future share metadata diverges,
  // sync the whole snapshot rather than silently dropping ownership state.
  if (!sameJson(before.shares, after.shares) && ops.length === 0) {
    ops.push(makeSyncOp('snapshot.replace', { snapshot: after }));
  }
  return ops;
}
