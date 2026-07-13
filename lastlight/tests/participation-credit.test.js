import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTICIPATION_REGISTRY, PARTICIPATION_SCHEMA, PARTICIPATION_STATE_SCHEMA,
  addEffectiveHealing, addMitigationPrevented, createParticipationState, grantAttributedShield,
  markTargetSupport, recordObjectiveWork, recordReviveWork, recordTargetControl, recordTargetDamage,
  reduceAttributedShield, removeObjectiveCredit, removeReviveCredit, removeTargetCredit,
  settleObjectiveCredit, settleReviveCredit, settleTargetCredit, validateParticipationRegistry,
  validateParticipationState,
} from "../participation-credit.js";

const stat = (state, slot, field) => state.slots.find((entry) => entry.slot === slot)?.[field] || 0;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("registry is immutable, strict, and versioned", () => {
  assert.equal(PARTICIPATION_SCHEMA, "lastlight.participation.v1");
  assert.equal(PARTICIPATION_STATE_SCHEMA, "lastlight.participation-state.v1");
  assert.equal(validateParticipationRegistry(), PARTICIPATION_REGISTRY);
  assert.ok(Object.isFrozen(PARTICIPATION_REGISTRY));
  assert.ok(Object.isFrozen(PARTICIPATION_REGISTRY.damageAssist));
  assert.throws(() => validateParticipationRegistry({ ...PARTICIPATION_REGISTRY, extra: true }), /unexpected fields/);
  assert.throws(() => validateParticipationRegistry({ ...PARTICIPATION_REGISTRY, damageAssist: { ...PARTICIPATION_REGISTRY.damageAssist, recencyTicks: 601 } }), /contract mismatch/);
});

test("state creation canonicalizes anonymous replay slots and validates exact keys", () => {
  const state = createParticipationState({ slots: [3, 1, 3, 0] });
  assert.deepEqual(state.slots.map(({ slot }) => slot), [0, 1, 3]);
  assert.equal(state.schema, PARTICIPATION_STATE_SCHEMA);
  assert.equal(state.registryVersion, PARTICIPATION_SCHEMA);
  assert.doesNotThrow(() => validateParticipationState(state));
  assert.throws(() => validateParticipationState({ ...state, callsign: "private" }), /unexpected fields/);
  const malformed = structuredClone(state); malformed.slots.reverse();
  assert.throws(() => validateParticipationState(malformed), /canonical/);
});

test("effective healing and mitigation credit only conserved applied deltas", () => {
  const initial = createParticipationState({ slots: [0, 1, 2] });
  const healed = addEffectiveHealing(initial, { sourceSlot: 1, amount: 2.75 });
  assert.equal(stat(initial, 1, "effectiveHealing"), 0);
  assert.equal(stat(healed, 1, "effectiveHealing"), 2.75);
  const mitigated = addMitigationPrevented(healed, { providers: [2, 0, 2], amount: 3 });
  assert.equal(stat(mitigated, 0, "mitigationPrevented"), 1.5);
  assert.equal(stat(mitigated, 2, "mitigationPrevented"), 1.5);
  assert.equal(stat(mitigated, 1, "mitigationPrevented"), 0);
  assert.equal(addEffectiveHealing(mitigated, { sourceSlot: 0, amount: 0 }), mitigated);
});

test("shield grants and absorption allocate proportionally and conserve exact reduction", () => {
  let state = createParticipationState({ slots: [0, 1, 2] });
  state = grantAttributedShield(state, { sourceSlot: 0, targetSlot: 2, amount: 6 });
  state = grantAttributedShield(state, { sourceSlot: 1, targetSlot: 2, amount: 3 });
  state = grantAttributedShield(state, { sourceSlot: null, targetSlot: 2, amount: 1 });
  assert.equal(stat(state, 0, "effectiveShielding"), 6);
  assert.equal(stat(state, 1, "effectiveShielding"), 3);
  const blocked = reduceAttributedShield(state, { targetSlot: 2, amount: 5, prevented: true });
  close(blocked.consumed, 5);
  close(blocked.allocations.reduce((sum, entry) => sum + entry.amount, 0), 5);
  close(stat(blocked.state, 0, "shieldDamagePrevented"), 3);
  close(stat(blocked.state, 1, "shieldDamagePrevented"), 1.5);
  close(blocked.state.shieldPools[0].sources.reduce((sum, entry) => sum + entry.amount, 0), 5);
  const decayed = reduceAttributedShield(blocked.state, { targetSlot: 2, amount: 99, prevented: false });
  close(decayed.consumed, 5);
  assert.equal(decayed.state.shieldPools.length, 0);
  close(stat(decayed.state, 0, "shieldDamagePrevented"), 3);
  close(stat(decayed.state, 1, "shieldDamagePrevented"), 1.5);
});

test("target settlement applies damage/control thresholds, recency, and priority participation once", () => {
  let state = createParticipationState({ slots: [0, 1, 2, 3] });
  state = recordTargetDamage(state, { enemyId: "elite-1", kind: "elite", maxHp: 200, slot: 0, damage: 10, tick: 100 });
  state = recordTargetControl(state, { enemyId: "elite-1", kind: "elite", maxHp: 200, slot: 1, extensionTicks: 30, tick: 110 });
  state = markTargetSupport(state, { enemyId: "elite-1", kind: "elite", maxHp: 200, slot: 2 });
  state = recordTargetDamage(state, { enemyId: "elite-1", kind: "elite", maxHp: 200, slot: 3, damage: 100, tick: 120 });
  const settled = settleTargetCredit(state, { enemyId: "elite-1", killerSlot: 3, tick: 200 });
  assert.equal(stat(settled.state, 0, "damageAssists"), 1);
  assert.equal(stat(settled.state, 1, "controlAssists"), 1);
  assert.deepEqual([0, 1, 2, 3].map((slot) => stat(settled.state, slot, "eliteParticipations")), [1, 1, 1, 1]);
  assert.equal(settled.state.targetCredits.length, 0);
  const duplicate = settleTargetCredit(settled.state, { enemyId: "elite-1", killerSlot: 3, tick: 201 });
  assert.equal(duplicate.state, settled.state);
  assert.deepEqual(duplicate.awards, []);
});

test("damage/control assist recency expires while apex participation retains accumulated work", () => {
  let state = createParticipationState({ slots: [0, 1] });
  state = recordTargetDamage(state, { enemyId: "apex-1", kind: "apex", maxHp: 1000, slot: 0, damage: 20, tick: 1 });
  state = recordTargetControl(state, { enemyId: "apex-1", kind: "apex", maxHp: 1000, slot: 0, extensionTicks: 30, tick: 1 });
  state = recordTargetDamage(state, { enemyId: "apex-1", kind: "apex", maxHp: 1000, slot: 1, damage: 1000, tick: 700 });
  const settled = settleTargetCredit(state, { enemyId: "apex-1", killerSlot: 1, tick: 700 });
  assert.equal(stat(settled.state, 0, "damageAssists"), 0);
  assert.equal(stat(settled.state, 0, "controlAssists"), 0);
  assert.equal(stat(settled.state, 0, "apexParticipations"), 1);
  assert.equal(stat(settled.state, 1, "apexParticipations"), 1);
});

test("revive settlement requires both 30 ticks and ten percent of contributor work", () => {
  let state = createParticipationState({ slots: [0, 1, 2, 3] });
  state = recordReviveWork(state, { downedSlot: 3, contributorSlot: 0, beganTick: 100, ticks: 200 });
  state = recordReviveWork(state, { downedSlot: 3, contributorSlot: 1, beganTick: 100, ticks: 30 });
  state = recordReviveWork(state, { downedSlot: 3, contributorSlot: 2, beganTick: 100, ticks: 20 });
  const result = settleReviveCredit(state, 3);
  assert.deepEqual(result.creditedSlots, [0, 1]);
  assert.equal(stat(result.state, 0, "revives"), 1);
  assert.equal(stat(result.state, 1, "revives"), 1);
  assert.equal(stat(result.state, 2, "revives"), 0);
  assert.equal(stat(result.state, 2, "reviveTicks"), 20);
  assert.equal(result.state.reviveCredits.length, 0);
});

test("objective zone and relay settlement use frozen work thresholds", () => {
  let state = createParticipationState({ slots: [0, 1, 2] });
  state = recordObjectiveWork(state, { objectiveId: "zone-1", kind: "zone", beganTick: 60, slot: 0, presenceTicks: 270 });
  state = recordObjectiveWork(state, { objectiveId: "zone-1", kind: "zone", beganTick: 60, slot: 1, presenceTicks: 30 });
  state = recordObjectiveWork(state, { objectiveId: "zone-1", kind: "zone", beganTick: 60, slot: 2, presenceTicks: 29 });
  let settled = settleObjectiveCredit(state, "zone-1");
  assert.deepEqual(settled.creditedSlots, [0]);
  state = settled.state;
  state = recordObjectiveWork(state, { objectiveId: "ball-1", kind: "relay-ball", beganTick: 120, routeDistance: 1000, slot: 0, movement: 49.9 });
  state = recordObjectiveWork(state, { objectiveId: "ball-1", kind: "relay-ball", beganTick: 120, routeDistance: 1000, slot: 1, movement: 50 });
  settled = settleObjectiveCredit(state, "ball-1");
  assert.deepEqual(settled.creditedSlots, [1]);
  assert.equal(stat(settled.state, 0, "objectiveMovement"), 49.9);
  assert.equal(stat(settled.state, 1, "objectiveMovement"), 50);
});

test("remove helpers cancel ledgers without awarding completion", () => {
  let state = createParticipationState({ slots: [0, 1] });
  state = recordTargetDamage(state, { enemyId: "mob-1", kind: "normal", maxHp: 10, slot: 0, damage: 1, tick: 1 });
  state = recordReviveWork(state, { downedSlot: 1, contributorSlot: 0, beganTick: 1, ticks: 60 });
  state = recordObjectiveWork(state, { objectiveId: "zone-1", kind: "zone", beganTick: 1, slot: 0, presenceTicks: 60 });
  state = removeTargetCredit(state, "mob-1"); state = removeReviveCredit(state, 1); state = removeObjectiveCredit(state, "zone-1");
  assert.equal(state.targetCredits.length, 0); assert.equal(state.reviveCredits.length, 0); assert.equal(state.objectiveCredits.length, 0);
  assert.equal(stat(state, 0, "damageAssists"), 0); assert.equal(stat(state, 0, "revives"), 0); assert.equal(stat(state, 0, "objectiveCompletions"), 0);
});

test("validators reject bounds, malformed sources, and unsafe numbers", () => {
  const state = createParticipationState({ slots: [0] });
  const badSource = structuredClone(state); badSource.shieldPools = [{ targetSlot: 0, sources: [{ sourceSlot: 9, amount: 1 }] }];
  assert.throws(() => validateParticipationState(badSource), /slot is invalid/);
  const duplicate = structuredClone(state); duplicate.slots.push(structuredClone(duplicate.slots[0]));
  assert.throws(() => validateParticipationState(duplicate), /canonical/);
  assert.throws(() => addEffectiveHealing(state, { sourceSlot: 0, amount: Number.NaN }), /amount is invalid/);
  let capped = state;
  for (let index = 0; index < 320; index++) capped = recordTargetDamage(capped, { enemyId: `m-${String(index).padStart(3, "0")}`, kind: "normal", maxHp: 10, slot: 0, damage: 1, tick: index });
  assert.throws(() => recordTargetDamage(capped, { enemyId: "m-overflow", kind: "normal", maxHp: 10, slot: 0, damage: 1, tick: 321 }), /target cap/);
});
