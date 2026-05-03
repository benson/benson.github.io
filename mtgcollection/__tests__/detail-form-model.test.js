import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  applyDetailFormValues,
  collectionLanguages,
  detailFieldDiffs,
  readDetailForm,
  renderDetailLanguageOptions,
  snapshotDetailFields,
  writeDetailForm,
} from '../detailFormModel.js';

function installDom() {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `
    <form id="detailForm">
      <input id="detailQty">
      <div id="detailFinish"></div>
      <div id="detailFinishHint"></div>
      <label><input type="radio" name="detailCondition" value="near_mint"></label>
      <label><input type="radio" name="detailCondition" value="lightly_played"></label>
      <div id="detailLanguageOptions"></div>
      <input id="detailLanguageOther">
      <input id="detailTagInput">
      <select id="detailLocationType">
        <option value="deck">deck</option>
        <option value="binder">binder</option>
        <option value="box">box</option>
      </select>
      <input id="detailLocationName">
    </form>
  `;
  return { doc, form: doc.getElementById('detailForm') };
}

test('collectionLanguages keeps english first, normalizes, and includes selected value', () => {
  assert.deepEqual(
    collectionLanguages([{ language: 'JA' }, { language: ' fr ' }], 'DE'),
    ['en', 'de', 'fr', 'ja']
  );
});

test('writeDetailForm renders normalized drawer fields from a card', () => {
  const { doc, form } = installDom();

  writeDetailForm({
    doc,
    form,
    collection: [{ language: 'ja' }],
    card: {
      qty: 3,
      finish: 'foil',
      condition: 'lightly_played',
      language: 'ja',
      location: { type: 'binder', name: 'Trade Binder' },
      finishes: ['nonfoil', 'foil'],
    },
  });

  assert.equal(doc.getElementById('detailQty').value, '3');
  assert.equal(form.querySelector('input[name="detailFinish"]:checked').value, 'foil');
  assert.equal(form.querySelector('input[name="detailCondition"]:checked').value, 'lightly_played');
  assert.equal(form.querySelector('input[name="detailLanguage"]:checked').value, 'ja');
  assert.equal(doc.getElementById('detailTagInput').value, '');
  assert.equal(doc.getElementById('detailLocationType').value, 'binder');
  assert.equal(doc.getElementById('detailLocationName').value, 'trade binder');
});

test('readDetailForm normalizes drawer values and prefers custom language input', () => {
  const { doc, form } = installDom();
  renderDetailLanguageOptions({ doc, collection: [{ language: 'en' }], selected: 'en' });

  doc.getElementById('detailQty').value = '0';
  doc.getElementById('detailFinish').innerHTML = '<label><input type="radio" name="detailFinish" value="etched" checked></label>';
  form.querySelector('input[name="detailCondition"][value="lightly_played"]').checked = true;
  doc.getElementById('detailLanguageOther').value = ' DE ';
  doc.getElementById('detailLocationType').value = 'deck';
  doc.getElementById('detailLocationName').value = ' Breya ';

  assert.deepEqual(readDetailForm({ doc, form, tags: ['commander'] }), {
    qty: 1,
    finish: 'etched',
    condition: 'lightly_played',
    language: 'de',
    location: { type: 'deck', name: 'breya' },
    tags: ['commander'],
  });
});

test('snapshots, applies values, and reports detail diffs without mutating snapshots', () => {
  const card = {
    qty: 1,
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    location: { type: 'box', name: 'bulk' },
    tags: ['rare'],
  };
  const before = snapshotDetailFields(card);

  applyDetailFormValues(card, {
    qty: 2,
    finish: 'foil',
    condition: 'lightly_played',
    language: 'ja',
    location: { type: 'binder', name: 'trade' },
    tags: ['rare', 'sale'],
  });

  assert.deepEqual(before, {
    qty: 1,
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    location: { type: 'box', name: 'bulk' },
    tags: ['rare'],
  });
  assert.deepEqual(card.tags, ['rare', 'sale']);
  assert.deepEqual(detailFieldDiffs(before, snapshotDetailFields(card)), {
    diffs: [
      'qty 1 → 2',
      'normal → foil',
      'near mint → lightly played',
      'en → ja',
      'location: box:bulk → binder:trade',
      'tags: [rare] → [rare, sale]',
    ],
    locationChanged: true,
  });
});
