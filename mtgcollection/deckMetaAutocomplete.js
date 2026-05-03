import { getCardBackImageUrl, getCardImageUrl } from './collection.js';
import { esc } from './feedback.js';
import { SCRYFALL_API } from './state.js';

function metaAcWrap(input) {
  return input?.parentElement?.classList.contains('deck-meta-ac-wrap') ? input.parentElement : null;
}

function metaAcList(input) {
  return metaAcWrap(input)?.querySelector('.deck-meta-ac-list') || null;
}

export function createDeckMetaAutocomplete({
  rootEl,
  apiBase = SCRYFALL_API,
  fetchImpl = globalThis.fetch,
  debounceMs = 250,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  let debounce = null;
  let abort = null;
  let items = [];
  let index = -1;
  const cardCache = new Map();

  function hide(input) {
    const list = metaAcList(input);
    if (!list) return;
    list.classList.remove('active');
    list.innerHTML = '';
    items = [];
    index = -1;
  }

  function render(input) {
    const list = metaAcList(input);
    if (!list) return;
    if (!items.length) {
      hide(input);
      return;
    }
    list.innerHTML = items
      .map((item, i) => `<li role="option"${i === index ? ' class="highlight"' : ''} data-ac-index="${i}">${esc(item.name)}</li>`)
      .join('');
    list.classList.add('active');
  }

  async function fetchMatches(input) {
    const kind = input?.dataset.metaAc;
    if (kind !== 'commander' && kind !== 'partner') return;
    const q = (input.value || '').trim();
    if (q.length < 2) {
      hide(input);
      return;
    }
    if (abort) abort.abort();
    abort = new AbortController();
    const filter = kind === 'partner' ? 'is:partner' : 'is:commander';
    const url = apiBase + '/cards/search?q=' + encodeURIComponent(`${filter} name:${q}`) + '&order=name&unique=cards';
    try {
      const resp = await fetchImpl(url, { signal: abort.signal });
      if (!resp.ok) {
        hide(input);
        return;
      }
      const data = await resp.json();
      items = (data.data || []).slice(0, 10).map(card => {
        cardCache.set(card.id, card);
        return {
          id: card.id,
          name: card.name,
          scryfallUri: card.scryfall_uri || '',
          imageUrl: getCardImageUrl(card) || '',
          backImageUrl: getCardBackImageUrl(card) || '',
        };
      });
      index = -1;
      render(input);
    } catch (err) {
      if (err.name !== 'AbortError') hide(input);
    }
  }

  function pick(input, item) {
    input.value = item.name;
    input.dataset.metaAcScryfallId = item.id || '';
    input.dataset.metaAcScryfallUri = item.scryfallUri || '';
    input.dataset.metaAcImage = item.imageUrl || '';
    input.dataset.metaAcBackImage = item.backImageUrl || '';
    hide(input);
  }

  function queueFetch(input) {
    input.dataset.metaAcScryfallId = '';
    input.dataset.metaAcScryfallUri = '';
    input.dataset.metaAcImage = '';
    input.dataset.metaAcBackImage = '';
    if (debounce) clearTimeoutImpl(debounce);
    debounce = setTimeoutImpl(() => fetchMatches(input), debounceMs);
  }

  function handleClick(event) {
    const itemEl = event.target.closest('.deck-meta-ac-list li');
    if (!itemEl) return false;
    const input = itemEl.closest('.deck-meta-ac-wrap')?.querySelector('input[data-meta-ac]');
    const itemIndex = parseInt(itemEl.dataset.acIndex || '-1', 10);
    const item = items[itemIndex];
    if (input && item) pick(input, item);
    return true;
  }

  function handleInput(event) {
    const input = event.target.closest('input[data-meta-ac]');
    if (!input) return false;
    queueFetch(input);
    return true;
  }

  function handleKeydown(event) {
    const input = event.target.closest('input[data-meta-ac]');
    if (!input) return false;
    const list = metaAcList(input);
    if (!list?.classList.contains('active')) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      index = Math.min(items.length - 1, index + 1);
      render(input);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      index = Math.max(-1, index - 1);
      render(input);
      return true;
    }
    if (event.key === 'Enter') {
      const item = items[index];
      if (item) {
        event.preventDefault();
        pick(input, item);
        return true;
      }
    }
    if (event.key === 'Escape') {
      hide(input);
      return true;
    }
    return false;
  }

  function handleFocusout(event) {
    const input = event.target.closest('input[data-meta-ac]');
    if (!input) return false;
    setTimeoutImpl(() => {
      if (document.activeElement?.closest('.deck-meta-ac-wrap') !== metaAcWrap(input)) {
        hide(input);
      }
    }, 150);
    return true;
  }

  function bind(target = rootEl) {
    if (!target) return;
    target.addEventListener('click', handleClick);
    target.addEventListener('input', handleInput);
    target.addEventListener('keydown', handleKeydown);
    target.addEventListener('focusout', handleFocusout);
  }

  return {
    bind,
    fetchMatches,
    getCard: scryfallId => cardCache.get(scryfallId) || null,
    getItems: () => [...items],
    hide,
    pick,
  };
}
