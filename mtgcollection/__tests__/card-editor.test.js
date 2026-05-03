import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  applyPrintingToEntry,
  createTagChipEditor,
  renderFinishRadios,
} from '../cardEditor.js';

test('createTagChipEditor normalizes chips and suggestion list', () => {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `
    <div id="chips"></div>
    <input id="tagInput">
    <datalist id="suggestions"></datalist>
  `;
  const editor = createTagChipEditor({
    chipsEl: doc.getElementById('chips'),
    inputEl: doc.getElementById('tagInput'),
    datalistEl: doc.getElementById('suggestions'),
    getSuggestions: () => ['EDH', 'sale', 'edh'],
  });
  editor.bind();
  editor.setTags([' EDH ']);
  doc.getElementById('tagInput').value = ' Sale ';
  doc.getElementById('tagInput').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  assert.deepEqual(editor.getTags(), ['edh', 'sale']);
  assert.match(doc.getElementById('chips').textContent, /edh/);
  assert.equal(doc.getElementById('suggestions').querySelectorAll('option').length, 0);
});

test('renderFinishRadios falls back when selected finish is unavailable', () => {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = '<div id="finish"></div><div id="hint" class="hidden"></div>';

  const selected = renderFinishRadios({
    doc,
    card: { finishes: ['nonfoil'], prices: {} },
    targetId: 'finish',
    name: 'detailFinish',
    selected: 'foil',
    hintEl: doc.getElementById('hint'),
  });

  assert.equal(selected, 'normal');
  assert.equal(doc.querySelector('input[name="detailFinish"]:checked').value, 'normal');
  assert.match(doc.getElementById('hint').textContent, /foil is not available/);
  assert.equal(doc.getElementById('hint').classList.contains('hidden'), false);
});

test('applyPrintingToEntry copies resolved printing fields and reprices', () => {
  const entry = {
    name: 'Old Sol Ring',
    finish: 'foil',
    price: 1,
    priceFallback: false,
  };

  applyPrintingToEntry(entry, {
    id: 'new-id',
    name: 'Sol Ring',
    set: 'sld',
    set_name: 'Secret Lair Drop',
    collector_number: '1011',
    rarity: 'rare',
    cmc: 1,
    colors: [],
    color_identity: [],
    type_line: 'Artifact',
    oracle_text: 'Tap: Add two colorless.',
    legalities: { commander: 'legal' },
    scryfall_uri: 'https://scryfall.test/card/new-id',
    image_uris: { normal: 'front.jpg' },
    prices: { usd: '3.00', usd_foil: '5.50' },
    finishes: ['nonfoil', 'foil'],
  });

  assert.equal(entry.name, 'Sol Ring');
  assert.equal(entry.scryfallId, 'new-id');
  assert.equal(entry.setCode, 'sld');
  assert.equal(entry.setName, 'Secret Lair Drop');
  assert.equal(entry.cn, '1011');
  assert.equal(entry.price, 5.5);
  assert.deepEqual(entry.finishes, ['nonfoil', 'foil']);
});
