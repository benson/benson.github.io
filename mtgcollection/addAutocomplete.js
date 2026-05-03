import { SCRYFALL_API } from './state.js';
import { esc } from './feedback.js';

export function buildAutocompleteUrl({ apiBase = SCRYFALL_API, query }) {
  return apiBase + '/cards/autocomplete?q=' + encodeURIComponent(query);
}

export async function fetchAutocompleteSuggestions({
  query,
  signal,
  apiBase = SCRYFALL_API,
  fetchImpl = fetch,
  maxItems = 12,
} = {}) {
  const resp = await fetchImpl(buildAutocompleteUrl({ apiBase, query }), { signal });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.data || []).slice(0, maxItems);
}

export function createNameAutocomplete({
  inputEl,
  listEl,
  onPick,
  onEmptyQuery = () => {},
  fetchSuggestions = (query, signal) => fetchAutocompleteSuggestions({ query, signal }),
  debounceMs = 180,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  let debounce = null;
  let abort = null;
  let items = [];
  let index = -1;

  function hide() {
    listEl.classList.remove('active');
    index = -1;
  }

  function render() {
    if (!items.length) {
      hide();
      return;
    }
    index = -1;
    listEl.innerHTML = items.map(name => `<li role="option">${esc(name)}</li>`).join('');
    listEl.classList.add('active');
  }

  function highlight() {
    Array.from(listEl.children).forEach((li, i) => {
      li.classList.toggle('highlight', i === index);
    });
  }

  async function pick(name) {
    hide();
    inputEl.value = name;
    await onPick(name);
  }

  async function load(query) {
    try {
      if (abort) abort.abort();
      abort = new AbortController();
      const signal = abort.signal;
      items = await fetchSuggestions(query, signal);
      if (signal.aborted) return;
      render();
    } catch (e) {}
  }

  function scheduleLoad(query) {
    clearTimeoutImpl(debounce);
    if (query.length < 2) {
      hide();
      onEmptyQuery();
      return;
    }
    debounce = setTimeoutImpl(() => {
      load(query);
    }, debounceMs);
  }

  function bind() {
    inputEl.addEventListener('input', () => {
      scheduleLoad(inputEl.value.trim());
    });

    inputEl.addEventListener('keydown', (e) => {
      const open = listEl.classList.contains('active');
      if (e.key === 'ArrowDown' && open) {
        e.preventDefault();
        index = Math.min(items.length - 1, index + 1);
        highlight();
      } else if (e.key === 'ArrowUp' && open) {
        e.preventDefault();
        index = Math.max(-1, index - 1);
        highlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (open && index >= 0 && index < items.length) pick(items[index]);
        else if (inputEl.value.trim()) pick(inputEl.value.trim());
      } else if (e.key === 'Escape' && open) {
        hide();
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeoutImpl(hide, 150);
    });

    listEl.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      pick(li.textContent);
    });
  }

  return {
    bind,
    hide,
    load,
    pick,
    getItems: () => [...items],
    getIndex: () => index,
  };
}
