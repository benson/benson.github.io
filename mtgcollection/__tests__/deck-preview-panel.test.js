import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createDeckPreviewPanel } from '../deckPreviewPanel.js';

function installDom(extra = '') {
  const win = new Window();
  win.document.body.innerHTML = `
    <aside id="deckPreviewPanel" class="hidden">
      <div class="deck-preview-frame">
        <img class="deck-preview-card" alt="">
        <div class="deck-preview-placeholder"></div>
      </div>
      <div class="deck-preview-name"></div>
      <div class="deck-preview-meta"></div>
      <div class="deck-preview-flip-row"><button id="deckPreviewFlipBtn" type="button">flip</button></div>
    </aside>
    ${extra}
  `;
  return {
    win,
    panelEl: win.document.getElementById('deckPreviewPanel'),
  };
}

const collectionCard = (extra = {}) => ({
  scryfallId: 'sid-1',
  name: 'Sol Ring',
  resolvedName: 'Sol Ring',
  imageUrl: 'https://img/front',
  backImageUrl: '',
  qty: 2,
  finish: 'foil',
  price: 1.5,
  location: { type: 'deck', name: 'breya' },
  ...extra,
});

test('createDeckPreviewPanel: setCard renders card art, metadata, and hide state', () => {
  const dom = installDom();
  const card = collectionCard();
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [card],
  });

  panel.setCard(card);

  assert.equal(dom.panelEl.classList.contains('hidden'), false);
  assert.equal(dom.panelEl.dataset.index, '0');
  assert.equal(dom.panelEl.querySelector('.deck-preview-card').src, 'https://img/front');
  assert.equal(dom.panelEl.querySelector('.deck-preview-name').textContent, 'Sol Ring');
  assert.equal(dom.panelEl.querySelector('.deck-preview-meta').textContent, '\u00d72  \u00b7  $1.50 \u00b7 $3.00 total');
  assert.equal(dom.panelEl.querySelector('.deck-preview-frame').classList.contains('is-foil'), true);

  panel.setCard(null);

  assert.equal(dom.panelEl.classList.contains('hidden'), true);
  assert.equal(dom.panelEl.dataset.index, '');
});

test('createDeckPreviewPanel: deck-card targets prefer inventory entries when available', () => {
  const dom = installDom(`
    <article class="deck-card" data-inventory-index="0" data-card-name="Placeholder"></article>
  `);
  const card = collectionCard({ resolvedName: 'Owned Sol Ring' });
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [card],
  });

  panel.showFromTarget(dom.win.document.querySelector('.deck-card'));

  assert.equal(dom.panelEl.querySelector('.deck-preview-name').textContent, 'Owned Sol Ring');
  assert.equal(dom.panelEl.dataset.index, '0');
});

test('createDeckPreviewPanel: placeholder deck-card targets synthesize preview data', () => {
  const dom = installDom(`
    <article class="deck-card" data-inventory-index="-1" data-card-name="Unknown Card" data-image-url="https://img/unknown" data-card-qty="3" data-card-finish="etched" data-card-price="2"></article>
  `);
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [],
  });

  panel.showFromTarget(dom.win.document.querySelector('.deck-card'));

  assert.equal(dom.panelEl.querySelector('.deck-preview-name').textContent, 'Unknown Card');
  assert.equal(dom.panelEl.querySelector('.deck-preview-card').src, 'https://img/unknown');
  assert.equal(dom.panelEl.querySelector('.deck-preview-meta').textContent, '\u00d73  \u00b7  $2.00 \u00b7 $6.00 total');
  assert.equal(dom.panelEl.querySelector('.deck-preview-frame').classList.contains('is-etched'), true);
  assert.equal(dom.panelEl.dataset.index, '-1');
});

test('createDeckPreviewPanel: metadata preview links resolve within the current deck scope', () => {
  const dom = installDom(`
    <dd class="deck-meta-preview-link" data-scryfall-id="sid-1" data-card-name="Commander" data-image-url="https://img/meta"></dd>
  `);
  const other = collectionCard({ resolvedName: 'Other Deck Copy', location: { type: 'deck', name: 'other' } });
  const current = collectionCard({ resolvedName: 'Breya Copy', location: { type: 'deck', name: 'breya' } });
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [other, current],
    getDeckScope: () => ({ type: 'deck', name: 'breya' }),
  });

  panel.showFromTarget(dom.win.document.querySelector('.deck-meta-preview-link'));

  assert.equal(dom.panelEl.querySelector('.deck-preview-name').textContent, 'Breya Copy');
  assert.equal(dom.panelEl.dataset.index, '1');
  assert.equal(dom.panelEl.querySelector('.deck-preview-frame').classList.contains('is-foil'), true);
});

test('createDeckPreviewPanel: metadata preview fallback keeps declared finish treatment', () => {
  const dom = installDom(`
    <dd class="deck-meta-preview-link" data-scryfall-id="sid-2" data-card-name="Commander" data-image-url="https://img/meta" data-card-finish="etched"></dd>
  `);
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [],
    getDeckScope: () => ({ type: 'deck', name: 'breya' }),
  });

  panel.showFromTarget(dom.win.document.querySelector('.deck-meta-preview-link'));

  assert.equal(dom.panelEl.querySelector('.deck-preview-name').textContent, 'Commander');
  assert.equal(dom.panelEl.querySelector('.deck-preview-frame').classList.contains('is-etched'), true);
});

test('createDeckPreviewPanel: bound preview panel opens details and flips inventory cards', () => {
  const dom = installDom();
  const opened = [];
  const card = collectionCard({ backImageUrl: 'https://img/back' });
  const panel = createDeckPreviewPanel({
    panelEl: dom.panelEl,
    getCollection: () => [card],
    openDetail: index => opened.push(index),
  });
  panel.bind();
  panel.setCard(card);

  dom.panelEl.querySelector('#deckPreviewFlipBtn').click();
  assert.equal(dom.panelEl.querySelector('.deck-preview-card').src, 'https://img/back');

  dom.panelEl.click();
  assert.deepEqual(opened, [0]);
});
