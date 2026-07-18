import test from "node:test";
import assert from "node:assert/strict";
import {
  COMBAT_WEIGHT_SCHEMA, SPECIALIST_RECOIL_PROFILES, enemyGroundingPlan,
  impactCameraImpulsePlan, locomotionPlantPlan, weaponKickPlan,
} from "../combat-weight.js";
import { impactFeedbackPlan } from "../impact-feel.js";

test("every specialist owns a bounded directional release profile", () => {
  assert.equal(COMBAT_WEIGHT_SCHEMA, "lastlight.combat-weight.v1");
  assert.deepEqual(Object.keys(SPECIALIST_RECOIL_PROFILES), ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
  for (const specialist of Object.keys(SPECIALIST_RECOIL_PROFILES)) {
    const plan = weaponKickPlan({ specialist, flash: 1, angle: 0 });
    assert.ok(plan.x < 0 && Math.abs(plan.y) < 1e-12, specialist);
    assert.ok(Math.abs(plan.x) <= 5.6, specialist);
    assert.ok(plan.scaleX < 1 && plan.scaleY > 1, specialist);
    assert.deepEqual(weaponKickPlan({ specialist, flash: 1, reducedMotion: true }), {
      schema: COMBAT_WEIGHT_SCHEMA, envelope: 0, angle: 0, x: -0, y: -0, rotation: -0, scaleX: 1, scaleY: 1,
    });
  }
});

test("release recoil snaps on then settles monotonically inside the muzzle clock", () => {
  const samples = [1, .75, .5, .25, 0].map((flash) => Math.abs(weaponKickPlan({ specialist: "bront", flash }).x));
  assert.deepEqual(samples, [...samples].sort((left, right) => right - left));
  assert.equal(samples.at(-1), 0);
});

test("locomotion start and stop use short planted envelopes without continuous bob", () => {
  const idle = locomotionPlantPlan({ startAge: 1, skidRatio: 0 });
  const launch = locomotionPlantPlan({ startAge: .07, speedRatio: .8 });
  const stop = locomotionPlantPlan({ startAge: 1, skidRatio: .5 });
  assert.deepEqual(idle, { schema: COMBAT_WEIGHT_SCHEMA, start: 0, stop: 0, turn: 0, offsetY: 0, rotation: -0, scaleX: 1, scaleY: 1, shadowX: 1, shadowY: 1 });
  for (const plan of [launch, stop]) {
    assert.ok(plan.offsetY > 0);
    assert.ok(plan.scaleX > 1 && plan.scaleY < 1);
  }
  assert.equal(locomotionPlantPlan({ startAge: .07, skidRatio: .5, reducedMotion: true }).offsetY, 0);
});

test("authored enemy atlases stay planted while fallback motion retains a bounded gait", () => {
  const authored = enemyGroundingPlan({ authored: true, moving: true, stride: Math.PI / 2 });
  assert.equal(authored.offsetY, 0);
  assert.equal(authored.rotation, 0);
  const fallback = enemyGroundingPlan({ authored: false, moving: true, stride: Math.PI / 2 });
  assert.ok(fallback.offsetY < 0 && fallback.offsetY >= -.85);
  const attack = enemyGroundingPlan({ authored: false, moving: true, phase: "windup", stride: Math.PI / 2 });
  assert.equal(attack.offsetY, 0);
});

test("only local or nearby high-priority impacts move the camera", () => {
  const light = impactFeedbackPlan({ tier: "light" });
  const heavy = impactFeedbackPlan({ tier: "heavy" });
  assert.equal(impactCameraImpulsePlan({ plan: light, distance: 10 }).strength, 0);
  assert.equal(impactCameraImpulsePlan({ plan: heavy, distance: 700 }).strength, 0);
  const nearby = impactCameraImpulsePlan({ plan: heavy, distance: 160 });
  const local = impactCameraImpulsePlan({ plan: heavy, distance: 160, localImpact: true });
  assert.ok(nearby.strength > 0 && nearby.strength < local.strength);
  assert.equal(impactCameraImpulsePlan({ plan: heavy, distance: 0, localImpact: true, reducedMotion: true }).strength, 0);
});

