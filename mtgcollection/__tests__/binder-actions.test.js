import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { bindBinderControls } from '../binderActions.js';
import { collectionKey } from '../collection.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <div id="binderSizeControl">
      <button data-binder-size="4x3"></button>
      <button data-binder-size="3x3"></button>
      <button data-binder-size="list"></button>
      <button data-binder-size="bogus"></button>
    </div>
    <input type="checkbox" id="binderPriceToggle" checked>
    <div id="binderModeControl">
      <button data-binder-mode="view"></button>
      <button data-binder-mode="organize"></button>
    </div>
    <select id="binderSortSelect">
      <option value="binder"></option>
      <option value="price-desc"></option>
    </select>
    <input id="binderSearchInput">
    <select id="binderColorFilter"><option value=""></option><option value="g"></option></select>
    <select id="binderTypeFilter"><option value=""></option><option value="creature"></option></select>
    <button id="binderLensReset"></button>
    <button id="binderPrev"></button>
    <button id="binderNext"></button>
    <div id="binderPages">
      <button class="deck-empty-chip"><span class="loc-pill" data-loc-type="binder" data-loc-name="trade binder"></span></button>
      <div class="binder-slot" data-index="2" tabindex="0"></div>
      <div class="binder-slot binder-slot-empty" data-index="9"></div>
    </div>
    <input id="searchInput">
    <select id="filterSet"></select>
    <select id="filterRarity"></select>
    <select id="filterFoil"></select>
    <select id="filterLocation"></select>
    <select id="filterTag"></select>
    <input id="editing">
  `;
  return {
    win,
    document: win.document,
    stateRef: {
      binderPage: 1,
      binderSize: '4x3',
      binderShowPrices: true,
      binderMode: 'view',
      binderSort: 'binder',
      binderSearch: '',
      binderColorFilter: '',
      binderTypeFilter: '',
      collection: [],
    },
  };
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('bindBinderControls: size and page buttons update state and render', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindBinderControls({
    documentObj: document,
    stateRef,
    renderImpl: () => calls.push('render'),
    saveBinderSizeImpl: () => calls.push('saveSize'),
    applyBinderSizeButtonsImpl: () => calls.push('applySize'),
  });

  click(win, document.querySelector('[data-binder-size="3x3"]'));
  assert.equal(stateRef.binderSize, '3x3');
  assert.equal(stateRef.binderPage, 0);
  assert.deepEqual(calls, ['saveSize', 'applySize', 'render']);

  click(win, document.getElementById('binderNext'));
  assert.equal(stateRef.binderPage, 1);
  click(win, document.getElementById('binderPrev'));
  assert.equal(stateRef.binderPage, 0);
  click(win, document.getElementById('binderPrev'));
  assert.equal(stateRef.binderPage, 0);

  click(win, document.querySelector('[data-binder-size="bogus"]'));
  assert.equal(stateRef.binderSize, '3x3');
});

test('bindBinderControls: price toggle persists and rerenders', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindBinderControls({
    documentObj: document,
    stateRef,
    renderImpl: () => calls.push('render'),
    saveBinderPricesImpl: () => calls.push('savePrices'),
    applyBinderPriceToggleImpl: () => calls.push('applyPrices'),
  });

  const toggle = document.getElementById('binderPriceToggle');
  toggle.checked = false;
  toggle.dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.equal(stateRef.binderShowPrices, false);
  assert.deepEqual(calls, ['savePrices', 'applyPrices', 'render']);
});

test('bindBinderControls: mode, sort, and explore filters persist and rerender', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindBinderControls({
    documentObj: document,
    stateRef,
    renderImpl: () => calls.push('render'),
    saveBinderViewPrefsImpl: () => calls.push('savePrefs'),
    applyBinderExploreControlsImpl: () => calls.push('applyExplore'),
  });

  click(win, document.querySelector('[data-binder-mode="organize"]'));
  assert.equal(stateRef.binderMode, 'organize');

  const sort = document.getElementById('binderSortSelect');
  sort.value = 'price-desc';
  sort.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(stateRef.binderSort, 'price-desc');

  const search = document.getElementById('binderSearchInput');
  search.value = 'tomb';
  search.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(stateRef.binderSearch, 'tomb');

  const color = document.getElementById('binderColorFilter');
  color.value = 'g';
  color.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(stateRef.binderColorFilter, 'g');

  click(win, document.getElementById('binderLensReset'));
  assert.equal(stateRef.binderSort, 'binder');
  assert.equal(stateRef.binderSearch, '');
  assert.equal(stateRef.binderColorFilter, '');
  assert.equal(stateRef.binderPage, 0);
  assert.deepEqual(calls, [
    'savePrefs', 'applyExplore', 'render',
    'savePrefs', 'applyExplore', 'render',
    'savePrefs', 'applyExplore', 'render',
    'savePrefs', 'applyExplore', 'render',
    'savePrefs', 'applyExplore', 'render',
  ]);
});

test('bindBinderControls: binder page slots open detail and chips navigate', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindBinderControls({
    documentObj: document,
    stateRef,
    openDetailImpl: index => calls.push(['detail', index]),
    navigateToLocationImpl: (type, name) => calls.push(['nav', type, name]),
  });

  click(win, document.querySelector('.deck-empty-chip'));
  click(win, document.querySelector('.binder-slot:not(.binder-slot-empty)'));
  document.querySelector('.binder-slot:not(.binder-slot-empty)')
    .dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  click(win, document.querySelector('.binder-slot-empty'));

  assert.deepEqual(calls, [
    ['nav', 'binder', 'trade binder'],
    ['detail', 2],
    ['detail', 2],
  ]);
});

test('bindBinderControls: arrow keys page only in binder shape and ignore inputs', () => {
  const { win, document, stateRef } = setup();
  const calls = [];
  let shape = 'collection';

  bindBinderControls({
    documentObj: document,
    stateRef,
    getEffectiveShapeImpl: () => shape,
    renderImpl: () => calls.push('render'),
  });

  document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(stateRef.binderPage, 1);

  shape = 'binder';
  document.getElementById('editing')
    .dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(stateRef.binderPage, 1);

  document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(stateRef.binderPage, 2);
  document.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(stateRef.binderPage, 1);

  assert.deepEqual(calls, ['render', 'render']);
});

test('bindBinderControls: organize drag/drop swaps canonical binder slots', () => {
  const { win, document, stateRef } = setup();
  const calls = [];
  const alpha = {
    name: 'Alpha',
    scryfallId: 'a',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    location: { type: 'binder', name: 'trade' },
  };
  const beta = {
    name: 'Beta',
    scryfallId: 'b',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    location: { type: 'binder', name: 'trade' },
  };
  const container = {
    type: 'binder',
    name: 'trade',
    binderOrder: [collectionKey(alpha), collectionKey(beta), null, null],
  };
  stateRef.collection = [alpha, beta];
  stateRef.binderMode = 'organize';
  stateRef.binderSize = '2x2';
  document.getElementById('binderPages').innerHTML = `
    <div class="binder-slot" data-binder-draggable="true" data-binder-slot="0"></div>
    <div class="binder-slot" data-binder-draggable="true" data-binder-slot="1"></div>
    <div class="binder-slot binder-slot-empty" data-binder-slot="2"></div>
    <div class="binder-slot binder-slot-empty" data-binder-slot="3"></div>
  `;

  bindBinderControls({
    documentObj: document,
    stateRef,
    getEffectiveShapeImpl: () => 'binder',
    getActiveBinderContainerImpl: () => container,
    saveImpl: () => calls.push('save'),
    renderImpl: () => calls.push('render'),
  });

  const data = new Map();
  const dataTransfer = {
    setData: (type, value) => data.set(type, value),
    getData: type => data.get(type) || '',
  };
  const first = document.querySelector('[data-binder-slot="0"]');
  const empty = document.querySelector('[data-binder-slot="2"]');
  first.dispatchEvent(new win.Event('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
  empty.dispatchEvent(new win.Event('drop', { bubbles: true, cancelable: true, dataTransfer }));

  assert.deepEqual(container.binderOrder.slice(0, 4), [null, collectionKey(beta), collectionKey(alpha), null]);
  assert.deepEqual(calls, ['save', 'render']);
});

test('bindBinderControls: search and filter changes reset the current page', () => {
  const { win, document, stateRef } = setup();

  bindBinderControls({ documentObj: document, stateRef });

  stateRef.binderPage = 5;
  document.getElementById('searchInput').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert.equal(stateRef.binderPage, 0);

  stateRef.binderPage = 4;
  document.getElementById('filterTag').dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(stateRef.binderPage, 0);
});
