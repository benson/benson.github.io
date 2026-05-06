import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderCollectionVisualGrid } from '../views/collectionVisualView.js';

function parse(html) {
  const win = new Window();
  const wrap = win.document.createElement('div');
  wrap.innerHTML = html;
  return wrap;
}

test('renderCollectionVisualGrid: renders card art, name, qty, finish, location, and price', () => {
  const card = {
    name: 'Sol Ring',
    resolvedName: 'Sol Ring',
    scryfallId: 'sol-id',
    finish: 'foil',
    condition: 'near_mint',
    language: 'en',
    qty: 2,
    price: 3.5,
    imageUrl: 'https://img.test/sol.jpg',
    location: { type: 'box', name: 'bulk rares' },
  };

  const wrap = parse(renderCollectionVisualGrid([card], [card]));
  const tile = wrap.querySelector('.collection-visual-card');

  assert.ok(wrap.querySelector('[data-collection-visual-grid]'));
  assert.equal(tile.dataset.index, '0');
  assert.equal(tile.classList.contains('is-foil'), true);
  assert.equal(wrap.querySelector('.collection-visual-card-image').getAttribute('src'), 'https://img.test/sol.jpg');
  assert.equal(wrap.querySelector('.collection-visual-card-name').textContent, 'Sol Ring');
  assert.equal(wrap.querySelector('.collection-visual-card-qty').textContent, 'x2');
  assert.equal(wrap.querySelector('.collection-visual-card-finish').textContent, 'foil');
  assert.equal(wrap.querySelector('.loc-pill').dataset.locType, 'box');
  assert.equal(wrap.querySelector('.loc-pill').dataset.locName, 'bulk rares');
  assert.equal(wrap.querySelector('.collection-visual-card-price').textContent, '$3.50');
});

test('renderCollectionVisualGrid: escapes text and shows fallback art/location basics', () => {
  const card = {
    name: '<script>alert("x")</script>',
    finish: 'normal',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    price: null,
    imageUrl: '',
    location: null,
  };

  const wrap = parse(renderCollectionVisualGrid([card], [card]));

  assert.equal(wrap.querySelector('script'), null);
  assert.equal(wrap.querySelector('.collection-visual-card-name').textContent, '<script>alert("x")</script>');
  assert.ok(wrap.querySelector('.collection-visual-card-image-missing'));
  assert.equal(wrap.querySelector('.collection-visual-card-location').textContent, 'unlocated');
  assert.equal(wrap.querySelector('.collection-visual-card-price').textContent, 'no price');
});

test('renderCollectionVisualGrid: marks etched cards for shared foil treatment', () => {
  const card = {
    name: 'Etched Card',
    finish: 'etched',
    condition: 'near_mint',
    language: 'en',
    qty: 1,
    price: 1,
    imageUrl: 'https://img.test/etched.jpg',
  };

  const wrap = parse(renderCollectionVisualGrid([card], [card]));

  assert.equal(wrap.querySelector('.collection-visual-card').classList.contains('is-etched'), true);
});
