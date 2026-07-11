import test from "node:test";
import assert from "node:assert/strict";
import {
  REPLAY_SCHEMA, REPLAY_STEP_HZ, ReplayDriver, ReplayRecorder, canonicalStringify,
  dequantizeReplayInput, fnv1a64, hashCanonicalState, quantizeReplayInput, validateReplay,
} from "../replay.js";

const base = () => ({
  schema: REPLAY_SCHEMA,
  build: "2026.07.11.3",
  balance: { version: "2026.07.11-baseline.1", hash: "fnv1a32:7e33be79" },
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
    [0, 3, "j", 1, "echo"], [0, 4, "l", 1], [0, 5, "r", 1, "echo"], [0, 6, "a"],
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
  recorder.addCheckpoint(0, "0000000000000000");
  const replay = recorder.finalize(5, "1111111111111111");
  const text = JSON.stringify(replay);
  assert.doesNotMatch(text, /relay-secret|callsign|resume|room/i);
  assert.equal(replay.commands.length, 2);
  assert.deepEqual(replay.roster, [{ slot: 0, specialist: "zuri" }]);
});

test("generic driver applies same-tick commands in ordinal order and verifies hashes", () => {
  const replay = base();
  replay.commands = [[0, 0, "i", 0, 127, 0, 0, 1], [0, 1, "c", 0, "e"]];
  const stateAtZero = { total: 2, commands: ["input", "cast"] };
  replay.checkpoints = [[0, hashCanonicalState(stateAtZero)]];
  replay.finalHash = replay.checkpoints[0][1];
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

test("oversized replays are rejected before playback", () => {
  const replay = base();
  replay.commands = Array.from({ length: 100_000 }, (_, ordinal) => [Math.floor(ordinal / 32), ordinal, "u", 0, `x${"a".repeat(38)}`]);
  replay.finalTick = 4000;
  assert.throws(() => validateReplay(replay), /2 MB/);
});
