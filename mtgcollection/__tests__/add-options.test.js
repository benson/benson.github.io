import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  bindLanguageOther,
  collectionLanguages,
  createAddOptionControls,
  createLanguageValueAccessor,
  createRadioValueAccessor,
  renderFinishRadios,
  renderLanguageRadios,
} from '../addOptions.js';

const previousDocument = globalThis.document;

afterEach(() => {
  globalThis.document = previousDocument;
});

function installDom() {
  const win = new Window();
  globalThis.document = win.document;
  win.document.body.innerHTML = `
    <div id="addFinish"></div>
    <label><input type="radio" name="addCondition" value="near_mint" checked></label>
    <label><input type="radio" name="addCondition" value="lightly_played"></label>
    <div id="addLanguageOptions"></div>
    <button id="addLanguageAdd" type="button">+</button>
    <input id="addLanguageOther">
  `;
  return win.document;
}

test('renderFinishRadios: maps nonfoil to normal and selects the first finish', () => {
  const doc = installDom();

  renderFinishRadios({
    doc,
    card: { finishes: ['nonfoil', 'foil', 'etched'], prices: {} },
  });

  const radios = [...doc.querySelectorAll('input[name="addFinish"]')];
  assert.deepEqual(radios.map(r => r.value), ['normal', 'foil', 'etched']);
  assert.equal(doc.querySelector('input[name="addFinish"]:checked').value, 'normal');
  assert.deepEqual([...doc.querySelectorAll('#addFinish span')].map(s => s.textContent), ['normal', 'foil', 'etched foil']);
});

test('collectionLanguages: keeps english first, normalizes, and includes extra value', () => {
  assert.deepEqual(
    collectionLanguages([{ language: 'JA' }, { language: 'en' }, { language: ' fr ' }], 'de'),
    ['en', 'de', 'fr', 'ja']
  );
});

test('language accessor: reads custom input and toggles custom state when setting unknown values', () => {
  const doc = installDom();
  renderLanguageRadios({ doc, collection: [{ language: 'ja' }], selected: 'en' });
  const language = createLanguageValueAccessor({ doc });

  assert.equal(language.value, 'en');
  language.value = 'ja';
  assert.equal(doc.querySelector('input[name="addLanguage"]:checked').value, 'ja');
  assert.equal(doc.getElementById('addLanguageOther').classList.contains('visible'), false);

  language.value = 'de';
  assert.equal(doc.querySelector('input[name="addLanguage"]:checked'), null);
  assert.equal(doc.getElementById('addLanguageOther').value, 'de');
  assert.equal(doc.getElementById('addLanguageOther').classList.contains('visible'), true);
  assert.equal(language.value, 'de');
});

test('bindLanguageOther: reveals free-form input and lets it override radios', () => {
  const doc = installDom();
  renderLanguageRadios({ doc, collection: [], selected: 'en' });
  const other = doc.getElementById('addLanguageOther');
  bindLanguageOther({ doc });

  doc.getElementById('addLanguageAdd').click();
  other.value = 'it';
  other.dispatchEvent(new doc.defaultView.Event('input'));

  assert.equal(other.classList.contains('visible'), true);
  assert.equal(doc.querySelector('input[name="addLanguage"]:checked'), null);
  assert.equal(createLanguageValueAccessor({ doc }).value, 'it');
});

test('createAddOptionControls: bundles radio accessors and render helpers', () => {
  const doc = installDom();
  const controls = createAddOptionControls({
    doc,
    getCollection: () => [{ language: 'ja' }],
  });

  controls.renderFinishRadios({ finishes: ['foil'], prices: {} });
  controls.renderLanguageRadios('ja');
  controls.condition.value = 'lightly_played';

  assert.equal(controls.finish.value, 'foil');
  assert.equal(controls.language.value, 'ja');
  assert.equal(controls.condition.value, 'lightly_played');
});

test('radio value accessor: falls back when no option is checked', () => {
  const doc = installDom();
  const accessor = createRadioValueAccessor({ doc, name: 'missingRadio', fallback: 'fallback' });

  assert.equal(accessor.value, 'fallback');
});
