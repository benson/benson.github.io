import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddPreviewCardModel,
  buildExistingPreviewSummary,
  buildExistingPreviewText,
  findExistingPreviewEntries,
} from '../addPreviewModel.js';

test('buildAddPreviewCardModel: returns display fields and image URLs', () => {
  const model = buildAddPreviewCardModel({
    name: 'Sol Ring',
    set_name: 'Commander',
    type_line: 'Artifact',
    rarity: 'uncommon',
    image_uris: { normal: 'front.jpg' },
  });

  assert.deepEqual(model, {
    name: 'Sol Ring',
    imageUrl: 'front.jpg',
    backUrl: null,
    meta: 'Commander \u2014 Artifact \u2014 uncommon',
  });
});

test('buildAddPreviewCardModel: supports double-faced card images', () => {
  const model = buildAddPreviewCardModel({
    name: 'Front // Back',
    card_faces: [
      { image_uris: { normal: 'front.jpg' } },
      { image_uris: { normal: 'back.jpg' } },
    ],
  });

  assert.equal(model.imageUrl, 'front.jpg');
  assert.equal(model.backUrl, 'back.jpg');
});

test('buildAddPreviewCardModel: accepts resolved candidate image fields', () => {
  const model = buildAddPreviewCardModel({
    name: 'Nissa, Worldwaker',
    setName: 'San Diego Comic-Con 2014',
    typeLine: 'Legendary Planeswalker - Nissa',
    rarity: 'mythic',
    imageUrl: 'candidate-front.jpg',
  });

  assert.deepEqual(model, {
    name: 'Nissa, Worldwaker',
    imageUrl: 'candidate-front.jpg',
    backUrl: null,
    meta: 'San Diego Comic-Con 2014 \u2014 Legendary Planeswalker - Nissa \u2014 mythic',
  });
});

test('findExistingPreviewEntries: matches exact Scryfall id before falling back to name', () => {
  const matches = findExistingPreviewEntries([
    { scryfallId: 'abc', qty: 1, name: 'Different' },
    { scryfallId: 'def', qty: 2, resolvedName: 'Sol Ring' },
    { qty: 3, name: 'sol ring' },
  ], { id: 'abc', name: 'Sol Ring' });

  assert.deepEqual(matches.map(c => c.qty), [1, 2, 3]);
});

test('buildExistingPreviewText: sums quantities or returns null with no match', () => {
  const card = { id: 'abc', name: 'Sol Ring' };

  assert.equal(buildExistingPreviewText([], card), null);
  assert.equal(
    buildExistingPreviewText([{ scryfallId: 'abc', qty: '2' }, { name: 'Sol Ring', qty: 3 }], card),
    'this printing owned (\u00d72) - other printings (\u00d73)'
  );
});

test('buildExistingPreviewSummary: distinguishes exact printing from same-name printings', () => {
  const card = { id: 'island-stx-369', name: 'Island', set: 'stx', collector_number: '369' };

  assert.deepEqual(
    buildExistingPreviewSummary([
      { scryfallId: 'island-stx-369', qty: 1, name: 'Island' },
      { name: 'Island', setCode: 'stx', cn: '369', qty: 2 },
      { name: 'Island', setCode: 'm21', cn: '264', qty: 20 },
    ], card),
    {
      exactQty: 3,
      otherQty: 20,
      totalQty: 23,
      text: 'this printing owned (\u00d73) - other printings (\u00d720)',
    }
  );

  assert.equal(
    buildExistingPreviewText([{ name: 'Island', setCode: 'm21', cn: '264', qty: 20 }], card),
    'other printings owned (\u00d720)'
  );
});
