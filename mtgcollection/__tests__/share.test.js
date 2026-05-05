import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initShareViewer,
  normalizeDeckShareSnapshot,
  pickDeckSharePayload,
  synthesizeInventoryFromSnapshot,
} from '../share.js';
import { resetState, state } from '../state.js';

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
    coverName: 'Sol Ring',
    coverScryfallId: 'sol-ring-id',
    coverImageUrl: 'https://img/sol',
    coverBackImageUrl: '',
    coverFinish: 'normal',
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
  assert.equal(out.container.deck.coverName, 'Sol Ring');
  assert.equal(out.container.deck.coverImageUrl, 'https://img/sol');
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

test('pickDeckSharePayload: normalizes malformed decklist values into safe viewer fields', () => {
  const deck = sampleDeck();
  Object.assign(deck.deckList[0], {
    qty: -4,
    board: 'commander',
    cmc: 'nope',
    colors: ['U', { bad: true }, '', 'B'],
    tags: [' keep ', 12, '', 'private'],
  });
  const out = pickDeckSharePayload(deck, { includeTags: true });
  const entry = out.container.deckList[0];
  assert.equal(entry.qty, 1);
  assert.equal(entry.board, 'main');
  assert.equal(entry.cmc, null);
  assert.deepEqual(entry.colors, ['U', 'B']);
  assert.deepEqual(entry.tags, ['keep', 'private']);
});

test('normalizeDeckShareSnapshot: strips untrusted creator-only and unknown fields from inbound viewer payloads', () => {
  const snap = {
    kind: 'deck',
    version: 99,
    createdAt: 1234,
    token: 'should-not-survive',
    container: {
      ...sampleDeck(),
      shareId: 'attacker-controlled-id',
      shareIncludeTags: true,
      extra: '<script>alert(1)</script>',
      deckList: [
        {
          ...sampleDeck().deckList[0],
          shareId: 'nested-share-id',
          oracleText: 'private-ish bulk text',
          tags: ['ok'],
        },
      ],
    },
  };
  const normalized = normalizeDeckShareSnapshot(snap);
  assert.equal(normalized.version, 99);
  assert.equal(normalized.createdAt, 1234);
  assert.equal(normalized.token, undefined);
  assert.equal(normalized.container.shareId, undefined);
  assert.equal(normalized.container.shareIncludeTags, undefined);
  assert.equal(normalized.container.extra, undefined);
  assert.equal(normalized.container.deckList[0].shareId, undefined);
  assert.equal(normalized.container.deckList[0].oracleText, undefined);
  assert.deepEqual(normalized.container.deckList[0].tags, ['ok']);
});

test('normalizeDeckShareSnapshot: rejects non-deck snapshots and falls back to a named shared deck', () => {
  assert.equal(normalizeDeckShareSnapshot({ kind: 'collection' }), null);
  const normalized = normalizeDeckShareSnapshot({
    kind: 'deck',
    container: { type: 'deck', name: '', deck: {}, deckList: [] },
  });
  assert.equal(normalized.container.name, 'shared deck');
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

test('initShareViewer: sanitizes fetched snapshots before populating read-only viewer state', async () => {
  resetState();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    async json() {
      return {
        kind: 'deck',
        version: 1,
        container: {
          ...sampleDeck(),
          shareId: 'leaked-share-id',
          shareIncludeTags: true,
          deckList: [
            {
              ...sampleDeck().deckList[0],
              qty: '2',
              board: 'maybe',
              colors: ['C', 1],
            },
          ],
        },
      };
    },
  });
  try {
    const ok = await initShareViewer('public-id');
    assert.equal(ok, true);
    assert.equal(state.shareSnapshot.id, 'public-id');
    assert.equal(state.shareSnapshot.container.shareId, undefined);
    assert.equal(state.containers['deck:breya'].shareId, undefined);
    assert.equal(state.collection.length, 1);
    assert.equal(state.collection[0].qty, 2);
    assert.equal(state.collection[0].deckBoard, 'maybe');
    assert.deepEqual(state.collection[0].colors, ['C']);
    assert.deepEqual(state.activeLocation, { type: 'deck', name: 'breya' });
  } finally {
    globalThis.fetch = previousFetch;
    resetState();
  }
});
