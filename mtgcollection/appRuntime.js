const collectionCommitHooks = new Set();

export function onCollectionCommit(handler) {
  if (typeof handler !== 'function') return () => {};
  collectionCommitHooks.add(handler);
  return () => collectionCommitHooks.delete(handler);
}

export function runCollectionCommitHooks(context = {}) {
  for (const handler of collectionCommitHooks) handler(context);
}

export function resetCollectionCommitHooks() {
  collectionCommitHooks.clear();
}
