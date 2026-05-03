import { state } from './state.js';
import {
  applyBinderSizeButtons,
  applyBinderPriceToggle,
  saveBinderPrices,
  saveBinderSize,
  VALID_BINDER_SIZES,
} from './views/binderView.js';

function isEditableTarget(target) {
  return !!target && (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable
  );
}

export function bindBinderControls({
  documentObj = globalThis.document,
  stateRef = state,
  binderSizeControlEl = documentObj?.getElementById('binderSizeControl'),
  binderPrevEl = documentObj?.getElementById('binderPrev'),
  binderNextEl = documentObj?.getElementById('binderNext'),
  binderPagesEl = documentObj?.getElementById('binderPages'),
  binderPriceToggleEl = documentObj?.getElementById('binderPriceToggle'),
  searchInputEl = documentObj?.getElementById('searchInput'),
  filterEls = ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag']
    .map(id => documentObj?.getElementById(id))
    .filter(Boolean),
  getEffectiveShapeImpl = () => '',
  navigateToLocationImpl = () => {},
  openDetailImpl = () => {},
  renderImpl = () => {},
  saveBinderSizeImpl = saveBinderSize,
  saveBinderPricesImpl = saveBinderPrices,
  applyBinderSizeButtonsImpl = applyBinderSizeButtons,
  applyBinderPriceToggleImpl = applyBinderPriceToggle,
} = {}) {
  const cleanups = [];

  if (binderSizeControlEl) {
    const onSizeClick = event => {
      const button = event.target.closest('[data-binder-size]');
      if (!button) return;
      if (!VALID_BINDER_SIZES.includes(button.dataset.binderSize)) return;
      stateRef.binderSize = button.dataset.binderSize;
      stateRef.binderPage = 0;
      saveBinderSizeImpl();
      applyBinderSizeButtonsImpl();
      renderImpl();
    };
    binderSizeControlEl.addEventListener('click', onSizeClick);
    cleanups.push(() => binderSizeControlEl.removeEventListener('click', onSizeClick));
  }

  if (binderPriceToggleEl) {
    const onPriceToggle = () => {
      stateRef.binderShowPrices = !!binderPriceToggleEl.checked;
      saveBinderPricesImpl();
      applyBinderPriceToggleImpl();
      renderImpl();
    };
    binderPriceToggleEl.addEventListener('change', onPriceToggle);
    cleanups.push(() => binderPriceToggleEl.removeEventListener('change', onPriceToggle));
  }

  if (binderPrevEl) {
    const onPrev = () => {
      if (stateRef.binderPage <= 0) return;
      stateRef.binderPage--;
      renderImpl();
    };
    binderPrevEl.addEventListener('click', onPrev);
    cleanups.push(() => binderPrevEl.removeEventListener('click', onPrev));
  }

  if (binderNextEl) {
    const onNext = () => {
      stateRef.binderPage++;
      renderImpl();
    };
    binderNextEl.addEventListener('click', onNext);
    cleanups.push(() => binderNextEl.removeEventListener('click', onNext));
  }

  if (binderPagesEl) {
    const onPagesClick = event => {
      const chip = event.target.closest('.deck-empty-chip');
      if (chip) {
        const pill = chip.querySelector('.loc-pill');
        if (pill) navigateToLocationImpl(pill.dataset.locType, pill.dataset.locName);
        return;
      }
      const slot = event.target.closest('.binder-slot:not(.binder-slot-empty)');
      if (slot) {
        openDetailImpl(parseInt(slot.dataset.index, 10));
        return;
      }
    };
    const onPagesKeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const slot = event.target.closest('.binder-slot:not(.binder-slot-empty)');
      if (!slot) return;
      event.preventDefault();
      openDetailImpl(parseInt(slot.dataset.index, 10));
    };
    binderPagesEl.addEventListener('click', onPagesClick);
    binderPagesEl.addEventListener('keydown', onPagesKeydown);
    cleanups.push(() => binderPagesEl.removeEventListener('click', onPagesClick));
    cleanups.push(() => binderPagesEl.removeEventListener('keydown', onPagesKeydown));
  }

  const onDocumentKeydown = event => {
    if (getEffectiveShapeImpl() !== 'binder') return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (isEditableTarget(event.target)) return;
    if (event.key === 'ArrowLeft') {
      if (stateRef.binderPage > 0) {
        stateRef.binderPage--;
        renderImpl();
      }
    } else {
      stateRef.binderPage++;
      renderImpl();
    }
  };
  documentObj?.addEventListener('keydown', onDocumentKeydown);
  cleanups.push(() => documentObj?.removeEventListener('keydown', onDocumentKeydown));

  const resetBinderPage = () => {
    stateRef.binderPage = 0;
  };
  if (searchInputEl) {
    searchInputEl.addEventListener('input', resetBinderPage);
    cleanups.push(() => searchInputEl.removeEventListener('input', resetBinderPage));
  }
  filterEls.forEach(element => {
    element.addEventListener('change', resetBinderPage);
    cleanups.push(() => element.removeEventListener('change', resetBinderPage));
  });

  return () => cleanups.forEach(cleanup => cleanup());
}
