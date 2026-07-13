import test from "node:test";
import assert from "node:assert/strict";
import {
  SQUAD_DIRECTOR_VERSION, createSquadDirectorState, planSquadFormation,
  squadDirectorContext, validateSquadDirectorState,
} from "../enemy-director.js";
import { BALANCE_CONFIG } from "../balance-config.js";

const SEED = "0123456789abcdeffedcba9876543210";
const weights = BALANCE_CONFIG.enemyIdentity.spawnPhases.at(-1).weights;
const archetypes = BALANCE_CONFIG.enemyIdentity.archetypes;
const players = (count, spread = 80) => Array.from({ length: count }, (_, replaySlot) => ({ id: `p${replaySlot}`, replaySlot, x: replaySlot * spread, y: replaySlot % 2 * 40, dead: false, downed: false }));
const plan = (overrides = {}) => planSquadFormation({ seed: SEED, state: createSquadDirectorState(), tick: 2_000, progress: .75, players: players(4), phaseWeights: weights, archetypes, ...overrides });

test("director state is strict, bounded, immutable, and versioned", () => {
  const state = createSquadDirectorState();
  assert.equal(state.version, SQUAD_DIRECTOR_VERSION); assert.equal(Object.isFrozen(state.metrics), true);
  assert.throws(() => validateSquadDirectorState({ ...state, token: "secret" }), /fields mismatch/);
  assert.throws(() => validateSquadDirectorState({ ...state, sequence: -1 }), /sequence/);
});

test("disabled and solo contexts preserve the legacy path without a decision", () => {
  assert.equal(plan({ state: createSquadDirectorState(false) }).decision, null);
  assert.equal(plan({ players: players(1) }).decision, null);
});

test("the same anonymous squad facts and sequence produce an exact formation", () => {
  const left = plan(), right = plan();
  assert.deepEqual(left, right); assert.equal(left.decision.units.length, 4);
  assert.ok(left.decision.units.every((unit) => weights[unit.type] > 0));
});

test("squad topology changes approach and objective pressure without identity", () => {
  const compact = plan({ players: players(3, 40) }).decision;
  const split = plan({ players: players(3, 700) }).decision;
  const objective = plan({ state: { ...createSquadDirectorState(), sequence: 2 }, players: players(3), objective: { x: 400, y: -200, kind: "uplink" } }).decision;
  assert.equal(compact.approach, "pincer"); assert.equal(split.approach, "split"); assert.equal(objective.approach, "objective");
  assert.deepEqual(Object.keys(squadDirectorContext(players(2))), ["standing", "squadSize", "centroid", "spread", "objective"]);
});

test("formations consume a caller-provided bounded population budget", () => {
  assert.equal(plan({ maxSize: 2 }).decision.units.length, 2);
  assert.equal(plan({ maxSize: 99 }).decision.units.length, 4);
  assert.equal(plan({ eliteEscort: true, maxSize: 3 }).state.metrics.eliteEscorts, 1);
});
