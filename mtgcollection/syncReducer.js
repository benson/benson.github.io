import {
  collectionKey,
  containerKey,
  normalizeCollectionEntry,
  normalizeContainers,
} from './collection.js';
import { makeSyncSnapshot } from './portableArchive.js';
import { normalizeStoredUi } from './storageSchema.js';

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

function removeCollectionKey(collection, key) {
  return (collection || []).filter(entry => collectionKey(entry) !== key);
}

function upsertCollectionEntry(collection, entry) {
  const normalized = normalizeCollectionEntry(entry, { preserveResolvedFields: true });
  const key = collectionKey(normalized);
  const out = removeCollectionKey(collection, key);
  out.push(normalized);
  return out;
}

function normalizeSnapshotForMutation(snapshot) {
  const normalized = makeSyncSnapshot(snapshot) || makeSyncSnapshot({ app: { collection: [], containers: {}, ui: {} } });
  return cloneJson(normalized, { app: { collection: [], containers: {}, ui: {} }, history: [], shares: [] });
}

function applyOne(snapshot, op) {
  const next = normalizeSnapshotForMutation(snapshot);
  const payload = op?.payload || {};
  if (op?.type === 'snapshot.replace') {
    return normalizeSnapshotForMutation(payload.snapshot);
  }

  if (op?.type === 'collection.upsert') {
    next.app.collection = upsertCollectionEntry(next.app.collection, payload.entry);
  } else if (op?.type === 'collection.remove') {
    next.app.collection = removeCollectionKey(next.app.collection, payload.key);
  } else if (op?.type === 'collection.qtyDelta') {
    const idx = next.app.collection.findIndex(entry => collectionKey(entry) === payload.key);
    if (idx === -1) {
      if ((payload.delta || 0) > 0 && payload.entry) {
        next.app.collection = upsertCollectionEntry(next.app.collection, {
          ...payload.entry,
          qty: payload.delta,
        });
      }
    } else {
      const current = next.app.collection[idx];
      const qty = (parseInt(current.qty, 10) || 0) + (parseInt(payload.delta, 10) || 0);
      if (qty <= 0) next.app.collection.splice(idx, 1);
      else current.qty = qty;
    }
  } else if (op?.type === 'collection.replace') {
    next.app.collection = removeCollectionKey(next.app.collection, payload.beforeKey);
    next.app.collection = upsertCollectionEntry(next.app.collection, payload.entry);
  } else if (op?.type === 'container.upsert') {
    const normalized = normalizeContainers({ [payload.key]: payload.container });
    const container = Object.values(normalized)[0];
    if (container) {
      if (!next.app.containers || typeof next.app.containers !== 'object') next.app.containers = {};
      next.app.containers[containerKey(container)] = container;
    }
  } else if (op?.type === 'container.remove') {
    if (next.app.containers && payload.key) delete next.app.containers[payload.key];
  } else if (op?.type === 'ui.patch') {
    next.app.ui = normalizeStoredUi({ ...next.app.ui, ...(payload.patch || {}) });
  } else if (op?.type === 'history.append') {
    if (payload.event) next.history.unshift(cloneJson(payload.event, payload.event));
  } else if (op?.type === 'history.replace') {
    next.history = Array.isArray(payload.history) ? cloneJson(payload.history, []) : [];
  }

  return makeSyncSnapshot(next);
}

export function applySyncOps(snapshot, ops = []) {
  let next = normalizeSnapshotForMutation(snapshot);
  for (const op of ops || []) next = applyOne(next, op);
  return makeSyncSnapshot(next);
}
