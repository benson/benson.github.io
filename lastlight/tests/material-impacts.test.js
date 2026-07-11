import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENEMY_TYPES, MAPS, MAP_OBSTACLES } from "../data.js";
import { createImpactStressFixture, createMaterialImpactStressFixture } from "../fixtures/impact-stress.js";
import {
  LASTLIGHT_MATERIAL_THEME,
  MATERIAL_CLASSES,
  MATERIAL_SCHEMA,
  MATERIAL_TARGET_METADATA,
  materialAtPoint,
  materialForEnemy,
  resolveMaterialImpact,
  stableImpactUnit,
  validateMaterialTargets,
  validateMaterialTheme,
} from "../material-impacts.js";

test("strict theme contract defines exactly six bounded material classes", () => {
  assert.equal(LASTLIGHT_MATERIAL_THEME.schema, MATERIAL_SCHEMA);
  assert.deepEqual(Object.keys(LASTLIGHT_MATERIAL_THEME), ["schema", ...MATERIAL_CLASSES]);
  assert.deepEqual(validateMaterialTheme(LASTLIGHT_MATERIAL_THEME), []);
  assert.deepEqual(validateMaterialTargets(), []);
  for (const id of MATERIAL_CLASSES) {
    const material = LASTLIGHT_MATERIAL_THEME[id];
    assert.ok(material.label && material.examples);
    assert.ok(material.particles.count <= 6 && material.particles.speed <= 180);
    assert.ok(material.decal.alpha <= .4 && material.decal.lifetimeMs <= 2000);
    assert.ok(material.flash.durationMs <= 140);
    assert.ok(material.sound.volume <= .8);
    assert.ok(material.fallback.pattern && material.fallback.label);
  }
});

test("enemy, obstacle, terrain, and objective metadata exhaustively select materials", () => {
  assert.deepEqual(Object.keys(MATERIAL_TARGET_METADATA.enemies).filter((id) => !["treasure", "bosses"].includes(id)), Object.keys(ENEMY_TYPES));
  assert.deepEqual(Object.keys(MATERIAL_TARGET_METADATA.terrain), Object.keys(MAPS));
  assert.equal(MATERIAL_TARGET_METADATA.obstacles.raisedCover.length, MAP_OBSTACLES.length);
  assert.deepEqual(new Set([
    ...Object.values(MATERIAL_TARGET_METADATA.enemies).flatMap((value) => typeof value === "object" ? Object.values(value) : value),
    ...MATERIAL_TARGET_METADATA.obstacles.raisedCover,
    MATERIAL_TARGET_METADATA.obstacles.supplyCache,
    ...Object.values(MATERIAL_TARGET_METADATA.terrain),
    ...Object.values(MATERIAL_TARGET_METADATA.objectives),
  ]), new Set(MATERIAL_CLASSES));
  assert.equal(materialForEnemy({ type: "mite" }), "organic");
  assert.equal(materialForEnemy({ boss: true }, "lab"), "void");
  assert.equal(materialForEnemy({ eventType: "treasure" }), "energy");
});

test("world-space material resolution follows target priority then terrain fallback", () => {
  const state = {
    map: "lab",
    enemies: [{ id: "brute", type: "brute", x: 100, y: 100, radius: 35 }],
    pods: [{ id: "cache", x: 220, y: 100, radius: 25 }],
    objectives: [{ id: "trial", kind: "trial", x: 340, y: 100, radius: 50 }],
    relayBalls: [{ id: "ball", x: 460, y: 100, radius: 28 }],
  };
  assert.equal(materialAtPoint({ x: 100, y: 100 }, state, MAP_OBSTACLES).material, "metal");
  assert.equal(materialAtPoint({ x: 220, y: 100 }, state, MAP_OBSTACLES).material, "metal");
  assert.equal(materialAtPoint({ x: 340, y: 100 }, state, MAP_OBSTACLES).material, "void");
  assert.equal(materialAtPoint({ x: 460, y: 100 }, state, MAP_OBSTACLES).material, "metal");
  assert.equal(materialAtPoint({ x: 1700, y: 1100 }, state, []).material, "liquid");
});

test("all 42 base/evolved variants resolve all six material responses", () => {
  const matrix = createMaterialImpactStressFixture();
  assert.equal(matrix.length, 42 * 6);
  assert.equal(new Set(matrix.map((entry) => entry.id)).size, matrix.length);
  for (const entry of matrix) {
    assert.equal(entry.response.material, entry.material);
    assert.equal(entry.response.weapon.silhouette, entry.weaponPlan.silhouette);
    assert.ok(entry.response.particles.count <= 6);
    assert.ok(entry.response.decal.lifetimeMs <= 2000);
    assert.ok(entry.response.flash.durationMs <= 140);
    assert.ok(entry.response.fallback.pattern);
  }
});

test("quality and accessibility fallbacks remove excess motion without hiding critical contact", () => {
  const weaponCases = createImpactStressFixture();
  const ordinary = weaponCases.find((entry) => entry.sourceId === "uwu" && !entry.evolved).plan;
  const critical = weaponCases.find((entry) => entry.sourceId === "mines" && !entry.evolved).plan;
  const low = resolveMaterialImpact(ordinary, "concrete", { reducedMotion: true, effectsDensity: 0, flashIntensity: .25, soundIntensity: 0 });
  assert.equal(low.particles.count, 0);
  assert.equal(low.particles.speed, 0);
  assert.equal(low.decal.visible, false);
  assert.equal(low.sound.volume, 0);
  assert.ok(low.fallback.pattern && low.fallback.color);
  const protectedCue = resolveMaterialImpact(critical, "energy", { reducedMotion: true, effectsDensity: 0, flashIntensity: .25 });
  assert.equal(protectedCue.particles.count, 1);
  assert.equal(protectedCue.decal.visible, true);
  assert.equal(protectedCue.flash.intensity, .25 * .55);
});

test("stable procedural sampling needs no random source", () => {
  assert.equal(stableImpactUnit("impact-1"), stableImpactUnit("impact-1"));
  assert.notEqual(stableImpactUnit("impact-1"), stableImpactUnit("impact-2"));
  const source = readFileSync(new URL("../material-impacts.js", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/);
  assert.match(renderer, /materialAtPoint/);
  assert.match(renderer, /materialImpacts/);
  assert.doesNotMatch(engine, /material-impacts|MATERIAL_CLASSES|resolveMaterialImpact/);
});
