import { state } from './state.js';
import { save } from './persistence.js';
import { clearAllFilters } from './search.js';
import { render } from './view.js';
import { renderDetailLegality } from './detail.js';
import { setTopLevelViewMode } from './routeState.js';

export const TEXT_CASE_KEY = 'mtgcollection_text_case_v1';
export const CHROME_KEY = 'mtgcollection_chrome_v1';

export function applyTextCase(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('proper-case', mode === 'proper');
}

export function applyChrome(mode, bodyEl = globalThis.document?.body) {
  bodyEl?.classList.toggle('chrome-classic', mode === 'classic');
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

  const caseToggleBtn = documentObj?.getElementById('caseToggleBtn');
  if (caseToggleBtn) {
    const onCaseToggle = () => {
      const next = bodyEl?.classList.contains('proper-case') ? 'lower' : 'proper';
      safeSet(storage, TEXT_CASE_KEY, next);
      applyTextCase(next, bodyEl);
    };
    caseToggleBtn.addEventListener('click', onCaseToggle);
    cleanups.push(() => caseToggleBtn.removeEventListener('click', onCaseToggle));
  }

  const chromeToggleBtn = documentObj?.getElementById('chromeToggleBtn');
  if (chromeToggleBtn) {
    const onChromeToggle = () => {
      const next = bodyEl?.classList.contains('chrome-classic') ? 'soft' : 'classic';
      safeSet(storage, CHROME_KEY, next);
      applyChrome(next, bodyEl);
    };
    chromeToggleBtn.addEventListener('click', onChromeToggle);
    cleanups.push(() => chromeToggleBtn.removeEventListener('click', onChromeToggle));
  }

  return {
    cleanup: () => cleanups.forEach(cleanup => cleanup()),
    syncFormatSelect,
    updateFooter,
  };
}
