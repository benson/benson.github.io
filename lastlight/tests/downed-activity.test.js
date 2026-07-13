import test from "node:test";
import assert from "node:assert/strict";
import {
  DOWNED_ACTIVITY_REGISTRY, DOWNED_ACTIVITY_SCHEMA, DOWNED_ACTIVITY_STATE_SCHEMA,
  advanceDownedBleedout, advanceDownedCrawl, beginDownedActivity, createDownedActivityState,
  downedImpactPenalty, downedInputPermissions, permitsDownedInput, removeDownedActivity,
  triggerDownedSupport, validateDownedActivityRegistry, validateDownedActivityState,
} from "../downed-activity.js";

function begin(state, slot, overrides = {}) {
  return beginDownedActivity(state, { slot, tick: 10, x: slot * 100, y: 0, livingSquadmates: 1, ...overrides }).state;
}
function entry(state, slot = 0) { return state.entries.find((item) => item.slot === slot); }

test("registry freezes the strict v1 simulation contract", () => {
  assert.equal(DOWNED_ACTIVITY_SCHEMA, "lastlight.downed-activity.v1");
  assert.equal(DOWNED_ACTIVITY_STATE_SCHEMA, "lastlight.downed-activity-state.v1");
  assert.equal(validateDownedActivityRegistry(), DOWNED_ACTIVITY_REGISTRY);
  assert.ok(Object.isFrozen(DOWNED_ACTIVITY_REGISTRY));
  assert.ok(Object.isFrozen(DOWNED_ACTIVITY_REGISTRY.crawl));
  assert.ok(Object.isFrozen(DOWNED_ACTIVITY_REGISTRY.permissions.enabled));
  assert.throws(() => validateDownedActivityRegistry({ ...DOWNED_ACTIVITY_REGISTRY, extra: true }), /unexpected fields/);
  assert.throws(() => validateDownedActivityRegistry({ ...DOWNED_ACTIVITY_REGISTRY, crawl: { ...DOWNED_ACTIVITY_REGISTRY.crawl, maxSpeed: 59 } }), /contract mismatch/);
});

test("state is anonymous, canonical, bounded, and recovery-suitable", () => {
  let state = createDownedActivityState(); state = begin(state, 3); state = begin(state, 0); state = begin(state, 2);
  assert.deepEqual(state.entries.map(({ slot }) => slot), [0, 2, 3]);
  assert.doesNotMatch(JSON.stringify(state), /name|callsign|client|room|token/i);
  assert.deepEqual(validateDownedActivityState(structuredClone(state)), state);
  const unordered = structuredClone(state); unordered.entries.reverse(); assert.throws(() => validateDownedActivityState(unordered), /canonical/);
  const privateField = structuredClone(state); privateField.entries[0].name = "Rookie"; assert.throws(() => validateDownedActivityState(privateField), /unexpected fields/);
  const duplicate = structuredClone(state); duplicate.entries[1].slot = 0; assert.throws(() => validateDownedActivityState(duplicate), /canonical/);
  assert.throws(() => begin(state, 4), /slot is invalid/);
});

test("solo or last-living down remains immediate-defeat compatible and feature-off stays legacy", () => {
  const enabled = createDownedActivityState();
  const solo = beginDownedActivity(enabled, { slot: 0, tick: 1, x: 0, y: 0, livingSquadmates: 0 });
  assert.equal(solo.entered, false); assert.equal(solo.immediateDefeat, true); assert.equal(solo.state, enabled);
  const disabled = createDownedActivityState({ enabled: false });
  const legacy = beginDownedActivity(disabled, { slot: 0, tick: 1, x: 0, y: 0, livingSquadmates: 2 });
  assert.equal(legacy.entered, false); assert.equal(legacy.reason, "disabled"); assert.equal(legacy.state.entries.length, 0);
  assert.equal(advanceDownedCrawl(disabled, { slot: 0, tick: 2 }).distance, 0);
  assert.equal(triggerDownedSupport(disabled, { slot: 0, tick: 2 }).accepted, false);
});

test("input permissions allow crawl, pings, support, and camera but suppress combat and participation", () => {
  assert.deepEqual(Object.keys(downedInputPermissions()), DOWNED_ACTIVITY_REGISTRY.actions);
  for (const action of ["move", "ping", "support", "camera"]) assert.equal(permitsDownedInput(action), true);
  for (const action of ["weapon", "abilityE", "ultimateR", "dash", "pickup", "objective", "relay", "selfRevive"]) assert.equal(permitsDownedInput(action), false);
  assert.equal(permitsDownedInput("move", false), false); assert.equal(permitsDownedInput("ping", false), true);
  assert.deepEqual(DOWNED_ACTIVITY_REGISTRY.participation, { supportShielding: true, selfRevive: false, reviveWork: false, objective: false, pickup: false, relay: false });
  assert.throws(() => permitsDownedInput("teleport"), /Unknown/);
});

test("crawl has deterministic acceleration, braking, collision, and world containment", () => {
  let state = begin(createDownedActivityState(), 0, { x: 0, y: 0 });
  const moved = advanceDownedCrawl(state, { slot: 0, tick: 11, inputX: 10, inputY: 0 }); state = moved.state;
  assert.ok(moved.dx > 0); assert.ok(Math.hypot(entry(state).vx, entry(state).vy) <= DOWNED_ACTIVITY_REGISTRY.crawl.maxSpeed);
  const braking = advanceDownedCrawl(state, { slot: 0, tick: 12, inputX: 0, inputY: 0 });
  assert.ok(Math.abs(entry(braking.state).vx) < Math.abs(entry(state).vx));

  state = begin(createDownedActivityState(), 0, { x: 0, y: 0 });
  for (let tick = 11; tick < 200; tick++) state = advanceDownedCrawl(state, { slot: 0, tick, inputX: 1, obstacles: [[45, -100, 20, 200]] }).state;
  assert.ok(entry(state).x <= 14.001, "31-unit crawl radius stops at cover");
  const blocked = advanceDownedCrawl(state, { slot: 0, tick: 201, inputX: 1, obstacles: [[45, -100, 20, 200]] });
  assert.equal(blocked.blockedX, true); assert.equal(entry(blocked.state).vx, 0);

  state = begin(createDownedActivityState(), 0, { x: 55, y: 0 });
  for (let tick = 11; tick < 300; tick++) state = advanceDownedCrawl(state, { slot: 0, tick, inputX: 1, worldHalfWidth: 100, worldHalfHeight: 100 }).state;
  assert.equal(entry(state).x, 60);
});

test("bleedout is exact; contact and projectiles do not execute while hazards accelerate it", () => {
  let state = begin(createDownedActivityState(), 0);
  let result = advanceDownedBleedout(state, { slot: 0, ticks: 1, impactKind: "contact" }); state = result.state;
  assert.equal(result.consumedTicks, 1); assert.equal(entry(state).bleedoutTicksRemaining, 599);
  result = advanceDownedBleedout(state, { slot: 0, ticks: 1, impactKind: "projectile" }); state = result.state;
  assert.equal(result.consumedTicks, 1); assert.equal(downedImpactPenalty("projectile"), 0);
  result = advanceDownedBleedout(state, { slot: 0, ticks: 1, impactKind: "hazard" }); state = result.state;
  assert.equal(result.consumedTicks, 31); assert.equal(downedImpactPenalty("hazard"), 30);
  result = advanceDownedBleedout(state, { slot: 0, ticks: 567 });
  assert.equal(result.expired, true); assert.equal(entry(result.state).bleedoutTicksRemaining, 0);
  assert.throws(() => advanceDownedBleedout(state, { slot: 0, impactKind: "apex" }), /Unknown/);
});

test("support pulse is weak, bounded, canonical, and emits only effective shielding hooks", () => {
  let state = begin(createDownedActivityState(), 2, { x: 0, y: 0 });
  const allies = [
    { slot: 3, x: 20, y: 0, dead: false, downed: false, shield: 0.4, shieldCap: 0.5 },
    { slot: 0, x: 30, y: 0, dead: false, downed: false, shield: 0, shieldCap: 1 },
    { slot: 1, x: 40, y: 0, dead: false, downed: true, shield: 0, shieldCap: 1 },
    { slot: 2, x: 0, y: 0, dead: false, downed: false, shield: 0, shieldCap: 1 },
  ];
  const pulse = triggerDownedSupport(state, { slot: 2, tick: 10, allies }); state = pulse.state;
  assert.equal(pulse.accepted, true);
  assert.deepEqual(pulse.applications, [
    { sourceSlot: 2, targetSlot: 0, shield: 0.25 },
    { sourceSlot: 2, targetSlot: 3, shield: 0.09999999999999998 },
  ]);
  assert.deepEqual(pulse.participationHooks.map(({ kind, sourceSlot, targetSlot }) => ({ kind, sourceSlot, targetSlot })), [
    { kind: "effective-shield", sourceSlot: 2, targetSlot: 0 }, { kind: "effective-shield", sourceSlot: 2, targetSlot: 3 },
  ]);
  assert.ok(pulse.applications.every(({ shield }) => shield <= 0.25));
  assert.equal(triggerDownedSupport(state, { slot: 2, tick: 189, allies }).reason, "cooldown");
  assert.equal(triggerDownedSupport(state, { slot: 2, tick: 190, allies }).accepted, true);
  assert.equal(DOWNED_ACTIVITY_REGISTRY.support.damage, 0); assert.equal(DOWNED_ACTIVITY_REGISTRY.support.healing, 0);
});

test("ineffective support does not consume cooldown and can never target self or downed players", () => {
  let state = begin(createDownedActivityState(), 0, { x: 0, y: 0 });
  const before = entry(state).supportReadyTick;
  const result = triggerDownedSupport(state, { slot: 0, tick: 10, allies: [
    { slot: 0, x: 0, y: 0, dead: false, downed: false, shield: 0, shieldCap: 1 },
    { slot: 1, x: 0, y: 0, dead: false, downed: true, shield: 0, shieldCap: 1 },
    { slot: 2, x: 500, y: 0, dead: false, downed: false, shield: 0, shieldCap: 1 },
  ] });
  assert.equal(result.accepted, false); assert.equal(result.reason, "no-effective-target"); assert.equal(result.state, state); assert.equal(entry(state).supportReadyTick, before);
});

test("removal is idempotent and malformed recovery state is rejected", () => {
  let state = begin(createDownedActivityState(), 1); state = removeDownedActivity(state, 1);
  assert.equal(state.entries.length, 0); assert.equal(removeDownedActivity(state, 1), state);
  const malformed = begin(createDownedActivityState(), 1); malformed.entries[0].bleedoutTicksRemaining = 601;
  assert.throws(() => validateDownedActivityState(malformed), /bleedoutTicksRemaining is invalid/);
  const nan = begin(createDownedActivityState(), 1); nan.entries[0].vx = Number.NaN;
  assert.throws(() => validateDownedActivityState(nan), /vx is invalid/);
});
