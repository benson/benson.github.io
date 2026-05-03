import { fetchCardByName } from '../shared/mtg.js';
import { SCRYFALL_API } from './state.js';

export const PRINTINGS_MAX_PAGES = 3;
export const PRINTINGS_HARD_CAP = 150;

export function buildPrintingsSearchUrl({ apiBase = SCRYFALL_API, name }) {
  const query = '!"' + String(name || '').replace(/"/g, '\\"') + '"';
  return apiBase
    + '/cards/search?q=' + encodeURIComponent(query)
    + '&unique=prints&order=released&dir=desc&include_extras=true&include_variations=true';
}

export async function fetchExactPrintings({
  name,
  signal,
  apiBase = SCRYFALL_API,
  fetchImpl = fetch,
  maxPages = PRINTINGS_MAX_PAGES,
  hardCap = PRINTINGS_HARD_CAP,
} = {}) {
  let url = buildPrintingsSearchUrl({ apiBase, name });
  const collected = [];
  let pages = 0;
  let totalCards = 0;
  while (url && pages < maxPages) {
    const resp = await fetchImpl(url, { signal });
    if (!resp.ok) {
      if (resp.status === 404) break;
      throw new Error('http ' + resp.status);
    }
    const data = await resp.json();
    pages++;
    if (typeof data.total_cards === 'number') totalCards = data.total_cards;
    if (Array.isArray(data.data)) {
      for (const card of data.data) {
        collected.push(card);
        if (collected.length >= hardCap) break;
      }
    }
    if (collected.length >= hardCap) break;
    url = data.has_more ? data.next_page : null;
  }
  const totalCount = Math.max(totalCards, collected.length);
  return {
    printings: collected,
    totalCount,
    truncated: collected.length < totalCount,
  };
}

export async function loadCardPrintings({
  name,
  signal,
  apiBase = SCRYFALL_API,
  fetchImpl = fetch,
  fetchCardByNameImpl = fetchCardByName,
  maxPages = PRINTINGS_MAX_PAGES,
  hardCap = PRINTINGS_HARD_CAP,
} = {}) {
  if (signal?.aborted) return { status: 'aborted' };
  try {
    const exact = await fetchExactPrintings({
      name,
      signal,
      apiBase,
      fetchImpl,
      maxPages,
      hardCap,
    });
    if (signal?.aborted) return { status: 'aborted' };
    if (exact.printings.length) return { status: 'ok', ...exact };

    const card = await fetchCardByNameImpl(name);
    if (signal?.aborted) return { status: 'aborted' };
    if (!card) return { status: 'empty', printings: [], totalCount: 0, truncated: false };
    return { status: 'fallback', printings: [card], totalCount: 1, truncated: false };
  } catch (error) {
    if (signal?.aborted) return { status: 'aborted' };
    const card = await fetchCardByNameImpl(name);
    if (signal?.aborted) return { status: 'aborted' };
    if (card) return { status: 'fallback-error', error, printings: [card], totalCount: 1, truncated: false };
    return { status: 'error-empty', error, printings: [], totalCount: 0, truncated: false };
  }
}
