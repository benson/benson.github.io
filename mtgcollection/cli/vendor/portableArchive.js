import { ensureContainersForCollection } from './collection.js';
import { applyLoadedState } from './state.js';
import { normalizeStoredAppData, serializeAppState } from './storageSchema.js';

export const PORTABLE_ARCHIVE_KIND = 'mtgcollection.archive';
export const PORTABLE_ARCHIVE_VERSION = 1;

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

export function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map(ev => cloneJson(ev, null))
    .filter(Boolean);
}

export function normalizeShareRecords(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map(record => ({
      shareId: String(record.shareId || record.id || '').trim(),
      containerKey: String(record.containerKey || '').trim(),
      kind: String(record.kind || 'deck'),
      owned: Boolean(record.owned),
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : null,
      updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : null,
    }))
    .filter(record => record.shareId);
}

export function extractShareRecords(appData) {
  const out = [];
  const containers = isPlainObject(appData?.containers) ? appData.containers : {};
  for (const [containerKey, container] of Object.entries(containers)) {
    if (!container || container.type !== 'deck' || !container.shareId) continue;
    out.push({
      shareId: String(container.shareId),
      containerKey,
      kind: 'deck',
      owned: false,
      createdAt: container.createdAt || null,
      updatedAt: container.updatedAt || null,
    });
  }
  return out;
}

export function makeSyncSnapshot({ app, history = [], shares = [] } = {}) {
  const appData = normalizeStoredAppData(app);
  if (!appData) return null;
  return {
    app: appData,
    history: normalizeHistory(history),
    shares: normalizeShareRecords(shares.length ? shares : extractShareRecords(appData)),
  };
}

export function captureSyncSnapshot(stateRef, { history = [] } = {}) {
  return makeSyncSnapshot({
    app: serializeAppState(stateRef),
    history,
  });
}

export function buildPortableArchive({ stateRef = null, snapshot = null, history = [] } = {}) {
  const syncSnapshot = snapshot
    ? makeSyncSnapshot(snapshot)
    : captureSyncSnapshot(stateRef, { history });
  if (!syncSnapshot) return null;
  return {
    kind: PORTABLE_ARCHIVE_KIND,
    version: PORTABLE_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot: syncSnapshot,
  };
}

export function normalizePortableArchive(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.kind === PORTABLE_ARCHIVE_KIND) {
    const version = Number(raw.version || 1);
    if (version !== PORTABLE_ARCHIVE_VERSION) return null;
    const snapshot = makeSyncSnapshot(raw.snapshot || raw);
    if (!snapshot) return null;
    return {
      kind: PORTABLE_ARCHIVE_KIND,
      version: PORTABLE_ARCHIVE_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      snapshot,
    };
  }

  // Accept the existing raw localStorage shape as a convenience import.
  const legacyApp = normalizeStoredAppData(raw.app || raw);
  if (!legacyApp) return null;
  return buildPortableArchive({
    snapshot: {
      app: legacyApp,
      history: normalizeHistory(raw.history),
      shares: normalizeShareRecords(raw.shares),
    },
  });
}

export function portableArchiveToJson(archive) {
  return JSON.stringify(archive, null, 2);
}

export function parsePortableArchiveJson(text) {
  try {
    return normalizePortableArchive(JSON.parse(text));
  } catch (e) {
    return null;
  }
}

export function applySyncSnapshotToState(snapshot, {
  applyLoadedStateImpl = applyLoadedState,
  ensureContainersForCollectionImpl = ensureContainersForCollection,
  replaceHistoryImpl = null,
} = {}) {
  const normalized = makeSyncSnapshot(snapshot);
  if (!normalized) return false;
  const app = normalized.app;
  applyLoadedStateImpl({
    collection: app.collection,
    containers: app.containers,
    viewMode: app.ui.viewMode,
    activeLocation: null,
    viewAsList: app.ui.viewAsList,
    selectedFormat: app.ui.selectedFormat,
    sortField: app.ui.sortField,
    sortDir: app.ui.sortDir,
  });
  ensureContainersForCollectionImpl();
  if (typeof replaceHistoryImpl === 'function') replaceHistoryImpl(normalized.history);
  return true;
}
