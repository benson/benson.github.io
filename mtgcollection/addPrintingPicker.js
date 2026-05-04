import { esc, hideFeedback, showFeedback } from './feedback.js';
import { buildExistingPreviewSummary } from './addPreviewModel.js';
import { loadCardPrintings } from './addPrintingSearch.js';
import { renderPrintingList as renderPrintingListView } from './addPrintingView.js';

export function createAddPrintingPicker({
  pickerEl,
  listEl,
  captionEl,
  searchEl = null,
  onSelect,
  shouldPreserveFields = () => false,
  getPreferredScryfallId = () => '',
  getCollection = () => [],
  loadPrintingsImpl = loadCardPrintings,
  showFeedbackImpl = showFeedback,
  hideFeedbackImpl = hideFeedback,
} = {}) {
  let printings = [];
  let currentName = '';
  let abort = null;
  let totalCount = 0;
  let truncated = false;
  let filterQuery = '';
  let selectedId = '';

  function filteredPrintings() {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return printings;
    return printings.filter(c =>
      String(c.set || '').toLowerCase().includes(q)
      || String(c.set_name || '').toLowerCase().includes(q)
    );
  }

  function render() {
    const visible = filteredPrintings();
    renderPrintingListView({
      listEl,
      captionEl,
      printings: visible,
      totalCount,
      truncated,
      loadedCount: printings.length,
      filterQuery,
      ownershipLookup: card => buildExistingPreviewSummary(getCollection(), card).exactQty,
    });
    syncSelectedRow();
  }

  function show() {
    if (pickerEl) pickerEl.classList.add('active');
  }

  function hide() {
    if (pickerEl) pickerEl.classList.remove('active');
    if (listEl) listEl.innerHTML = '';
    if (captionEl) captionEl.textContent = '';
    if (abort) {
      try { abort.abort(); } catch (e) {}
      abort = null;
    }
    printings = [];
    currentName = '';
    totalCount = 0;
    truncated = false;
    filterQuery = '';
    selectedId = '';
    if (searchEl) searchEl.value = '';
  }

  async function load(name) {
    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;

    printings = [];
    currentName = name;
    totalCount = 0;
    truncated = false;
    filterQuery = '';
    selectedId = '';
    if (searchEl) searchEl.value = '';

    show();
    captionEl.textContent = 'Loading printings...';
    listEl.innerHTML = '';

    const result = await loadPrintingsImpl({ name, signal });
    if (result.status === 'aborted') return;

    if (result.status === 'empty') {
      captionEl.textContent = 'No printings found';
      showFeedbackImpl('no card found for ' + esc(name), 'error');
      return;
    }

    if (result.error) {
      showFeedbackImpl("couldn't load printings: " + esc(result.error.message || String(result.error)), 'error');
    } else {
      hideFeedbackImpl();
    }

    if (!result.printings.length) {
      hide();
      return;
    }

    printings = result.printings;
    currentName = name;
    totalCount = result.totalCount;
    truncated = result.truncated;
    render();
    const preferredId = getPreferredScryfallId();
    const preferredIndex = preferredId ? filteredPrintings().findIndex(c => c.id === preferredId) : -1;
    select(preferredIndex >= 0 ? preferredIndex : 0);
  }

  function select(index) {
    const visible = filteredPrintings();
    if (!visible.length) return null;
    const selectedIndex = Math.max(0, Math.min(visible.length - 1, index));
    const card = visible[selectedIndex];
    selectedId = card.id || '';
    syncSelectedRow();
    onSelect(card, { preserveFields: shouldPreserveFields() });
    return card;
  }

  function syncSelectedRow() {
    Array.from(listEl?.children || []).forEach((li, idx) => {
      const card = filteredPrintings()[idx];
      li.classList.toggle('selected', !!card && !!selectedId && card.id === selectedId);
    });
  }

  function bind() {
    if (!listEl) return;
    listEl.addEventListener('click', (event) => {
      const row = event.target.closest('.printing-row');
      if (!row) return;
      const index = parseInt(row.dataset.index, 10);
      if (Number.isNaN(index)) return;
      select(index);
    });
    if (searchEl && searchEl.dataset.bound !== '1') {
      searchEl.dataset.bound = '1';
      searchEl.addEventListener('input', () => {
        filterQuery = searchEl.value || '';
        render();
        if (selectedId && filteredPrintings().some(c => c.id === selectedId)) return;
        if (filteredPrintings().length) select(0);
      });
    }
  }

  return {
    bind,
    hide,
    load,
    render,
    select,
    show,
    getPrintings: () => [...printings],
    getCurrentName: () => currentName,
    getFilteredPrintings: () => filteredPrintings(),
  };
}
