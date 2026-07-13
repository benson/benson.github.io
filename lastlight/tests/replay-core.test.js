import test from "node:test";
import assert from "node:assert/strict";
import {
  REPLAY_SCHEMA, REPLAY_STEP_HZ, ReplayDriver, ReplayRecorder, canonicalStringify,
  canonicalSimulationState, dequantizeReplayInput, fnv1a64, hashCanonicalState, hashSimulationState,
  quantizeReplayInput, validateReplay,
} from "../replay.js";
import { Simulation } from "../engine.js";

const base = () => ({
  schema: REPLAY_SCHEMA,
  build: "2026.07.11.3",
  balance: { version: "2026.07.11-baseline.1", hash: "fnv1a32:7e33be79" },
  features: { configVersion: "release-2026.07.11.4", gameplayVersion: "events-v1", objectiveEvents: true },
  engine: { stepHz: REPLAY_STEP_HZ, rng: "xoshiro128ss-v1" },
  seed: "0123456789abcdef0123456789abcdef",
  run: { map: "warehouse", difficulty: "story", duration: 240 },
  roster: [{ slot: 0, specialist: "zuri" }],
  commands: [[0, 0, "i", 0, 127, 0, 0, 1]],
  checkpoints: [[0, "0000000000000000"]],
  finalTick: 0,
  finalHash: "0000000000000000",
});

test("canonical JSON is key-order independent and preserves array order", () => {
  assert.equal(canonicalStringify({ b: 2, a: { d: 4, c: 3 } }), canonicalStringify({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(canonicalStringify([1, 2]), canonicalStringify([2, 1]));
  assert.equal(fnv1a64("hello"), "a430d84680aabd0b");
  assert.equal(hashCanonicalState({ x: -0, y: 1.0000001 }), hashCanonicalState({ y: 1, x: 0 }));
});

test("input quantization is bounded, normalized, and round-trippable", () => {
  const quantized = quantizeReplayInput({ x: 2, y: 2, aim: -Math.PI / 2, autoAim: true });
  assert.deepEqual(quantized, { x: 90, y: 90, aim: 3071, auto: 1 });
  const restored = dequantizeReplayInput(quantized);
  assert.ok(Math.hypot(restored.x, restored.y) <= 1.01);
  assert.equal(restored.autoAim, true);
  assert.throws(() => quantizeReplayInput({ aim: Infinity }), /finite/);
});

test("strict replay validation accepts every command kind", () => {
  const replay = base();
  replay.roster.push({ slot: 1, specialist: "echo" });
  replay.commands = [
    [0, 0, "i", 0, 0, 0, 0, 1], [0, 1, "c", 0, "e"], [0, 2, "u", 0, "passive:damage"],
    [0, 3, "q", 0], [0, 4, "b", 0, "weapon:uwu"], [0, 5, "s", 0], [0, 6, "x", 0, "weapon:uwu", "drone"],
    [0, 7, "j", 1, "echo"], [0, 8, "l", 1], [0, 9, "r", 1, "echo"], [0, 10, "a"],
  ];
  assert.deepEqual(validateReplay(replay), replay);
});

test("validator rejects unknown fields, identity, nonfinite input, and stale contracts", () => {
  assert.throws(() => validateReplay({ ...base(), callsign: "SECRET" }), /unexpected/);
  assert.throws(() => validateReplay({ ...base(), room: "ABCDE" }), /unexpected/);
  const bad = base(); bad.commands = [[0, 0, "i", 0, NaN, 0, 0, 1]];
  assert.throws(() => validateReplay(bad), /integer/);
  assert.throws(() => validateReplay(base(), { balanceHash: "fnv1a32:deadbeef" }), /mismatch/);
  assert.throws(() => validateReplay(base(), { rng: "different-v1" }), /mismatch/);
  assert.throws(() => validateReplay(base(), { gameplayVersion: "events-off-v1" }), /gameplay feature version mismatch/);
});

test("validator enforces tuple length, command order, and per-tick bounds", () => {
  const length = base(); length.commands = [[0, 0, "a", 1]];
  assert.throws(() => validateReplay(length), /length/);
  const order = base(); order.commands = [[1, 1, "a"], [0, 2, "a"]]; order.finalTick = 1;
  assert.throws(() => validateReplay(order), /ordered/);
  const crowded = base(); crowded.commands = Array.from({ length: 33 }, (_, ordinal) => [0, ordinal, "a"]);
  assert.throws(() => validateReplay(crowded), /too many/);
});

test("recorder keeps transient identities out of replay JSON and deduplicates input", () => {
  const recorder = new ReplayRecorder({
    build: "2026.07.11.3", balanceVersion: "2026.07.11-baseline.1", balanceHash: "fnv1a32:7e33be79",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("relay-secret-123", "zuri", { slot: 0, initial: true });
  recorder.recordInput("relay-secret-123", 0, { x: 1, y: 0, aim: 0, autoAim: true });
  recorder.recordInput("relay-secret-123", 1, { x: 1, y: 0, aim: 0, autoAim: true });
  recorder.recordCast("relay-secret-123", 5, "e");
  recorder.recordDraftReroll("relay-secret-123", 5);
  recorder.recordDraftBanish("relay-secret-123", 5, "weapon:uwu");
  recorder.recordDraftSkip("relay-secret-123", 5);
  recorder.recordDraftReplacement("relay-secret-123", 5, "weapon:mines", "drone");
  recorder.addCheckpoint(0, "0000000000000000");
  const replay = recorder.finalize(5, "1111111111111111");
  const text = JSON.stringify(replay);
  assert.doesNotMatch(text, /relay-secret|callsign|resume|room/i);
  assert.equal(replay.commands.length, 6);
  assert.deepEqual(replay.roster, [{ slot: 0, specialist: "zuri" }]);
  assert.deepEqual(replay.features, { configVersion: "release-2026.07.11.4", gameplayVersion: "events-v1", objectiveEvents: true });
});

test("paused pointer sampling coalesces safely and mixed-case authored choices remain replayable", () => {
  const recorder = new ReplayRecorder({
    build: "2026.07.12.3", balanceVersion: "2026.07.12-signatures.3", balanceHash: "fnv1a32:e36834e8",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("host", "rift", { slot: 0, initial: true });
  for (let sample = 0; sample < 80; sample++) recorder.recordInput("host", 986, { x: 0, y: 0, aim: sample / 20, autoAim: false }, { coalesceSameTick: true });
  recorder.recordUpgrade("host", 986, "passive:maxHealth");
  recorder.recordAbandon(986);
  const replay = recorder.finalize(986, "1111111111111111");
  assert.equal(replay.commands.filter((command) => command[2] === "i").length, 1);
  assert.deepEqual(replay.commands.map((command) => command[2]), ["i", "u", "a"]);
});

test("legacy v1 replay manifests remain readable with the original gameplay identity", () => {
  const legacy = base();
  legacy.schema = "lastlight.replay.v1";
  delete legacy.features;
  assert.doesNotThrow(() => validateReplay(legacy, { gameplayVersion: "events-v1" }));
  assert.throws(() => validateReplay(legacy, { gameplayVersion: "events-off-v1" }), /gameplay feature version mismatch/);
});

test("legacy v3 manifests reject v4-only draft commands", () => {
  const legacy = base(); legacy.schema = "lastlight.replay.v3"; legacy.commands = [[0, 0, "q", 0]];
  assert.throws(() => validateReplay(legacy), /unsupported/);
});

test("movement v3 keeps feature-bearing v2 manifests readable without changing input tuples", () => {
  const legacy = base();
  legacy.schema = "lastlight.replay.v2";
  assert.doesNotThrow(() => validateReplay(legacy, { gameplayVersion: "events-v1" }));
  assert.equal(legacy.commands[0].length, 8);
});

test("join and reconnect commands reuse an anonymous slot without changing the initial roster", () => {
  const recorder = new ReplayRecorder({
    build: "2026.07.11.3", balanceVersion: "2026.07.11-baseline.1", balanceHash: "fnv1a32:7e33be79",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("host", "zuri", { slot: 0, initial: true });
  recorder.registerPlayer("guest-old", "echo", { slot: 1, tick: 10 });
  recorder.recordLeave("guest-old", 20);
  recorder.registerPlayer("guest-new", "echo", { slot: 1, tick: 25, reconnect: true });
  recorder.addCheckpoint(0, "0000000000000000");
  const replay = recorder.finalize(25, "1111111111111111");
  assert.deepEqual(replay.roster, [{ slot: 0, specialist: "zuri" }]);
  assert.deepEqual(replay.commands.map((command) => command[2]), ["j", "l", "r"]);
});

test("a validated reconnect can reclaim a stale active replay owner after authority migration", () => {
  const recorder = new ReplayRecorder({
    build: "2026.07.11.3", balanceVersion: "2026.07.11-baseline.1", balanceHash: "fnv1a32:7e33be79",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("old-host", "zuri", { slot: 0, initial: true });
  assert.throws(() => recorder.registerPlayer("intruder", "zuri", { slot: 0, tick: 10 }), /already belongs/);
  assert.doesNotThrow(() => recorder.registerPlayer("returned-host", "zuri", { slot: 0, tick: 10, reconnect: true }));
  assert.throws(() => recorder.slotFor("old-host"), /not registered/);
  assert.equal(recorder.slotFor("returned-host"), 0);
  assert.deepEqual(recorder.commands.slice(-2).map((command) => command[2]), ["l", "r"]);
});

test("a departed anonymous slot can be reused by a different specialist", () => {
  const recorder = new ReplayRecorder({
    build: "2026.07.11.3", balanceVersion: "2026.07.11-baseline.1", balanceHash: "fnv1a32:7e33be79",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("host", "zuri", { slot: 0, initial: true });
  recorder.registerPlayer("guest", "echo", { slot: 1, tick: 1 });
  recorder.recordLeave("guest", 2);
  assert.doesNotThrow(() => recorder.registerPlayer("replacement", "fang", { slot: 1, tick: 3 }));
});

test("generic driver applies same-tick commands in ordinal order and verifies hashes", () => {
  const replay = base();
  replay.commands = [[0, 0, "i", 0, 127, 0, 0, 1], [0, 1, "c", 0, "e"]];
  const stateAtZero = { total: 0, commands: [] };
  replay.checkpoints = [[0, hashCanonicalState(stateAtZero)]];
  replay.finalHash = hashCanonicalState({ total: 2, commands: ["input", "cast"] });
  const driver = new ReplayDriver(replay, {
    createSimulation: () => ({ total: 0, commands: [] }),
    applyCommand: (sim, command) => { sim.total += 1; sim.commands.push(command.kind); },
    stepSimulation: (sim) => { sim.total += 10; },
    hashState: hashCanonicalState,
  }, { build: replay.build, balanceVersion: replay.balance.version, balanceHash: replay.balance.hash, rng: replay.engine.rng, stepHz: 60 });
  const result = driver.run();
  assert.equal(result.finalHash, replay.finalHash);
  assert.deepEqual(result.simulation.commands, ["input", "cast"]);
});

test("driver reports the first divergent checkpoint", () => {
  const replay = base();
  const driver = new ReplayDriver(replay, {
    createSimulation: () => ({}), applyCommand() {}, stepSimulation() {}, hashState: () => "ffffffffffffffff",
  });
  assert.throws(() => driver.run(), /diverged at tick 0/);
});

test("driver rejects a simulation created with different gameplay flags before stepping", () => {
  const replay = base();
  replay.features = { configVersion: "rollback-42", gameplayVersion: "events-off-v1", objectiveEvents: false };
  const driver = new ReplayDriver(replay, {
    createSimulation: () => ({ gameplayVersion: "events-v1", objectiveEvents: true }),
    applyCommand() {}, stepSimulation() {}, hashState: () => replay.finalHash,
  });
  assert.throws(() => driver.run(), /gameplay feature version mismatch/);
});

test("simulation hashes normalize transient identity but include input, hit sets, and pending tasks", () => {
  const config = { map: "warehouse", difficulty: "story", duration: 240 };
  const seed = "0123456789abcdef0123456789abcdef";
  const first = new Simulation({ ...config, players: [{ id: "relay-a", name: "Secret A", specialist: "zuri", replaySlot: 0 }] }, { seed });
  const second = new Simulation({ ...config, players: [{ id: "relay-b", name: "Secret B", specialist: "zuri", replaySlot: 0 }] }, { seed });
  first.players[0].resumeToken = "a".repeat(24); second.players[0].resumeToken = "b".repeat(24);
  assert.equal(hashSimulationState(first), hashSimulationState(second));
  assert.doesNotMatch(JSON.stringify(canonicalSimulationState(first)), /relay-a|Secret A|aaaaaaaaaaaaaaaaaaaaaaaa/);

  first.setInput("relay-a", { x: 1, y: 0, aim: 0, autoAim: true });
  assert.notEqual(hashSimulationState(first), hashSimulationState(second));
  second.setInput("relay-b", { x: 1, y: 0, aim: 0, autoAim: true });
  assert.equal(hashSimulationState(first), hashSimulationState(second));

  first.projectiles.push({ id: "b-test", owner: "relay-a", hit: new Set(["enemy-2"]) });
  second.projectiles.push({ id: "b-test", owner: "relay-b", hit: new Set() });
  assert.notEqual(hashSimulationState(first), hashSimulationState(second));
});

test("a recorded deterministic Simulation replays to the same final hash", () => {
  const run = { map: "warehouse", difficulty: "story", duration: 240 };
  const seed = "0123456789abcdef0123456789abcdef";
  const source = new Simulation({ ...run, players: [{ id: "source-relay", name: "Source", specialist: "zuri", replaySlot: 0 }] }, { seed });
  const recorder = new ReplayRecorder({
    build: "2026.07.11.3", balanceVersion: source.balanceVersion, balanceHash: source.balanceHash,
    rng: "xoshiro128ss-v1", seed, run,
  });
  recorder.registerPlayer("source-relay", "zuri", { slot: 0, initial: true });
  recorder.addCheckpoint(0, hashSimulationState(source));
  const input = dequantizeReplayInput(quantizeReplayInput({ x: 1, y: .25, aim: .7, autoAim: true }));
  recorder.recordInput("source-relay", 0, input);
  source.setInput("source-relay", input);
  for (let tick = 0; tick < 120; tick++) source.update(1 / 60);
  const replay = recorder.finalize(source.tick, hashSimulationState(source));

  const driver = new ReplayDriver(replay, {
    createSimulation: (manifest) => new Simulation({
      ...manifest.run,
      players: manifest.roster.map(({ slot, specialist }) => ({ id: `p${slot}`, name: `P${slot}`, specialist, replaySlot: slot })),
    }, {
      seed: manifest.seed, balanceVersion: manifest.balance.version, balanceHash: manifest.balance.hash,
      features: { gameplayVersion: manifest.features.gameplayVersion, objectiveEvents: manifest.features.objectiveEvents },
    }),
    applyCommand: (sim, command) => {
      const player = sim.players.find((entry) => entry.replaySlot === command.slot);
      if (command.kind === "input") sim.setInput(player.id, command.input);
    },
    stepSimulation: (sim, dt) => sim.update(dt),
    hashState: hashSimulationState,
  });
  assert.equal(driver.run().finalHash, replay.finalHash);
});

test("oversized replays are rejected before playback", () => {
  const replay = base();
  replay.commands = Array.from({ length: 100_000 }, (_, ordinal) => [Math.floor(ordinal / 32), ordinal, "u", 0, `x${"a".repeat(38)}`]);
  replay.finalTick = 4000;
  assert.throws(() => validateReplay(replay), /2 MB/);
});
