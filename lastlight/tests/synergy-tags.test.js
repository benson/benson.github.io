import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import { BUILDCRAFT_CATEGORIES, BUILDCRAFT_CATEGORY_DEFINITIONS, BUILDCRAFT_SCHEMA, passiveBuildcraft, sourceBuildcraft, validateBuildcraftTags } from "../synergy-tags.js";

test("buildcraft taxonomy is strict, stable, theme-ready, and valid", () => {
  assert.equal(BUILDCRAFT_SCHEMA, "lastlight.buildcraft-tags.v1");
  assert.deepEqual(Object.keys(BUILDCRAFT_CATEGORY_DEFINITIONS), BUILDCRAFT_CATEGORIES);
  assert.equal(new Set(Object.values(BUILDCRAFT_CATEGORY_DEFINITIONS).map(({ themeToken }) => themeToken)).size, 11);
  assert.deepEqual(validateBuildcraftTags(), []);
  assert.ok(Object.isFrozen(BUILDCRAFT_CATEGORY_DEFINITIONS));
});

test("all 21 weapons separate shape, behavioral traits, direct scaling, and evolution pairs", () => {
  const records = [...Object.keys(SPECIALISTS).map((specialistId) => sourceBuildcraft("signature", { specialistId })), ...Object.keys(WEAPONS).map((sourceId) => sourceBuildcraft(sourceId))];
  assert.equal(records.length, 21);
  for (const record of records) {
    assert.ok(record.shape && record.traits.length >= 3);
    assert.ok(record.traits.every(({ category, value, themeToken }) => BUILDCRAFT_CATEGORIES.includes(category) && value && themeToken));
    assert.ok(record.scalesWith.every(({ id }) => PASSIVES[id]));
    assert.ok(record.pairedPassive && PASSIVES[record.pairedPassive.id]);
    assert.ok(Object.isFrozen(record) && Object.isFrozen(record.traits) && Object.isFrozen(record.scalesWith));
  }
});

test("every passive has a scaling trait and explicit evolution pair list", () => {
  for (const passiveId of Object.keys(PASSIVES)) {
    const record = passiveBuildcraft(passiveId);
    assert.equal(record.passiveId, passiveId);
    assert.ok(BUILDCRAFT_CATEGORIES.includes(record.trait.category));
    assert.ok(record.pairedSources.length >= 1);
  }
  assert.equal(sourceBuildcraft("unknown"), null);
  assert.equal(passiveBuildcraft("unknown"), null);
});

test("buildcraft resolution is deterministic and contains no player identity", () => {
  const first = sourceBuildcraft("signature", { specialistId: "zuri", evolved: true });
  assert.deepEqual(first, sourceBuildcraft("signature", { specialistId: "zuri", evolved: true }));
  assert.doesNotMatch(JSON.stringify(first), /callsign|client|room|playerId/i);
});
