import { esc, hideFeedback, showFeedback } from './feedback.js';
import { loadCardPrintings } from './addPrintingSearch.js';
import { renderPrintingList as renderPrintingListView } from './addPrintingView.js';

export function createAddPrintingPicker({
  pickerEl,
  listEl,
  captionEl,
  onSelect,
  shouldPreserveFields = () => false,
  loadPrintingsImpl = loadCardPrintings,
  showFeedbackImpl = showFeedback,
  hideFeedbackImpl = hideFeedback,
} = {}) {
  let printings = [];
  let currentName = '';
  let abort = null;
  let totalCount = 0;
  let truncated = false;

  function render() {
    renderPrintingListView({
      listEl,
      captionEl,
      printings,
      totalCount,
      truncated,
    });
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
  }

  async function load(name) {
    if (abort) abort.abort();
    abort = new AbortController();
    const signal = abort.signal;

    printings = [];
    currentName = name;
    totalCount = 0;
    truncated = false;

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
    select(0);
  }

  function select(index) {
    if (!printings.length) return null;
    const selectedIndex = Math.max(0, Math.min(printings.length - 1, index));
    const card = printings[selectedIndex];
    Array.from(listEl.children).forEach((li, idx) => {
      li.classList.toggle('selected', idx === selectedIndex);
    });
    onSelect(card, { preserveFields: shouldPreserveFields() });
    return card;
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
  };
}
