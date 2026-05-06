import { state } from './state.js';
import { binderSlotCount, normalizedBinderOrder } from './binder.js?binder-playlist-4';
import { locationKey } from './collection.js';
import { save } from './persistence.js';
import {
  applyBinderSizeButtons,
  applyBinderExploreControls,
  applyBinderPriceToggle,
  saveBinderPrices,
  saveBinderSize,
  saveBinderViewPrefs,
  VALID_BINDER_MODES,
  VALID_BINDER_SORTS,
  VALID_BINDER_SIZES,
} from './views/binderView.js?binder-playlist-4';

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
  binderModeControlEl = documentObj?.getElementById('binderModeControl'),
  binderSortSelectEl = documentObj?.getElementById('binderSortSelect'),
  binderSearchInputEl = documentObj?.getElementById('binderSearchInput'),
  binderColorFilterEl = documentObj?.getElementById('binderColorFilter'),
  binderTypeFilterEl = documentObj?.getElementById('binderTypeFilter'),
  binderLensResetEl = documentObj?.getElementById('binderLensReset'),
  searchInputEl = documentObj?.getElementById('searchInput'),
  filterEls = ['filterSet', 'filterRarity', 'filterFoil', 'filterLocation', 'filterTag']
    .map(id => documentObj?.getElementById(id))
    .filter(Boolean),
  getEffectiveShapeImpl = () => '',
  getActiveBinderContainerImpl = () => null,
  navigateToLocationImpl = () => {},
  openDetailImpl = () => {},
  renderImpl = () => {},
  saveImpl = save,
  saveBinderSizeImpl = saveBinderSize,
  saveBinderPricesImpl = saveBinderPrices,
  saveBinderViewPrefsImpl = saveBinderViewPrefs,
  applyBinderSizeButtonsImpl = applyBinderSizeButtons,
  applyBinderPriceToggleImpl = applyBinderPriceToggle,
  applyBinderExploreControlsImpl = applyBinderExploreControls,
} = {}) {
  const cleanups = [];
  let draggingSlot = null;
  let suppressSlotClickUntil = 0;

  const updateBinderLens = (mutate) => {
    if (typeof mutate === 'function') mutate();
    stateRef.binderPage = 0;
    saveBinderViewPrefsImpl();
    applyBinderExploreControlsImpl();
    renderImpl();
  };

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

  if (binderModeControlEl) {
    const onModeClick = event => {
      const button = event.target.closest('[data-binder-mode]');
      if (!button) return;
      if (!VALID_BINDER_MODES.includes(button.dataset.binderMode)) return;
      updateBinderLens(() => {
        stateRef.binderMode = button.dataset.binderMode;
      });
    };
    binderModeControlEl.addEventListener('click', onModeClick);
    cleanups.push(() => binderModeControlEl.removeEventListener('click', onModeClick));
  }

  if (binderSortSelectEl) {
    const onSortChange = () => {
      const value = VALID_BINDER_SORTS.includes(binderSortSelectEl.value) ? binderSortSelectEl.value : 'binder';
      updateBinderLens(() => { stateRef.binderSort = value; });
    };
    binderSortSelectEl.addEventListener('change', onSortChange);
    cleanups.push(() => binderSortSelectEl.removeEventListener('change', onSortChange));
  }

  if (binderSearchInputEl) {
    const onSearchInput = () => {
      updateBinderLens(() => { stateRef.binderSearch = binderSearchInputEl.value || ''; });
    };
    binderSearchInputEl.addEventListener('input', onSearchInput);
    cleanups.push(() => binderSearchInputEl.removeEventListener('input', onSearchInput));
  }

  if (binderColorFilterEl) {
    const onColorChange = () => {
      updateBinderLens(() => { stateRef.binderColorFilter = binderColorFilterEl.value || ''; });
    };
    binderColorFilterEl.addEventListener('change', onColorChange);
    cleanups.push(() => binderColorFilterEl.removeEventListener('change', onColorChange));
  }

  if (binderTypeFilterEl) {
    const onTypeChange = () => {
      updateBinderLens(() => { stateRef.binderTypeFilter = binderTypeFilterEl.value || ''; });
    };
    binderTypeFilterEl.addEventListener('change', onTypeChange);
    cleanups.push(() => binderTypeFilterEl.removeEventListener('change', onTypeChange));
  }

  if (binderLensResetEl) {
    const onLensReset = () => {
      updateBinderLens(() => {
        stateRef.binderSort = 'binder';
        stateRef.binderSearch = '';
        stateRef.binderColorFilter = '';
        stateRef.binderTypeFilter = '';
      });
    };
    binderLensResetEl.addEventListener('click', onLensReset);
    cleanups.push(() => binderLensResetEl.removeEventListener('click', onLensReset));
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
      if (Date.now() < suppressSlotClickUntil) return;
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
    const currentBinderCards = container => {
      const key = locationKey(container);
      return (stateRef.collection || []).filter(c => locationKey(c.location) === key);
    };
    const onDragStart = event => {
      if (getEffectiveShapeImpl() !== 'binder' || stateRef.binderMode !== 'organize') return;
      const slot = event.target.closest('.binder-slot[data-binder-draggable="true"]');
      if (!slot) return;
      draggingSlot = parseInt(slot.dataset.binderSlot, 10);
      if (!Number.isInteger(draggingSlot)) return;
      event.dataTransfer?.setData('text/plain', String(draggingSlot));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      slot.classList.add('is-dragging');
    };
    const onDragOver = event => {
      if (getEffectiveShapeImpl() !== 'binder' || stateRef.binderMode !== 'organize') return;
      const slot = event.target.closest('.binder-slot[data-binder-slot]');
      if (!slot) return;
      event.preventDefault();
      slot.classList.add('is-drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    };
    const clearDragOver = () => {
      binderPagesEl.querySelectorAll('.is-drag-over, .is-dragging').forEach(el => {
        el.classList.remove('is-drag-over', 'is-dragging');
      });
    };
    const onDragLeave = event => {
      const slot = event.target.closest('.binder-slot[data-binder-slot]');
      if (!slot || slot.contains(event.relatedTarget)) return;
      slot.classList.remove('is-drag-over');
    };
    const onDrop = event => {
      if (getEffectiveShapeImpl() !== 'binder' || stateRef.binderMode !== 'organize') return;
      const slot = event.target.closest('.binder-slot[data-binder-slot]');
      if (!slot) return;
      event.preventDefault();
      const from = parseInt(event.dataTransfer?.getData('text/plain') || String(draggingSlot), 10);
      const to = parseInt(slot.dataset.binderSlot, 10);
      clearDragOver();
      draggingSlot = null;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
      const container = getActiveBinderContainerImpl();
      if (!container) return;
      const cards = currentBinderCards(container);
      const slotsPerPage = binderSlotCount(stateRef.binderSize);
      const order = normalizedBinderOrder(container, cards, slotsPerPage);
      if (from < 0 || from >= order.length || to < 0 || to >= order.length || !order[from]) return;
      const target = order[to] || null;
      order[to] = order[from];
      order[from] = target;
      container.binderOrder = order;
      container.updatedAt = Date.now();
      suppressSlotClickUntil = Date.now() + 400;
      saveImpl();
      renderImpl();
    };
    const onDragEnd = () => {
      draggingSlot = null;
      clearDragOver();
    };
    binderPagesEl.addEventListener('dragstart', onDragStart);
    binderPagesEl.addEventListener('dragover', onDragOver);
    binderPagesEl.addEventListener('dragleave', onDragLeave);
    binderPagesEl.addEventListener('drop', onDrop);
    binderPagesEl.addEventListener('dragend', onDragEnd);
    cleanups.push(() => binderPagesEl.removeEventListener('click', onPagesClick));
    cleanups.push(() => binderPagesEl.removeEventListener('keydown', onPagesKeydown));
    cleanups.push(() => binderPagesEl.removeEventListener('dragstart', onDragStart));
    cleanups.push(() => binderPagesEl.removeEventListener('dragover', onDragOver));
    cleanups.push(() => binderPagesEl.removeEventListener('dragleave', onDragLeave));
    cleanups.push(() => binderPagesEl.removeEventListener('drop', onDrop));
    cleanups.push(() => binderPagesEl.removeEventListener('dragend', onDragEnd));
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
