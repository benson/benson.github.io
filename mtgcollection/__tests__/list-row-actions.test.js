import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { state } from '../state.js';
import {
  bindListRowInteractions,
  clearRowLocation,
  commitRowLocationFromPicker,
  commitRowTag,
  removeRowTag,
} from '../listRowActions.js';

afterEach(() => {
  state.collection = [];
  state.containers = {};
});

function sideEffects() {
  const calls = { commits: [], records: [], feedback: [] };
  return {
    calls,
    captureBeforeImpl: keys => ({ keys }),
    commitImpl: options => calls.commits.push(options),
    recordEventImpl: event => calls.records.push(event),
    showFeedbackImpl: (message, type) => calls.feedback.push({ message, type }),
  };
}

function rowInput(html, selector) {
  const win = new Window();
  const table = win.document.createElement('table');
  table.innerHTML = `<tbody><tr><td>${html}</td></tr></tbody>`;
  return {
    win,
    input: table.querySelector(selector),
  };
}

function card(overrides = {}) {
  return {
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    imageUrl: 'front.jpg',
    backImageUrl: 'back.jpg',
    tags: [],
    ...overrides,
  };
}

test('commitRowLocationFromPicker: writes a normalized location and records one edit', () => {
  state.collection = [card()];
  const fx = sideEffects();
  const { input } = rowInput(`
    <select class="loc-picker-type"><option value="deck" selected>deck</option></select>
    <input class="loc-picker-name" data-index="0" value="Breya Deck">
  `, '.loc-picker-name');

  const result = commitRowLocationFromPicker(input, fx);

  assert.equal(result.ok, true);
  assert.deepEqual(state.collection[0].location, { type: 'deck', name: 'breya deck' });
  assert.deepEqual(fx.calls.commits, [{ coalesce: true }]);
  assert.equal(fx.calls.records.length, 1);
  assert.deepEqual(fx.calls.records[0].cards[0], {
    name: 'Sol Ring',
    imageUrl: 'front.jpg',
    backImageUrl: 'back.jpg',
  });
});

test('commitRowLocationFromPicker: can commit an existing container select value', () => {
  state.collection = [card()];
  const fx = sideEffects();
  const { input } = rowInput(`
    <span class="loc-picker">
      <select class="loc-picker-target" data-index="0">
        <option value="">+ loc</option>
        <option value="binder:trade binder" selected>trade binder</option>
        <option value="__new__">+ new container</option>
      </select>
      <span class="loc-picker-new hidden">
        <select class="loc-picker-type"><option value="box" selected>box</option></select>
        <input class="loc-picker-name" data-index="0" value="">
      </span>
    </span>
  `, '.loc-picker-target');

  const result = commitRowLocationFromPicker(input, fx);

  assert.equal(result.ok, true);
  assert.deepEqual(state.collection[0].location, { type: 'binder', name: 'trade binder' });
  assert.deepEqual(fx.calls.commits, [{ coalesce: true }]);
});

test('commitRowLocationFromPicker: clears invalid empty locations without committing', () => {
  state.collection = [card()];
  const fx = sideEffects();
  const { input } = rowInput(`
    <select class="loc-picker-type"><option value="box" selected>box</option></select>
    <input class="loc-picker-name" data-index="0" value=" ">
  `, '.loc-picker-name');

  const result = commitRowLocationFromPicker(input, fx);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-location');
  assert.equal(input.value, '');
  assert.equal(fx.calls.commits.length, 0);
  assert.equal(fx.calls.records.length, 0);
});

test('clearRowLocation: clears existing location and records the previous value', () => {
  state.collection = [card({ location: { type: 'box', name: 'bulk' } })];
  const fx = sideEffects();

  const result = clearRowLocation(0, fx);

  assert.equal(result.ok, true);
  assert.equal(state.collection[0].location, null);
  assert.deepEqual(fx.calls.commits, [{ coalesce: true }]);
  assert.equal(fx.calls.records[0].summary, '{card} removed from {loc:box:bulk}');
});

test('commitRowTag and removeRowTag: mutate tags with duplicate feedback', () => {
  state.collection = [card({ tags: ['edh'] })];
  const fx = sideEffects();
  const { input } = rowInput('<input class="row-tag-input" data-index="0" value="EDH">', '.row-tag-input');

  const duplicate = commitRowTag(input, fx);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate-tag');
  assert.deepEqual(fx.calls.feedback, [{ message: 'already tagged edh', type: 'info' }]);
  assert.equal(input.value, '');

  input.value = 'Artifact Staple';
  const added = commitRowTag(input, fx);
  const removed = removeRowTag(0, 'edh', fx);

  assert.equal(added.ok, true);
  assert.equal(added.tag, 'artifact staple');
  assert.equal(removed.ok, true);
  assert.deepEqual(state.collection[0].tags, ['artifact staple']);
  assert.deepEqual(fx.calls.commits, [{ coalesce: true }, { coalesce: true }]);
  assert.equal(fx.calls.records[0].summary, 'Tagged {card} +artifact staple');
  assert.equal(fx.calls.records[1].summary, 'Tagged {card} -edh');
});

test('bindListRowInteractions: delegates clicks, key commits, and change commits', () => {
  const win = new Window();
  win.document.body.innerHTML = `
    <table><tbody id="rows">
      <tr class="detail-trigger" data-index="7">
        <td class="text-cell">open row</td>
        <td><button class="row-tag-remove" data-index="1" data-tag="edh">x</button></td>
        <td><button class="loc-pill-remove" data-index="2">x</button></td>
        <td><button class="card-name-button" data-index="3">Sol Ring</button></td>
        <td><input class="row-tag-input" data-index="4" value="artifact"></td>
        <td><input class="loc-picker-name" data-index="5" value="bulk"></td>
        <td>
          <span class="loc-picker">
            <select class="loc-picker-target" data-index="6">
              <option value="">+ loc</option>
              <option value="binder:trade binder">trade binder</option>
              <option value="__new__">+ new container</option>
            </select>
            <span class="loc-picker-new hidden">
              <select class="loc-picker-type" data-index="6"><option value="box" selected>box</option></select>
              <input class="loc-picker-name" data-index="6" value="">
            </span>
          </span>
        </td>
        <td><input class="row-check"></td>
      </tr>
    </tbody></table>
  `;
  const rows = win.document.getElementById('rows');
  const calls = [];
  bindListRowInteractions({
    listBodyEl: rows,
    openDetailImpl: index => calls.push(['detail', index]),
    removeRowTagImpl: (index, tag) => calls.push(['removeTag', index, tag]),
    clearRowLocationImpl: index => calls.push(['clearLoc', index]),
    commitRowTagImpl: input => calls.push(['tag', input.dataset.index, input.value]),
    commitRowLocationFromPickerImpl: input => calls.push(['loc', input.dataset.index, input.value]),
  });

  rows.querySelector('.row-tag-remove').click();
  rows.querySelector('.loc-pill-remove').click();
  rows.querySelector('.card-name-button').click();
  rows.querySelector('.text-cell').click();
  rows.querySelector('.row-tag-input').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  rows.querySelector('.loc-picker-name').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  rows.querySelector('.row-tag-input').dispatchEvent(new win.Event('change', { bubbles: true }));
  rows.querySelector('.loc-picker-name').dispatchEvent(new win.Event('change', { bubbles: true }));
  const locSelect = rows.querySelector('.loc-picker-target');
  locSelect.value = 'binder:trade binder';
  locSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  locSelect.value = '__new__';
  locSelect.dispatchEvent(new win.Event('change', { bubbles: true }));
  rows.querySelector('.row-check').dispatchEvent(new win.Event('change', { bubbles: true }));

  assert.deepEqual(calls, [
    ['removeTag', 1, 'edh'],
    ['clearLoc', 2],
    ['detail', 3],
    ['detail', 7],
    ['tag', '4', 'artifact'],
    ['loc', '5', 'bulk'],
    ['tag', '4', 'artifact'],
    ['loc', '5', 'bulk'],
    ['loc', '6', 'binder:trade binder'],
  ]);
  assert.equal(rows.querySelector('.loc-picker-new').classList.contains('hidden'), false);
});
