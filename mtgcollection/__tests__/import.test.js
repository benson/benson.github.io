import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseDecklist, mapHeaders, ALIASES } from '../import.js';

// ---- parseCsv ----

test('parseCsv: simple rows', () => {
  const out = parseCsv('a,b,c\n1,2,3\n4,5,6');
  assert.deepEqual(out, [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]);
});

test('parseCsv: quoted field with comma', () => {
  const out = parseCsv('Name,Set\n"Ragavan, Nimble Pilferer",mh2');
  assert.deepEqual(out, [
    ['Name', 'Set'],
    ['Ragavan, Nimble Pilferer', 'mh2'],
  ]);
});

test('parseCsv: escaped double-quote ("") inside quoted field', () => {
  const out = parseCsv('a\n"he said ""hi"""');
  assert.deepEqual(out, [
    ['a'],
    ['he said "hi"'],
  ]);
});

test('parseCsv: CRLF line endings', () => {
  const out = parseCsv('a,b\r\n1,2\r\n3,4');
  assert.deepEqual(out, [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
  ]);
});

test('parseCsv: LF line endings', () => {
  const out = parseCsv('a,b\n1,2');
  assert.deepEqual(out, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: trailing newline', () => {
  const out = parseCsv('a,b\n1,2\n');
  assert.deepEqual(out, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: filters empty rows', () => {
  const out = parseCsv('a,b\n\n1,2\n\n');
  assert.deepEqual(out, [['a', 'b'], ['1', '2']]);
});

test('parseCsv: quoted field with embedded newline', () => {
  const out = parseCsv('a\n"line1\nline2"');
  assert.deepEqual(out, [
    ['a'],
    ['line1\nline2'],
  ]);
});

// ---- mapHeaders ----

test('mapHeaders: case-insensitive matching', () => {
  const idx = mapHeaders(['NAME', 'Set Code', 'COLLECTOR NUMBER']);
  assert.equal(idx.name, 0);
  assert.equal(idx.setCode, 1);
  assert.equal(idx.cn, 2);
});

test('mapHeaders: alias matching for each known column', () => {
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const idx = mapHeaders([alias]);
      assert.equal(idx[key], 0, `alias "${alias}" should resolve to "${key}"`);
    }
  }
});

// Pin specific aliases that real exporter CSVs depend on. The loop above
// proves "everything in ALIASES still maps", but won't catch someone
// deleting an alias from ALIASES — these explicit tests will.
test('mapHeaders: pinned canonical aliases from real exporters', () => {
  // manabox uses these
  assert.equal(mapHeaders(['Name'])['name'], 0);
  assert.equal(mapHeaders(['Set code'])['setCode'], 0);
  assert.equal(mapHeaders(['Collector number'])['cn'], 0);
  assert.equal(mapHeaders(['Foil'])['finish'], 0);
  assert.equal(mapHeaders(['Quantity'])['qty'], 0);
  assert.equal(mapHeaders(['Scryfall ID'])['scryfallId'], 0);
  // moxfield uses these
  assert.equal(mapHeaders(['Card Name'])['name'], 0);
  assert.equal(mapHeaders(['Edition'])['setCode'], 0);
  assert.equal(mapHeaders(['Count'])['qty'], 0);
  // deckbox uses these
  assert.equal(mapHeaders(['Card Number'])['cn'], 0);
  // common alternates
  assert.equal(mapHeaders(['Lang'])['language'], 0);
  assert.equal(mapHeaders(['Location'])['location'], 0);
  assert.equal(mapHeaders(['Condition'])['condition'], 0);
  assert.equal(mapHeaders(['Rarity'])['rarity'], 0);
});

test('mapHeaders: missing columns return undefined', () => {
  const idx = mapHeaders(['something', 'unrelated']);
  assert.equal(idx.name, undefined);
  assert.equal(idx.setCode, undefined);
  assert.equal(idx.qty, undefined);
});

test('mapHeaders: alias precedence — first matching alias wins per category', () => {
  // For "name" the aliases are ['name', 'card name', 'card'] — both 'name' and 'card name' present, 'name' wins
  const idx = mapHeaders(['card name', 'name']);
  assert.equal(idx.name, 1);
});

test('mapHeaders: trims whitespace in headers', () => {
  const idx = mapHeaders(['  Name  ', '  Set Code  ']);
  assert.equal(idx.name, 0);
  assert.equal(idx.setCode, 1);
});

test('mapHeaders: handles full Moxfield-style CSV header row', () => {
  const idx = mapHeaders([
    'Count', 'Name', 'Edition', 'Collector Number',
    'Foil', 'Condition', 'Language', 'Scryfall ID',
  ]);
  assert.equal(idx.qty, 0);
  assert.equal(idx.name, 1);
  assert.equal(idx.setCode, 2);
  assert.equal(idx.cn, 3);
  assert.equal(idx.finish, 4);
  assert.equal(idx.condition, 5);
  assert.equal(idx.language, 6);
  assert.equal(idx.scryfallId, 7);
});

// ---- parseDecklist ----

test('parseDecklist: moxfield format with foil marker', () => {
  const { entries, errors } = parseDecklist('1 Sol Ring (CMM) 410 *F*');
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'Sol Ring');
  assert.equal(entries[0].setCode, 'cmm');
  assert.equal(entries[0].cn, '410');
  assert.equal(entries[0].finish, 'foil');
  assert.equal(entries[0].qty, 1);
});

test('parseDecklist: etched marker *E*', () => {
  const { entries, errors } = parseDecklist('1 Mox Opal (SLD) 1072 *E*');
  assert.equal(errors.length, 0);
  assert.equal(entries[0].finish, 'etched');
});

test('parseDecklist: no marker → normal finish', () => {
  const { entries, errors } = parseDecklist('1 Lightning Bolt (CLB) 187');
  assert.equal(errors.length, 0);
  assert.equal(entries[0].finish, 'normal');
  assert.equal(entries[0].name, 'Lightning Bolt');
});

test('parseDecklist: multi-card qty', () => {
  const { entries } = parseDecklist('4 Counterspell (CMM) 81');
  assert.equal(entries[0].qty, 4);
});

test('parseDecklist: skips blank lines and // comments', () => {
  const text = [
    '// commander',
    '1 Sol Ring (CMM) 410',
    '',
    '// lands',
    '1 Island (UND) 89',
    '',
  ].join('\n');
  const { entries, errors } = parseDecklist(text);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 2);
});

test('parseDecklist: error line numbers tracked (1-based)', () => {
  const text = [
    '1 Sol Ring (CMM) 410',
    'this is junk',
    '1 Lightning Bolt (CLB) 187',
    'also junk',
  ].join('\n');
  const { entries, errors } = parseDecklist(text);
  assert.equal(entries.length, 2);
  assert.deepEqual(errors, [2, 4]);
});

test('parseDecklist: option.location is applied to entries', () => {
  const { entries } = parseDecklist('1 Sol Ring (CMM) 410', { location: 'Breya Deck' });
  assert.equal(entries[0].location, 'breya deck'); // normalizeLocation lowercases+trims
});

test('parseDecklist: cn with star/letter suffix (PNPH 42★)', () => {
  const { entries, errors } = parseDecklist('1 Phyrexian Metamorph (PNPH) 42★ *F*');
  assert.equal(errors.length, 0);
  assert.equal(entries[0].cn, '42★');
  assert.equal(entries[0].finish, 'foil');
});

// ---- Tags column ----

test('mapHeaders: Tags column resolves to "tags"', () => {
  assert.equal(mapHeaders(['Tags'])['tags'], 0);
  assert.equal(mapHeaders(['tags'])['tags'], 0);
});

test('parseCsv: row with Tags cell containing pipes', () => {
  const csv = 'Quantity,Name,Set code,Collector number,Foil,Quantity,Condition,Location,Tags\n' +
              '1,Sol Ring,sld,1011,foil,1,near_mint,binder a,edh staple|trade pile';
  const out = parseCsv(csv);
  assert.equal(out.length, 2);
  assert.equal(out[1][8], 'edh staple|trade pile');
});
