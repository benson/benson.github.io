import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPILED_SQUAD_SYNERGIES,
  SQUAD_SYNERGY_REGISTRY,
  SQUAD_SYNERGY_SCHEMA,
  SQUAD_SYNERGY_STATE_SCHEMA,
  activeFormationSlots,
  addSquadSynergyStats,
  compileSquadSynergyRegistry,
  createSquadSynergyState,
  formationDamageMultiplier,
  headingDeltaDegrees,
  qualifiesBreachFollowupRole,
  qualifiesBreachSetupRole,
  qualifiesBreachSource,
  recordBreachControl,
  recordUltimateCast,
  removeSquadSynergySlot,
  resolveBreachFollowup,
  updateFormationPairs,
  validateSquadSynergyRegistry,
  validateSquadSynergyState,
} from "../squad-synergies.js";
import { BALANCE_CONFIG, BALANCE_VERSION } from "../balance-config.js";

const clone = (value) => structuredClone(value);
const movingPlayer = (replaySlot, x, y, overrides = {}) => ({
  replaySlot, x, y, moveVx: 1, moveVy: 0, moveSpeedRatio: 1,
  dead: false, downed: false, ...overrides,
});

test("the registry freezes exactly three ordered, balance-backed squad synergies", () => {
  assert.equal(SQUAD_SYNERGY_REGISTRY.schemaVersion, SQUAD_SYNERGY_SCHEMA);
  assert.equal(SQUAD_SYNERGY_REGISTRY.balanceVersion, BALANCE_VERSION);
  assert.deepEqual(SQUAD_SYNERGY_REGISTRY.entries.map(({ id }) => id), ["breach-window", "ultimate-resonance", "moving-screen"]);
  assert.deepEqual(validateSquadSynergyRegistry(), []);
  assert.equal(Object.isFrozen(SQUAD_SYNERGY_REGISTRY.entries[0].condition.setupRoles), true);
  assert.equal(Object.isFrozen(COMPILED_SQUAD_SYNERGIES), true);
  assert.deepEqual(COMPILED_SQUAD_SYNERGIES.orderedIds, ["breach-window", "ultimate-resonance", "moving-screen"]);
  assert.equal(COMPILED_SQUAD_SYNERGIES.byId["breach-window"].timing.windowTicks, BALANCE_CONFIG.synergies.breachWindow.followupWindowTicks);
  assert.equal(COMPILED_SQUAD_SYNERGIES.byId["ultimate-resonance"].timing.cooldownTicks, BALANCE_CONFIG.synergies.ultimateResonance.teamCooldownTicks);
  assert.equal(COMPILED_SQUAD_SYNERGIES.byId["moving-screen"].effect.multiplier, BALANCE_CONFIG.synergies.movingScreen.directDamageMultiplier);
});

test("strict registry validation rejects unknown fields, order drift, and unsafe mitigation", () => {
  const extra = clone(SQUAD_SYNERGY_REGISTRY); extra.entries[0].surprise = true;
  assert.ok(validateSquadSynergyRegistry(extra).some((error) => error.includes("unexpected or missing fields")));
  assert.throws(() => compileSquadSynergyRegistry(extra), /Invalid squad synergy registry/);
  const reordered = clone(SQUAD_SYNERGY_REGISTRY); reordered.entries.reverse();
  assert.ok(validateSquadSynergyRegistry(reordered).some((error) => error.includes("canonical order")));
  const unsafe = clone(SQUAD_SYNERGY_REGISTRY); unsafe.entries[2].effect.multiplier = 1;
  assert.ok(validateSquadSynergyRegistry(unsafe).some((error) => error.includes("bounded and non-stacking")));
});

test("state is exact, bounded, serializable, and its validators reject schema drift", () => {
  const state = createSquadSynergyState({ slots: [3, 0, 3, 1] });
  assert.equal(state.schema, SQUAD_SYNERGY_STATE_SCHEMA);
  assert.deepEqual(state.stats.map(({ slot }) => slot), [0, 1, 3]);
  assert.deepEqual(validateSquadSynergyState(JSON.parse(JSON.stringify(state))), state);
  const unknown = clone(state); unknown.extra = 1;
  assert.throws(() => validateSquadSynergyState(unknown), /Invalid squad synergy state header/);
  const oversized = clone(state);
  oversized.formationLinks = Array.from({ length: BALANCE_CONFIG.synergies.movingScreen.maxLinks + 1 }, (_, index) => ({
    a: 0, b: 1, active: false, qualifyingTicks: index, failingTicks: 0, lastEvaluatedTick: 0,
  }));
  assert.throws(() => validateSquadSynergyState(oversized), /exceeds bounds/);
});

test("Breach Window requires complementary roles, priority control, a distinct contributor, and eligible damage", () => {
  assert.equal(qualifiesBreachSetupRole("echo"), true);
  assert.equal(qualifiesBreachSetupRole("zuri"), false);
  assert.equal(qualifiesBreachFollowupRole("zuri"), true);
  assert.equal(qualifiesBreachSource("signature", "zuri"), true);
  assert.equal(qualifiesBreachSource("aura", "zuri"), false);
  assert.equal(qualifiesBreachSource("synergy:breach-window", "zuri"), false);

  const initial = createSquadSynergyState({ slots: [0, 1] });
  const initialCopy = clone(initial);
  const short = recordBreachControl(initial, { tick: 10, enemyId: "elite-1", setupSlot: 0, specialistId: "echo", controlTicks: 29, targetKind: "elite" });
  assert.equal(short.accepted, false);
  const armed = recordBreachControl(initial, { tick: 10, enemyId: "elite-1", setupSlot: 0, specialistId: "echo", controlTicks: 30, targetKind: "elite" });
  assert.equal(armed.accepted, true);
  assert.deepEqual(initial, initialCopy, "transition must not mutate its input");
  const samePlayer = resolveBreachFollowup(armed.state, { tick: 11, enemyId: "elite-1", finisherSlot: 0, specialistId: "zuri", sourceId: "signature", actualDamage: 100, level: 10 });
  assert.equal(samePlayer.accepted, false);
  const field = resolveBreachFollowup(armed.state, { tick: 11, enemyId: "elite-1", finisherSlot: 1, specialistId: "zuri", sourceId: "aura", actualDamage: 100, level: 10 });
  assert.equal(field.accepted, false);
  const proc = resolveBreachFollowup(armed.state, { tick: 11, enemyId: "elite-1", finisherSlot: 1, specialistId: "zuri", sourceId: "signature", actualDamage: 100, level: 10 });
  assert.equal(proc.accepted, true);
  assert.equal(proc.proc.damage, 11.5);
  assert.deepEqual(proc.proc, { id: "breach-window", sequence: 2, enemyId: "elite-1", setupSlot: 0, finisherSlot: 1, damage: 11.5, sourceId: "synergy:breach-window" });
  assert.equal(recordBreachControl(proc.state, { tick: 12, enemyId: "elite-1", setupSlot: 0, specialistId: "echo", controlTicks: 30, targetKind: "elite" }).reason, "cooldown");
});

test("Breach Window expires deterministically and enforces its global per-tick proc cap", () => {
  let state = createSquadSynergyState({ slots: [0, 1] });
  for (const enemyId of ["elite-a", "elite-b", "elite-c"]) {
    state = recordBreachControl(state, { tick: 20, enemyId, setupSlot: 0, specialistId: "echo", controlTicks: 30, targetKind: "elite" }).state;
  }
  for (const enemyId of ["elite-a", "elite-b"]) {
    const result = resolveBreachFollowup(state, { tick: 21, enemyId, finisherSlot: 1, specialistId: "zuri", sourceId: "signature", actualDamage: 10, level: 1 });
    assert.equal(result.accepted, true); state = result.state;
  }
  assert.equal(resolveBreachFollowup(state, { tick: 21, enemyId: "elite-c", finisherSlot: 1, specialistId: "zuri", sourceId: "signature", actualDamage: 10, level: 1 }).reason, "tick-cap");
  assert.equal(resolveBreachFollowup(state, { tick: 171, enemyId: "elite-c", finisherSlot: 1, specialistId: "zuri", sourceId: "signature", actualDamage: 10, level: 1 }).reason, "not-armed");
});

test("Ultimate Resonance chains distinct nearby living casters once per cooldown", () => {
  const initial = createSquadSynergyState({ slots: [0, 1, 2] });
  const first = recordUltimateCast(initial, { tick: 100, slot: 0, x: 0, y: 0, livingSlots: [0, 1, 2] });
  assert.equal(first.accepted, true); assert.equal(first.triggered, false);
  const same = recordUltimateCast(first.state, { tick: 110, slot: 0, x: 0, y: 0, livingSlots: [0, 1, 2] });
  assert.equal(same.triggered, false); assert.deepEqual(same.state.ultimateWindow.map(({ slot }) => slot), [0]);
  const far = recordUltimateCast(same.state, { tick: 120, slot: 1, x: 701, y: 0, livingSlots: [0, 1, 2] });
  assert.equal(far.triggered, false);
  const chain = recordUltimateCast(far.state, { tick: 130, slot: 2, x: 699, y: 0, livingSlots: [0, 1, 2] });
  assert.equal(chain.triggered, true);
  assert.deepEqual(chain.pulse.contributorSlots, [1, 2]);
  assert.equal(chain.pulse.radius, 650);
  assert.equal(chain.pulse.shieldMaxHealth, 0.15);
  assert.equal(recordUltimateCast(chain.state, { tick: 131, slot: 0, x: 0, y: 0, livingSlots: [0, 1, 2] }).reason, "cooldown");
});

test("Moving Screen uses enter/leave hysteresis and one non-stacking mitigation multiplier", () => {
  let state = createSquadSynergyState({ slots: [0, 1] });
  const players = [movingPlayer(0, 0, 0), movingPlayer(1, 200, 0)];
  for (let tick = 6; tick <= 42; tick += 6) {
    const update = updateFormationPairs(state, players, tick); state = update.state;
    assert.deepEqual(update.transitions, []);
  }
  const enter = updateFormationPairs(state, players, 48); state = enter.state;
  assert.deepEqual(enter.transitions, [{ id: "moving-screen", type: "enter", slots: [0, 1], tick: 48 }]);
  assert.deepEqual(activeFormationSlots(state), [0, 1]);
  assert.equal(formationDamageMultiplier(state, 0), 0.85);
  assert.equal(formationDamageMultiplier(state, 2), 1);
  assert.equal(headingDeltaDegrees(players[0], movingPlayer(1, 0, 0, { moveVx: 0, moveVy: 1 })), 90);

  const failed = [players[0], movingPlayer(1, 400, 0)];
  for (let tick = 54; tick <= 66; tick += 6) state = updateFormationPairs(state, failed, tick).state;
  const leave = updateFormationPairs(state, failed, 72); state = leave.state;
  assert.deepEqual(leave.transitions, [{ id: "moving-screen", type: "leave", slots: [0, 1], tick: 72 }]);
  assert.deepEqual(activeFormationSlots(state), []);
});

test("slot removal immediately leaves active formations, drops pending casts, and preserves stats and breach attribution", () => {
  let state = createSquadSynergyState({ slots: [0, 1] });
  state = recordBreachControl(state, { tick: 1, enemyId: "boss", setupSlot: 0, specialistId: "echo", controlTicks: 30, targetKind: "apex" }).state;
  state = recordUltimateCast(state, { tick: 2, slot: 0, x: 0, y: 0, livingSlots: [0, 1] }).state;
  for (let tick = 6; tick <= 48; tick += 6) state = updateFormationPairs(state, [movingPlayer(0, 0, 0), movingPlayer(1, 200, 0)], tick).state;
  state = addSquadSynergyStats(state, 0, { triggers: 1, damage: 4 });
  const snapshot = clone(state), removed = removeSquadSynergySlot(state, 0, 49);
  assert.deepEqual(state, snapshot, "slot removal must not mutate its input");
  assert.deepEqual(removed.transitions, [{ id: "moving-screen", type: "leave", slots: [0, 1], tick: 49 }]);
  assert.deepEqual(removed.state.formationLinks, []);
  assert.deepEqual(removed.state.ultimateWindow, []);
  assert.deepEqual(removed.state.breachTargets, snapshot.breachTargets);
  assert.deepEqual(removed.state.stats, snapshot.stats);
});

test("synergy attribution stats are additive, pure, and reject negative deltas", () => {
  const state = createSquadSynergyState({ slots: [0] });
  const next = addSquadSynergyStats(state, 0, { triggers: 1, assists: 2, damage: 3.5, shielding: 4, mitigated: 5, formationTicks: 6, ultimateChains: 1 });
  assert.deepEqual(state.stats[0], { slot: 0, triggers: 0, assists: 0, damage: 0, shielding: 0, mitigated: 0, formationTicks: 0, ultimateChains: 0 });
  assert.deepEqual(next.stats[0], { slot: 0, triggers: 1, assists: 2, damage: 3.5, shielding: 4, mitigated: 5, formationTicks: 6, ultimateChains: 1 });
  assert.throws(() => addSquadSynergyStats(next, 0, { damage: -1 }), /invalid/);
});
