import { state } from './state.js';
import { showFeedback } from './feedback.js';
import {
  collectionKey,
  normalizeLocation,
  normalizeCondition,
  normalizeFinish,
  normalizeLanguage,
} from './collection.js';
import { commitCollectionChange } from './persistence.js';
import { filteredSorted } from './search.js';
import { render } from './view.js';

let bulkBar, listBodyEl, feedbackEl;

export function snapshotCollection() {
  state.lastSnapshot = state.collection.map(c => ({ ...c }));
}

export function undoLast() {
  if (!state.lastSnapshot) return;
  state.collection = state.lastSnapshot.map(c => ({ ...c }));
  state.lastSnapshot = null;
  state.selectedKeys.clear();
  commitCollectionChange();
  showFeedback('undone', 'info');
}

export function updateBulkBar() {
  const n = state.selectedKeys.size;
  document.getElementById('bulkCount').textContent = n + ' selected';
  bulkBar.classList.toggle('active', n > 0);
  syncHeaderCheckbox();
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

function applyBulk(field, rawValue, normalizer) {
  if (!state.selectedKeys.size) return;
  snapshotCollection();
  const v = normalizer ? normalizer(rawValue) : rawValue;
  let touched = 0;
  for (const c of state.collection) {
    if (state.selectedKeys.has(collectionKey(c))) {
      c[field] = v;
      touched++;
    }
  }
  state.selectedKeys.clear();
  commitCollectionChange({ coalesce: true });
  const noun = 'card' + (touched === 1 ? '' : 's');
  showFeedback('updated ' + touched + ' ' + noun + ' <button class="undo-btn" type="button">undo</button>', 'success');
}

export function initBulk() {
  bulkBar = document.getElementById('bulkBar');
  listBodyEl = document.getElementById('listBody');
  feedbackEl = document.getElementById('feedback');

  feedbackEl.addEventListener('click', e => {
    if (e.target.classList.contains('undo-btn')) undoLast();
  });

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
    applyBulk('location', e.target.value, normalizeLocation);
    e.target.value = '';
  });
  document.getElementById('bulkCondition').addEventListener('change', e => {
    if (!e.target.value) return;
    applyBulk('condition', e.target.value, normalizeCondition);
    e.target.value = '';
  });
  document.getElementById('bulkFinish').addEventListener('change', e => {
    if (!e.target.value) return;
    applyBulk('finish', e.target.value, normalizeFinish);
    e.target.value = '';
  });
  document.getElementById('bulkLanguage').addEventListener('change', e => {
    if (!e.target.value) return;
    applyBulk('language', e.target.value, normalizeLanguage);
    e.target.value = '';
  });

  document.getElementById('bulkDelete').addEventListener('click', () => {
    if (!state.selectedKeys.size) return;
    const n = state.selectedKeys.size;
    if (!confirm('delete ' + n + ' selected card' + (n === 1 ? '' : 's') + '?')) return;
    snapshotCollection();
    state.collection = state.collection.filter(c => !state.selectedKeys.has(collectionKey(c)));
    state.selectedKeys.clear();
    commitCollectionChange();
    const noun = 'card' + (n === 1 ? '' : 's');
    showFeedback('deleted ' + n + ' ' + noun + ' <button class="undo-btn" type="button">undo</button>', 'success');
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
