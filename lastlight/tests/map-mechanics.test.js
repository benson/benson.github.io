import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_MECHANICS, MAP_MECHANICS_SCHEMA, MAP_MECHANIC_IDS, mapMechanicDefinition,
  mapMechanicFrame, mapSpawnWeights, pointInMapMechanic, validateMapMechanics,
} from "../map-mechanics.js";

test("map mechanics registry is strict, immutable, and covers every operation", () => {
  assert.deepEqual(validateMapMechanics(), []);
  assert.equal(Object.isFrozen(MAP_MECHANICS), true);
  assert.deepEqual(Object.keys(MAP_MECHANICS.maps).sort(), [...MAP_MECHANIC_IDS].sort());
  for (const id of MAP_MECHANIC_IDS) {
    const mechanic = mapMechanicDefinition(id);
    assert.equal(mechanic.id, id);
    assert.ok(mechanic.description.length > 20);
    assert.ok(mechanic.counterplay.length > 20);
  }
  const invalid = structuredClone(MAP_MECHANICS);
  invalid.maps.lab.effect.secretDamage = 99;
  assert.match(validateMapMechanics(invalid).join(" "), /effect is invalid/);
});

test("frames expose deterministic idle, warning, and active geometry without wall-clock state", () => {
  for (const id of MAP_MECHANIC_IDS) {
    const mechanic = mapMechanicDefinition(id);
    const activeStart = mechanic.cycleTicks - mechanic.activeTicks;
    const warningStart = activeStart - mechanic.warningTicks;
    const idle = mapMechanicFrame(id, 0), warning = mapMechanicFrame(id, warningStart), active = mapMechanicFrame(id, activeStart);
    assert.equal(idle.schema, MAP_MECHANICS_SCHEMA);
    assert.equal(idle.phase, "idle");
    assert.equal(warning.phase, "warning");
    assert.equal(active.phase, "active");
    assert.deepEqual(mapMechanicFrame(id, activeStart), active);
    assert.equal(pointInMapMechanic(active, active.geometry.axis === "vertical" ? active.geometry.center : 0, active.geometry.axis === "horizontal" ? active.geometry.center : 0), true);
    assert.equal(pointInMapMechanic(active, active.geometry.axis === "vertical" ? active.geometry.center + active.geometry.halfWidth + 1 : 0, active.geometry.axis === "horizontal" ? active.geometry.center + active.geometry.halfWidth + 1 : 0), false);
  }
});

test("beachhead undertow alternates direction and crosses the complete field", () => {
  const mechanic = mapMechanicDefinition("beachhead"), start = mechanic.cycleTicks - mechanic.activeTicks;
  const first = mapMechanicFrame("beachhead", start), middle = mapMechanicFrame("beachhead", start + mechanic.activeTicks / 2);
  const second = mapMechanicFrame("beachhead", mechanic.cycleTicks + start);
  assert.equal(first.direction, 1);
  assert.equal(second.direction, -1);
  assert.ok(first.geometry.center < middle.geometry.center);
  assert.equal(second.geometry.center > 0, true);
});

test("map composition produces exact deterministic 100-point phase budgets", () => {
  const base = { mite: 25, hound: 25, spitter: 20, brute: 12, bomber: 18 };
  const outputs = new Map();
  for (const id of MAP_MECHANIC_IDS) {
    const weights = mapSpawnWeights(id, base);
    assert.equal(Object.values(weights).reduce((sum, weight) => sum + weight, 0), 100);
    assert.ok(Object.values(weights).every((weight) => Number.isSafeInteger(weight) && weight > 0));
    assert.deepEqual(mapSpawnWeights(id, base), weights);
    outputs.set(id, JSON.stringify(weights));
  }
  assert.equal(new Set(outputs.values()).size, MAP_MECHANIC_IDS.length);
  assert.ok(mapSpawnWeights("outskirts", base).spitter > mapSpawnWeights("warehouse", base).spitter);
  assert.ok(mapSpawnWeights("warehouse", base).brute > mapSpawnWeights("outskirts", base).brute);
  assert.throws(() => mapSpawnWeights("lab", { ghost: 100 }), /invalid/);
});
