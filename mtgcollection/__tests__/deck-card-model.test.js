import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckCardFromEntry } from '../deckCardModel.js';

const deckEntry = (extra = {}) => ({
  scryfallId: 'sid-1',
  name: 'Sol Ring',
  setCode: 'cmm',
  cn: '1',
  qty: 1,
  board: 'main',
  imageUrl: 'entry-front',
  backImageUrl: '',
  ...extra,
});

const inventoryCard = (extra = {}) => ({
  scryfallId: 'sid-1',
  name: 'Sol Ring',
  resolvedName: 'Sol Ring',
  setCode: 'cmm',
  setName: 'Commander Masters',
  cn: '1',
  rarity: 'uncommon',
  qty: 1,
  finish: 'foil',
  condition: 'lightly_played',
  language: 'en',
  location: { type: 'deck', name: 'breya' },
  price: 1.23,
  cmc: 1,
  colors: [],
  colorIdentity: [],
  typeLine: 'Artifact',
  oracleText: 'Tap: Add one mana of any color.',
  legalities: { commander: 'legal' },
  tags: ['mana'],
  imageUrl: 'inventory-front',
  backImageUrl: '',
  ...extra,
});

test('buildDeckCardFromEntry: combines decklist identity with primary inventory details', () => {
  const collection = [
    inventoryCard({ location: { type: 'box', name: 'bulk' }, finish: 'normal' }),
    inventoryCard(),
  ];

  const card = buildDeckCardFromEntry(deckEntry({ qty: 2 }), collection);

  assert.equal(card.name, 'Sol Ring');
  assert.equal(card.qty, 2);
  assert.equal(card.deckBoard, 'main');
  assert.equal(card.finish, 'foil');
  assert.equal(card.price, 1.23);
  assert.equal(card.typeLine, 'Artifact');
  assert.equal(card.placeholder, false);
  assert.equal(card.ownedQty, 2);
  assert.equal(card.needed, 0);
  assert.equal(card.inventoryIndex, 1);
});

test('buildDeckCardFromEntry: keeps placeholder decklist data when no inventory exists', () => {
  const card = buildDeckCardFromEntry(deckEntry({
    scryfallId: 'missing',
    name: 'Imaginary Card',
    qty: 3,
    cmc: 4,
    colors: ['U'],
    colorIdentity: ['U'],
    typeLine: 'Creature',
    imageUrl: 'placeholder-front',
  }), []);

  assert.equal(card.name, 'Imaginary Card');
  assert.equal(card.placeholder, true);
  assert.equal(card.ownedQty, 0);
  assert.equal(card.needed, 3);
  assert.equal(card.inventoryIndex, -1);
  assert.equal(card.cmc, 4);
  assert.deepEqual(card.colors, ['U']);
  assert.equal(card.imageUrl, 'placeholder-front');
});

test('buildDeckCardFromEntry: inventory fields win for physical condition while decklist art wins for display', () => {
  const collection = [inventoryCard({ imageUrl: 'owned-front', condition: 'near_mint', priceFallback: true })];

  const card = buildDeckCardFromEntry(deckEntry({ imageUrl: 'chosen-printing-front' }), collection);

  assert.equal(card.imageUrl, 'chosen-printing-front');
  assert.equal(card.condition, 'near_mint');
  assert.equal(card.priceFallback, true);
});
