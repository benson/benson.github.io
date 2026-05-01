import { state } from './state.js';
import { esc } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  normalizeCondition,
  normalizeFinish,
  normalizeLanguage,
  normalizeTag,
  allCollectionTags,
} from './collection.js';
import { commitCollectionChange } from './persistence.js';
import { filteredSorted } from './search.js';
import { render } from './view.js';
import { captureBefore, recordEvent } from './changelog.js';

let bulkBar, listBodyEl;

export function updateBulkBar() {
  const n = state.selectedKeys.size;
  document.getElementById('bulkCount').textContent = n + ' selected';
  bulkBar.classList.toggle('active', n > 0);
  syncHeaderCheckbox();
  populateBulkTagDropdowns();
  if (n === 0 && pendingChangeCount() > 0) clearPendingBulk();
  renderPendingRow();
}

function populateBulkTagDropdowns() {
  const suggestions = document.getElementById('bulkTagSuggestions');
  if (suggestions) {
    suggestions.innerHTML = allCollectionTags()
      .map(t => '<option value="' + esc(t) + '">')
      .join('');
  }
  const removeSelect = document.getElementById('bulkTagRemove');
  if (!removeSelect) return;
  const selectedTags = new Set();
  for (const c of state.collection) {
    if (state.selectedKeys.has(collectionKey(c))) {
      for (const t of (c.tags || [])) selectedTags.add(t);
    }
  }
  const current = removeSelect.value;
  removeSelect.innerHTML = '<option value="">—</option>' +
    [...selectedTags].sort().map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
  removeSelect.value = current;
}

function syncHeaderCheckbox() {
  const headerCheck = document.getElementById('headerCheck');
  if (!headerCheck) return;
  const visibleKeys = filteredSorted().map(c => collectionKey(c));
  if (visibleKeys.length === 0) {
    headerCheck.checked = false;
    headerCheck.indeterminate = false;
    return;
  }
  const selVisible = visibleKeys.filter(k => state.selectedKeys.has(k)).length;
  if (selVisible === 0) {
    headerCheck.checked = false;
    headerCheck.indeterminate = false;
  } else if (selVisible === visibleKeys.length) {
    headerCheck.checked = true;
    headerCheck.indeterminate = false;
  } else {
    headerCheck.checked = false;
    headerCheck.indeterminate = true;
  }
}

// ---- Staged (pending) bulk changes ----
const pendingBulk = {
  location: null,
  condition: null,
  finish: null,
  language: null,
  addTags: [],
  removeTags: [],
};

const LANGUAGE_LABELS = {
  en: 'english', ja: 'japanese', de: 'german', fr: 'french', it: 'italian',
  es: 'spanish', pt: 'portuguese', ru: 'russian', ko: 'korean',
  zhs: 'chinese (simplified)', zht: 'chinese (traditional)',
};

function pendingChangeCount() {
  let n = 0;
  if (pendingBulk.location !== null) n++;
  if (pendingBulk.condition !== null) n++;
  if (pendingBulk.finish !== null) n++;
  if (pendingBulk.language !== null) n++;
  n += pendingBulk.addTags.length;
  n += pendingBulk.removeTags.length;
  return n;
}

function clearPendingBulk() {
  pendingBulk.location = null;
  pendingBulk.condition = null;
  pendingBulk.finish = null;
  pendingBulk.language = null;
  pendingBulk.addTags.length = 0;
  pendingBulk.removeTags.length = 0;
}

function stageField(field, raw, normalizer) {
  if (!state.selectedKeys.size) return;
  pendingBulk[field] = normalizer ? normalizer(raw) : raw;
  renderPendingRow();
}

function stageTagAdd(rawTag) {
  if (!state.selectedKeys.size) return;
  const tag = normalizeTag(rawTag);
  if (!tag) return;
  pendingBulk.removeTags = pendingBulk.removeTags.filter(t => t !== tag);
  if (!pendingBulk.addTags.includes(tag)) pendingBulk.addTags.push(tag);
  renderPendingRow();
}

function stageTagRemove(rawTag) {
  if (!state.selectedKeys.size) return;
  const tag = normalizeTag(rawTag);
  if (!tag) return;
  pendingBulk.addTags = pendingBulk.addTags.filter(t => t !== tag);
  if (!pendingBulk.removeTags.includes(tag)) pendingBulk.removeTags.push(tag);
  renderPendingRow();
}

function unstage(kind, value) {
  if (kind === 'addTag') {
    pendingBulk.addTags = pendingBulk.addTags.filter(t => t !== value);
  } else if (kind === 'removeTag') {
    pendingBulk.removeTags = pendingBulk.removeTags.filter(t => t !== value);
  } else if (kind in pendingBulk) {
    pendingBulk[kind] = null;
  }
  renderPendingRow();
}

function pillHTML(kind, value, label) {
  return '<span class="pending-pill" data-kind="' + esc(kind) + '" data-value="' + esc(value) + '">' +
    esc(label) +
    '<button class="pending-pill-remove" type="button" aria-label="remove">×</button>' +
    '</span>';
}

function renderPendingRow() {
  const row = document.getElementById('bulkPending');
  if (!row) return;
  const cardCount = state.selectedKeys.size;
  if (pendingChangeCount() === 0 || cardCount === 0) {
    row.classList.remove('active');
    row.innerHTML = '';
    return;
  }
  const pills = [];
  if (pendingBulk.location !== null) {
    pills.push(pillHTML('location', '', '→ location: ' + (pendingBulk.location || '(empty)')));
  }
  if (pendingBulk.condition !== null) {
    pills.push(pillHTML('condition', '', '→ condition: ' + pendingBulk.condition.replace(/_/g, ' ')));
  }
  if (pendingBulk.finish !== null) {
    pills.push(pillHTML('finish', '', '→ finish: ' + pendingBulk.finish));
  }
  if (pendingBulk.language !== null) {
    const label = LANGUAGE_LABELS[pendingBulk.language] || pendingBulk.language;
    pills.push(pillHTML('language', '', '→ language: ' + label));
  }
  for (const t of pendingBulk.addTags) pills.push(pillHTML('addTag', t, '+ tag: ' + t));
  for (const t of pendingBulk.removeTags) pills.push(pillHTML('removeTag', t, '− tag: ' + t));
  const cardNoun = 'card' + (cardCount === 1 ? '' : 's');
  row.innerHTML =
    '<span class="pending-label">pending</span>' +
    pills.join('') +
    '<span class="bulk-spacer"></span>' +
    '<button class="btn save-pending-btn" type="button" id="bulkSavePending">save (' + cardCount + ' ' + cardNoun + ')</button>' +
    '<button class="btn btn-secondary cancel-pending-btn" type="button" id="bulkCancelPending">cancel</button>';
  row.classList.add('active');
}

function commitPending() {
  if (pendingChangeCount() === 0) return;
  if (!state.selectedKeys.size) return;
  const affectedKeys = [...state.selectedKeys];
  const before = captureBefore(affectedKeys);
  const cardCount = state.selectedKeys.size;
  const changeCount = pendingChangeCount();
  for (const c of state.collection) {
    if (!state.selectedKeys.has(collectionKey(c))) continue;
    if (pendingBulk.location !== null) c.location = pendingBulk.location;
    if (pendingBulk.condition !== null) c.condition = pendingBulk.condition;
    if (pendingBulk.finish !== null) c.finish = pendingBulk.finish;
    if (pendingBulk.language !== null) c.language = pendingBulk.language;
    if (pendingBulk.addTags.length || pendingBulk.removeTags.length) {
      const removeSet = new Set(pendingBulk.removeTags);
      let tags = (c.tags || []).filter(t => !removeSet.has(t.toLowerCase()));
      const existing = new Set(tags.map(t => t.toLowerCase()));
      for (const t of pendingBulk.addTags) {
        if (!existing.has(t)) {
          tags.push(t);
          existing.add(t);
        }
      }
      c.tags = tags;
    }
  }
  clearPendingBulk();
  state.selectedKeys.clear();
  commitCollectionChange({ coalesce: true });
  const changeNoun = 'change' + (changeCount === 1 ? '' : 's');
  const cardNoun = 'card' + (cardCount === 1 ? '' : 's');
  recordEvent({
    type: 'bulk-edit',
    summary: 'saved ' + changeCount + ' ' + changeNoun + ' to ' + cardCount + ' ' + cardNoun,
    before,
    affectedKeys,
  });
}

function cancelPending() {
  clearPendingBulk();
  ['bulkLocation', 'bulkCondition', 'bulkFinish', 'bulkLanguage', 'bulkTagAdd', 'bulkTagRemove'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderPendingRow();
}

export function initBulk() {
  bulkBar = document.getElementById('bulkBar');
  listBodyEl = document.getElementById('listBody');

  document.getElementById('headerCheck').addEventListener('change', e => {
    const visible = filteredSorted();
    if (e.target.checked) visible.forEach(c => state.selectedKeys.add(collectionKey(c)));
    else visible.forEach(c => state.selectedKeys.delete(collectionKey(c)));
    render();
  });

  document.getElementById('bulkClear').addEventListener('click', () => {
    state.selectedKeys.clear();
    render();
  });

  document.getElementById('bulkLocation').addEventListener('change', e => {
    stageField('location', e.target.value, normalizeLocation);
    e.target.value = '';
  });
  document.getElementById('bulkCondition').addEventListener('change', e => {
    if (!e.target.value) return;
    stageField('condition', e.target.value, normalizeCondition);
    e.target.value = '';
  });
  document.getElementById('bulkFinish').addEventListener('change', e => {
    if (!e.target.value) return;
    stageField('finish', e.target.value, normalizeFinish);
    e.target.value = '';
  });
  document.getElementById('bulkLanguage').addEventListener('change', e => {
    if (!e.target.value) return;
    stageField('language', e.target.value, normalizeLanguage);
    e.target.value = '';
  });

  const bulkTagAddInput = document.getElementById('bulkTagAdd');
  const bulkTagAddBtn = document.getElementById('bulkTagAddBtn');
  const bulkTagRemoveSelect = document.getElementById('bulkTagRemove');
  const bulkTagRemoveBtn = document.getElementById('bulkTagRemoveBtn');

  bulkTagAddBtn.addEventListener('click', () => {
    const v = bulkTagAddInput.value;
    if (!v.trim()) return;
    stageTagAdd(v);
    bulkTagAddInput.value = '';
  });
  bulkTagAddInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); bulkTagAddBtn.click(); }
  });
  bulkTagRemoveBtn.addEventListener('click', () => {
    const v = bulkTagRemoveSelect.value;
    if (!v) return;
    stageTagRemove(v);
    bulkTagRemoveSelect.value = '';
  });

  document.getElementById('bulkPending').addEventListener('click', e => {
    if (e.target.id === 'bulkSavePending') {
      commitPending();
    } else if (e.target.id === 'bulkCancelPending') {
      cancelPending();
    } else if (e.target.classList.contains('pending-pill-remove')) {
      const pill = e.target.closest('.pending-pill');
      if (pill) unstage(pill.dataset.kind, pill.dataset.value);
    }
  });

  document.getElementById('bulkDelete').addEventListener('click', () => {
    if (!state.selectedKeys.size) return;
    const n = state.selectedKeys.size;
    if (!confirm('delete ' + n + ' selected card' + (n === 1 ? '' : 's') + '?')) return;
    const affectedKeys = [...state.selectedKeys];
    const before = captureBefore(affectedKeys);
    state.collection = state.collection.filter(c => !state.selectedKeys.has(collectionKey(c)));
    state.selectedKeys.clear();
    commitCollectionChange();
    const noun = 'card' + (n === 1 ? '' : 's');
    recordEvent({
      type: 'bulk-delete',
      summary: 'deleted ' + n + ' ' + noun,
      before,
      affectedKeys,
    });
  });

  // Row checkbox toggle (delegated on tbody)
  listBodyEl.addEventListener('change', e => {
    if (!e.target.classList.contains('row-check')) return;
    const key = e.target.dataset.key;
    if (e.target.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
    const tr = e.target.closest('tr');
    if (tr) tr.classList.toggle('row-selected', e.target.checked);
    updateBulkBar();
  });
}
