export const HISTORY_DRAWER_COLLAPSED_KEY = 'mtgcollection_history_drawer_collapsed_v1';

function safeGet(storage, key) {
  try { return storage?.getItem(key) || ''; } catch (e) { return ''; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch (e) {}
}

function historyDrawers(documentObj) {
  return Array.from(documentObj?.querySelectorAll?.('[data-history-drawer]') || []);
}

function syncHistoryDrawer(drawer, collapsed) {
  if (!drawer) return;
  drawer.classList.toggle('history-drawer-collapsed', !!collapsed);
  drawer.classList.toggle('history-drawer-open', !collapsed);

  const button = drawer.querySelector('[data-history-drawer-toggle]');
  if (button) {
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.title = collapsed ? 'show history' : 'hide history';
    button.setAttribute('aria-label', collapsed ? 'show history' : 'hide history');
  }

  const body = drawer.querySelector('[data-history-drawer-body]');
  body?.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
}

export function applyHistoryDrawerCollapsed(collapsed, {
  documentObj = globalThis.document,
} = {}) {
  historyDrawers(documentObj).forEach(drawer => syncHistoryDrawer(drawer, !!collapsed));
}

export function loadHistoryDrawerPreference({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  applyHistoryDrawerCollapsed(safeGet(storage, HISTORY_DRAWER_COLLAPSED_KEY) === '1', { documentObj });
}

export function bindHistoryDrawerToggle({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  const buttons = Array.from(documentObj?.querySelectorAll?.('[data-history-drawer-toggle]') || []);
  if (!buttons.length) return () => {};

  const onClick = event => {
    const drawer = event.currentTarget?.closest?.('[data-history-drawer]');
    if (!drawer) return;
    const collapsed = !drawer.classList.contains('history-drawer-collapsed');
    safeSet(storage, HISTORY_DRAWER_COLLAPSED_KEY, collapsed ? '1' : '0');
    syncHistoryDrawer(drawer, collapsed);
  };

  buttons.forEach(button => button.addEventListener('click', onClick));
  return () => buttons.forEach(button => button.removeEventListener('click', onClick));
}
