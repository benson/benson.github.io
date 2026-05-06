import { state } from './state.js';
import {
  collectionKey,
  DEFAULT_LOCATION_TYPE,
  normalizeLocation,
  normalizeTag,
} from './collection.js';
import { commitCollectionChange } from './commit.js';
import { showFeedback } from './feedback.js';
import { captureBefore, locationDiffSummary, recordEvent } from './changelog.js';

function rowCardEventPayload(card) {
  return {
    name: card.resolvedName || card.name || 'card',
    imageUrl: card.imageUrl || '',
    backImageUrl: card.backImageUrl || '',
  };
}

function rowLocationPickerRoot(control) {
  return control?.closest?.('.loc-picker') || control?.closest?.('tr');
}

function revealNewLocationPicker(control) {
  const root = rowLocationPickerRoot(control);
  if (!root) return;
  root.classList.add('is-new');
  root.querySelector('.loc-picker-new')?.classList.remove('hidden');
  root.querySelector('.loc-picker-name')?.focus();
}

function resetNewLocationPicker(control) {
  const root = rowLocationPickerRoot(control);
  if (!root) return;
  root.classList.remove('is-new');
  root.querySelector('.loc-picker-new')?.classList.add('hidden');
  const target = root.querySelector('.loc-picker-target');
  if (target) target.value = '';
  const input = root.querySelector('.loc-picker-name');
  if (input) input.value = '';
}

function readRowLocationPicker(control, normalizeLocationImpl) {
  const root = rowLocationPickerRoot(control);
  const target = root?.querySelector?.('.loc-picker-target');
  if (target && target.value && target.value !== '__new__') {
    return normalizeLocationImpl(target.value);
  }

  const typeSelect = root?.querySelector?.('.loc-picker-type');
  const nameInput = root?.querySelector?.('.loc-picker-name');
  const type = typeSelect ? typeSelect.value : DEFAULT_LOCATION_TYPE;
  const name = nameInput ? nameInput.value : control?.value;
  return normalizeLocationImpl({ type, name });
}

function actionDeps(overrides = {}) {
  return {
    collection: overrides.collection || state.collection,
    captureBeforeImpl: overrides.captureBeforeImpl || captureBefore,
    collectionKeyImpl: overrides.collectionKeyImpl || collectionKey,
    commitImpl: overrides.commitImpl || commitCollectionChange,
    locationDiffSummaryImpl: overrides.locationDiffSummaryImpl || locationDiffSummary,
    normalizeLocationImpl: overrides.normalizeLocationImpl || normalizeLocation,
    normalizeTagImpl: overrides.normalizeTagImpl || normalizeTag,
    recordEventImpl: overrides.recordEventImpl || recordEvent,
    showFeedbackImpl: overrides.showFeedbackImpl || showFeedback,
  };
}

export function commitRowLocationFromPicker(input, overrides = {}) {
  const deps = actionDeps(overrides);
  const index = parseInt(input?.dataset.index, 10);
  const card = deps.collection[index];
  if (!card) return { ok: false, reason: 'missing-card' };

  const location = readRowLocationPicker(input, deps.normalizeLocationImpl);
  if (!location) {
    if (input.classList.contains('loc-picker-name')) input.value = '';
    return { ok: false, reason: 'invalid-location' };
  }

  const beforeKey = deps.collectionKeyImpl(card);
  const before = deps.captureBeforeImpl([beforeKey]);
  card.location = location;
  deps.recordEventImpl({
    type: 'edit',
    summary: deps.locationDiffSummaryImpl(null, location),
    before,
    affectedKeys: [beforeKey],
    cards: [rowCardEventPayload(card)],
  });
  deps.commitImpl({ coalesce: true });
  return { ok: true, location };
}

export function clearRowLocation(index, overrides = {}) {
  const deps = actionDeps(overrides);
  const card = deps.collection[index];
  if (!card || !card.location) return { ok: false, reason: 'missing-location' };

  const beforeLocation = card.location;
  const beforeKey = deps.collectionKeyImpl(card);
  const before = deps.captureBeforeImpl([beforeKey]);
  card.location = null;
  deps.recordEventImpl({
    type: 'edit',
    summary: deps.locationDiffSummaryImpl(beforeLocation, null),
    before,
    affectedKeys: [beforeKey],
    cards: [rowCardEventPayload(card)],
  });
  deps.commitImpl({ coalesce: true });
  return { ok: true };
}

export function commitRowTag(input, overrides = {}) {
  const deps = actionDeps(overrides);
  const index = parseInt(input?.dataset.index, 10);
  const card = deps.collection[index];
  if (!card) return { ok: false, reason: 'missing-card' };

  const tag = deps.normalizeTagImpl(input.value);
  if (!tag) {
    input.value = '';
    return { ok: false, reason: 'invalid-tag' };
  }
  if (!Array.isArray(card.tags)) card.tags = [];
  if (card.tags.includes(tag)) {
    deps.showFeedbackImpl('already tagged ' + tag, 'info');
    input.value = '';
    return { ok: false, reason: 'duplicate-tag' };
  }

  const beforeKey = deps.collectionKeyImpl(card);
  const before = deps.captureBeforeImpl([beforeKey]);
  card.tags.push(tag);
  deps.recordEventImpl({
    type: 'edit',
    summary: 'Tagged {card} +' + tag,
    before,
    affectedKeys: [beforeKey],
    cards: [rowCardEventPayload(card)],
  });
  deps.commitImpl({ coalesce: true });
  return { ok: true, tag };
}

export function removeRowTag(index, tag, overrides = {}) {
  const deps = actionDeps(overrides);
  const card = deps.collection[index];
  if (!card || !Array.isArray(card.tags) || !card.tags.includes(tag)) {
    return { ok: false, reason: 'missing-tag' };
  }

  const beforeKey = deps.collectionKeyImpl(card);
  const before = deps.captureBeforeImpl([beforeKey]);
  card.tags = card.tags.filter(existing => existing !== tag);
  deps.recordEventImpl({
    type: 'edit',
    summary: 'Tagged {card} -' + tag,
    before,
    affectedKeys: [beforeKey],
    cards: [rowCardEventPayload(card)],
  });
  deps.commitImpl({ coalesce: true });
  return { ok: true };
}

export function bindListRowInteractions({
  listBodyEl,
  openDetailImpl = () => {},
  commitRowLocationFromPickerImpl = commitRowLocationFromPicker,
  clearRowLocationImpl = clearRowLocation,
  commitRowTagImpl = commitRowTag,
  removeRowTagImpl = removeRowTag,
} = {}) {
  if (!listBodyEl) return () => {};

  const isRowInScope = row => {
    if (!row || !listBodyEl.contains(row)) return false;
    return listBodyEl.tagName === 'TBODY' || row.hasAttribute('data-key');
  };

  const isInteractiveRowControl = target => {
    if (target.closest('input, select, textarea, a, .loc-pill')) return true;
    const button = target.closest('button');
    return !!button && !button.classList.contains('card-name-button');
  };

  const isRowSelectionModifier = event => (
    event.ctrlKey
    || event.metaKey
    || event.getModifierState?.('Control')
    || event.getModifierState?.('Meta')
  );

  const toggleRowCheckbox = row => {
    const checkbox = row?.querySelector?.('.row-check');
    if (!checkbox || checkbox.disabled) return false;
    checkbox.checked = !checkbox.checked;
    const EventCtor = checkbox.ownerDocument?.defaultView?.Event || Event;
    checkbox.dispatchEvent(new EventCtor('change', { bubbles: true }));
    return true;
  };

  let suppressNextRowClick = null;

  const stopRowSelectionEvent = event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const toggleRowFromEvent = event => {
    if (isRowSelectionModifier(event) && !isInteractiveRowControl(event.target)) {
      const trigger = event.target.closest('tr.detail-trigger');
      if (isRowInScope(trigger) && toggleRowCheckbox(trigger)) {
        stopRowSelectionEvent(event);
        return trigger;
      }
    }
    return null;
  };

  const onMouseDownCapture = event => {
    if (event.button !== 0) return;
    const trigger = toggleRowFromEvent(event);
    if (trigger) suppressNextRowClick = trigger;
  };

  const onClickCapture = event => {
    const trigger = event.target.closest('tr.detail-trigger');
    if (suppressNextRowClick && trigger === suppressNextRowClick) {
      suppressNextRowClick = null;
      stopRowSelectionEvent(event);
      return;
    }
    const toggledRow = toggleRowFromEvent(event);
    if (toggledRow) suppressNextRowClick = null;
  };

  const onClick = event => {
    const removeTagButton = event.target.closest('.row-tag-remove');
    if (removeTagButton) {
      event.preventDefault();
      removeRowTagImpl(parseInt(removeTagButton.dataset.index, 10), removeTagButton.dataset.tag);
      return;
    }

    const removeLocationButton = event.target.closest('.loc-pill-remove');
    if (removeLocationButton) {
      event.preventDefault();
      clearRowLocationImpl(parseInt(removeLocationButton.dataset.index, 10));
      return;
    }

    const nameButton = event.target.closest('.card-name-button');
    if (nameButton) {
      if (!isRowInScope(nameButton.closest('tr'))) return;
      openDetailImpl(parseInt(nameButton.dataset.index, 10));
      return;
    }

    if (event.target.closest('input, select, button, a, .loc-pill')) return;
    const trigger = event.target.closest('tr.detail-trigger');
    if (!isRowInScope(trigger)) return;
    openDetailImpl(parseInt(trigger.dataset.index, 10));
  };

  const onKeydown = event => {
    if (event.target.classList.contains('row-tag-input')) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        commitRowTagImpl(event.target);
      } else if (event.key === 'Escape') {
        event.target.value = '';
        event.target.blur();
      }
      return;
    }

    if (event.target.classList.contains('loc-picker-name')) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRowLocationFromPickerImpl(event.target);
      } else if (event.key === 'Escape') {
        resetNewLocationPicker(event.target);
      }
    }
  };

  const onChange = event => {
    if (event.target.classList.contains('row-check')) return;
    if (event.target.classList.contains('row-tag-input')) {
      if (event.target.value.trim()) commitRowTagImpl(event.target);
      return;
    }
    if (event.target.classList.contains('loc-picker-target')) {
      if (event.target.value === '__new__') {
        revealNewLocationPicker(event.target);
      } else if (event.target.value) {
        commitRowLocationFromPickerImpl(event.target);
      }
      return;
    }
    if (event.target.classList.contains('loc-picker-name') && event.target.value.trim()) {
      commitRowLocationFromPickerImpl(event.target);
    }
  };

  listBodyEl.addEventListener('mousedown', onMouseDownCapture, true);
  listBodyEl.addEventListener('click', onClickCapture, true);
  listBodyEl.addEventListener('click', onClick);
  listBodyEl.addEventListener('keydown', onKeydown);
  listBodyEl.addEventListener('change', onChange);

  return () => {
    listBodyEl.removeEventListener('mousedown', onMouseDownCapture, true);
    listBodyEl.removeEventListener('click', onClickCapture, true);
    listBodyEl.removeEventListener('click', onClick);
    listBodyEl.removeEventListener('keydown', onKeydown);
    listBodyEl.removeEventListener('change', onChange);
  };
}
