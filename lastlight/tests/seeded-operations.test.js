import test from "node:test";
import assert from "node:assert/strict";
import {
  SEEDED_OPERATION_MAX_RECORDS, SEEDED_OPERATION_SCHEMA, SEEDED_OPERATION_STORAGE_SCHEMA,
  emptySeededOperationRecords, normalizeSeededOperationRecords, recordSeededOperationResult,
  seededOperationDescriptor, seededOperationFor, seededOperationFromId, seededOperationTelemetry,
  validateSeededOperation,
} from "../seeded-operations.js";
import { Simulation } from "../engine.js";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { gameplayFeatureContract } from "../feature-config.js";
import { createSquadRunReport, validateSquadRunReport } from "../run-archive.js";
import { ReplayRecorder, hashSimulationState, validateReplay } from "../replay.js";
import { createGameReplayAdapters } from "../replay-game-adapters.js";

function report(operation, patch = {}) {
  return {
    map: operation.map,
    difficulty: operation.difficulty,
    outcome: "won",
    elapsed: operation.duration + 30,
    squadKills: 420,
    seededOperation: seededOperationDescriptor(operation),
    ...patch,
  };
}

test("daily and weekly schedules use exact UTC boundaries and deterministic contracts", () => {
  const before = new Date("2026-07-13T23:59:59.999Z"), after = new Date("2026-07-14T00:00:00.000Z");
  const daily = seededOperationFor("daily", before), nextDaily = seededOperationFor("daily", after);
  const weekly = seededOperationFor("weekly", before), nextWeekly = seededOperationFor("weekly", new Date("2026-07-20T00:00:00Z"));
  assert.equal(daily.id, "daily:2026-07-13");
  assert.equal(nextDaily.id, "daily:2026-07-14");
  assert.equal(weekly.id, "weekly:2026-07-13");
  assert.equal(nextWeekly.id, "weekly:2026-07-20");
  assert.deepEqual(daily, seededOperationFromId(daily.id));
  assert.equal(daily.schema, SEEDED_OPERATION_SCHEMA);
  assert.match(daily.seed, /^[0-9a-f]{32}$/);
  assert.match(daily.configHash, /^[0-9a-f]{16}$/);
  assert.ok(Object.isFrozen(daily));
  assert.equal(daily.reward.gameplayPower, false);
  assert.equal(new Set(daily.challengeIds).size, daily.challengeIds.length);
});

test("schedule validation fails closed on boundary, seed, config, and arbitrary-field tampering", () => {
  const operation = seededOperationFromId("weekly:2026-07-13");
  for (const patch of [
    { seed: "0000000000000000" },
    { map: "warehouse" === operation.map ? "lab" : "warehouse" },
    { windowEnd: "2026-07-21T00:00:00.000Z" },
    { challengeIds: [] },
    { arbitrary: "identity" },
  ]) assert.throws(() => validateSeededOperation({ ...operation, ...patch }));
  assert.throws(() => seededOperationFromId("weekly:2026-07-14"));
});

test("terminal results keep only deterministic local bests and completion rewards", () => {
  const operation = seededOperationFromId("daily:2026-07-13");
  const initial = emptySeededOperationRecords();
  const first = recordSeededOperationResult(initial, report(operation, { outcome: "lost", elapsed: 210, squadKills: 200 }));
  assert.equal(first.changed, true);
  assert.equal(first.record.completed, false);
  assert.equal(first.reward, null);
  const duplicate = recordSeededOperationResult(first.state, report(operation, { outcome: "lost", elapsed: 210, squadKills: 200 }));
  assert.equal(duplicate.changed, false);
  const win = recordSeededOperationResult(first.state, report(operation, { elapsed: 260, squadKills: 350 }));
  assert.equal(win.changed, true);
  assert.equal(win.record.completed, true);
  assert.equal(win.reward.gameplayPower, false);
  const worseWin = recordSeededOperationResult(win.state, report(operation, { elapsed: 900, squadKills: 1 }));
  assert.equal(worseWin.changed, false);
});

test("malformed local records are isolated and storage stays bounded", () => {
  const records = [];
  for (let index = 0; index < SEEDED_OPERATION_MAX_RECORDS + 12; index++) {
    const day = new Date(Date.UTC(2026, 0, 1 + index));
    const operation = seededOperationFor("daily", day);
    records.push({ id: operation.id, kind: operation.kind, configHash: operation.configHash, completed: false, best: { outcome: "lost", score: index, elapsed: 10, squadKills: 0 } });
  }
  records.unshift({ id: "daily:not-a-date", arbitrary: "callsign" });
  const normalized = normalizeSeededOperationRecords({ schema: SEEDED_OPERATION_STORAGE_SCHEMA, records });
  assert.equal(normalized.records.length, SEEDED_OPERATION_MAX_RECORDS);
  assert.ok(normalized.records.every((item) => !Object.hasOwn(item, "arbitrary")));
});

test("telemetry exposes only allowlisted comparison bands without schedule identity or seed", () => {
  const operation = seededOperationFromId("weekly:2026-07-13");
  const telemetry = seededOperationTelemetry(report(operation));
  assert.deepEqual(Object.keys(telemetry).sort(), ["completed", "difficulty", "kind", "map", "outcome", "scoreBand"]);
  const serialized = JSON.stringify(telemetry);
  for (const forbidden of [operation.id, operation.seed, operation.configHash, "callsign", "room", "slot"]) assert.equal(serialized.includes(forbidden), false);
});

test("active contracts survive authoritative snapshots and recovery while off-path state stays absent", () => {
  const operation = seededOperationFromId("daily:2026-07-13"), features = gameplayFeatureContract();
  const config = { map: operation.map, difficulty: operation.difficulty, duration: operation.duration, seededOperation: operation, players: [{ id: "solo", name: "Rookie", specialist: "zuri", replaySlot: 0 }], features };
  const sim = new Simulation(config, { seed: operation.seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  assert.deepEqual(sim.snapshot().seededOperation, operation);
  const recovered = Simulation.fromRecoveryState(sim.exportRecoveryState());
  assert.deepEqual(recovered.seededOperation, operation);
  assert.deepEqual(recovered.deterministicState(), sim.deterministicState());
  sim.stage = "won";
  const report = createSquadRunReport(sim, { build: "2026.07.13.18" });
  assert.doesNotThrow(() => validateSquadRunReport(report));
  assert.deepEqual(report.seededOperation, seededOperationDescriptor(operation));

  const standard = new Simulation({ map: operation.map, difficulty: operation.difficulty, duration: operation.duration, players: config.players, features }, { seed: "1".repeat(32), balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  assert.equal(Object.hasOwn(standard.snapshot(), "seededOperation"), false);
  assert.equal(Object.hasOwn(standard.deterministicState(), "seededOperation"), false);
});

test("active contracts replay from the signed schedule and reject schedule tampering", () => {
  const operation = seededOperationFromId("weekly:2026-07-13"), features = gameplayFeatureContract();
  const run = { map: operation.map, difficulty: operation.difficulty, duration: operation.duration, seededOperation: operation };
  const source = new Simulation({ ...run, players: [{ id: "source", name: "Source", specialist: "zuri", replaySlot: 0 }], features }, { seed: operation.seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  const recorder = new ReplayRecorder({
    build: "2026.07.13.18", balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH,
    featureConfigVersion: features.configVersion, gameplayVersion: features.gameplayVersion,
    objectiveEvents: features.objectiveEvents, squadSynergies: features.squadSynergies,
    sharedParticipationCredit: features.sharedParticipationCredit, downedActivity: features.downedActivity,
    joinInProgressNormalization: features.joinInProgressNormalization, squadEnemyDirector: features.squadEnemyDirector,
    mapMechanics: features.mapMechanics, campaignMutations: features.campaignMutations,
    specialistMastery: features.specialistMastery, rareDiscoveries: features.rareDiscoveries,
    registryVersion: features.registryVersion, rng: "xoshiro128ss-v1", seed: operation.seed, run,
  });
  recorder.registerPlayer("source", "zuri", { slot: 0, initial: true });
  recorder.addCheckpoint(0, hashSimulationState(source));
  const replay = recorder.finalize(0, hashSimulationState(source));
  assert.doesNotThrow(() => validateReplay(replay));
  const replayed = createGameReplayAdapters().createSimulation(replay);
  assert.deepEqual(replayed.seededOperation, operation);
  assert.equal(hashSimulationState(replayed), replay.finalHash);

  const tampered = structuredClone(replay);
  tampered.run.seededOperation.configHash = "0".repeat(16);
  assert.throws(() => createGameReplayAdapters().createSimulation(tampered), /schedule/);
});
