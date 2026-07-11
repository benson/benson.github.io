import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createReadabilityStressFixture } from "../fixtures/readability-stress.js";
import {
  COMBAT_READABILITY,
  COMBAT_READABILITY_VERSION,
  READABILITY_CATEGORIES,
  READABILITY_PASS_ORDER,
  contrastRatio,
  effectReadabilityCategory,
  partitionEffects,
  readabilityPlan,
  validateCombatReadability,
} from "../readability.js";

test("combat readability contract is exhaustive, ordered, and high-contrast", () => {
  assert.equal(COMBAT_READABILITY_VERSION, "lastlight.readability.v1");
  assert.deepEqual(validateCombatReadability(), []);
  assert.equal(new Set(READABILITY_PASS_ORDER).size, READABILITY_PASS_ORDER.length);
  assert.equal(new Set(Object.values(COMBAT_READABILITY).map((entry) => entry.silhouette)).size, READABILITY_CATEGORIES.length);
  assert.equal(new Set(Object.values(COMBAT_READABILITY).map((entry) => entry.pattern)).size, READABILITY_CATEGORIES.length);
  for (const entry of Object.values(COMBAT_READABILITY)) assert.ok(contrastRatio(entry.palette.keyline, entry.palette.core) >= 4.5);
});

test("effect partition keeps lethal telegraphs and damage feedback in late passes", () => {
  const effects = [
    { id: "ambient", kind: "ring" },
    { id: "friendly", kind: "pop", sourceId: "signature", owner: "p0" },
    { id: "danger", kind: "danger", owner: "enemy" },
    { id: "delayed", kind: "ring", delayed: true },
    { id: "number", kind: "number" },
  ];
  assert.equal(effectReadabilityCategory(effects[2]), "lethalTelegraph");
  assert.deepEqual(partitionEffects(effects), {
    ground: [effects[0], effects[1]],
    threat: [effects[2], effects[3]],
    feedback: [effects[4]],
  });
});

test("minimal and reduced profiles retain essential shape while removing decorative motion and flash", () => {
  for (const category of ["hostileProjectile", "lethalTelegraph", "objective", "teammateCritical", "damageFeedback", "inspection"]) {
    const plan = readabilityPlan(category, { qualityTier: "minimal", reducedMotion: true, reducedFlash: true });
    assert.equal(plan.visible, true, category);
    assert.equal(plan.motion, "static-state-change");
    assert.equal(plan.flash, "none");
    assert.ok(plan.silhouette && plan.pattern && plan.edge);
  }
  assert.equal(readabilityPlan("decorative", { qualityTier: "minimal" }).visible, false);
});

test("readability stress fixture covers every category in high, reduced, and minimal profiles", () => {
  const fixture = createReadabilityStressFixture();
  assert.equal(fixture.length, READABILITY_CATEGORIES.length * 3);
  assert.equal(new Set(fixture.map((entry) => entry.id)).size, fixture.length);
  assert.ok(fixture.every((entry) => entry.plan.silhouette && entry.plan.pattern));
});

test("renderer uses explicit late threat, objective, teammate, feedback, and inspection passes", () => {
  const source = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const order = [
    "drawProjectiles(friendlyProjectiles",
    "drawGroundedQueue",
    "drawProjectiles(hostileProjectiles",
    'drawObjectives(state.objectives || [], map, "overlay")',
    'drawEffects(effectPasses.threat',
    "drawCriticalOverlays",
    'drawEffects(effectPasses.feedback',
    "drawHovered",
  ].map((needle) => source.indexOf(needle));
  assert.ok(order.every((index) => index >= 0), order);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(source, /const rendered = pass === "threat" \? relevant : this\.budget/, "lethal telegraphs bypass cosmetic effect caps");
});
