export const SIDEBAR_COLLAPSED_KEY = 'mtgcollection_sidebar_collapsed_v1';

function safeGet(storage, key) {
  try { return storage?.getItem(key) || ''; } catch (e) { return ''; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch (e) {}
}

function isNarrowLayout(documentObj) {
  return !!documentObj?.defaultView?.matchMedia?.('(max-width: 900px)')?.matches;
}

function syncSidebarToggle(button, collapsed, {
  mobileOpen = false,
  narrowLayout = false,
} = {}) {
  if (!button) return;
  const isEdgeToggle = button.matches?.('[data-sidebar-edge-toggle]');
  const expanded = isEdgeToggle && narrowLayout ? mobileOpen : !collapsed;
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  button.title = expanded ? 'hide filters' : 'show filters';
  button.setAttribute('aria-label', expanded ? 'hide filters' : 'show filters');
  if (isEdgeToggle) {
    button.textContent = expanded ? '<' : '>';
  }
}

function sidebarToggleButtons(documentObj) {
  return Array.from(documentObj?.querySelectorAll?.('[data-sidebar-edge-toggle]') || []);
}

function syncSidebarToggles(documentObj, collapsed) {
  const mobileOpen = documentObj?.body?.classList.contains('left-drawer-open');
  const narrowLayout = isNarrowLayout(documentObj);
  sidebarToggleButtons(documentObj).forEach(button => {
    syncSidebarToggle(button, collapsed, { mobileOpen, narrowLayout });
  });
}

export function applySidebarCollapsed(collapsed, {
  documentObj = globalThis.document,
} = {}) {
  documentObj?.body?.classList.toggle('left-sidebar-collapsed', !!collapsed);
  syncSidebarToggles(documentObj, !!collapsed);
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
  const buttons = sidebarToggleButtons(documentObj);
  if (!buttons.length) return () => {};

  const onClick = event => {
    if (event.currentTarget?.matches?.('[data-sidebar-edge-toggle]') && isNarrowLayout(documentObj)) {
      documentObj.body.classList.toggle('left-drawer-open');
      syncSidebarToggles(documentObj, documentObj.body.classList.contains('left-sidebar-collapsed'));
      return;
    }

    const collapsed = !documentObj.body.classList.contains('left-sidebar-collapsed');
    safeSet(storage, SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    applySidebarCollapsed(collapsed, { documentObj });
  };
  buttons.forEach(button => button.addEventListener('click', onClick));
  syncSidebarToggles(documentObj, documentObj.body.classList.contains('left-sidebar-collapsed'));
  return () => buttons.forEach(button => button.removeEventListener('click', onClick));
}
