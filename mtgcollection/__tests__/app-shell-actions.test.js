import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { bindAppShellActions } from '../appShellActions.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <nav class="app-header-views">
      <button data-view="collection"></button>
      <button data-view="decks"></button>
      <button data-view="bogus"></button>
    </nav>
    <button data-view-as-list></button>
    <table><thead>
      <tr><th data-sort="name">Name</th><th data-sort="price">Price</th><th><button class="sort-clear-btn"></button></th></tr>
    </thead></table>
    <div id="fabCluster"><button data-fab-target="filters, add"></button></div>
    <div id="appRightBackdrop"></div>
    <div id="detailDrawer"></div>
    <span class="loc-pill" data-loc-type="box" data-loc-name="bulk"></span>
    <button class="loc-pill-remove"><span class="loc-pill" data-loc-type="box" data-loc-name="bulk"></span></button>
    <button class="deck-empty-chip"><span class="loc-pill" data-loc-type="deck" data-loc-name="breya"></span></button>
  `;
  return {
    win,
    document: win.document,
    stateRef: {
      sortDir: 'asc',
      sortField: null,
      viewAsList: false,
      viewMode: 'collection',
    },
  };
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('bindAppShellActions: header view switching validates modes and skips no-op home clicks', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindAppShellActions({
    documentObj: document,
    stateRef,
    getActiveLocationImpl: () => null,
    setTopLevelViewModeImpl: mode => {
      calls.push(['view', mode]);
      stateRef.viewMode = mode;
    },
    saveImpl: () => calls.push(['save']),
    renderImpl: () => calls.push(['render']),
  });

  click(win, document.querySelector('[data-view="collection"]'));
  click(win, document.querySelector('[data-view="bogus"]'));
  click(win, document.querySelector('[data-view="decks"]'));

  assert.deepEqual(calls, [
    ['view', 'decks'],
    ['save'],
    ['render'],
  ]);
});

test('bindAppShellActions: view-as-list and sort controls update shell state', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindAppShellActions({
    documentObj: document,
    stateRef,
    saveImpl: () => calls.push('save'),
    renderImpl: () => calls.push('render'),
  });

  click(win, document.querySelector('[data-view-as-list]'));
  click(win, document.querySelector('th[data-sort="name"]'));
  click(win, document.querySelector('th[data-sort="name"]'));
  click(win, document.querySelector('th[data-sort="price"]'));
  click(win, document.querySelector('th[data-sort="price"]'));
  click(win, document.querySelector('th[data-sort="price"]'));
  click(win, document.querySelector('.sort-clear-btn'));

  assert.equal(stateRef.viewAsList, true);
  assert.equal(stateRef.sortField, null);
  assert.equal(stateRef.sortDir, 'asc');
  assert.deepEqual(calls, [
    'save', 'render',
    'save', 'render',
    'save', 'render',
    'save', 'render',
    'save', 'render',
    'save', 'render',
    'save', 'render',
  ]);
});

test('bindAppShellActions: fab/backdrop/escape coordinate the right drawer', () => {
  const { win, document, stateRef } = setup();
  const calls = [];
  let open = true;

  bindAppShellActions({
    documentObj: document,
    stateRef,
    getEffectiveShapeImpl: () => 'deck',
    currentDeckScopeImpl: () => ({ type: 'deck', name: 'breya' }),
    openRightDrawerImpl: (targets, options) => calls.push(['open', targets, options]),
    closeRightDrawerImpl: () => {
      calls.push(['close']);
      open = false;
    },
    isRightDrawerOpenImpl: () => open,
    isLightboxVisibleImpl: () => false,
  });

  click(win, document.querySelector('[data-fab-target]'));
  click(win, document.getElementById('appRightBackdrop'));
  open = true;
  document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.deepEqual(calls, [
    ['open', ['filters', 'add'], { seedLocation: { type: 'deck', name: 'breya' } }],
    ['close'],
    ['close'],
  ]);
});

test('bindAppShellActions: escape respects higher-priority overlays', () => {
  const { win, document, stateRef } = setup();
  const calls = [];
  const detailDrawer = document.getElementById('detailDrawer');

  bindAppShellActions({
    documentObj: document,
    stateRef,
    detailDrawerEl: detailDrawer,
    closeRightDrawerImpl: () => calls.push('close'),
    isRightDrawerOpenImpl: () => true,
    isLightboxVisibleImpl: () => false,
  });

  detailDrawer.classList.add('visible');
  document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  detailDrawer.classList.remove('visible');
  document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.deepEqual(calls, ['close']);
});

test('bindAppShellActions: location pills navigate except remove and empty-chip controls', () => {
  const { win, document, stateRef } = setup();
  const calls = [];

  bindAppShellActions({
    documentObj: document,
    stateRef,
    navigateToLocationImpl: (type, name) => calls.push([type, name]),
  });

  click(win, document.querySelector('.loc-pill'));
  click(win, document.querySelector('.loc-pill-remove .loc-pill'));
  click(win, document.querySelector('.deck-empty-chip .loc-pill'));

  assert.deepEqual(calls, [['box', 'bulk']]);
});
