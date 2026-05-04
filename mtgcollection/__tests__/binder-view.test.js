import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { state } from '../state.js';
import {
  applyBinderSizeButtons,
  applyBinderPriceToggle,
  loadBinderPrices,
  loadBinderSize,
  renderBinderSlot,
  renderBinderView,
  saveBinderPrices,
  saveBinderSize,
} from '../views/binderView.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

afterEach(() => {
  state.collection = [];
  state.binderSize = '4x3';
  state.binderPage = 0;
  state.binderShowPrices = true;
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
});

function installDom() {
  const win = new Window();
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.body.innerHTML = `
    <div id="binderPages"></div>
    <div id="binderNav" class="hidden">
      <button id="binderPrev"></button>
      <span id="binderPageIndicator"></span>
      <button id="binderNext"></button>
    </div>
    <div id="binderSummary"></div>
    <button data-binder-size="4x3"></button>
    <button data-binder-size="3x3"></button>
    <button data-binder-size="list"></button>
    <input type="checkbox" id="binderPriceToggle">
  `;
  return win.document;
}

function card(name, extra = {}) {
  return {
    name,
    resolvedName: name,
    qty: 1,
    setCode: 'tst',
    cn: name,
    finish: 'normal',
    ...extra,
  };
}

test('renderBinderSlot: renders detail-ready slot markup for a collection card', () => {
  const c = card('Sol Ring', {
    qty: 2,
    imageUrl: 'https://img.test/sol.jpg',
    finish: 'foil',
    price: 1.23,
  });
  state.collection = [c];
  const doc = installDom();

  const wrap = doc.createElement('div');
  wrap.innerHTML = renderBinderSlot(c);
  const slot = wrap.querySelector('.binder-slot');

  assert.equal(slot.dataset.index, '0');
  assert.equal(slot.classList.contains('detail-trigger'), true);
  assert.equal(slot.classList.contains('is-foil'), true);
  assert.equal(slot.querySelector('img').getAttribute('alt'), 'Sol Ring');
  assert.equal(slot.querySelector('.binder-qty').textContent, '\u00d72');
  assert.equal(slot.querySelector('.binder-price-badge').textContent, '$1.23');
});

test('renderBinderSlot: omits price badge when hidden or unpriced', () => {
  const c = card('No Price', { price: 0 });
  state.collection = [c];
  const doc = installDom();
  const wrap = doc.createElement('div');

  wrap.innerHTML = renderBinderSlot(c);
  assert.equal(wrap.querySelector('.binder-price-badge'), null);

  state.binderShowPrices = false;
  wrap.innerHTML = renderBinderSlot(card('Priced', { price: 9.99 }));
  assert.equal(wrap.querySelector('.binder-price-badge'), null);
});

test('renderBinderView: paginates sorted cards and updates binder chrome', () => {
  const doc = installDom();
  state.binderSize = '2x2';
  state.binderPage = 99;
  state.collection = ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'].map(name => card(name));

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(state.binderPage, 0);
  assert.equal(doc.querySelectorAll('.binder-slot.detail-trigger').length, 4);
  assert.equal(doc.getElementById('binderPages').classList.contains('binder-pages-2x2'), true);
  assert.equal(doc.querySelector('.binder-surface').classList.contains('binder-surface-2x2'), true);
  assert.match(doc.querySelector('.binder-page').getAttribute('style'), /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.equal(doc.querySelector('.binder-slot').getAttribute('aria-label'), 'Alpha');
  assert.equal(doc.getElementById('binderNav').classList.contains('hidden'), false);
  assert.equal(doc.getElementById('binderPrev').disabled, true);
  assert.equal(doc.getElementById('binderNext').disabled, false);
  assert.equal(doc.getElementById('binderPageIndicator').textContent, 'page 1 of 2');
  assert.equal(doc.getElementById('binderSummary').textContent, '5 cards - 5 unique');
});

test('renderBinderView: preserves empty pockets on sparse binder pages', () => {
  const doc = installDom();
  state.binderSize = '4x3';
  state.collection = ['Beta', 'Alpha'].map(name => card(name));

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(doc.querySelectorAll('.binder-slot').length, 12);
  assert.equal(doc.querySelectorAll('.binder-slot-empty').length, 10);
});

test('renderBinderView: list layout reuses row renderer without pagination chrome', () => {
  const doc = installDom();
  state.binderSize = 'list';
  state.binderPage = 2;
  state.collection = ['Bravo', 'Alpha'].map(name => card(name, { price: 2 }));

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(state.binderPage, 0);
  assert.equal(doc.getElementById('binderNav').classList.contains('hidden'), true);
  assert.equal(doc.getElementById('binderPages').classList.contains('binder-pages-list'), true);
  assert.equal(doc.querySelector('.binder-surface'), null);
  assert.equal(doc.querySelector('.binder-page'), null);
  assert.equal(doc.querySelectorAll('.binder-list-table tbody tr').length, 2);
  assert.equal(doc.querySelector('.binder-list-table tbody tr .card-name-button').textContent, 'Alpha');
});

test('renderBinderView: delegates no-filter empty state back to the shell', () => {
  const doc = installDom();
  let emptyMode = null;

  renderBinderView([], {
    hasActiveFilter: () => false,
    renderEmptyScopeState: (target, mode) => {
      emptyMode = mode;
      target.innerHTML = '<p>empty binder</p>';
    },
  });

  assert.equal(emptyMode, 'binder');
  assert.equal(doc.getElementById('binderNav').classList.contains('hidden'), true);
  assert.equal(doc.getElementById('binderSummary').textContent, '');
  assert.equal(doc.getElementById('binderPages').textContent, 'empty binder');
});

test('binder view preferences load, save, and update active size buttons', () => {
  const doc = installDom();
  const saved = new Map([['mtgcollection_binder_size_v1', 'list']]);
  const storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  };

  loadBinderSize(storage);
  assert.equal(state.binderSize, 'list');
  applyBinderSizeButtons(doc);
  assert.equal(doc.querySelector('[data-binder-size="list"]').classList.contains('active'), true);
  assert.equal(doc.querySelector('[data-binder-size="list"]').getAttribute('aria-pressed'), 'true');

  state.binderSize = '4x3';
  saveBinderSize(storage);
  assert.equal(saved.get('mtgcollection_binder_size_v1'), '4x3');
});

test('binder price preference defaults on and persists toggle state', () => {
  const doc = installDom();
  const saved = new Map();
  const storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  };

  loadBinderPrices(storage);
  assert.equal(state.binderShowPrices, true);
  applyBinderPriceToggle(doc);
  assert.equal(doc.getElementById('binderPriceToggle').checked, true);

  state.binderShowPrices = false;
  saveBinderPrices(storage);
  assert.equal(saved.get('mtgcollection_binder_prices_v1'), 'false');
});
