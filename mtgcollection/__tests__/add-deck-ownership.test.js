import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeckOwnershipReadout } from '../addDeckOwnership.js';

const card = { id: 'sol-ring', name: 'Sol Ring' };
const deck = { type: 'deck', name: 'breya' };

test('buildDeckOwnershipReadout: returns null until a preview card exists', () => {
  assert.equal(buildDeckOwnershipReadout({ collection: [], card: null, location: deck }), null);
});

test('buildDeckOwnershipReadout: unowned printings default to placeholder mode', () => {
  assert.deepEqual(
    buildDeckOwnershipReadout({ collection: [], card, location: deck }),
    {
      text: "you don't own this printing yet - defaults to placeholder",
      placeholderState: true,
      placeholderChecked: true,
    }
  );
});

test('buildDeckOwnershipReadout: summarizes owned copies and current deck copies', () => {
  const readout = buildDeckOwnershipReadout({
    collection: [
      { scryfallId: 'sol-ring', qty: 2, location: { type: 'deck', name: 'breya' } },
      { scryfallId: 'sol-ring', qty: 1, location: 'binder trades' },
      { scryfallId: 'other', qty: 9, location: { type: 'deck', name: 'breya' } },
    ],
    card,
    location: deck,
  });

  assert.equal(
    readout.text,
    'you own 3 of this printing (2 in deck:breya, 1 in binder:trades) - 2 already in this deck'
  );
  assert.equal(readout.placeholderState, false);
  assert.equal(readout.placeholderChecked, false);
});

test('buildDeckOwnershipReadout: labels missing locations as unsorted', () => {
  const readout = buildDeckOwnershipReadout({
    collection: [{ scryfallId: 'sol-ring', qty: 1, location: null }],
    card,
    location: deck,
  });

  assert.equal(readout.text, 'you own 1 of this printing (1 in unsorted)');
});
