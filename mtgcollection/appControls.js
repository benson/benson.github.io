import { state } from './state.js';
import { save } from './persistence.js';
import { clearAllFilters } from './search.js';
import { render } from './view.js?bulk-location-picker-4';
import { renderDetailLegality } from './detail.js';
import { setTopLevelViewMode } from './routeState.js';
import { syncSidebarTabFlow } from './sidebarTabFlow.js';

export const TEXT_CASE_KEY = 'mtgcollection_text_case_v1';
export const CHROME_KEY = 'mtgcollection_chrome_v1';
export const TEXT_SIZE_KEY = 'mtgcollection_text_size_v1';
export const DRAWER_TAB_KEY = 'mtgcollection_drawer_tab_v1';

export function applyTextCase(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('proper-case', mode === 'proper');
}

export function applyChrome(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('chrome-classic', mode === 'classic');
}

export function applyTextSize(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('text-size-compact', mode === 'compact');
  bodyEl?.classList.toggle('text-size-large', mode === 'large');
  const rootEl = bodyEl?.ownerDocument?.documentElement;
  rootEl?.classList.toggle('text-size-compact', mode === 'compact');
  rootEl?.classList.toggle('text-size-large', mode === 'large');
}

export function applyDrawerTab(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('sidebar-tab-simple', mode === 'simple');
}

function safeGet(storage, key) {
  try { return storage?.getItem(key) || ''; } catch (e) { return ''; }
}

function safeSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch (e) {}
}

export function loadChromePreferences({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
} = {}) {
  applyTextCase(safeGet(storage, TEXT_CASE_KEY), documentObj?.body);
  applyChrome(safeGet(storage, CHROME_KEY), documentObj?.body);
  applyTextSize(safeGet(storage, TEXT_SIZE_KEY), documentObj?.body);
  applyDrawerTab(safeGet(storage, DRAWER_TAB_KEY), documentObj?.body);
}

export function bindAppControls({
  documentObj = globalThis.document,
  storage = globalThis.localStorage,
  stateRef = state,
  saveImpl = save,
  renderImpl = render,
  renderDetailLegalityImpl = renderDetailLegality,
  clearAllFiltersImpl = clearAllFilters,
  setTopLevelViewModeImpl = setTopLevelViewMode,
  historyObj = globalThis.history,
  locationObj = globalThis.location,
} = {}) {
  const cleanups = [];
  const bodyEl = documentObj?.body;
  const formatSelectEl = documentObj?.getElementById('formatSelect');
  const footerEl = documentObj?.querySelector('.app-footer');
  const settingsToggleBtn = documentObj?.getElementById('settingsToggleBtn');
  const settingsPopoverEl = documentObj?.getElementById('settingsPopover');

  const updateFooter = () => {
    footerEl?.classList.toggle('format-active', !!stateRef.selectedFormat);
  };

  const syncFormatSelect = () => {
    if (formatSelectEl) formatSelectEl.value = stateRef.selectedFormat;
    updateFooter();
  };

  if (formatSelectEl) {
    const onFormatChange = () => {
      stateRef.selectedFormat = formatSelectEl.value;
      saveImpl();
      updateFooter();
      if (stateRef.detailIndex >= 0) renderDetailLegalityImpl();
      renderImpl();
    };
    formatSelectEl.addEventListener('change', onFormatChange);
    cleanups.push(() => formatSelectEl.removeEventListener('change', onFormatChange));
  }
  updateFooter();

  const focusLocationCreator = () => {
    documentObj?.getElementById('locationsCreateName')?.focus();
  };

  const emptyStateEl = documentObj?.getElementById('emptyState');
  if (emptyStateEl) {
    const onEmptyStateClick = event => {
      const btn = event.target.closest('[data-empty-action]');
      if (!btn) return;
      const action = btn.dataset.emptyAction;
      if (action === 'new-deck' || action === 'new-container') {
        setTopLevelViewModeImpl(action === 'new-deck' ? 'decks' : 'storage');
        saveImpl();
        renderImpl();
        focusLocationCreator();
      } else if (action === 'open-import') {
        const det = documentObj?.getElementById('addDetails');
        if (det) det.open = true;
        documentObj?.querySelector('[data-add-mode="import"]')?.click();
      } else if (action === 'load-sample') {
        documentObj?.getElementById('loadSampleBtn')?.click();
      } else if (action === 'load-test') {
        documentObj?.getElementById('loadTestDataBtn')?.click();
      }
    };
    emptyStateEl.addEventListener('click', onEmptyStateClick);
    cleanups.push(() => emptyStateEl.removeEventListener('click', onEmptyStateClick));
  }

  const resetAppBtn = documentObj?.getElementById('resetAppBtn');
  if (resetAppBtn) {
    const onReset = () => {
      clearAllFiltersImpl();
      setTopLevelViewModeImpl('collection');
      stateRef.detailIndex = -1;
      saveImpl();
      if (historyObj && locationObj) historyObj.replaceState(null, '', locationObj.pathname);
      renderImpl();
    };
    resetAppBtn.addEventListener('click', onReset);
    cleanups.push(() => resetAppBtn.removeEventListener('click', onReset));
  }

  if (settingsPopoverEl) {
    const settingButtons = Array.from(settingsPopoverEl.querySelectorAll('[data-settings-key][data-settings-value]'));
    const getCurrentSetting = key => {
      if (key === 'text-case') return bodyEl?.classList.contains('proper-case') ? 'proper' : 'lower';
      if (key === 'chrome') return bodyEl?.classList.contains('chrome-classic') ? 'classic' : 'soft';
      if (key === 'drawer-tab') return bodyEl?.classList.contains('sidebar-tab-simple') ? 'simple' : 'flowing';
      if (key === 'text-size') {
        if (bodyEl?.classList.contains('text-size-compact')) return 'compact';
        if (bodyEl?.classList.contains('text-size-large')) return 'large';
        return 'default';
      }
      return '';
    };
    const syncSettingsButtons = () => {
      settingButtons.forEach(btn => {
        const active = getCurrentSetting(btn.dataset.settingsKey) === btn.dataset.settingsValue;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
    const setSettingsOpen = isOpen => {
      settingsPopoverEl.hidden = !isOpen;
      settingsToggleBtn?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };
    const closeSettings = () => setSettingsOpen(false);

    const onSettingsOptionClick = event => {
      const btn = event.target?.closest?.('[data-settings-key][data-settings-value]');
      if (!btn || !settingsPopoverEl.contains(btn)) return;
      const { settingsKey, settingsValue } = btn.dataset;
      if (settingsKey === 'text-case') {
        safeSet(storage, TEXT_CASE_KEY, settingsValue);
        applyTextCase(settingsValue, bodyEl);
      } else if (settingsKey === 'chrome') {
        safeSet(storage, CHROME_KEY, settingsValue);
        applyChrome(settingsValue, bodyEl);
      } else if (settingsKey === 'drawer-tab') {
        safeSet(storage, DRAWER_TAB_KEY, settingsValue);
        applyDrawerTab(settingsValue, bodyEl);
        syncSidebarTabFlow({ rescan: true });
      } else if (settingsKey === 'text-size') {
        safeSet(storage, TEXT_SIZE_KEY, settingsValue);
        applyTextSize(settingsValue, bodyEl);
      }
      syncSettingsButtons();
    };
    settingsPopoverEl.addEventListener('click', onSettingsOptionClick);
    cleanups.push(() => settingsPopoverEl.removeEventListener('click', onSettingsOptionClick));

    if (settingsToggleBtn) {
      const onSettingsToggle = () => {
        setSettingsOpen(settingsPopoverEl.hidden);
      };
      settingsToggleBtn.addEventListener('click', onSettingsToggle);
      cleanups.push(() => settingsToggleBtn.removeEventListener('click', onSettingsToggle));
    }

    const onDocumentClick = event => {
      if (settingsPopoverEl.hidden) return;
      const target = event.target;
      if (settingsPopoverEl.contains(target) || settingsToggleBtn?.contains(target)) return;
      closeSettings();
    };
    const onDocumentKeydown = event => {
      if (event.key !== 'Escape' || settingsPopoverEl.hidden) return;
      closeSettings();
      settingsToggleBtn?.focus?.();
    };
    documentObj?.addEventListener('click', onDocumentClick);
    documentObj?.addEventListener('keydown', onDocumentKeydown);
    cleanups.push(() => documentObj?.removeEventListener('click', onDocumentClick));
    cleanups.push(() => documentObj?.removeEventListener('keydown', onDocumentKeydown));

    syncSettingsButtons();
  }

  return {
    cleanup: () => cleanups.forEach(cleanup => cleanup()),
    syncFormatSelect,
    updateFooter,
  };
}
