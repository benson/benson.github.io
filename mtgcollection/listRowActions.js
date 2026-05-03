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

  const row = input.closest('tr');
  const typeSelect = row && row.querySelector('.loc-picker-type');
  const type = typeSelect ? typeSelect.value : DEFAULT_LOCATION_TYPE;
  const location = deps.normalizeLocationImpl({ type, name: input.value });
  if (!location) {
    input.value = '';
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
        event.target.value = '';
        event.target.blur();
      }
    }
  };

  const onChange = event => {
    if (event.target.classList.contains('row-check')) return;
    if (event.target.classList.contains('row-tag-input')) {
      if (event.target.value.trim()) commitRowTagImpl(event.target);
      return;
    }
    if (event.target.classList.contains('loc-picker-name') && event.target.value.trim()) {
      commitRowLocationFromPickerImpl(event.target);
    }
  };

  listBodyEl.addEventListener('click', onClick);
  listBodyEl.addEventListener('keydown', onKeydown);
  listBodyEl.addEventListener('change', onChange);

  return () => {
    listBodyEl.removeEventListener('click', onClick);
    listBodyEl.removeEventListener('keydown', onKeydown);
    listBodyEl.removeEventListener('change', onChange);
  };
}
