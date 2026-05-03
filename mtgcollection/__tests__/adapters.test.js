import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalAdapter,
  moxfieldAdapter,
  manaboxAdapter,
  deckboxAdapter,
  detectAdapter,
  getAdapter,
  mergeSource,
  ADAPTERS,
} from '../adapters.js';
import { parseCsv } from '../import.js';

// ---- detection ----
test('detectAdapter: moxfield CSV with hallmark columns', () => {
  const headers = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Tags', 'Last Modified', 'Collector Number', 'Alter', 'Proxy', 'Purchase Price'];
  assert.equal(detectAdapter(headers).id, 'moxfield');
});

test('detectAdapter: deckbox CSV with hallmark columns', () => {
  const headers = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Card Number', 'Condition', 'Language', 'Foil', 'Signed', 'Artist Proof', 'Altered Art', 'Misprint', 'Promo', 'Textless', 'My Price'];
  assert.equal(detectAdapter(headers).id, 'deckbox');
});

test('detectAdapter: manabox CSV with hallmark columns', () => {
  const headers = ['Name', 'Set code', 'Set name', 'Collector number', 'Foil', 'Rarity', 'Quantity', 'ManaBox ID', 'Scryfall ID', 'Purchase price', 'Misprint', 'Altered', 'Condition', 'Language', 'Purchase price currency'];
  assert.equal(detectAdapter(headers).id, 'manabox');
});

test('detectAdapter: minimal canonical CSV falls through to canonical', () => {
  const headers = ['Name', 'Set code', 'Collector number', 'Quantity'];
  assert.equal(detectAdapter(headers).id, 'canonical');
});

test('detectAdapter: returns null when no name/id/setCN combo present', () => {
  const headers = ['random', 'unrelated', 'columns'];
  assert.equal(detectAdapter(headers), null);
});

test('moxfield does NOT match a generic CSV with Count/Name/Edition only (lacks hallmarks)', () => {
  const headers = ['Count', 'Name', 'Edition', 'Collector Number'];
  // No Tradelist/Last Modified/Alter/Proxy → falls through to canonical
  assert.equal(detectAdapter(headers).id, 'canonical');
});

test('deckbox vs moxfield disambiguation — Card Number vs Collector Number', () => {
  const dbox = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Card Number', 'My Price'];
  const mox = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Collector Number'];
  assert.equal(detectAdapter(dbox).id, 'deckbox');
  assert.equal(detectAdapter(mox).id, 'moxfield');
});

// ---- parse ----
test('moxfield.parse: extracts qty + finish + condition correctly', () => {
  const csv = 'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price\n3,1,Sol Ring,sld,NM,en,foil,trade,2026-01-01,1011,False,False,2.50';
  const rows = parseCsv(csv);
  const out = moxfieldAdapter.parse(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Sol Ring');
  assert.equal(out[0].setCode, 'sld');
  assert.equal(out[0].cn, '1011');
  assert.equal(out[0].finish, 'foil');
  assert.equal(out[0].qty, 3);
  assert.equal(out[0].condition, 'near_mint');
  assert.equal(out[0].price, 2.50);
});

test('moxfield.parse: source metadata preserved on the entry', () => {
  const csv = 'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price\n2,5,Sol Ring,sld,LP,en,,trade,2026-04-01,1011,True,False,1.00';
  const rows = parseCsv(csv);
  const [entry] = moxfieldAdapter.parse(rows);
  assert.equal(entry._source.moxfield['Tradelist Count'], '5');
  assert.equal(entry._source.moxfield['Last Modified'], '2026-04-01');
  assert.equal(entry._source.moxfield['Alter'], 'True');
});

test('deckbox.parse: long condition names normalize to canonical', () => {
  const csv = 'Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price\n1,0,Sol Ring,Secret Lair Drop,1011,Good (Lightly Played),English,foil,,,,,,,3.00';
  const rows = parseCsv(csv);
  const [entry] = deckboxAdapter.parse(rows);
  assert.equal(entry.name, 'Sol Ring');
  assert.equal(entry.setName, 'Secret Lair Drop');
  assert.equal(entry.cn, '1011');
  assert.equal(entry.finish, 'foil');
  assert.equal(entry.condition, 'lightly_played');
});

test('manabox.parse: scryfall id + manabox id preserved', () => {
  const csv = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency\nSol Ring,sld,Secret Lair Drop,1011,foil,uncommon,1,42,abc-def-123,2.50,false,false,near_mint,en,USD';
  const rows = parseCsv(csv);
  const [entry] = manaboxAdapter.parse(rows);
  assert.equal(entry.scryfallId, 'abc-def-123');
  assert.equal(entry.qty, 1);
  assert.equal(entry._source.manabox['ManaBox ID'], '42');
});

test('canonical.parse: handles legacy CSVs (location, tags pipe-separated)', () => {
  const csv = 'Name,Set code,Collector number,Quantity,Location,Tags\nSol Ring,sld,1011,2,box: bulk,edh|trade';
  const rows = parseCsv(csv);
  const [entry] = canonicalAdapter.parse(rows);
  assert.equal(entry.qty, 2);
  assert.equal(entry.location.type, 'box');
  assert.equal(entry.location.name, 'bulk');
  assert.deepEqual(entry.tags, ['edh', 'trade']);
});

// ---- export roundtrip ----
test('moxfield roundtrip: parse → export preserves Tradelist Count + Alter', () => {
  const csv = 'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price\n2,3,Sol Ring,sld,NM,en,foil,edh,2026-01-01,1011,True,False,2.50';
  const rows = parseCsv(csv);
  const entries = moxfieldAdapter.parse(rows);
  const out = moxfieldAdapter.export(entries);
  assert.match(out, /Sol Ring/);
  assert.match(out, /,3,/); // Tradelist Count preserved
  assert.match(out, /,True,/); // Alter preserved
  assert.match(out, /^Count,Tradelist Count,Name,Edition,/);
});

test('deckbox roundtrip: parse → export preserves Promo + Signed', () => {
  const csv = 'Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price\n1,0,Sol Ring,Secret Lair Drop,1011,Near Mint,English,,Yes,,,,Yes,,3.00';
  const rows = parseCsv(csv);
  const entries = deckboxAdapter.parse(rows);
  const out = deckboxAdapter.export(entries);
  assert.match(out, /Sol Ring/);
  // Yes for Signed (col index 8) and Promo (col index 12) survive
  const dataLine = out.split('\n')[1];
  const cells = dataLine.split(',');
  assert.equal(cells[8], 'Yes');
  assert.equal(cells[12], 'Yes');
});

// ---- mergeSource ----
test('mergeSource: keeps existing slots, updates with newer rows per format', () => {
  const existing = { _source: { moxfield: { Count: '1', Name: 'Old' } } };
  const incoming = { _source: { moxfield: { Count: '2', Name: 'New' }, deckbox: { Count: '1', Name: 'Old' } } };
  mergeSource(existing, incoming);
  assert.equal(existing._source.moxfield.Name, 'New');
  assert.equal(existing._source.deckbox.Count, '1');
});

test('mergeSource: handles existing without _source field', () => {
  const existing = { qty: 1 };
  mergeSource(existing, { _source: { moxfield: { Name: 'Foo' } } });
  assert.equal(existing._source.moxfield.Name, 'Foo');
});

test('ADAPTERS registry order: moxfield/deckbox/manabox before canonical (most specific first)', () => {
  const ids = ADAPTERS.map(a => a.id);
  assert.deepEqual(ids, ['moxfield', 'deckbox', 'manabox', 'canonical']);
});

test('getAdapter: by id', () => {
  assert.equal(getAdapter('moxfield').id, 'moxfield');
  assert.equal(getAdapter('does-not-exist'), null);
});
