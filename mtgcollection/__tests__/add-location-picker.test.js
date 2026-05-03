import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { state } from '../state.js';
import { buildLocationTypeRadios, createAddLocationPicker } from '../addLocationPicker.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;

afterEach(() => {
  state.collection = [];
  globalThis.window = previousWindow;
  globalThis.document = previousDocument;
});

function installDom() {
  const win = new Window();
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.body.innerHTML = `
    <div id="addLocationPills"></div>
    <div id="addLocationNewBox" class="hidden"></div>
    <div id="addLocationTypeRadios"></div>
    <input id="addLocationName">
  `;
  return win.document;
}

test('buildLocationTypeRadios: renders typed physical destination choices', () => {
  const doc = installDom();

  buildLocationTypeRadios(doc);

  assert.deepEqual(
    [...doc.querySelectorAll('input[name="addLocationType"]')].map(input => input.value),
    ['deck', 'binder', 'box']
  );
  assert.equal(doc.querySelector('input[name="addLocationType"]:checked').value, 'box');
});

test('add location picker: selects existing locations and reads them back', () => {
  const doc = installDom();
  state.collection = [
    { location: { type: 'deck', name: 'breya' } },
    { location: { type: 'binder', name: 'trade binder' } },
  ];
  let changed = 0;
  const picker = createAddLocationPicker({ doc, onChange: () => { changed++; } });

  picker.buildTypeRadios();
  picker.render();
  picker.bindPills();
  doc.querySelector('[data-loc-type="deck"][data-loc-name="breya"]').click();

  assert.deepEqual(picker.readLocation(), { type: 'deck', name: 'breya' });
  assert.equal(doc.querySelector('[data-loc-name="breya"]').classList.contains('is-selected'), true);
  assert.equal(doc.getElementById('addLocationNewBox').classList.contains('hidden'), true);
  assert.ok(changed >= 2);
});

test('add location picker: seeds unknown locations into new-location mode', () => {
  const doc = installDom();
  const picker = createAddLocationPicker({ doc });
  picker.buildTypeRadios();

  picker.seed({ type: 'box', name: 'bulk rares' });

  assert.equal(doc.getElementById('addLocationNewBox').classList.contains('hidden'), false);
  assert.equal(doc.querySelector('input[name="addLocationType"]:checked').value, 'box');
  assert.equal(doc.getElementById('addLocationName').value, 'bulk rares');
  assert.deepEqual(picker.readLocation(), { type: 'box', name: 'bulk rares' });
});

test('add location picker: snapshots and restores new-location state', () => {
  const doc = installDom();
  state.collection = [{ location: { type: 'deck', name: 'breya' } }];
  const picker = createAddLocationPicker({ doc });
  picker.buildTypeRadios();

  picker.seed({ type: 'binder', name: 'new binder' });
  const snap = picker.snapshot();
  picker.setSelectedLocation({ type: 'deck', name: 'breya' });
  picker.restore(snap);

  assert.equal(doc.querySelector('input[name="addLocationType"]:checked').value, 'binder');
  assert.equal(doc.getElementById('addLocationName').value, 'new binder');
  assert.deepEqual(picker.readLocation(), { type: 'binder', name: 'new binder' });
});
