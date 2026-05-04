const syncChangeHooks = new Set();

export function onSyncChange(handler) {
  if (typeof handler !== 'function') return () => {};
  syncChangeHooks.add(handler);
  return () => syncChangeHooks.delete(handler);
}

export function runSyncChangeHooks(context = {}) {
  for (const handler of syncChangeHooks) handler(context);
}

export function resetSyncChangeHooks() {
  syncChangeHooks.clear();
}
