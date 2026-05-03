import { state } from './state.js';
import { save } from './persistence.js';
import {
  getActiveLocation,
  setTopLevelViewMode,
  VALID_VIEW_MODES,
} from './routeState.js';
import { isLightboxVisible } from './ui/cardPreview.js';

export function bindAppShellActions({
  documentObj = globalThis.document,
  stateRef = state,
  headerViewsEl = documentObj?.querySelector('.app-header-views'),
  tableHeadEl = documentObj?.querySelector('table thead'),
  fabClusterEl = documentObj?.getElementById('fabCluster'),
  appRightBackdropEl = documentObj?.getElementById('appRightBackdrop'),
  detailDrawerEl = documentObj?.getElementById('detailDrawer'),
  getActiveLocationImpl = getActiveLocation,
  setTopLevelViewModeImpl = setTopLevelViewMode,
  getEffectiveShapeImpl = () => '',
  currentDeckScopeImpl = () => null,
  openRightDrawerImpl = () => {},
  closeRightDrawerImpl = () => {},
  isRightDrawerOpenImpl = () => false,
  isLightboxVisibleImpl = isLightboxVisible,
  navigateToLocationImpl = () => {},
  saveImpl = save,
  renderImpl = () => {},
} = {}) {
  const cleanups = [];

  if (headerViewsEl) {
    const onHeaderClick = event => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      const next = button.dataset.view;
      if (!VALID_VIEW_MODES.includes(next)) return;
      if (stateRef.viewMode === next && !getActiveLocationImpl()) return;
      setTopLevelViewModeImpl(next);
      saveImpl();
      renderImpl();
    };
    headerViewsEl.addEventListener('click', onHeaderClick);
    cleanups.push(() => headerViewsEl.removeEventListener('click', onHeaderClick));
  }

  const onBodyClick = event => {
    const button = event.target.closest('[data-view-as-list]');
    if (!button) return;
    stateRef.viewAsList = !stateRef.viewAsList;
    saveImpl();
    renderImpl();
  };
  documentObj?.body?.addEventListener('click', onBodyClick);
  cleanups.push(() => documentObj?.body?.removeEventListener('click', onBodyClick));

  if (tableHeadEl) {
    const onSortClick = event => {
      if (event.target.closest('.sort-clear-btn')) {
        stateRef.sortField = null;
        stateRef.sortDir = 'asc';
        saveImpl();
        renderImpl();
        return;
      }
      const header = event.target.closest('th[data-sort]');
      if (!header) return;
      const field = header.dataset.sort;
      if (field === 'name') {
        if (stateRef.sortField === null || (stateRef.sortField === 'name' && stateRef.sortDir === 'asc')) {
          stateRef.sortField = 'name';
          stateRef.sortDir = 'desc';
        } else {
          stateRef.sortField = null;
          stateRef.sortDir = 'asc';
        }
      } else if (stateRef.sortField === field && stateRef.sortDir === 'asc') {
        stateRef.sortDir = 'desc';
      } else if (stateRef.sortField === field && stateRef.sortDir === 'desc') {
        stateRef.sortField = null;
        stateRef.sortDir = 'asc';
      } else {
        stateRef.sortField = field;
        stateRef.sortDir = 'asc';
      }
      saveImpl();
      renderImpl();
    };
    tableHeadEl.addEventListener('click', onSortClick);
    cleanups.push(() => tableHeadEl.removeEventListener('click', onSortClick));
  }

  if (fabClusterEl) {
    const onFabClick = event => {
      const button = event.target.closest('[data-fab-target]');
      if (!button) return;
      const targets = button.dataset.fabTarget.split(',').map(part => part.trim()).filter(Boolean);
      const seedLocation = getEffectiveShapeImpl() === 'deck' ? currentDeckScopeImpl() : null;
      openRightDrawerImpl(targets, { seedLocation });
    };
    fabClusterEl.addEventListener('click', onFabClick);
    cleanups.push(() => fabClusterEl.removeEventListener('click', onFabClick));
  }

  if (appRightBackdropEl) {
    appRightBackdropEl.addEventListener('click', closeRightDrawerImpl);
    cleanups.push(() => appRightBackdropEl.removeEventListener('click', closeRightDrawerImpl));
  }

  const onEscape = event => {
    if (event.key !== 'Escape') return;
    if (!isRightDrawerOpenImpl()) return;
    if (isLightboxVisibleImpl()) return;
    if (detailDrawerEl && detailDrawerEl.classList.contains('visible')) return;
    closeRightDrawerImpl();
  };
  documentObj?.addEventListener('keydown', onEscape);
  cleanups.push(() => documentObj?.removeEventListener('keydown', onEscape));

  const onLocationPillClick = event => {
    if (event.target.closest('.loc-pill-remove')) return;
    if (event.target.closest('.deck-empty-chip')) return;
    const pill = event.target.closest('.loc-pill');
    if (!pill) return;
    const type = pill.dataset.locType;
    const name = pill.dataset.locName;
    if (type && name) navigateToLocationImpl(type, name);
  };
  documentObj?.addEventListener('click', onLocationPillClick);
  cleanups.push(() => documentObj?.removeEventListener('click', onLocationPillClick));

  return () => cleanups.forEach(cleanup => cleanup());
}
