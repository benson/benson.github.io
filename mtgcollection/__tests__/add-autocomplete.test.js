import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  buildAutocompleteUrl,
  createNameAutocomplete,
  fetchAutocompleteSuggestions,
} from '../addAutocomplete.js';

const previousDocument = globalThis.document;

afterEach(() => {
  globalThis.document = previousDocument;
});

function installDom() {
  const win = new Window();
  globalThis.document = win.document;
  win.document.body.innerHTML = `
    <input id="name">
    <ol id="suggestions"></ol>
  `;
  return {
    doc: win.document,
    inputEl: win.document.getElementById('name'),
    listEl: win.document.getElementById('suggestions'),
  };
}

function response({ ok = true, body = {} } = {}) {
  return {
    ok,
    async json() {
      return body;
    },
  };
}

test('buildAutocompleteUrl: encodes the card query', () => {
  assert.equal(
    buildAutocompleteUrl({ apiBase: 'https://api.example', query: 'Sol Ring' }),
    'https://api.example/cards/autocomplete?q=Sol%20Ring'
  );
});

test('fetchAutocompleteSuggestions: returns bounded Scryfall names', async () => {
  const calls = [];
  const suggestions = await fetchAutocompleteSuggestions({
    query: 'so',
    apiBase: 'api',
    maxItems: 2,
    fetchImpl: async (url) => {
      calls.push(url);
      return response({ body: { data: ['Sol Ring', 'Solemn Simulacrum', 'Soul Warden'] } });
    },
  });

  assert.deepEqual(suggestions, ['Sol Ring', 'Solemn Simulacrum']);
  assert.equal(calls[0], 'api/cards/autocomplete?q=so');
});

test('createNameAutocomplete: loads and renders escaped suggestions', async () => {
  const { inputEl, listEl } = installDom();
  const ac = createNameAutocomplete({
    inputEl,
    listEl,
    onPick: () => {},
    fetchSuggestions: async () => ['Sol Ring', '<Bad Card>'],
  });

  await ac.load('so');

  assert.equal(listEl.classList.contains('active'), true);
  assert.deepEqual([...listEl.children].map(li => li.textContent), ['Sol Ring', '<Bad Card>']);
  assert.equal(listEl.innerHTML.includes('<Bad Card>'), false);
  assert.deepEqual(ac.getItems(), ['Sol Ring', '<Bad Card>']);
});

test('createNameAutocomplete: reports Scryfall lookup errors', async () => {
  const { inputEl, listEl } = installDom();
  const errors = [];
  const ac = createNameAutocomplete({
    inputEl,
    listEl,
    onPick: () => {},
    onError: (error, query) => errors.push({ message: error.message, query }),
    fetchSuggestions: async () => { throw new TypeError('Failed to fetch'); },
  });

  await ac.load('so');

  assert.equal(listEl.classList.contains('active'), false);
  assert.deepEqual(errors, [{ message: 'Failed to fetch', query: 'so' }]);
});

test('createNameAutocomplete: keyboard navigation picks the highlighted suggestion', async () => {
  const { doc, inputEl, listEl } = installDom();
  const picked = [];
  const ac = createNameAutocomplete({
    inputEl,
    listEl,
    onPick: async (name) => { picked.push(name); },
    fetchSuggestions: async () => ['Sol Ring', 'Solemn Simulacrum'],
  });
  ac.bind();
  await ac.load('so');

  inputEl.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(ac.getIndex(), 0);
  assert.equal(listEl.children[0].classList.contains('highlight'), true);

  inputEl.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await Promise.resolve();

  assert.deepEqual(picked, ['Sol Ring']);
  assert.equal(inputEl.value, 'Sol Ring');
  assert.equal(listEl.classList.contains('active'), false);
});

test('createNameAutocomplete: short input hides suggestions and invokes empty-query hook', async () => {
  const { doc, inputEl, listEl } = installDom();
  let emptied = 0;
  const ac = createNameAutocomplete({
    inputEl,
    listEl,
    onPick: () => {},
    onEmptyQuery: () => { emptied++; },
    fetchSuggestions: async () => ['Sol Ring'],
  });
  ac.bind();
  await ac.load('so');

  inputEl.value = 's';
  inputEl.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));

  assert.equal(listEl.classList.contains('active'), false);
  assert.equal(emptied, 1);
});

test('createNameAutocomplete: clicking a suggestion picks it', async () => {
  const { doc, inputEl, listEl } = installDom();
  const picked = [];
  const ac = createNameAutocomplete({
    inputEl,
    listEl,
    onPick: async (name) => { picked.push(name); },
    fetchSuggestions: async () => ['Sol Ring'],
  });
  ac.bind();
  await ac.load('so');

  listEl.children[0].dispatchEvent(new doc.defaultView.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await Promise.resolve();

  assert.deepEqual(picked, ['Sol Ring']);
  assert.equal(inputEl.value, 'Sol Ring');
});
