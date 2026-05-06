export const SIDEBAR_COLLAPSED_KEY = 'mtgcollection_sidebar_collapsed_v1';

function safeGet(storage, key) {
  try { return storage?.getItem(key) || ''; } catch (e) { return ''; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch (e) {}
}

function syncSidebarToggle(button, collapsed) {
  if (!button) return;
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  button.title = collapsed ? 'show filters' : 'hide filters';
}

export function applySidebarCollapsed(collapsed, {
  documentObj = globalThis.document,
} = {}) {
  documentObj?.body?.classList.toggle('left-sidebar-collapsed', !!collapsed);
  syncSidebarToggle(documentObj?.getElementById('sidebarToggleBtn'), !!collapsed);
}

export function loadSidebarPreference({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  applySidebarCollapsed(safeGet(storage, SIDEBAR_COLLAPSED_KEY) === '1', { documentObj });
}

export function bindSidebarToggle({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  const button = documentObj?.getElementById('sidebarToggleBtn');
  if (!button) return () => {};

  const onClick = () => {
    const collapsed = !documentObj.body.classList.contains('left-sidebar-collapsed');
    safeSet(storage, SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    applySidebarCollapsed(collapsed, { documentObj });
  };
  button.addEventListener('click', onClick);
  syncSidebarToggle(button, documentObj.body.classList.contains('left-sidebar-collapsed'));
  return () => button.removeEventListener('click', onClick);
}
