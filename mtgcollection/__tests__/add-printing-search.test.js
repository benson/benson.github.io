import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrintingsSearchUrl,
  fetchExactPrintings,
  loadCardPrintings,
} from '../addPrintingSearch.js';

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

test('buildPrintingsSearchUrl: searches exact card names and includes all print variants', () => {
  const url = buildPrintingsSearchUrl({ apiBase: 'https://api.example', name: 'Urza "Lord"' });

  assert.match(url, /^https:\/\/api\.example\/cards\/search\?/);
  assert.match(decodeURIComponent(url), /q=!"Urza \\"Lord\\""/);
  assert.match(url, /unique=prints/);
  assert.match(url, /include_extras=true/);
  assert.match(url, /include_variations=true/);
});

test('fetchExactPrintings: paginates, reports total count, and marks truncated results', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return response({
        body: {
          total_cards: 4,
          data: [{ id: 'a' }, { id: 'b' }],
          has_more: true,
          next_page: 'next-page',
        },
      });
    }
    return response({
      body: {
        total_cards: 4,
        data: [{ id: 'c' }],
        has_more: false,
      },
    });
  };

  const result = await fetchExactPrintings({ name: 'Sol Ring', fetchImpl, apiBase: 'api' });

  assert.deepEqual(result.printings.map(c => c.id), ['a', 'b', 'c']);
  assert.equal(result.totalCount, 4);
  assert.equal(result.truncated, true);
  assert.equal(calls.length, 2);
});

test('fetchExactPrintings: treats Scryfall 404 as no matching printings', async () => {
  const result = await fetchExactPrintings({
    name: 'Nope',
    fetchImpl: async () => response({ ok: false, status: 404 }),
    apiBase: 'api',
  });

  assert.deepEqual(result, { printings: [], totalCount: 0, truncated: false });
});

test('loadCardPrintings: falls back to fuzzy card lookup when exact search is empty', async () => {
  const result = await loadCardPrintings({
    name: 'Sol Rung',
    apiBase: 'api',
    fetchImpl: async () => response({ ok: false, status: 404 }),
    fetchCardByNameImpl: async () => ({ id: 'sol-ring', name: 'Sol Ring' }),
  });

  assert.equal(result.status, 'fallback');
  assert.deepEqual(result.printings, [{ id: 'sol-ring', name: 'Sol Ring' }]);
  assert.equal(result.totalCount, 1);
  assert.equal(result.truncated, false);
});

test('loadCardPrintings: returns fallback-error when search fails but fuzzy lookup succeeds', async () => {
  const result = await loadCardPrintings({
    name: 'Sol Ring',
    apiBase: 'api',
    fetchImpl: async () => response({ ok: false, status: 500 }),
    fetchCardByNameImpl: async () => ({ id: 'fallback' }),
  });

  assert.equal(result.status, 'fallback-error');
  assert.equal(result.error.message, 'http 500');
  assert.deepEqual(result.printings, [{ id: 'fallback' }]);
});

test('loadCardPrintings: returns aborted without touching the network if already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;

  const result = await loadCardPrintings({
    name: 'Sol Ring',
    signal: controller.signal,
    fetchImpl: async () => {
      called = true;
      return response();
    },
  });

  assert.deepEqual(result, { status: 'aborted' });
  assert.equal(called, false);
});
