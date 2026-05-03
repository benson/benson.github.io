import {
  DEFAULT_LOCATION_TYPE,
  formatLocationLabel,
  normalizeCondition,
  normalizeFinish,
  normalizeLanguage,
  normalizeLocation,
} from './collection.js';
import { esc } from './feedback.js';
import { renderFinishRadios } from './cardEditor.js';

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

export function renderDetailLanguageOptions({ doc = document, collection = [], selected }) {
  const lang = normalizeLanguage(selected);
  const options = collectionLanguages(collection, lang);
  doc.getElementById('detailLanguageOptions').innerHTML = options.map(code =>
    `<label><input type="radio" name="detailLanguage" value="${esc(code)}"${code === lang ? ' checked' : ''}><span>${esc(code)}</span></label>`
  ).join('');
  const other = doc.getElementById('detailLanguageOther');
  other.value = '';
  other.classList.remove('visible');
}

export function writeDetailForm({ doc = document, form, collection = [], card }) {
  doc.getElementById('detailQty').value = card.qty || 1;
  renderFinishRadios({
    doc,
    card,
    targetId: 'detailFinish',
    name: 'detailFinish',
    selected: card.finish || 'normal',
    hintEl: doc.getElementById('detailFinishHint'),
  });

  const conditionValue = card.condition || 'near_mint';
  const conditionInput = form.querySelector(`input[name="detailCondition"][value="${cssEscape(conditionValue, doc)}"]`)
    || form.querySelector('input[name="detailCondition"][value="near_mint"]');
  if (conditionInput) conditionInput.checked = true;

  renderDetailLanguageOptions({ doc, collection, selected: card.language || 'en' });

  doc.getElementById('detailTagInput').value = '';
  const drawerLoc = normalizeLocation(card.location);
  const legacyType = doc.getElementById('detailLocationType');
  if (legacyType) legacyType.value = drawerLoc ? drawerLoc.type : DEFAULT_LOCATION_TYPE;
  const nameInput = doc.getElementById('detailLocationName');
  if (nameInput) nameInput.value = drawerLoc ? drawerLoc.name : '';
}

export function readDetailForm({ doc = document, form, tags = [], location } = {}) {
  const newLocType = doc.querySelector('input[name="detailLocationType"]:checked')?.value
    || doc.getElementById('detailLocationType')?.value
    || DEFAULT_LOCATION_TYPE;
  const newLocName = doc.getElementById('detailLocationName')?.value || '';
  return {
    qty: Math.max(1, parseInt(doc.getElementById('detailQty').value, 10) || 1),
    finish: normalizeFinish(form.querySelector('input[name="detailFinish"]:checked')?.value || 'normal'),
    condition: normalizeCondition(form.querySelector('input[name="detailCondition"]:checked')?.value || 'near_mint'),
    language: normalizeLanguage(doc.getElementById('detailLanguageOther').value
      || form.querySelector('input[name="detailLanguage"]:checked')?.value
      || 'en'),
    location: location === undefined ? normalizeLocation({ type: newLocType, name: newLocName }) : normalizeLocation(location),
    tags: [...tags],
  };
}

export function snapshotDetailFields(card) {
  return {
    qty: card.qty,
    finish: card.finish,
    condition: card.condition,
    language: card.language,
    location: card.location ? { ...card.location } : null,
    tags: Array.isArray(card.tags) ? [...card.tags] : [],
  };
}

export function applyDetailFormValues(card, values) {
  card.qty = values.qty;
  card.finish = values.finish;
  card.condition = values.condition;
  card.language = values.language;
  card.location = values.location;
  card.tags = [...values.tags];
}

export function detailFieldDiffs(before, after) {
  const beforeLocLabel = formatLocationLabel(before.location);
  const afterLocLabel = formatLocationLabel(after.location);
  const locationChanged = beforeLocLabel !== afterLocLabel;
  const diffs = [];

  if (after.qty !== before.qty) diffs.push('qty ' + before.qty + ' → ' + after.qty);
  if (after.finish !== before.finish) diffs.push(before.finish + ' → ' + after.finish);
  if (after.condition !== before.condition) {
    diffs.push(before.condition.replace(/_/g, ' ') + ' → ' + after.condition.replace(/_/g, ' '));
  }
  if (after.language !== before.language) diffs.push(before.language + ' → ' + after.language);
  if (locationChanged) {
    diffs.push('location: ' + (beforeLocLabel || '—') + ' → ' + (afterLocLabel || '—'));
  }

  const beforeTagsKey = [...before.tags].sort().join(',');
  const afterTagsKey = [...after.tags].sort().join(',');
  if (beforeTagsKey !== afterTagsKey) {
    const fmt = arr => '[' + arr.join(', ') + ']';
    diffs.push('tags: ' + fmt(before.tags) + ' → ' + fmt(after.tags));
  }

  return { diffs, locationChanged };
}

function cssEscape(value, doc) {
  const css = doc.defaultView?.CSS || globalThis.CSS;
  return css?.escape ? css.escape(value) : value;
}
