import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enemyAttackEffectPresentation, enemyAttackFamily, enemyAttackMotionPlan } from "../enemy-attack-motion.js";
import {
  assertEnemyAttackMotionAuditMetadata, buildEnemyAttackMotionAuditMetadata,
} from "../enemy-attack-motion-audit.js";

const geometry = Object.freeze({ x: 17, y: -9, angle: .4, radius: 115, range: 208, start: 18, halfWidth: 28, endpointX: 208, endpointY: 3 });

test("attack-family plans preserve authoritative geometry byte-for-byte", () => {
  for (const family of ["charge", "slam", "detonation"]) {
    const plan = enemyAttackMotionPlan({ family, progress: .62, geometry });
    assert.deepEqual(plan.authoritativeGeometry, geometry);
    assert.equal(Object.isFrozen(plan.authoritativeGeometry), true);
    assert.ok(plan.markCount <= 20, `${family} stays inside the bounded mark budget`);
  }
});

test("charge, slam, and detonation expose distinct bounded motion grammars", () => {
  const charge = enemyAttackMotionPlan({ family: "charge", progress: .5, geometry });
  const slam = enemyAttackMotionPlan({ family: "slam", progress: .5, geometry });
  const detonation = enemyAttackMotionPlan({ family: "detonation", progress: .5, geometry });
  assert.deepEqual([charge.accents.chevrons, charge.accents.endpointTeeth, charge.accents.launchArcs], [5, 5, 3]);
  assert.deepEqual([slam.accents.brokenRings, slam.accents.fractures], [3, 8]);
  assert.deepEqual([detonation.accents.fuseSegments, detonation.accents.litSegments, detonation.accents.spokes], [12, 6, 6]);
  assert.equal(enemyAttackFamily({ type: "hound", telegraphKind: "lane" }), "charge");
  assert.equal(enemyAttackFamily({ type: "brute", telegraphKind: "ring" }), "slam");
  assert.equal(enemyAttackFamily({ type: "bomber", telegraphKind: "burst" }), "detonation");
});

test("reduced motion freezes all decorative position and scale while opacity may fade", () => {
  for (const family of ["charge", "slam", "detonation"]) {
    const early = enemyAttackMotionPlan({ family, stage: "contact", progress: .25, geometry, reducedMotion: true });
    const late = enemyAttackMotionPlan({ family, stage: "contact", progress: .75, geometry, reducedMotion: true });
    assert.equal(early.contact.progress, late.contact.progress, `${family} contact expansion is frozen`);
    assert.equal(early.contact.travel, 0);
    assert.equal(late.contact.travel, 0);
    if (family === "charge") assert.deepEqual(early.accents.travel, late.accents.travel);
    if (family === "slam") assert.deepEqual([early.accents.compression, early.accents.rotation], [late.accents.compression, late.accents.rotation]);
    if (family === "detonation") assert.deepEqual([early.accents.coreScale, early.accents.unstableRotation], [late.accents.coreScale, late.accents.unstableRotation]);
    assert.ok(early.contact.alpha > late.contact.alpha, "an opacity-only fade remains available");
  }
});

test("reduced flash removes bright contact cores without removing the footprint", () => {
  const normal = enemyAttackMotionPlan({ family: "detonation", stage: "contact", progress: .25, geometry });
  const reduced = enemyAttackMotionPlan({ family: "detonation", stage: "contact", progress: .25, geometry, reducedFlash: true });
  assert.equal(normal.contact.brightCore, true);
  assert.equal(reduced.contact.brightCore, false);
  assert.ok(reduced.contact.alpha > 0 && reduced.contact.alpha < normal.contact.alpha);
  assert.deepEqual(reduced.authoritativeGeometry, normal.authoritativeGeometry);
});

test("crowded mode reduces decoration counts without changing danger geometry", () => {
  for (const family of ["charge", "slam", "detonation"]) {
    const normal = enemyAttackMotionPlan({ family, geometry });
    const crowded = enemyAttackMotionPlan({ family, geometry, crowded: true });
    assert.ok(crowded.markCount < normal.markCount);
    assert.deepEqual(crowded.authoritativeGeometry, normal.authoritativeGeometry);
  }
});

test("deterministic audit covers windup, contact, recovery, and accessibility modes", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("enemy attack audit must not consume gameplay RNG"); };
  try {
    const report = buildEnemyAttackMotionAuditMetadata();
    assert.deepEqual(assertEnemyAttackMotionAuditMetadata(report), []);
    assert.deepEqual(report.coverage, { attacks: 3, modes: 4, stages: 5, frames: 60 });
  } finally {
    Math.random = originalRandom;
  }
});

test("runtime consumes shared attack plans and infers presentation without mutating engine state", () => {
  const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  assert.match(render, /drawEnemyAttackAccents\(enemyAttackMotionPlan\(/);
  assert.match(render, /drawEnemyAttackContact\(enemyAttackMotionPlan\(/);
  assert.deepEqual(enemyAttackEffectPresentation({ kind: "danger", owner: "enemy", radius: 170, maxLife: .5, x: 5, y: 6 }), { family: "detonation", stage: "windup", angle: 0 });
  assert.deepEqual(enemyAttackEffectPresentation({ kind: "danger", owner: "enemy", radius: 150, maxLife: .3, x: 5, y: 6 }), { family: "detonation", stage: "contact", angle: 0 });
  assert.deepEqual(enemyAttackEffectPresentation({ kind: "danger", owner: "enemy", radius: 115, maxLife: .3, x: 5, y: 6 }), { family: "slam", stage: "contact", angle: 0 });
});
