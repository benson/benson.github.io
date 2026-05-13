const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAppBoosterMap, filterSets } = require('../update-sets.js');

const TODAY = new Date('2026-04-18T00:00:00Z');

function record(overrides) {
  return {
    set: {
      code: overrides.code,
      name: overrides.name || overrides.code.toUpperCase(),
      releaseDate: overrides.releaseDate || '2025-01-01',
      type: overrides.type || 'expansion',
    },
    boosterTypes: overrides.boosterTypes || ['play'],
    defaultBoosterType: overrides.defaultBoosterType || 'play',
    limitedBoosterType: overrides.limitedBoosterType || 'play',
    limitedLabel: overrides.limitedLabel || 'play',
    mtgjsonBoosterTypes: overrides.mtgjsonBoosterTypes || ['play'],
    extraSheetLabel: overrides.extraSheetLabel || null,
  };
}

test('maps play plus collector into current app surfaces', () => {
  assert.deepEqual(buildAppBoosterMap(['collector', 'play', 'prerelease']), {
    play: 'play',
    collector: 'collector',
  });
});

test('maps old default boosters to play surface', () => {
  assert.deepEqual(buildAppBoosterMap(['default', 'starter']), {
    play: 'default',
  });
});

test('ignores arena-only configs when choosing app booster map', () => {
  assert.deepEqual(buildAppBoosterMap(['arena', 'arena-1']), {});
});

test('preserves collector-only product surface', () => {
  assert.deepEqual(buildAppBoosterMap(['collector', 'collector-sample']), {
    collector: 'collector',
  });
});

test('filterSets drops future sets even if MTGJSON has a config', () => {
  const out = filterSets([
    record({ code: 'msh', releaseDate: '2026-06-26' }),
    record({ code: 'tdm', releaseDate: '2025-04-11' }),
  ], TODAY);
  assert.deepEqual(out.map(s => s.code), ['tdm']);
});

test('filterSets sorts released sets newest first and includes MTGJSON fields', () => {
  const out = filterSets([
    record({ code: 'm15', name: 'Magic 2015', releaseDate: '2014-07-18', limitedBoosterType: 'draft', limitedLabel: 'draft booster', mtgjsonBoosterTypes: ['draft'] }),
    record({ code: 'tdm', name: 'Tarkir: Dragonstorm', releaseDate: '2025-04-11', extraSheetLabel: 'special guests' }),
  ], TODAY);

  assert.deepEqual(out, [
    {
      code: 'tdm',
      name: 'Tarkir: Dragonstorm',
      released: '2025-04-11',
      boosterTypes: ['play'],
      defaultBoosterType: 'play',
      limitedBoosterType: 'play',
      limitedLabel: 'play',
      mtgjsonBoosterTypes: ['play'],
      extraSheetLabel: 'special guests',
    },
    {
      code: 'm15',
      name: 'Magic 2015',
      released: '2014-07-18',
      boosterTypes: ['play'],
      defaultBoosterType: 'play',
      limitedBoosterType: 'draft',
      limitedLabel: 'draft booster',
      mtgjsonBoosterTypes: ['draft'],
      extraSheetLabel: null,
    },
  ]);
});
