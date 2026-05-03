import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDeckSharePayload, synthesizeInventoryFromSnapshot } from '../share.js';

const sampleDeck = () => ({
  type: 'deck',
  name: 'breya',
  createdAt: 1000,
  updatedAt: 2000,
  shareId: 'abc12345',
  deck: {
    title: 'breya',
    description: 'fun stax build',
    format: 'commander',
    commander: 'Breya, Etherium Shaper',
    commanderScryfallId: 'breya-id-1',
    commanderImageUrl: 'https://img/breya-front',
    commanderBackImageUrl: '',
    partner: '',
    partnerScryfallId: '',
    partnerImageUrl: '',
    partnerBackImageUrl: '',
    companion: '',
  },
  deckList: [
    {
      scryfallId: 'sol-ring-id',
      qty: 1,
      board: 'main',
      name: 'Sol Ring',
      setCode: 'sld',
      cn: '1011',
      imageUrl: 'https://img/sol',
      backImageUrl: '',
      rarity: 'uncommon',
      cmc: 1,
      typeLine: 'Artifact',
      colors: [],
      colorIdentity: [],
      tags: ['private', 'trade'],
    },
  ],
});

test('pickDeckSharePayload: returns null for non-deck container', () => {
  assert.equal(pickDeckSharePayload({ type: 'box', name: 'bulk' }), null);
  assert.equal(pickDeckSharePayload(null), null);
});

test('pickDeckSharePayload: includes deck metadata + decklist', () => {
  const out = pickDeckSharePayload(sampleDeck());
  assert.equal(out.kind, 'deck');
  assert.equal(out.version, 1);
  assert.equal(out.container.name, 'breya');
  assert.equal(out.container.deck.commander, 'Breya, Etherium Shaper');
  assert.equal(out.container.deck.commanderImageUrl, 'https://img/breya-front');
  assert.equal(out.container.deckList.length, 1);
  assert.equal(out.container.deckList[0].name, 'Sol Ring');
});

test('pickDeckSharePayload: tags stripped by default', () => {
  const out = pickDeckSharePayload(sampleDeck());
  assert.equal(out.container.deckList[0].tags, undefined);
});

test('pickDeckSharePayload: includeTags=true preserves tags', () => {
  const out = pickDeckSharePayload(sampleDeck(), { includeTags: true });
  assert.deepEqual(out.container.deckList[0].tags, ['private', 'trade']);
});

test('pickDeckSharePayload: drops shareId from the share payload', () => {
  // The payload should NOT echo the creator's shareId — viewers should
  // never see it in their snapshot.
  const out = pickDeckSharePayload(sampleDeck());
  assert.equal(out.container.shareId, undefined);
});

test('pickDeckSharePayload: drops oracleText/legalities/_source/colorIdentity from entries', () => {
  const deck = sampleDeck();
  deck.deckList[0].oracleText = 'tap: add C';
  deck.deckList[0].legalities = { commander: 'banned' };
  deck.deckList[0]._source = { moxfield: { Count: '1' } };
  deck.deckList[0].priceFallback = true;
  // colorIdentity is in the source but we picked colors only; verify both behaviors
  deck.deckList[0].colorIdentity = ['W', 'U'];
  const out = pickDeckSharePayload(deck);
  const entry = out.container.deckList[0];
  assert.equal(entry.oracleText, undefined);
  assert.equal(entry.legalities, undefined);
  assert.equal(entry._source, undefined);
  assert.equal(entry.priceFallback, undefined);
  assert.equal(entry.colorIdentity, undefined);
});

test('pickDeckSharePayload: round-trips through JSON without loss of essential fields', () => {
  const out = pickDeckSharePayload(sampleDeck(), { includeTags: true });
  const round = JSON.parse(JSON.stringify(out));
  assert.deepEqual(round, out);
});

test('synthesizeInventoryFromSnapshot: each deckList entry becomes an inventory entry in the deck container', () => {
  const snap = {
    kind: 'deck',
    version: 1,
    container: {
      type: 'deck',
      name: 'breya',
      deck: { title: 'breya', commander: '', commanderScryfallId: '', commanderImageUrl: '', commanderBackImageUrl: '' },
      deckList: [
        { scryfallId: 'a', qty: 2, board: 'main', name: 'Card A', setCode: 'aaa', cn: '1', imageUrl: 'https://img/a', backImageUrl: '', rarity: 'common', cmc: 0, typeLine: 'Land', colors: [] },
        { scryfallId: 'b', qty: 1, board: 'sideboard', name: 'Card B', setCode: 'bbb', cn: '2', imageUrl: 'https://img/b', backImageUrl: '', rarity: 'rare', cmc: 3, typeLine: 'Creature', colors: ['R'] },
      ],
    },
  };
  const inv = synthesizeInventoryFromSnapshot(snap);
  assert.equal(inv.length, 2);
  assert.equal(inv[0].name, 'Card A');
  assert.equal(inv[0].qty, 2);
  assert.equal(inv[0].location.type, 'deck');
  assert.equal(inv[0].location.name, 'breya');
  assert.equal(inv[0].deckBoard, 'main');
  assert.equal(inv[1].deckBoard, 'sideboard');
});

test('synthesizeInventoryFromSnapshot: returns empty for non-deck snapshot', () => {
  assert.deepEqual(synthesizeInventoryFromSnapshot({ kind: 'other' }), []);
  assert.deepEqual(synthesizeInventoryFromSnapshot(null), []);
});
