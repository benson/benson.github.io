import {
  getCardBackImageUrl,
  getCardImageUrl,
  getUsdPrice,
  normalizeTag,
} from './collection.js';
import { esc } from './feedback.js';

export {
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
  entry.scryfallId = card.id || '';
  entry.resolvedName = card.name || entry.resolvedName || entry.name || '';
  entry.setCode = card.set || '';
  entry.setName = card.set_name || '';
  entry.cn = card.collector_number || '';
  entry.scryfallUri = card.scryfall_uri || '';
  entry.imageUrl = getCardImageUrl(card);
  entry.backImageUrl = getCardBackImageUrl(card);
  entry.rarity = String(card.rarity || '').toLowerCase();
  entry.cmc = card.cmc ?? null;
  entry.colors = card.colors || (card.card_faces?.[0]?.colors) || [];
  entry.colorIdentity = card.color_identity || [];
  entry.typeLine = card.type_line || (card.card_faces?.map(f => f.type_line).filter(Boolean).join(' // ') || '');
  entry.oracleText = card.oracle_text || (card.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || '');
  entry.legalities = card.legalities || {};
  entry.finishes = Array.isArray(card.finishes) ? [...card.finishes] : [];
  const priced = getUsdPrice(card, entry.finish);
  entry.price = priced.price;
  entry.priceFallback = priced.fallback;
  return entry;
}
