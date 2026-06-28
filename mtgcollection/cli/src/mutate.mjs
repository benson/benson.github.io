// Unified write path. Every mutating command (add/rm/move/edit/tag/container/
// import) expresses itself as a pure transform of the snapshot; we diff before
// vs after into granular sync ops (reusing the app's diffSyncSnapshots) and push
// once with optimistic concurrency, retrying on a revision conflict by
// re-reading and re-diffing. This never emits snapshot.replace/history/ui ops,
// so it stays within what a CLI OAuth token is allowed to push.
import { diffSyncSnapshots } from '../vendor/syncOps.js';
import { collectionKey } from '../vendor/collection.js';
import { emptySnapshot } from './snapshot.mjs';
import { CliError } from './errors.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Capture the before-values of exactly the keys a set of ops touches, so `bp
// undo` can restore them without disturbing anything else.
function captureUndo(before, ops) {
  const collectionKeys = new Set();
  const containerKeys = new Set();
  for (const op of ops) {
    const p = op.payload || {};
    if (op.type.startsWith('collection.')) {
      for (const k of [p.key, p.beforeKey, p.afterKey]) if (k) collectionKeys.add(k);
    } else if (op.type.startsWith('container.') && p.key) {
      containerKeys.add(p.key);
    }
  }
  const collection = {};
  for (const key of collectionKeys) {
    collection[key] = (before.app.collection || []).find(e => collectionKey(e) === key) || null;
  }
  const containers = {};
  for (const key of containerKeys) containers[key] = (before.app.containers || {})[key] || null;
  return { collection, containers };
}

export async function loadSnapshot(session) {
  const boot = await session.bootstrap();
  return {
    snapshot: boot.hasCloudData && boot.snapshot ? boot.snapshot : emptySnapshot(),
    revision: boot.revision || 0,
    collectionId: boot.collectionId || null,
    hasCloudData: !!boot.hasCloudData,
  };
}

// mutate(draft) edits the snapshot clone in place. It may return metadata (e.g.
// a human summary) and may throw a CliError to abort. Returns { ops, revision,
// snapshot, noop, meta }. With dryRun, computes ops but does not push.
export async function applyMutation(session, mutate, { attempts = 4, dryRun = false } = {}) {
  let lastConflict;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { snapshot, revision } = await loadSnapshot(session);
    const before = clone(snapshot);
    const draft = clone(snapshot);
    const meta = mutate(draft) || {};
    const ops = diffSyncSnapshots(before, draft);
    if (!ops.length) return { ops: [], revision, snapshot: draft, noop: true, meta };
    const undo = captureUndo(before, ops);
    if (dryRun) return { ops, revision, snapshot: draft, dryRun: true, meta, undo };
    try {
      const result = await session.push({ ops, baseRevision: revision });
      return { ops, revision: result.revision, snapshot: result.snapshot, meta, undo: { ...undo, resultRevision: result.revision } };
    } catch (err) {
      if (err.conflict && attempt < attempts - 1) { lastConflict = err; continue; }
      throw err;
    }
  }
  throw lastConflict || new CliError('could not apply change after several retries');
}
