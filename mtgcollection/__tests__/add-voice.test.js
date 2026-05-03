import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRepeatVoiceInput,
  buildVoiceAddOptions,
  chooseVoiceFinish,
  lookupVoiceCard,
  resolveVoiceLookupTarget,
} from '../addVoice.js';

test('resolveVoiceLookupTarget: regular lookups lowercase the set and keep collector number', () => {
  assert.deepEqual(resolveVoiceLookupTarget('FIN', '142', 'regular'), { set: 'fin', cn: '142' });
});

test('resolveVoiceLookupTarget: promo-like variants use p-set and s-suffixed collector numbers', () => {
  assert.deepEqual(resolveVoiceLookupTarget('fin', '142', 'promo'), { set: 'pfin', cn: '142s' });
  assert.deepEqual(resolveVoiceLookupTarget('pfin', '142a', 'prerelease'), { set: 'pfin', cn: '142a' });
});

test('lookupVoiceCard: returns direct collector-number hits', async () => {
  const calls = [];
  const result = await lookupVoiceCard({
    userSet: 'fin',
    userCn: '142',
    fetchCardByCollectorNumberImpl: async (set, cn) => {
      calls.push([set, cn]);
      return { id: 'card' };
    },
  });

  assert.equal(result.status, 'found');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.card, { id: 'card' });
  assert.deepEqual(calls, [['fin', '142']]);
});

test('lookupVoiceCard: falls back to the regular printing when promo target misses', async () => {
  const calls = [];
  const result = await lookupVoiceCard({
    userSet: 'fin',
    userCn: '142',
    variant: 'promo',
    fetchCardByCollectorNumberImpl: async (set, cn) => {
      calls.push([set, cn]);
      return calls.length === 2 ? { id: 'regular' } : null;
    },
  });

  assert.equal(result.status, 'found');
  assert.equal(result.fallback, true);
  assert.deepEqual(result.card, { id: 'regular' });
  assert.deepEqual(calls, [['pfin', '142s'], ['fin', '142']]);
});

test('lookupVoiceCard: reports missing cards without fallback for regular lookups', async () => {
  const result = await lookupVoiceCard({
    userSet: 'fin',
    userCn: '999',
    fetchCardByCollectorNumberImpl: async () => null,
  });

  assert.equal(result.status, 'missing');
  assert.equal(result.card, null);
});

test('chooseVoiceFinish: honors foil request only when the card supports foil', () => {
  assert.equal(chooseVoiceFinish({ finishes: ['nonfoil', 'foil'], prices: {} }, true), 'foil');
  assert.equal(chooseVoiceFinish({ finishes: ['nonfoil'], prices: {} }, true), 'normal');
  assert.equal(chooseVoiceFinish({ finishes: ['etched'], prices: {} }, false), 'etched');
  assert.equal(chooseVoiceFinish({ finishes: [], prices: {} }, false), 'normal');
});

test('buildVoiceAddOptions: normalizes add options, quantity, and location override', () => {
  const opts = buildVoiceAddOptions({
    card: { finishes: ['foil'], prices: {} },
    wantsFoil: true,
    qtyOverride: 3,
    locationOverride: 'deck breya',
    lastUsedLocation: { type: 'box', name: 'bulk' },
    condition: 'LP',
    language: 'JA',
  });

  assert.deepEqual(opts, {
    finish: 'foil',
    condition: 'lightly_played',
    language: 'ja',
    qty: 3,
    location: { type: 'deck', name: 'breya' },
  });
});

test('buildRepeatVoiceInput: returns null without history and default quantity otherwise', () => {
  assert.equal(buildRepeatVoiceInput(null, 2), null);
  assert.deepEqual(
    buildRepeatVoiceInput({ set: 'fin', cn: '142', qty: 4 }, null),
    { set: 'fin', cn: '142', qty: 1 }
  );
  assert.deepEqual(
    buildRepeatVoiceInput({ set: 'fin', cn: '142', qty: 4 }, 3),
    { set: 'fin', cn: '142', qty: 3 }
  );
});
