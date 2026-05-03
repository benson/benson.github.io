import { state } from './state.js';
import {
  VALID_DECK_BOARD_FILTERS,
  VALID_DECK_CARD_SIZES,
  VALID_DECK_GROUPS,
  VALID_DECK_MODES,
  VALID_DECK_OWNERSHIP_VIEWS,
} from './deckUi.js';
import { saveDeckGroup, saveDeckPrefs } from './deckPreferences.js';
import { openShareModal } from './share.js';
import {
  moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommand,
} from './commands.js';
import { buildDeckSampleHand } from './deckSampleHand.js';
import { copyDecklist, runDeckExportAction } from './deckExportActions.js';
import { saveDeckMetadataFromForm } from './deckMetadataForm.js';
import {
  closeDeckCardMenus,
  moveFocusInDeckCardMenu,
  openDeckCardMenu,
  toggleDeckCardMenu,
} from './deckCardMenu.js';
import { showFeedback } from './feedback.js';
import { recordEvent } from './changelog.js';

export function setDeckPanelOpen(root, panelId, triggerSelector, open) {
  const panel = root?.querySelector('#' + panelId);
  if (!panel) return false;
  panel.classList.toggle('hidden', !open);
  const trigger = root.querySelector(triggerSelector);
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const first = panel.querySelector('textarea, input, select, button');
    if (first) first.focus();
  }
  return true;
}

export function runDeckCardAction(actionEl, {
  root,
  documentObj = globalThis.document,
  currentDeckContainerImpl = () => null,
  openDetailImpl = () => {},
  moveDeckCardToBoardCommandImpl = moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommandImpl = removeDeckCardFromDeckCommand,
  closeDeckCardMenusImpl = closeDeckCardMenus,
} = {}) {
  const action = actionEl?.dataset.cardAction;
  closeDeckCardMenusImpl(root || documentObj);
  if (action === 'open') {
    const idx = parseInt(actionEl.dataset.inventoryIndex || '-1', 10);
    if (idx >= 0) openDetailImpl(idx);
    return { ok: idx >= 0, action };
  }

  const scryfallId = actionEl?.dataset.scryfallId;
  const board = actionEl?.dataset.board;
  if (!scryfallId || !board) return { ok: false, reason: 'missing-card' };
  const deck = currentDeckContainerImpl();
  if (action === 'move-board') {
    moveDeckCardToBoardCommandImpl(deck, scryfallId, board, actionEl.dataset.boardTarget);
    return { ok: true, action };
  }
  if (action === 'remove-from-deck') {
    removeDeckCardFromDeckCommandImpl(deck, scryfallId, board);
    return { ok: true, action };
  }
  return { ok: false, reason: 'unknown-action' };
}

export function bindDeckWorkspaceInteractions({
  deckColumnsEl,
  deckGroupEl = null,
  documentObj = globalThis.document,
  stateRef = state,
  currentDeckContainerImpl = () => null,
  currentDeckMetadataImpl = () => ({}),
  filteredSortedImpl = () => [],
  getCardById = () => null,
  navigateToLocationImpl = () => {},
  openDetailImpl = () => {},
  openShareModalImpl = openShareModal,
  renderImpl = () => {},
  saveImpl = () => {},
  saveDeckGroupImpl = saveDeckGroup,
  saveDeckPrefsImpl = saveDeckPrefs,
  showFeedbackImpl = showFeedback,
  recordEventImpl = recordEvent,
  buildDeckSampleHandImpl = buildDeckSampleHand,
  copyDecklistImpl = copyDecklist,
  runDeckExportActionImpl = runDeckExportAction,
  saveDeckMetadataFromFormImpl = saveDeckMetadataFromForm,
  closeDeckCardMenusImpl = closeDeckCardMenus,
  openDeckCardMenuImpl = openDeckCardMenu,
  toggleDeckCardMenuImpl = toggleDeckCardMenu,
  moveFocusInDeckCardMenuImpl = moveFocusInDeckCardMenu,
  moveDeckCardToBoardCommandImpl = moveDeckCardToBoardCommand,
  removeDeckCardFromDeckCommandImpl = removeDeckCardFromDeckCommand,
  deckPreviewPanel = null,
} = {}) {
  if (!deckColumnsEl) return () => {};

  const closeMenus = () => closeDeckCardMenusImpl(deckColumnsEl);

  const onDeckGroupChange = () => {
    const value = deckGroupEl.value;
    if (!VALID_DECK_GROUPS.includes(value)) return;
    stateRef.deckGroupBy = value;
    saveDeckGroupImpl();
    renderImpl();
  };

  if (deckGroupEl) {
    deckGroupEl.value = stateRef.deckGroupBy;
    deckGroupEl.addEventListener('change', onDeckGroupChange);
  }

  const onClick = event => {
    const chip = event.target.closest('.deck-empty-chip');
    if (chip) {
      const pill = chip.querySelector('.loc-pill');
      if (pill) navigateToLocationImpl(pill.dataset.locType, pill.dataset.locName);
      return;
    }

    const modeButton = event.target.closest('[data-deck-mode]');
    if (modeButton) {
      const mode = modeButton.dataset.deckMode;
      if (!VALID_DECK_MODES.includes(mode)) return;
      stateRef.deckMode = mode;
      saveDeckPrefsImpl();
      renderImpl();
      return;
    }

    const boardFilterButton = event.target.closest('[data-deck-board-filter]');
    if (boardFilterButton) {
      const filter = boardFilterButton.dataset.deckBoardFilter;
      if (!VALID_DECK_BOARD_FILTERS.includes(filter)) return;
      stateRef.deckBoardFilter = filter;
      saveDeckPrefsImpl();
      renderImpl();
      return;
    }

    const sizeButton = event.target.closest('[data-deck-card-size]');
    if (sizeButton) {
      const size = sizeButton.dataset.deckCardSize;
      if (!VALID_DECK_CARD_SIZES.includes(size)) return;
      stateRef.deckCardSize = size;
      saveDeckPrefsImpl();
      renderImpl();
      return;
    }

    const ownershipButton = event.target.closest('[data-deck-ownership]');
    if (ownershipButton) {
      const value = ownershipButton.dataset.deckOwnership;
      if (!VALID_DECK_OWNERSHIP_VIEWS.includes(value)) return;
      stateRef.deckOwnershipView = value;
      saveDeckPrefsImpl();
      renderImpl();
      return;
    }

    if (event.target.closest('[data-add-companion]')) {
      const wrap = event.target.closest('.deck-metadata-companion');
      const input = wrap?.querySelector('input[name="companion"]');
      const button = wrap?.querySelector('[data-add-companion]');
      if (input) {
        input.hidden = false;
        input.focus();
      }
      if (button) button.remove();
      return;
    }

    if (event.target.closest('[data-deck-action="share"]')) {
      const deck = currentDeckContainerImpl();
      if (deck) openShareModalImpl(deck);
      return;
    }

    const exportToggle = event.target.closest('[data-toggle-deck-export]');
    if (exportToggle) {
      event.stopPropagation();
      const panel = deckColumnsEl.querySelector('#deckExportPanel');
      setDeckPanelOpen(deckColumnsEl, 'deckExportPanel', '[data-toggle-deck-export]', panel?.classList.contains('hidden'));
      return;
    }

    if (event.target.closest('[data-close-deck-export]')) {
      setDeckPanelOpen(deckColumnsEl, 'deckExportPanel', '[data-toggle-deck-export]', false);
      return;
    }

    const menuToggle = event.target.closest('[data-card-menu-toggle]');
    if (menuToggle) {
      event.preventDefault();
      event.stopPropagation();
      toggleDeckCardMenuImpl(menuToggle);
      return;
    }

    const cardAction = event.target.closest('[data-card-action]');
    if (cardAction) {
      event.preventDefault();
      event.stopPropagation();
      runDeckCardAction(cardAction, {
        root: deckColumnsEl,
        documentObj,
        currentDeckContainerImpl,
        openDetailImpl,
        moveDeckCardToBoardCommandImpl,
        removeDeckCardFromDeckCommandImpl,
        closeDeckCardMenusImpl,
      });
      return;
    }

    const textNameButton = event.target.closest('.deck-text-table .card-name-button');
    if (textNameButton) {
      openDetailImpl(parseInt(textNameButton.dataset.index, 10));
      return;
    }

    if (!event.target.closest('input, select, button, a')) {
      const textRow = event.target.closest('.deck-text-table tr.detail-trigger');
      if (textRow) {
        openDetailImpl(parseInt(textRow.dataset.index, 10));
        return;
      }
    }

    const editButton = event.target.closest('[data-edit-deck-details]');
    if (editButton) {
      const editor = deckColumnsEl.querySelector('#deckDetailsEditor');
      if (!editor) return;
      editor.classList.remove('hidden');
      editButton.setAttribute('aria-expanded', 'true');
      const firstInput = editor.querySelector('input[name="title"]');
      if (firstInput) firstInput.focus();
      return;
    }

    const cancelButton = event.target.closest('[data-cancel-deck-details]');
    if (cancelButton) {
      const editor = deckColumnsEl.querySelector('#deckDetailsEditor');
      if (editor) editor.classList.add('hidden');
      const toggle = deckColumnsEl.querySelector('[data-edit-deck-details]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    const sampleButton = event.target.closest('[data-sample-hand]');
    if (sampleButton) {
      stateRef.deckSampleHand = buildDeckSampleHandImpl({
        deck: currentDeckContainerImpl(),
        collection: stateRef.collection,
        handSize: 7,
      });
      stateRef.deckMode = 'hands';
      saveDeckPrefsImpl();
      renderImpl();
      return;
    }

    const exportAction = event.target.closest('[data-export-action]');
    if (exportAction) {
      runDeckExportActionImpl({
        action: exportAction.dataset.exportAction,
        form: deckColumnsEl.querySelector('#deckExportForm'),
        list: filteredSortedImpl(),
        metadata: currentDeckMetadataImpl(),
        showFeedback: showFeedbackImpl,
      });
      return;
    }

    const copyButton = event.target.closest('[data-copy-decklist]');
    if (copyButton) {
      copyDecklistImpl({
        list: filteredSortedImpl(),
        metadata: currentDeckMetadataImpl(),
        showFeedback: showFeedbackImpl,
      });
      return;
    }

    if (!event.target.closest('.deck-card')) closeMenus();
  };

  const onChange = event => {
    const groupSelect = event.target.closest('[data-deck-group]');
    if (groupSelect) {
      const value = groupSelect.value;
      if (!VALID_DECK_GROUPS.includes(value)) return;
      stateRef.deckGroupBy = value;
      saveDeckGroupImpl();
      renderImpl();
      return;
    }

    const formatPreset = event.target.closest('[data-deck-format-preset]');
    if (formatPreset) {
      const form = formatPreset.closest('#deckMetadataForm');
      const customInput = form?.querySelector('[data-deck-format-custom]');
      if (customInput) {
        const showCustom = formatPreset.value === 'custom';
        customInput.hidden = !showCustom;
        if (showCustom) customInput.focus();
      }
      const effective = formatPreset.value === 'custom' ? (customInput?.value || '') : formatPreset.value;
      if (form) form.dataset.format = effective;
      return;
    }

    const priceToggle = event.target.closest('[data-deck-show-prices]');
    if (priceToggle) {
      stateRef.deckShowPrices = !!priceToggle.checked;
      saveDeckPrefsImpl();
      renderImpl();
    }
  };

  const onSubmit = event => {
    if (event.target.id !== 'deckMetadataForm') return;
    event.preventDefault();
    const deck = currentDeckContainerImpl();
    if (!deck) return;
    const { added } = saveDeckMetadataFromFormImpl({
      form: event.target,
      deck,
      getCardById,
      recordEventImpl,
    });
    saveImpl();
    renderImpl();
    if (added > 0) {
      showFeedbackImpl('added ' + added + ' commander card' + (added === 1 ? '' : 's') + ' to deck', 'success');
    }
  };

  const onKeydown = event => {
    if (event.key === 'Escape') {
      closeMenus();
      return;
    }
    const toggle = event.target.closest('[data-card-menu-toggle]');
    if (toggle && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openDeckCardMenuImpl(toggle, { focusFirst: true });
      return;
    }
    const menu = event.target.closest('.deck-card-menu');
    if (!menu) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocusInDeckCardMenuImpl(menu, event.target, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const items = [...menu.querySelectorAll('[role="menuitem"]:not([disabled])')];
      const target = event.key === 'Home' ? items[0] : items[items.length - 1];
      if (target) target.focus();
    }
  };

  const onDocumentClickCloseMenus = event => {
    if (event.target.closest('.deck-card')) return;
    closeMenus();
  };

  const onMouseover = event => {
    deckPreviewPanel?.showFromTarget(event.target);
  };

  const onFocusin = event => {
    deckPreviewPanel?.showFromTarget(event.target);
  };

  const onDocumentClickCloseExport = event => {
    const panel = deckColumnsEl.querySelector('#deckExportPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (event.target.closest('.deck-export-menu-wrap')) return;
    setDeckPanelOpen(deckColumnsEl, 'deckExportPanel', '[data-toggle-deck-export]', false);
  };

  deckColumnsEl.addEventListener('click', onClick);
  deckColumnsEl.addEventListener('change', onChange);
  deckColumnsEl.addEventListener('submit', onSubmit);
  deckColumnsEl.addEventListener('keydown', onKeydown);
  deckColumnsEl.addEventListener('mouseover', onMouseover);
  deckColumnsEl.addEventListener('focusin', onFocusin);
  documentObj?.addEventListener('click', onDocumentClickCloseMenus);
  documentObj?.addEventListener('click', onDocumentClickCloseExport);

  return () => {
    if (deckGroupEl) deckGroupEl.removeEventListener('change', onDeckGroupChange);
    deckColumnsEl.removeEventListener('click', onClick);
    deckColumnsEl.removeEventListener('change', onChange);
    deckColumnsEl.removeEventListener('submit', onSubmit);
    deckColumnsEl.removeEventListener('keydown', onKeydown);
    deckColumnsEl.removeEventListener('mouseover', onMouseover);
    deckColumnsEl.removeEventListener('focusin', onFocusin);
    documentObj?.removeEventListener('click', onDocumentClickCloseMenus);
    documentObj?.removeEventListener('click', onDocumentClickCloseExport);
  };
}
