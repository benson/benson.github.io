import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createDeckMetaAutocomplete } from '../deckMetaAutocomplete.js';

function installDom() {
  const win = new Window();
  global.document = win.document;
  win.document.body.innerHTML = `
    <div id="deckColumns">
      <span class="deck-meta-ac-wrap">
        <input data-meta-ac="commander" value="" data-meta-ac-scryfall-id="old" data-meta-ac-scryfall-uri="old-uri" data-meta-ac-image="old-img" data-meta-ac-back-image="old-back">
        <ul class="autocomplete-list deck-meta-ac-list" role="listbox"></ul>
      </span>
    </div>
  `;
  return {
    win,
    rootEl: win.document.getElementById('deckColumns'),
    input: win.document.querySelector('input[data-meta-ac]'),
    list: win.document.querySelector('.deck-meta-ac-list'),
  };
}

function scryfallCard(extra = {}) {
  return {
    id: 'breya-id',
    name: 'Breya, Etherium Shaper',
    scryfall_uri: 'https://scryfall.test/card/breya-id',
    image_uris: { normal: 'https://img/front-normal', small: 'https://img/front-small' },
    ...extra,
  };
}

test('createDeckMetaAutocomplete: fetches commander matches and renders suggestions', async () => {
  const dom = installDom();
  let requestedUrl = '';
  let requestedSignal = null;
  const ac = createDeckMetaAutocomplete({
    rootEl: dom.rootEl,
    apiBase: 'https://example.test',
    fetchImpl: async (url, opts) => {
      requestedUrl = url;
      requestedSignal = opts.signal;
      return { ok: true, json: async () => ({ data: [scryfallCard()] }) };
    },
  });

  dom.input.value = 'breya';
  await ac.fetchMatches(dom.input);

  assert.equal(decodeURIComponent(requestedUrl), 'https://example.test/cards/search?q=is:commander name:breya&order=name&unique=cards');
  assert.equal(requestedSignal.aborted, false);
  assert.equal(dom.list.classList.contains('active'), true);
  assert.equal(dom.list.children.length, 1);
  assert.equal(dom.list.textContent, 'Breya, Etherium Shaper');
  assert.equal(ac.getCard('breya-id').name, 'Breya, Etherium Shaper');
});

test('createDeckMetaAutocomplete: clicking a suggestion fills the input and metadata', async () => {
  const dom = installDom();
  const ac = createDeckMetaAutocomplete({
    rootEl: dom.rootEl,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [scryfallCard({ card_faces: [{ image_uris: { normal: 'front' } }, { image_uris: { normal: 'back' } }] })] }),
    }),
  });
  ac.bind();

  dom.input.value = 'breya';
  await ac.fetchMatches(dom.input);
  dom.list.children[0].click();

  assert.equal(dom.input.value, 'Breya, Etherium Shaper');
  assert.equal(dom.input.dataset.metaAcScryfallId, 'breya-id');
  assert.equal(dom.input.dataset.metaAcScryfallUri, 'https://scryfall.test/card/breya-id');
  assert.equal(dom.input.dataset.metaAcImage, 'https://img/front-normal');
  assert.equal(dom.input.dataset.metaAcBackImage, 'back');
  assert.equal(dom.list.classList.contains('active'), false);
});

test('createDeckMetaAutocomplete: keyboard selection picks the highlighted suggestion', async () => {
  const dom = installDom();
  const ac = createDeckMetaAutocomplete({
    rootEl: dom.rootEl,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [
        scryfallCard({ id: 'one', name: 'Breya One' }),
        scryfallCard({ id: 'two', name: 'Breya Two' }),
      ] }),
    }),
  });
  ac.bind();

  dom.input.value = 'breya';
  await ac.fetchMatches(dom.input);
  dom.input.dispatchEvent(new dom.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  dom.input.dispatchEvent(new dom.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  dom.input.dispatchEvent(new dom.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.equal(dom.input.value, 'Breya Two');
  assert.equal(dom.input.dataset.metaAcScryfallId, 'two');
});

test('createDeckMetaAutocomplete: input clears stale picked metadata before lookup', () => {
  const dom = installDom();
  let queued = null;
  const ac = createDeckMetaAutocomplete({
    rootEl: dom.rootEl,
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    setTimeoutImpl: (fn) => { queued = fn; return 1; },
    clearTimeoutImpl: () => {},
  });
  ac.bind();

  dom.input.value = 'br';
  dom.input.dispatchEvent(new dom.win.Event('input', { bubbles: true }));

  assert.equal(dom.input.dataset.metaAcScryfallId, '');
  assert.equal(dom.input.dataset.metaAcScryfallUri, '');
  assert.equal(dom.input.dataset.metaAcImage, '');
  assert.equal(dom.input.dataset.metaAcBackImage, '');
  assert.equal(typeof queued, 'function');
});

test('createDeckMetaAutocomplete: short and failed searches hide suggestions', async () => {
  const dom = installDom();
  let fetches = 0;
  const ac = createDeckMetaAutocomplete({
    rootEl: dom.rootEl,
    fetchImpl: async () => {
      fetches++;
      return { ok: false, json: async () => ({}) };
    },
  });

  dom.list.innerHTML = '<li>old</li>';
  dom.list.classList.add('active');
  dom.input.value = 'b';
  await ac.fetchMatches(dom.input);

  assert.equal(fetches, 0);
  assert.equal(dom.list.classList.contains('active'), false);
  assert.equal(dom.list.innerHTML, '');

  dom.input.value = 'breya';
  dom.list.innerHTML = '<li>old</li>';
  dom.list.classList.add('active');
  await ac.fetchMatches(dom.input);

  assert.equal(fetches, 1);
  assert.equal(dom.list.classList.contains('active'), false);
  assert.equal(dom.list.innerHTML, '');
});
