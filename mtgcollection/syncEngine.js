import { state } from './state.js';
import { commitCollectionChange } from './commit.js';
import { applySyncSnapshotToState, buildPortableArchive, captureSyncSnapshot, parsePortableArchiveJson, portableArchiveToJson } from './portableArchive.js';
import { diffSyncSnapshots, makeSyncOp } from './syncOps.js';
import { applySyncOps } from './syncReducer.js';
import { onSyncChange } from './syncRuntime.js';
import { serializeHistory, replaceLog } from './changelog.js';
import { showFeedback } from './feedback.js';
import { setShareAuthTokenProvider } from './share.js';
import {
  addPendingOps,
  clearPendingImportSnapshot,
  clearPendingOps,
  getLocalSyncSnapshot,
  getPendingOps,
  getSyncMeta,
  removePendingOps,
  setLocalSyncSnapshot,
  setPendingImportSnapshot,
  setSyncMeta,
} from './localSyncStore.js';
import { createSyncClient } from './syncClient.js';
import { initSyncAuth } from './syncAuth.js';

let baselineSnapshot = null;
let syncClient = null;
let auth = null;
let meta = null;
let applyingRemote = false;
let pushTimer = null;
let liveSocket = null;
let renderImpl = () => {};
let populateFiltersImpl = () => {};
const listeners = new Set();

let status = {
  mode: 'local',
  label: 'local',
  detail: 'local collection',
  user: null,
  pending: 0,
  revision: 0,
  configured: false,
};

function cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch (e) { return fallback; }
}

function currentSnapshot() {
  return captureSyncSnapshot(state, { history: serializeHistory() });
}

function sameSnapshot(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function emit(patch = {}) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

function isOfflineSyncError(error) {
  const message = String(error?.message || error || '');
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return browserOffline
    || /sync service is unreachable|failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

function isBackendAvailabilityError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '');
  return status === 429
    || status === 503
    || /quota|limit exceeded|daily limits|resource limits|error 1027|D1|database unavailable|backend unavailable/i.test(message);
}

async function reportSyncFailure(error) {
  if (isOfflineSyncError(error)) {
    await refreshPendingStatus({
      mode: 'queued',
      label: 'offline queued',
      detail: 'local changes saved here; waiting for network',
    });
    return;
  }
  if (isBackendAvailabilityError(error)) {
    await refreshPendingStatus({
      mode: 'queued',
      label: 'queued',
      detail: 'cloud sync unavailable; local changes saved here',
    });
    return;
  }
  emit({ mode: 'error', label: 'sync error', detail: error.message || String(error) });
}

export function onSyncStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function refreshPendingStatus(patch = {}) {
  const pending = await getPendingOps();
  emit({
    pending: pending.length,
    ...patch,
  });
}

async function setBaseline(snapshot, revision = status.revision) {
  baselineSnapshot = cloneJson(snapshot, snapshot);
  await setLocalSyncSnapshot(baselineSnapshot);
  await setSyncMeta({ baseRevision: revision });
  meta = await getSyncMeta();
  emit({ revision });
}

async function applyRemoteSnapshot(snapshot, revision) {
  applyingRemote = true;
  try {
    applySyncSnapshotToState(snapshot, { replaceHistoryImpl: replaceLog });
    await setBaseline(snapshot, revision);
    populateFiltersImpl();
    renderImpl();
  } finally {
    applyingRemote = false;
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow().catch(e => reportSyncFailure(e));
  }, 700);
}

async function handleLocalChange() {
  if (applyingRemote) return;
  const after = currentSnapshot();
  if (!after) return;
  if (!baselineSnapshot) {
    await setBaseline(after, status.revision || 0);
    return;
  }
  const ops = diffSyncSnapshots(baselineSnapshot, after);
  if (!ops.length) {
    await setLocalSyncSnapshot(after);
    return;
  }
  await addPendingOps(ops);
  baselineSnapshot = after;
  await setLocalSyncSnapshot(after);
  await refreshPendingStatus({
    mode: auth?.user ? 'queued' : 'local',
    label: auth?.user ? 'queued' : 'local',
    detail: auth?.user ? 'changes waiting to sync' : 'local collection',
  });
  if (auth?.user) schedulePush();
}

async function connectLive() {
  if (!syncClient || !auth?.user || liveSocket) return;
  try {
    liveSocket = await syncClient.openLive({
      onMessage(message) {
        if (message?.type === 'revision' && message.revision > (status.revision || 0)) {
          syncNow().catch(e => reportSyncFailure(e));
        }
      },
      onClose() {
        liveSocket = null;
        if (auth?.user) setTimeout(() => connectLive(), 3000);
      },
    });
  } catch (e) {
    liveSocket = null;
  }
}

async function bootstrapCloud() {
  if (!syncClient || !auth?.user) return;
  emit({ mode: 'syncing', label: 'syncing', detail: 'checking cloud collection', user: auth.user });
  const local = currentSnapshot();
  const response = await syncClient.bootstrap();
  if (!response?.hasCloudData) {
    const claimed = await syncClient.claim(local);
    await clearPendingOps();
    await setSyncMeta({
      userId: auth.user.id,
      collectionId: claimed.collectionId || '',
      baseRevision: claimed.revision || 1,
    });
    meta = await getSyncMeta();
    await setBaseline(claimed.snapshot || local, claimed.revision || 1);
    await refreshPendingStatus({ mode: 'synced', label: 'synced', detail: 'cloud collection claimed' });
    connectLive();
    return;
  }

  const cloudSnapshot = response.snapshot;
  if (local && cloudSnapshot && !sameSnapshot(local, cloudSnapshot)) {
    await setPendingImportSnapshot(local);
  }
  await setSyncMeta({
    userId: auth.user.id,
    collectionId: response.collectionId || '',
    baseRevision: response.revision || 0,
  });
  meta = await getSyncMeta();
  await applyRemoteSnapshot(cloudSnapshot, response.revision || 0);
  await refreshPendingStatus({
    mode: 'synced',
    label: 'synced',
    detail: 'up to date',
  });
  connectLive();
}

export async function loadLocalSyncSnapshotIntoState() {
  const snapshot = await getLocalSyncSnapshot();
  if (!snapshot) return false;
  return applySyncSnapshotToState(snapshot, { replaceHistoryImpl: replaceLog });
}

export async function primeSyncBaseline() {
  const snapshot = currentSnapshot();
  if (snapshot) await setBaseline(snapshot, status.revision || 0);
}

export async function initSyncEngine({ render = () => {}, populateFilters = () => {} } = {}) {
  renderImpl = render;
  populateFiltersImpl = populateFilters;
  meta = await getSyncMeta();
  emit({ revision: meta.baseRevision || 0 });
  baselineSnapshot = (await getLocalSyncSnapshot()) || currentSnapshot();
  if (baselineSnapshot) await setLocalSyncSnapshot(baselineSnapshot);

  onSyncChange(() => { handleLocalChange(); });

  try {
    auth = await initSyncAuth({
      onChange: user => {
        emit({ user, configured: true });
        if (user) bootstrapCloud().catch(e => reportSyncFailure(e));
        else emit({ mode: 'local', label: 'local', detail: 'signed out local collection' });
      },
    });
    syncClient = createSyncClient({ getToken: () => auth.getToken() });
    setShareAuthTokenProvider(() => auth.getToken());
    emit({
      configured: auth.configured,
      user: auth.user,
      mode: auth.user ? 'syncing' : 'local',
      label: auth.user ? 'syncing' : 'local',
      detail: auth.configured ? 'sync ready' : 'configure Clerk to enable cloud sync',
    });
    if (auth.user) await bootstrapCloud();
  } catch (e) {
    auth = null;
    emit({
      mode: 'local',
      label: 'local',
      configured: false,
      user: null,
      detail: 'cloud sign-in unavailable: ' + (e.message || String(e)),
    });
  }
  await refreshPendingStatus();
}

export async function signIn() {
  if (!auth?.configured) {
    const detail = String(status.detail || '');
    showFeedback(detail.startsWith('cloud sign-in unavailable:')
      ? detail
      : 'cloud sync needs a Clerk publishable key configured', 'error');
    return;
  }
  emit({ mode: 'signing-in', label: 'signing in', detail: 'opening sign in' });
  await auth.signIn();
}

export async function signOut() {
  if (!auth) return;
  if (liveSocket) liveSocket.close();
  liveSocket = null;
  await auth.signOut();
  emit({ mode: 'local', label: 'local', user: null, detail: 'signed out local collection' });
}

export async function openAccount() {
  if (auth?.user) await auth.openAccount();
}

export async function syncNow() {
  try {
    if (!auth?.user || !syncClient) {
      await refreshPendingStatus({ mode: 'local', label: 'local', detail: 'sign in to sync' });
      return;
    }
    emit({ mode: 'syncing', label: 'syncing', detail: 'pushing changes' });
    meta = await getSyncMeta();
    const pending = await getPendingOps();
    if (pending.length) {
      const snapshot = applySyncOps(baselineSnapshot || currentSnapshot(), pending);
      const pushed = await syncClient.push({
        clientId: meta.clientId,
        baseRevision: meta.baseRevision || status.revision || 0,
        ops: pending,
        snapshot,
      });
      await removePendingOps(pushed.acceptedOpIds || pending.map(op => op.id));
      await applyRemoteSnapshot(pushed.snapshot || snapshot, pushed.revision || status.revision);
    }
    const pulled = await syncClient.pull(status.revision || 0);
    if (pulled?.snapshot && pulled.revision >= (status.revision || 0)) {
      await applyRemoteSnapshot(pulled.snapshot, pulled.revision);
    } else if (pulled?.ops?.length) {
      const snapshot = applySyncOps(baselineSnapshot || currentSnapshot(), pulled.ops);
      await applyRemoteSnapshot(snapshot, pulled.revision || status.revision);
    }
    await refreshPendingStatus({ mode: 'synced', label: 'synced', detail: 'up to date' });
    connectLive();
  } catch (e) {
    await reportSyncFailure(e);
  }
}

export function exportPortableJson() {
  const archive = buildPortableArchive({ snapshot: currentSnapshot() });
  return portableArchiveToJson(archive);
}

export async function importPortableJson(text, { merge = false } = {}) {
  const archive = parsePortableArchiveJson(text);
  if (!archive) throw new Error('not a valid mtgcollection JSON file');
  const imported = archive.snapshot;
  const op = merge
    ? makeSyncOp('snapshot.replace', { snapshot: imported })
    : makeSyncOp('snapshot.replace', { snapshot: imported });
  applyingRemote = true;
  try {
    applySyncSnapshotToState(imported, { replaceHistoryImpl: replaceLog });
    populateFiltersImpl();
    renderImpl();
  } finally {
    applyingRemote = false;
  }
  await setBaseline(imported, status.revision || 0);
  await addPendingOps([op]);
  commitCollectionChange();
  await refreshPendingStatus({
    mode: auth?.user ? 'queued' : 'local',
    label: auth?.user ? 'queued' : 'local',
    detail: auth?.user ? 'import waiting to sync' : 'imported locally',
  });
  if (auth?.user) schedulePush();
}

export async function importPendingLocalSnapshot() {
  const { getPendingImportSnapshot } = await import('./localSyncStore.js');
  const pending = await getPendingImportSnapshot();
  if (!pending) return;
  const op = makeSyncOp('snapshot.replace', { snapshot: pending });
  applyingRemote = true;
  try {
    applySyncSnapshotToState(pending, { replaceHistoryImpl: replaceLog });
    populateFiltersImpl();
    renderImpl();
  } finally {
    applyingRemote = false;
  }
  await setBaseline(pending, status.revision || 0);
  await addPendingOps([op]);
  await clearPendingImportSnapshot();
  await refreshPendingStatus({ mode: 'queued', label: 'queued', detail: 'local import waiting to sync' });
  schedulePush();
}

export function getSyncStatus() {
  return status;
}

export async function getSyncAuthToken() {
  return auth?.getToken ? auth.getToken() : null;
}

export function getSyncUser() {
  return auth?.user || null;
}
