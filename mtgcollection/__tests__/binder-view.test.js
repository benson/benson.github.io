import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { state } from '../state.js';
import {
  applyBinderSizeButtons,
  applyBinderExploreControls,
  applyBinderPriceToggle,
  loadBinderViewPrefs,
  loadBinderPrices,
  loadBinderSize,
  renderBinderSlot,
  renderBinderView,
  saveBinderViewPrefs,
  saveBinderPrices,
  saveBinderSize,
} from '../views/binderView.js';
import { binderCardKey } from '../binder.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

afterEach(() => {
  state.collection = [];
  state.binderSize = '4x3';
  state.binderPage = 0;
  state.binderShowPrices = true;
  state.binderMode = 'view';
  state.binderSort = 'binder';
  state.binderSearch = '';
  state.binderColorFilter = '';
  state.binderTypeFilter = '';
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
    <button data-binder-mode="view"></button>
    <button data-binder-mode="organize"></button>
    <select id="binderSortSelect">
      <option value="binder"></option>
      <option value="name"></option>
      <option value="price-desc"></option>
      <option value="recent"></option>
    </select>
    <input id="binderSearchInput">
    <select id="binderColorFilter">
      <option value=""></option>
      <option value="g"></option>
    </select>
    <select id="binderTypeFilter">
      <option value=""></option>
      <option value="creature"></option>
    </select>
    <button id="binderLensReset" class="hidden"></button>
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
  state.binderSort = 'name';
  state.collection = ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'].map((name, index) => card(name, { price: index + 1 }));

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(state.binderPage, 0);
  assert.equal(doc.querySelectorAll('.binder-slot.detail-trigger').length, 4);
  assert.equal(doc.getElementById('binderPages').classList.contains('binder-pages-2x2'), true);
  assert.equal(doc.querySelector('.binder-surface').classList.contains('binder-surface-2x2'), true);
  assert.match(doc.querySelector('.binder-page').getAttribute('style'), /grid-template-rows: repeat\(2, auto\)/);
  assert.equal(doc.querySelector('.binder-slot').getAttribute('aria-label'), 'Alpha');
  assert.equal(doc.getElementById('binderNav').classList.contains('hidden'), false);
  assert.equal(doc.getElementById('binderPrev').disabled, true);
  assert.equal(doc.getElementById('binderNext').disabled, false);
  assert.equal(doc.getElementById('binderPageIndicator').textContent, 'page 1 of 2');
  assert.equal(doc.getElementById('binderSummary').textContent, '5 cards - 5 unique - $15.00 value');
});

test('renderBinderView: preserves empty pockets on sparse binder pages', () => {
  const doc = installDom();
  state.binderSize = '4x3';
  state.collection = ['Beta', 'Alpha'].map(name => card(name));

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(doc.querySelectorAll('.binder-slot').length, 12);
  assert.equal(doc.querySelectorAll('.binder-slot-empty').length, 10);
});

test('renderBinderView: uses canonical binder order including empty pockets', () => {
  const doc = installDom();
  state.binderSize = '2x2';
  const alpha = card('Alpha');
  const beta = card('Beta');
  const gamma = card('Gamma');
  state.collection = [alpha, beta, gamma];
  const container = {
    type: 'binder',
    name: 'trade',
    binderOrder: [binderCardKey(gamma), null, binderCardKey(alpha)],
  };

  renderBinderView(state.collection, { container, hasActiveFilter: () => true });

  const slots = [...doc.querySelectorAll('.binder-slot')];
  assert.equal(slots[0].getAttribute('aria-label'), 'Gamma');
  assert.equal(slots[1].classList.contains('binder-slot-empty'), true);
  assert.equal(slots[2].getAttribute('aria-label'), 'Alpha');
  assert.equal(slots[3].getAttribute('aria-label'), 'Beta');
});

test('renderBinderView: explore lenses sort/filter without preserving empty pockets', () => {
  const doc = installDom();
  state.binderSize = '2x2';
  state.binderSort = 'price-desc';
  state.binderColorFilter = 'g';
  const alpha = card('Alpha', { price: 2, colors: ['G'], typeLine: 'Creature' });
  const beta = card('Beta', { price: 9, colors: ['U'], typeLine: 'Instant' });
  const gamma = card('Gamma', { price: 5, colors: ['G'], typeLine: 'Sorcery' });
  state.collection = [alpha, beta, gamma];
  const container = {
    type: 'binder',
    name: 'trade',
    binderOrder: [binderCardKey(alpha), null, binderCardKey(gamma), binderCardKey(beta)],
  };

  renderBinderView(state.collection, { container, hasActiveFilter: () => true });

  const slots = [...doc.querySelectorAll('.binder-slot')];
  assert.equal(slots[0].getAttribute('aria-label'), 'Gamma');
  assert.equal(slots[1].getAttribute('aria-label'), 'Alpha');
  assert.equal(slots[2].classList.contains('binder-slot-empty'), true);
  assert.equal(doc.getElementById('binderSummary').textContent, '2 cards - 2 unique - $7.00 value');
  assert.equal(doc.getElementById('binderLensReset').classList.contains('hidden'), false);
});

test('renderBinderView: organize mode marks cards draggable and ignores explore sort', () => {
  const doc = installDom();
  state.binderMode = 'organize';
  state.binderSort = 'price-desc';
  state.binderSize = '2x2';
  const alpha = card('Alpha', { price: 1 });
  const beta = card('Beta', { price: 9 });
  state.collection = [alpha, beta];

  renderBinderView(state.collection, { hasActiveFilter: () => true });

  assert.equal(doc.querySelector('.binder-slot').getAttribute('aria-label'), 'Alpha');
  assert.equal(doc.querySelector('.binder-slot').getAttribute('draggable'), 'true');
  assert.equal(doc.getElementById('binderSortSelect').disabled, true);
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

test('binder explore preferences load, save, and update controls', () => {
  const doc = installDom();
  const saved = new Map([['mtgcollection_binder_view_prefs_v1', JSON.stringify({
    mode: 'organize',
    sort: 'price-desc',
    search: 'tomb',
    color: 'g',
    type: 'creature',
  })]]);
  const storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  };

  loadBinderViewPrefs(storage);
  assert.equal(state.binderMode, 'organize');
  assert.equal(state.binderSort, 'price-desc');
  assert.equal(state.binderSearch, 'tomb');
  assert.equal(state.binderColorFilter, 'g');
  assert.equal(state.binderTypeFilter, 'creature');

  applyBinderExploreControls(doc);
  assert.equal(doc.querySelector('[data-binder-mode="organize"]').classList.contains('active'), true);
  assert.equal(doc.getElementById('binderSortSelect').disabled, true);
  assert.equal(doc.getElementById('binderSearchInput').value, 'tomb');
  assert.equal(doc.getElementById('binderColorFilter').value, 'g');
  assert.equal(doc.getElementById('binderTypeFilter').value, 'creature');

  state.binderMode = 'view';
  state.binderSort = 'recent';
  saveBinderViewPrefs(storage);
  assert.match(saved.get('mtgcollection_binder_view_prefs_v1'), /"sort":"recent"/);
});
