import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { bindBinderControls } from '../binderActions.js';

function setup() {
  const win = new Window();
  win.document.body.innerHTML = `
    <div id="binderSizeControl">
      <button data-binder-size="4x3"></button>
      <button data-binder-size="3x3"></button>
      <button data-binder-size="bogus"></button>
    </div>
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
    stateRef: { binderPage: 1, binderSize: '4x3' },
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
