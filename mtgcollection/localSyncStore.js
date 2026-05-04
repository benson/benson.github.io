const DB_NAME = 'mtgcollection_sync_v1';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_META = 'meta';
const KEY_SNAPSHOT = 'snapshot';
const KEY_PENDING = 'pendingOps';
const KEY_IMPORT = 'pendingImportSnapshot';

const memoryStore = new Map();
let dbPromise = null;

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(e => {
    console.warn('[sync] IndexedDB unavailable:', e.message);
    return null;
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return memoryStore.has(key) ? memoryStore.get(key) : null;
  const tx = db.transaction(STORE, 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(key)).then(value => value ?? null);
}

async function idbSet(key, value) {
  const db = await openDb();
  if (!db) {
    memoryStore.set(key, value);
    return;
  }
  const tx = db.transaction(STORE, 'readwrite');
  await requestToPromise(tx.objectStore(STORE).put(value, key));
}

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

function generateClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export async function getSyncMeta() {
  const meta = await idbGet(KEY_META);
  if (meta && typeof meta === 'object') return meta;
  const next = {
    clientId: generateClientId(),
    baseRevision: 0,
    collectionId: '',
    userId: '',
  };
  await idbSet(KEY_META, next);
  return next;
}

export async function setSyncMeta(patch = {}) {
  const prev = await getSyncMeta();
  const next = { ...prev, ...patch };
  await idbSet(KEY_META, next);
  return next;
}

export async function getLocalSyncSnapshot() {
  return cloneJson(await idbGet(KEY_SNAPSHOT), null);
}

export async function setLocalSyncSnapshot(snapshot) {
  await idbSet(KEY_SNAPSHOT, cloneJson(snapshot, snapshot));
}

export async function getPendingOps() {
  const pending = await idbGet(KEY_PENDING);
  return Array.isArray(pending) ? pending : [];
}

export async function addPendingOps(ops = []) {
  if (!ops.length) return getPendingOps();
  const prev = await getPendingOps();
  const next = [...prev, ...ops.map(op => cloneJson(op, op))];
  await idbSet(KEY_PENDING, next);
  return next;
}

export async function removePendingOps(ids = []) {
  const remove = new Set(ids);
  const next = (await getPendingOps()).filter(op => !remove.has(op.id));
  await idbSet(KEY_PENDING, next);
  return next;
}

export async function clearPendingOps() {
  await idbSet(KEY_PENDING, []);
}

export async function getPendingImportSnapshot() {
  return cloneJson(await idbGet(KEY_IMPORT), null);
}

export async function setPendingImportSnapshot(snapshot) {
  await idbSet(KEY_IMPORT, cloneJson(snapshot, snapshot));
}

export async function clearPendingImportSnapshot() {
  await idbSet(KEY_IMPORT, null);
}

export function _resetMemorySyncStore() {
  memoryStore.clear();
  dbPromise = null;
}
