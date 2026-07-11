import test from "node:test";
import assert from "node:assert/strict";
import {
  bossHealthSegments,
  enemyHealthSegments,
  healthSegmentLayout,
  niceSegmentUnit,
  playerHealthSegments,
} from "../health-bars.js";

test("player health uses one readable segment per HP with a fractional final segment", () => {
  const layout = playerHealthSegments(9.5);
  assert.equal(layout.unit, 1);
  assert.equal(layout.segmentCount, 10);
  assert.equal(layout.dividers.length, 9);
  assert.equal(layout.finalSegmentFraction, .5);
  assert.equal(layout.dividers.at(-1).position, 9 / 9.5);
});

test("adaptive enemy units use 1/2/5 steps and stay between five and ten segments", () => {
  for (const maximum of [42, 88, 120, 170, 390, 1800, 12600]) {
    const layout = enemyHealthSegments(maximum);
    const exponent = 10 ** Math.floor(Math.log10(layout.unit));
    const multiplier = layout.unit / exponent;
    assert.ok([1, 2, 5].includes(multiplier), `${maximum} used non-nice unit ${layout.unit}`);
    assert.ok(layout.segmentCount >= 5 && layout.segmentCount <= 10, `${maximum} made ${layout.segmentCount} segments`);
  }
  assert.equal(niceSegmentUnit(42), 5);
  assert.equal(niceSegmentUnit(390), 50);
});

test("boss layouts add stronger major divisions without changing minor math", () => {
  const layout = bossHealthSegments(1800);
  assert.equal(layout.unit, 200);
  assert.equal(layout.segmentCount, 9);
  assert.equal(layout.majorEvery, 2);
  assert.deepEqual(layout.dividers.filter((divider) => divider.major).map((divider) => divider.index), [2, 4, 6, 8]);
});

test("explicit segment units remain deterministic for DOM adapters", () => {
  const layout = healthSegmentLayout(15, { unit: 1, majorSections: 5 });
  assert.equal(layout.segmentCount, 15);
  assert.equal(layout.majorEvery, 3);
  assert.deepEqual(layout.dividers.filter((divider) => divider.major).map((divider) => divider.position), [3 / 15, 6 / 15, 9 / 15, 12 / 15]);
  assert.equal(globalThis.LastlightHealthBars.playerHealthSegments, playerHealthSegments);
});
