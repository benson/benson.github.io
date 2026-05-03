import {
  applyScryfallCardResolution,
  getUsdPrice,
  normalizeTag,
} from './collection.js';
import { esc } from './feedback.js';

export {
  availableFinishValues,
  createAddOptionControls,
  createRadioValueAccessor,
  renderFinishRadios,
} from './addOptions.js';
export { createAddLocationPicker } from './addLocationPicker.js';
export { createAddPrintingPicker } from './addPrintingPicker.js';

export function createTagChipEditor({
  chipsEl,
  inputEl,
  datalistEl,
  getSuggestions = () => [],
} = {}) {
  let tags = [];

  function render() {
    if (chipsEl) {
      chipsEl.innerHTML = tags.map(t =>
        `<span class="tag-chip">${esc(t)}<button class="tag-chip-remove" type="button" data-tag="${esc(t)}" aria-label="remove ${esc(t)}">x</button></span>`
      ).join('');
    }
    updateSuggestions();
  }

  function updateSuggestions() {
    if (!datalistEl) return;
    const have = new Set(tags);
    const options = Array.from(new Set(getSuggestions().map(normalizeTag).filter(Boolean)))
      .filter(t => !have.has(t));
    datalistEl.innerHTML = options.map(t => `<option value="${esc(t)}"></option>`).join('');
  }

  function commitInput() {
    if (!inputEl) return;
    const raw = inputEl.value;
    if (!raw.trim()) {
      inputEl.value = '';
      return;
    }
    const tag = normalizeTag(raw);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
      render();
    }
    inputEl.value = '';
  }

  function bind() {
    if (inputEl && inputEl.dataset.tagEditorBound !== '1') {
      inputEl.dataset.tagEditorBound = '1';
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          commitInput();
        }
      });
      inputEl.addEventListener('blur', () => {
        if (inputEl.value.trim()) commitInput();
      });
    }
    if (chipsEl && chipsEl.dataset.tagEditorBound !== '1') {
      chipsEl.dataset.tagEditorBound = '1';
      chipsEl.addEventListener('click', e => {
        const btn = e.target.closest('.tag-chip-remove');
        if (!btn) return;
        e.preventDefault();
        tags = tags.filter(t => t !== btn.dataset.tag);
        render();
      });
    }
  }

  function setTags(nextTags = []) {
    tags = Array.isArray(nextTags)
      ? nextTags.map(normalizeTag).filter(Boolean).filter((tag, index, arr) => arr.indexOf(tag) === index)
      : [];
    if (inputEl) inputEl.value = '';
    render();
  }

  return {
    bind,
    commitInput,
    getTags: () => [...tags],
    render,
    setTags,
  };
}

export function applyPrintingToEntry(entry, card) {
  if (!entry || !card) return entry;
  entry.name = card.name || entry.name || '';
  applyScryfallCardResolution(entry, card, { priceMode: 'replace' });
  return entry;
}

export function priceForFinish(card, finish) {
  return getUsdPrice(card, finish);
}
