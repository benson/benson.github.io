// Lightweight checkbox-dropdown multiselect.
// Each control is a <div class="multiselect" id="..."> containing a trigger button
// and a hidden popover with checkboxes.  Selected values live in element.dataset
// as a JSON-encoded array, retrievable via getMultiselectValue().

import { esc } from './feedback.js';

let openPopover = null;

function setSelectedValues(el, values) {
  el.dataset.selected = JSON.stringify(values);
}

function getSelectedValues(el) {
  try { return JSON.parse(el.dataset.selected || '[]'); } catch (_) { return []; }
}

function updateTriggerLabel(el) {
  const trigger = el.querySelector('.ms-trigger-label');
  if (!trigger) return;
  const selected = getSelectedValues(el);
  const defaultLabel = el.dataset.defaultLabel || '';
  if (selected.length === 0) {
    trigger.textContent = defaultLabel;
    el.classList.remove('has-selection');
  } else if (selected.length === 1) {
    trigger.textContent = selected[0];
    el.classList.add('has-selection');
  } else {
    const noun = el.dataset.noun || 'selected';
    trigger.textContent = selected.length + ' ' + noun;
    el.classList.add('has-selection');
  }
}

function renderOptions(el) {
  const popover = el.querySelector('.ms-popover');
  if (!popover) return;
  const options = JSON.parse(el.dataset.options || '[]');
  const selected = new Set(getSelectedValues(el));
  if (options.length === 0) {
    popover.innerHTML = '<div class="ms-empty">no options</div>';
    return;
  }
  popover.innerHTML = options.map(opt => {
    const value = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
    const checked = selected.has(value) ? ' checked' : '';
    return '<label class="ms-option"><input type="checkbox" value="' + esc(value) + '"' + checked + '><span>' + esc(label) + '</span></label>';
  }).join('');
}

function closeAll() {
  if (openPopover) {
    openPopover.classList.remove('open');
    openPopover = null;
  }
}

export function initMultiselect(el, { onChange } = {}) {
  if (!el || el.dataset.msInit === '1') return;
  el.dataset.msInit = '1';
  el.classList.add('multiselect');
  if (!el.dataset.selected) el.dataset.selected = '[]';
  if (!el.dataset.options) el.dataset.options = '[]';

  el.innerHTML =
    '<button type="button" class="ms-trigger filter-select"><span class="ms-trigger-label"></span></button>' +
    '<div class="ms-popover"></div>';

  const trigger = el.querySelector('.ms-trigger');
  const popover = el.querySelector('.ms-popover');

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = popover.classList.contains('open');
    closeAll();
    if (!wasOpen) {
      popover.classList.add('open');
      openPopover = popover;
    }
  });

  popover.addEventListener('click', e => e.stopPropagation());
  popover.addEventListener('change', e => {
    if (e.target.matches('input[type="checkbox"]')) {
      const checked = [...popover.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
      setSelectedValues(el, checked);
      updateTriggerLabel(el);
      if (typeof onChange === 'function') onChange(checked);
    }
  });

  updateTriggerLabel(el);
}

export function populateMultiselect(el, options, { defaultLabel, noun } = {}) {
  if (!el) return;
  if (defaultLabel != null) el.dataset.defaultLabel = defaultLabel;
  if (noun != null) el.dataset.noun = noun;
  el.dataset.options = JSON.stringify(options);
  // Drop any selected values that no longer exist in options (preserve user intent for set-typed fields).
  const validValues = new Set(options.map(o => typeof o === 'string' ? o : o.value));
  const selected = getSelectedValues(el).filter(v => validValues.has(v));
  setSelectedValues(el, selected);
  renderOptions(el);
  updateTriggerLabel(el);
}

export function getMultiselectValue(el) {
  if (!el) return [];
  return getSelectedValues(el);
}

export function setMultiselectValue(el, values) {
  if (!el) return;
  setSelectedValues(el, Array.isArray(values) ? values : []);
  renderOptions(el);
  updateTriggerLabel(el);
}

// Global outside-click handler (no-op in non-browser environments like tests)
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => closeAll());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
  });
}
