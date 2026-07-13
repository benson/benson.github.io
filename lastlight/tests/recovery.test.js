import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract } from "../feature-config.js";
import { ReplayRecorder, hashSimulationState } from "../replay.js";
import { RNG_ALGORITHM } from "../rng.js";
import {
  RECOVERY_MAX_AGE_MS, RECOVERY_STORAGE_KEY, clearRunRecovery, createRunRecovery,
  loadRunRecovery, runtimeRecoveryIdentity, saveRunRecovery, validateRunRecovery,
} from "../recovery.js";

const BUILD = "2026.07.11.4";
const SEED = "0123456789abcdef0123456789abcdef";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), values };
}

function simulation() {
  return new Simulation({
    map: "warehouse", difficulty: "story", duration: 240,
    players: [{ id: "relay-secret", name: "Private Callsign", specialist: "zuri", replaySlot: 0, resumeToken: "a".repeat(24) }],
    features: gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG),
  }, { seed: SEED, features: gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG) });
}

test("simulation recovery is exact, anonymous, and continues deterministically", () => {
  const original = simulation();
  original.setInput("relay-secret", { x: .7, y: -.2, aim: 1.7, autoAim: true });
  for (let tick = 0; tick < 180; tick++) original.update(1 / 60);
  original.projectiles.push({ id: original.nextGameplayId("shot"), owner: "relay-secret", x: 1, y: 2, radius: 3, life: 1, hit: new Set(["enemy-1"]) });

  const exported = original.exportRecoveryState();
  const json = JSON.stringify(exported);
  assert.doesNotMatch(json, /Private Callsign|relay-secret|aaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.match(json, /slot-0/);

  const restored = Simulation.fromRecoveryState(JSON.parse(json));
  assert.equal(restored.players[0].name, "Specialist 1");
  assert.equal(restored.players[0].reconnectKey, "");
  assert.ok(restored.projectiles.at(-1).hit instanceof Set);
  assert.equal(hashSimulationState(restored), hashSimulationState(original));

  original.setInput("relay-secret", { x: -.4, y: .6, aim: .2, autoAim: false });
  restored.setInput("slot-0", { x: -.4, y: .6, aim: .2, autoAim: false });
  for (let tick = 0; tick < 120; tick++) { original.update(1 / 60); restored.update(1 / 60); }
  assert.equal(hashSimulationState(restored), hashSimulationState(original));
});

test("draft budgets, revisions, offers, and banishes recover exactly and reject corruption", () => {
  const original = simulation(); original.beginUpgradeChoice();
  original.draftAction("relay-secret", { type: "reroll", round: 1, revision: 0 });
  const choice = original.pendingChoices["relay-secret"].find(({ kind }) => kind === "weapon" || kind === "passive");
  original.draftAction("relay-secret", { type: "banish", choiceId: choice.id, round: 1, revision: 1 });
  const exported = original.exportRecoveryState(), restored = Simulation.fromRecoveryState(structuredClone(exported));
  assert.deepEqual(restored.players[0].draft, original.players[0].draft);
  assert.deepEqual(restored.pendingChoices["slot-0"], original.pendingChoices["relay-secret"]);
  assert.equal(hashSimulationState(restored), hashSimulationState(original));
  const corrupt = structuredClone(exported); corrupt.players[0].draft.rerolls = 99;
  assert.throws(() => Simulation.fromRecoveryState(corrupt), /draft rerolls/);
  const oversized = structuredClone(exported); oversized.players[0].draft.banished = ["weapon:uwu", "weapon:mines", "weapon:drone"];
  assert.throws(() => Simulation.fromRecoveryState(oversized), /banished/);
});

test("replay drafts resume without storing transient player identity", () => {
  const sim = simulation();
  const recorder = new ReplayRecorder({
    build: BUILD, balanceVersion: sim.balanceVersion, balanceHash: sim.balanceHash,
    featureConfigVersion: DEFAULT_RUNTIME_CONFIG.configVersion, gameplayVersion: sim.gameplayVersion,
    objectiveEvents: sim.objectiveEvents, rng: RNG_ALGORITHM, seed: SEED,
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("relay-secret", "zuri", { slot: 0, initial: true });
  recorder.recordInput("relay-secret", 1, { x: 1, y: 0, aim: 0, autoAim: true });
  recorder.addCheckpoint(0, hashSimulationState(sim));
  const draft = recorder.exportDraft(2);
  assert.doesNotMatch(JSON.stringify(draft), /relay-secret|Private Callsign/);

  const resumed = ReplayRecorder.fromDraft(JSON.parse(JSON.stringify(draft)), [{ id: "slot-0", specialist: "zuri", replaySlot: 0 }]);
  resumed.recordInput("slot-0", 3, { x: 0, y: 1, aim: 1, autoAim: true });
  const replay = resumed.finalize(3, hashSimulationState(sim));
  assert.equal(replay.commands.length, 2);
  assert.deepEqual(replay.roster, [{ slot: 0, specialist: "zuri" }]);
});

test("local recovery enforces age, runtime identity, privacy, and corruption cleanup", () => {
  const now = 1_800_000_000_000;
  const sim = simulation();
  const runtime = runtimeRecoveryIdentity(DEFAULT_RUNTIME_CONFIG);
  const checkpoint = createRunRecovery({ build: BUILD, runtime, source: "solo", localSlot: 0, simulation: sim.exportRecoveryState(), savedAt: now });
  const storage = memoryStorage();
  saveRunRecovery(storage, checkpoint);
  assert.equal(loadRunRecovery(storage, { build: BUILD, runtime, now: now + 1_000 }).localSlot, 0);
  assert.throws(() => validateRunRecovery(checkpoint, { build: "other", runtime, now }), /build mismatch/);
  assert.throws(() => validateRunRecovery(checkpoint, { build: BUILD, runtime: { ...runtime, objectiveEvents: false }, now }), /configuration mismatch/);
  assert.throws(() => validateRunRecovery({ ...checkpoint, roomCode: "SECRET" }, { build: BUILD, runtime, now }), /unexpected fields/);
  assert.throws(() => validateRunRecovery({ ...checkpoint, expiresAt: now + RECOVERY_MAX_AGE_MS, simulation: { ...checkpoint.simulation, resumeToken: "secret" } }, { build: BUILD, runtime, now }), /not permitted/);

  storage.setItem(RECOVERY_STORAGE_KEY, "{broken");
  assert.equal(loadRunRecovery(storage, { build: BUILD, runtime, now }), null);
  assert.equal(storage.getItem(RECOVERY_STORAGE_KEY), null);
  saveRunRecovery(storage, checkpoint); clearRunRecovery(storage);
  assert.equal(storage.getItem(RECOVERY_STORAGE_KEY), null);
});
