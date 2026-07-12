import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { Simulation } from "../engine.js";
import { createGameReplayAdapters } from "../replay-game-adapters.js";
import { ReplayRecorder, hashCanonicalState, hashSimulationState } from "../replay.js";
import { ReplayVerificationError, VerifiedReplayTimeline } from "../replay-timeline.js";

function genericReplay() {
  const states = [{ value: 0 }, { value: 2 }, { value: 4 }, { value: 6 }];
  return {
    replay: {
      schema: "lastlight.replay.v3", build: "2026.07.11.7",
      balance: { version: BALANCE_VERSION, hash: BALANCE_HASH },
      features: { configVersion: "test-v1", gameplayVersion: "events-v1", objectiveEvents: true },
      engine: { stepHz: 60, rng: "xoshiro128ss-v1" }, seed: "0123456789abcdef0123456789abcdef",
      run: { map: "warehouse", difficulty: "story", duration: 240 }, roster: [{ slot: 0, specialist: "zuri" }],
      commands: [[0, 0, "i", 0, 127, 0, 0, 1]], checkpoints: [[0, hashCanonicalState(states[0])]],
      finalTick: 3, finalHash: hashCanonicalState(states[3]),
    },
    adapters: {
      createSimulation: () => ({ value: 0 }), applyCommand: () => {},
      stepSimulation: (state) => { state.value += 2; }, hashState: hashCanonicalState,
    },
  };
}

test("verified timeline plays, resets, and seeks backward through deterministic reconstruction", () => {
  const { replay, adapters } = genericReplay();
  const timeline = new VerifiedReplayTimeline(replay, adapters);
  timeline.step(2); assert.equal(timeline.tick, 2); assert.equal(timeline.simulation.value, 4);
  timeline.seek(1); assert.equal(timeline.tick, 1); assert.equal(timeline.simulation.value, 2);
  const final = timeline.seek(3);
  assert.equal(final.simulation.value, 6); assert.equal(final.finalVerified, true); assert.equal(final.progress, 1);
  timeline.reset(); assert.equal(timeline.tick, 0); assert.equal(timeline.complete, false);
});

test("timeline advance honors fractional playback speed without changing the fixed step", () => {
  const { replay, adapters } = genericReplay();
  const timeline = new VerifiedReplayTimeline(replay, adapters);
  timeline.advance(1 / 60, .5); assert.equal(timeline.tick, 0);
  timeline.advance(1 / 60, .5); assert.equal(timeline.tick, 1);
  timeline.advance(1 / 60, 2); assert.equal(timeline.tick, 3); assert.equal(timeline.finalVerified, true);
  assert.throws(() => timeline.advance(.1, 0), /speed/);
});

test("checkpoint and final hash divergence fail closed with the exact tick", () => {
  const first = genericReplay(); first.replay.checkpoints[0][1] = "0000000000000000";
  assert.throws(() => new VerifiedReplayTimeline(first.replay, first.adapters), (error) => error instanceof ReplayVerificationError && error.kind === "checkpoint" && error.tick === 0);
  const second = genericReplay(); second.replay.finalHash = "1111111111111111";
  const timeline = new VerifiedReplayTimeline(second.replay, second.adapters);
  assert.throws(() => timeline.seek(3), (error) => error instanceof ReplayVerificationError && error.kind === "final hash" && error.tick === 3);
});

test("game adapters reproduce anonymous disconnect and reconnect without retaining resume tokens", () => {
  const seed = "123456789abcdef0123456789abcdef0", token = "a".repeat(24);
  const run = { map: "warehouse", difficulty: "story", duration: 240 };
  const source = new Simulation({ ...run, players: [
    { id: "host-secret", name: "Host Name", specialist: "zuri", replaySlot: 0, resumeToken: "b".repeat(24) },
    { id: "guest-secret", name: "Guest Name", specialist: "echo", replaySlot: 1, resumeToken: token },
  ] }, { seed });
  const recorder = new ReplayRecorder({ build: "2026.07.11.7", balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, rng: "xoshiro128ss-v1", seed, run });
  recorder.registerPlayer("host-secret", "zuri", { slot: 0, initial: true }); recorder.registerPlayer("guest-secret", "echo", { slot: 1, initial: true });
  recorder.addCheckpoint(0, hashSimulationState(source));
  for (let tick = 0; tick < 5; tick++) source.update(1 / 60);
  recorder.recordLeave("guest-secret", source.tick); source.removePlayer("guest-secret");
  for (let tick = 0; tick < 3; tick++) source.update(1 / 60);
  const restored = source.addPlayer({ id: "guest-new-secret", name: "Guest Again", specialist: "echo", replaySlot: 1, resumeToken: token }, 1);
  recorder.registerPlayer("guest-new-secret", "echo", { slot: restored.replaySlot, tick: source.tick, reconnect: true });
  for (let tick = 0; tick < 4; tick++) source.update(1 / 60);
  const replay = recorder.finalize(source.tick, hashSimulationState(source));
  const text = JSON.stringify(replay);
  assert.doesNotMatch(text, /secret|Host Name|Guest Name|Guest Again/);
  const timeline = new VerifiedReplayTimeline(replay, createGameReplayAdapters());
  timeline.seek(replay.finalTick);
  assert.equal(timeline.finalVerified, true);
  assert.doesNotMatch(JSON.stringify(timeline.simulation.snapshot()), new RegExp(token));
});

test("game adapter accepts only the exact pending upgrade choice", () => {
  const adapters = createGameReplayAdapters(), applied = [];
  const simulation = {
    players: [{ id: "p0", replaySlot: 0 }], pendingChoices: { p0: [{ id: "weapon:uwu" }] }, choiceReady: { p0: false },
    choose: (id, choice) => applied.push([id, choice]),
  };
  adapters.applyCommand(simulation, { kind: "upgrade", slot: 0, choiceId: "weapon:uwu" });
  assert.deepEqual(applied, [["p0", "weapon:uwu"]]);
  assert.throws(() => adapters.applyCommand(simulation, { kind: "upgrade", slot: 0, choiceId: "weapon:mines" }), /rejected/);
});
