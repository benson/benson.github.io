const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..');

function boosterModel(code) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'boosters', `${code}.json`), 'utf8'));
}

function setCodes(model) {
  return new Set(Object.values(model.cards || {}).map(card => card.setCode));
}

test('known MTGJSON artifacts have no unresolved UUIDs', () => {
  for (const code of ['mh3', 'blb', 'otj', 'stx', 'mom', 'bfz', 'j25', 'acr']) {
    const model = boosterModel(code);
    assert.equal(model.unresolved, undefined, `${code} should not serialize unresolved UUIDs`);
    assert.ok(Object.keys(model.cards || {}).length > 0, `${code} should include card records`);
  }
});

test('modern play boosters preserve bonus-sheet and Special Guest source cards', () => {
  const mh3 = boosterModel('mh3');
  const blb = boosterModel('blb');
  const otj = boosterModel('otj');

  assert.equal(mh3.appBoosterMap.play, 'play');
  assert.ok(mh3.boosters.play.sheets.specialGuest);
  assert.ok(blb.extraSheetsByBoosterType.play.theList);
  assert.ok(setCodes(blb).has('spg'));
  assert.ok(setCodes(otj).has('big'));
  assert.ok(setCodes(otj).has('otp'));
  assert.ok(setCodes(otj).has('spg'));
});

test('cross-set bonus sheets are resolved from source sets', () => {
  const stx = boosterModel('stx');
  const mom = boosterModel('mom');

  assert.equal(stx.appBoosterMap.play, 'draft');
  assert.ok(setCodes(stx).has('sta'));
  assert.ok(setCodes(mom).has('mul'));
});

test('legacy and specialty booster mappings stay app-compatible', () => {
  const bfz = boosterModel('bfz');
  const j25 = boosterModel('j25');
  const acr = boosterModel('acr');

  assert.equal(bfz.appBoosterMap.play, 'draft');
  assert.ok(bfz.boosters.draft.sheets.foilOrMasterpiece1In144);
  assert.ok(setCodes(bfz).has('exp'));

  assert.equal(j25.appBoosterMap.play, 'jumpstart');
  assert.ok(Object.values(j25.boosters.jumpstart.sheets).some(sheet => sheet.fixed));

  assert.equal(acr.appBoosterMap.play, 'default');
  assert.equal(acr.appBoosterMap.collector, 'collector');
});
