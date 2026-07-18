import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPACT_FEEL_SCHEMA, IMPACT_FEEL_TIERS, IMPACT_MASS_PROFILES, IMPACT_TIER_PROFILES,
  ImpactIntensityDirector, aftermathPlan, attackerRecoilTransform, cameraLookBias,
  impactAnimationTimeScale, impactFeedbackPlan, impactPhaseProgress, impactReactionTransform, impactTierForEvent,
  projectileMotionPlan, secondaryMotionPlan, selectImpactFeedback,
} from "../impact-feel.js";

test("impact tiers form a strict escalating presentation grammar", () => {
  assert.equal(IMPACT_FEEL_SCHEMA, "lastlight.impact-feel.v1");
  assert.deepEqual(IMPACT_FEEL_TIERS, ["ambient", "light", "heavy", "critical"]);
  const profiles = IMPACT_FEEL_TIERS.map((tier) => IMPACT_TIER_PROFILES[tier]);
  for (let index = 1; index < profiles.length; index++) {
    assert.ok(profiles[index].cost > profiles[index - 1].cost);
    assert.ok(profiles[index].reaction > profiles[index - 1].reaction);
    assert.ok(profiles[index].audio > profiles[index - 1].audio);
  }
  assert.equal(impactTierForEvent({ damage: 1, maxHp: 1000, priority: "ambient" }), "ambient");
  assert.equal(impactTierForEvent({ damage: 20, maxHp: 1000 }), "light");
  assert.equal(impactTierForEvent({ damage: 100, maxHp: 1000 }), "heavy");
  assert.equal(impactTierForEvent({ critical: true }), "critical");
});

test("feedback plans synchronize timing force vfx sound and haptics", () => {
  const plan = impactFeedbackPlan({ tier: "critical", angle: Math.PI / 2, mass: "brute" });
  assert.equal(plan.schema, IMPACT_FEEL_SCHEMA);
  assert.equal(plan.tier, "critical");
  assert.ok(plan.timing.holdMs > 0 && plan.timing.freezeMs > 0);
  assert.ok(plan.force.reaction > 0 && plan.force.cameraPunch > 0 && plan.force.attackerRecoil > 0);
  assert.ok(plan.vfx.criticalGraphic && plan.vfx.smear && plan.vfx.aftermath > 0);
  assert.equal(plan.audio.cue, "impact-critical");
  assert.ok(plan.audio.duck > 0 && plan.audio.minimumIntervalMs > 0 && plan.haptic.strong > plan.haptic.weak);
});

test("frequent impacts stay quiet while heavy accents and visual hit-stop share one tier", () => {
  const light = impactFeedbackPlan({ tier: "light" });
  const heavy = impactFeedbackPlan({ tier: "heavy" });
  assert.equal(light.audio.cue, null);
  assert.equal(heavy.audio.cue, "impact-heavy");
  assert.equal(impactAnimationTimeScale({ plan: heavy, ageMs: heavy.timing.freezeMs - 1 }), 0);
  assert.equal(impactAnimationTimeScale(null, { plan: heavy, ageMs: heavy.timing.freezeMs }), 1);
  assert.equal(impactAnimationTimeScale({ plan: light, ageMs: 0 }), 1);
});

test("reduced motion and reduced flash preserve information without displacement", () => {
  const plan = impactFeedbackPlan({ tier: "critical", reducedMotion: true, reducedFlash: true, crowded: true });
  assert.equal(plan.timing.freezeMs, 0);
  assert.equal(plan.force.reaction, 0);
  assert.equal(plan.force.cameraPunch, 0);
  assert.equal(plan.haptic.duration, 0);
  assert.equal(plan.vfx.criticalGraphic, true);
  assert.equal(plan.vfx.criticalBloom, false);
  assert.ok(plan.vfx.flashScale > 0);
  assert.ok(plan.vfx.particleCount >= 1);
});

test("directional target and attacker reactions transfer force in opposite directions", () => {
  const plan = impactFeedbackPlan({ tier: "heavy", angle: 0 });
  const contact = impactReactionTransform(plan, 0), settling = impactReactionTransform(plan, .2), attacker = attackerRecoilTransform(plan, 1);
  assert.ok(contact.x > settling.x, "contact starts at peak force instead of ramping into a delayed push");
  const target = settling;
  assert.ok(target.x > 0);
  assert.ok(attacker.x < 0);
  assert.equal(Math.abs(target.y), 0);
  assert.equal(Math.abs(attacker.y), 0);
  assert.equal(contact.axisRotation, 0);
  assert.ok(contact.scaleX < 1 && contact.scaleY > 1, "contact compresses along the incoming force axis");
});

test("mass curves distinguish quick enemies from brutes and apexes", () => {
  assert.ok(IMPACT_MASS_PROFILES.brute.mass > IMPACT_MASS_PROFILES.hound.mass);
  assert.ok(impactPhaseProgress("hound", "windup", .5) > impactPhaseProgress("brute", "windup", .5));
  assert.ok(impactPhaseProgress("boss", "contact", .5) > impactPhaseProgress("spitter", "contact", .5));
  assert.equal(impactPhaseProgress("boss", "contact", .5, true), .5);
});

test("projectile lifecycle scales trails with speed and supplies birth and terminal states", () => {
  const weaponPlan = { trail: { length: 28, width: 3 } };
  const slow = projectileMotionPlan({ vx: 220, vy: 0, age: .03, life: 2 }, weaponPlan);
  const fast = projectileMotionPlan({ vx: 760, vy: 0, age: .2, life: .08 }, weaponPlan);
  assert.ok(fast.trailLength > slow.trailLength);
  assert.equal(slow.birth, true);
  assert.equal(fast.terminal, true);
  assert.equal(fast.smear, true);
  assert.ok(fast.stretch > 1);
});

test("look bias and secondary motion are bounded and accessibility safe", () => {
  const look = cameraLookBias({ aimAngle: 0, moving: true, speedRatio: 3 });
  assert.equal(look.distance, 48);
  assert.equal(cameraLookBias({ aimAngle: 0, reducedMotion: true }).distance, 0);
  const secondary = secondaryMotionPlan({ turnDelta: Math.PI, speedRatio: 1, recoil: 1, mass: "brute" });
  assert.ok(Math.abs(secondary.shear) <= .18 * IMPACT_MASS_PROFILES.brute.secondaryLag + Number.EPSILON);
  assert.deepEqual(secondaryMotionPlan({ turnDelta: 1, reducedMotion: true }), { rotation: 0, shear: 0, lag: 0 });
});

test("aftermath remains short lived and intensity director preserves high priority impacts", () => {
  const critical = impactFeedbackPlan({ tier: "critical" }), light = impactFeedbackPlan({ tier: "light" });
  const aftermath = aftermathPlan(critical, { radius: 40, material: "metal" });
  assert.ok(aftermath.visible && aftermath.smoke && aftermath.lifetimeMs <= 2000);
  const director = new ImpactIntensityDirector(6);
  director.beginFrame({ crowded: false, density: 1 });
  assert.equal(director.admit(light), true);
  assert.equal(director.admit(light), false);
  assert.equal(director.admit(critical), true);
  const diagnostics = director.diagnostics();
  assert.equal(diagnostics.admitted, 2);
  assert.equal(diagnostics.rejected, 1);
});

test("reduced flash preserves the critical silhouette without bloom", () => {
  const plan = impactFeedbackPlan({ tier: "critical", reducedFlash: true });
  assert.equal(plan.vfx.criticalGraphic, true);
  assert.equal(plan.vfx.criticalBloom, false);
});

test("priority selection is stable regardless of candidate arrival order", () => {
  const director = new ImpactIntensityDirector(8);
  const candidates = [
    { id: "ordinary", plan: impactFeedbackPlan({ tier: "light" }) },
    { id: "critical", plan: impactFeedbackPlan({ tier: "critical" }) },
    { id: "heavy", plan: impactFeedbackPlan({ tier: "heavy" }) },
  ];
  director.beginFrame();
  const forward = selectImpactFeedback(candidates, director).map(({ id }) => id);
  director.beginFrame();
  const reverse = selectImpactFeedback([...candidates].reverse(), director).map(({ id }) => id);
  assert.deepEqual(forward, reverse);
  assert.equal(forward[0], "critical");
});
