import { getCardFinishes } from '../shared/mtg.js';
import { normalizeLanguage } from './collection.js';
import { esc } from './feedback.js';

export function createRadioValueAccessor({ doc = document, name, fallback = '' }) {
  return {
    get value() {
      return doc.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
    },
    set value(v) {
      doc.querySelectorAll(`input[name="${name}"]`).forEach(r => {
        r.checked = (r.value === v);
      });
    },
  };
}

export function createLanguageValueAccessor({ doc = document } = {}) {
  return {
    get value() {
      const other = doc.getElementById('addLanguageOther');
      if (other && other.value.trim()) return other.value.trim();
      return doc.querySelector('input[name="addLanguage"]:checked')?.value || 'en';
    },
    set value(v) {
      const radios = doc.querySelectorAll('input[name="addLanguage"]');
      let matched = false;
      radios.forEach(r => {
        const checked = r.value === v;
        r.checked = checked;
        if (checked) matched = true;
      });
      const other = doc.getElementById('addLanguageOther');
      if (!other) return;
      if (matched) {
        other.value = '';
        other.classList.remove('visible');
      } else {
        other.value = v;
        other.classList.add('visible');
      }
    },
  };
}

export function finishValueFromScryfallFinish(finish) {
  return finish === 'nonfoil' ? 'normal' : finish;
}

export function renderFinishRadios({
  doc = document,
  card,
  targetId = 'addFinish',
  name = 'addFinish',
  selected = '',
  hintEl = null,
} = {}) {
  const wrap = doc.getElementById(targetId);
  if (!wrap) return;
  const finishes = getCardFinishes(card);
  const options = finishes.length
    ? finishes.map(f => ({ value: finishValueFromScryfallFinish(f.finish), label: f.label.toLowerCase() }))
    : [{ value: card?.finish || 'normal', label: card?.finish || 'normal' }];
  const preferred = selected || options[0]?.value || 'normal';
  const selectedValue = options.some(o => o.value === preferred) ? preferred : options[0]?.value || 'normal';
  wrap.innerHTML = options.map((f) => {
    const value = f.value;
    const label = f.label.toLowerCase();
    return `<label><input type="radio" name="${esc(name)}" value="${esc(value)}"${value === selectedValue ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  }).join('');
  if (hintEl) {
    hintEl.textContent = '';
    hintEl.classList.add('hidden');
  }
  return selectedValue;
}

export function collectionLanguages(collection, extra = '') {
  const langs = new Set(['en']);
  collection.forEach(c => langs.add(normalizeLanguage(c.language)));
  if (extra) langs.add(normalizeLanguage(extra));
  return [...langs].filter(Boolean).sort((a, b) => {
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
  });
}

export function renderLanguageRadios({ doc = document, collection = [], selected }) {
  const wrap = doc.getElementById('addLanguageOptions');
  if (!wrap) return;
  const lang = normalizeLanguage(selected);
  const options = collectionLanguages(collection, lang);
  wrap.innerHTML = options.map(code =>
    `<label><input type="radio" name="addLanguage" value="${esc(code)}"${code === lang ? ' checked' : ''}><span>${esc(code)}</span></label>`
  ).join('');
  const other = doc.getElementById('addLanguageOther');
  if (other) {
    other.value = '';
    other.classList.remove('visible');
  }
}

export function bindLanguageOther({ doc = document } = {}) {
  const addLanguageAdd = doc.getElementById('addLanguageAdd');
  const addLanguageOther = doc.getElementById('addLanguageOther');
  if (!addLanguageAdd || !addLanguageOther) return;
  addLanguageAdd.addEventListener('click', () => {
    addLanguageOther.classList.add('visible');
    addLanguageOther.focus();
  });
  addLanguageOther.addEventListener('input', () => {
    if (!addLanguageOther.value.trim()) return;
    doc.querySelectorAll('input[name="addLanguage"]').forEach(r => { r.checked = false; });
  });
}

export function createAddOptionControls({ doc = document, getCollection = () => [] } = {}) {
  return {
    finish: createRadioValueAccessor({ doc, name: 'addFinish', fallback: '' }),
    condition: createRadioValueAccessor({ doc, name: 'addCondition', fallback: 'near_mint' }),
    language: createLanguageValueAccessor({ doc }),
    renderFinishRadios(card, selected = '') {
      return renderFinishRadios({ doc, card, selected });
    },
    renderLanguageRadios(selected) {
      renderLanguageRadios({ doc, collection: getCollection(), selected });
    },
    collectionLanguages(extra = '') {
      return collectionLanguages(getCollection(), extra);
    },
    bindLanguageOther() {
      bindLanguageOther({ doc });
    },
  };
}
