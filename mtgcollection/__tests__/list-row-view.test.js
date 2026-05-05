import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { state } from '../state.js';
import { collectionKey } from '../collection.js';
import { locationCellHtml, renderRow } from '../views/listRowView.js';

afterEach(() => {
  state.collection = [];
  state.containers = {};
  state.selectedKeys = new Set();
});

function parseRow(html) {
  const win = new Window();
  const table = win.document.createElement('table');
  table.innerHTML = `<tbody>${html}</tbody>`;
  return table.querySelector('tr');
}

test('locationCellHtml: renders a typed location pill when a card has a location', () => {
  const html = locationCellHtml({ location: { type: 'deck', name: 'breya' } }, 3);
  const win = new Window();
  const wrap = win.document.createElement('div');
  wrap.innerHTML = html;

  const pill = wrap.querySelector('.loc-pill');
  assert.equal(pill.dataset.locType, 'deck');
  assert.equal(pill.dataset.locName, 'breya');
  assert.equal(wrap.querySelector('.loc-pill-remove').dataset.index, '3');
});

test('locationCellHtml: renders an inline picker for unlocated cards', () => {
  const win = new Window();
  const wrap = win.document.createElement('div');
  state.collection = [
    { location: { type: 'binder', name: 'trade binder' } },
    { location: { type: 'box', name: 'bulk rares' } },
  ];
  state.containers = {
    'deck:breya': { type: 'deck', name: 'breya' },
  };
  wrap.innerHTML = locationCellHtml({ location: null }, 2);

  assert.equal(wrap.querySelector('.loc-picker').dataset.index, '2');
  assert.equal(wrap.querySelector('.loc-picker-target').value, '');
  assert.deepEqual(
    [...wrap.querySelectorAll('.loc-picker-target option')].map(option => option.value),
    ['', 'deck:breya', 'binder:trade binder', 'box:bulk rares', '__new__']
  );
  assert.equal(wrap.querySelector('.loc-picker-new').classList.contains('hidden'), true);
  assert.equal(wrap.querySelector('.loc-picker-type option[value="box"]').hasAttribute('selected'), true);
  assert.equal(wrap.querySelector('.loc-picker-name').getAttribute('placeholder'), 'new name');
});

test('renderRow: renders selection, preview, tags, location, and price cells', () => {
  const c = {
    scryfallId: 'sol-id',
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    setCode: 'sld',
    cn: '1011',
    finish: 'foil',
    condition: 'near_mint',
    rarity: 'rare',
    qty: 2,
    price: 3.5,
    imageUrl: 'https://img.test/sol.jpg',
    location: { type: 'binder', name: 'trade binder' },
    tags: ['edh staple'],
  };
  state.collection = [c];
  state.selectedKeys = new Set([collectionKey(c)]);

  const row = parseRow(renderRow(c));

  assert.equal(row.classList.contains('row-selected'), true);
  assert.equal(row.dataset.index, '0');
  assert.equal(row.querySelector('.card-preview-link').dataset.previewUrl, 'https://img.test/sol.jpg');
  assert.equal(row.querySelector('.set-cell').textContent.trim(), 'SLD');
  assert.equal(row.querySelector('.rarity-cell').textContent, 'r');
  assert.equal(row.querySelector('.condition-cell').textContent, 'nm');
  assert.equal(row.querySelector('.loc-pill').dataset.locName, 'trade binder');
  assert.equal(row.querySelector('.row-tag-remove').dataset.tag, 'edh staple');
  assert.equal(row.querySelector('.qty-cell').textContent, '2');
  assert.equal(row.querySelector('.price-cell').textContent, '$3.50');
});

test('renderRow: exposes lookup metadata for rows missing a cached image', () => {
  const c = {
    name: 'Dreamroot Cascade',
    resolvedName: 'Dreamroot Cascade',
    setCode: 'ddu',
    cn: '179',
    finish: 'normal',
    condition: 'near_mint',
    rarity: '',
    qty: 1,
    price: null,
    imageUrl: '',
    location: { type: 'box', name: '' },
    tags: [],
  };
  state.collection = [c];

  const row = parseRow(renderRow(c));
  const link = row.querySelector('.card-preview-link');
  assert.ok(link);
  assert.equal(link.dataset.previewUrl, undefined);
  assert.equal(link.dataset.previewSet, 'ddu');
  assert.equal(link.dataset.previewCn, '179');
  assert.equal(link.dataset.previewName, 'Dreamroot Cascade');
});
