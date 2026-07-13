import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { Simulation } from "../engine.js";
import { createGameReplayAdapters } from "../replay-game-adapters.js";
import { REPLAY_SCHEMA, ReplayRecorder, hashCanonicalState, hashSimulationState } from "../replay.js";
import { ReplayVerificationError, VerifiedReplayTimeline } from "../replay-timeline.js";

function genericReplay() {
  const states = [{ value: 0 }, { value: 2 }, { value: 4 }, { value: 6 }];
  return {
    replay: {
      schema: REPLAY_SCHEMA, build: "2026.07.11.7",
      balance: { version: BALANCE_VERSION, hash: BALANCE_HASH },
      features: {
        configVersion: "test-v1", gameplayVersion: "join-normalization-v1", objectiveEvents: true,
        squadSynergies: true, sharedParticipationCredit: true, downedActivity: true, joinInProgressNormalization: true, squadEnemyDirector: true, mapMechanics: true, campaignMutations: true, registryVersion: "lastlight.squad-synergy.v1",
      },
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
    draftAction: (id, action) => action.choiceId === "weapon:uwu" ? (applied.push([id, action.choiceId]), { accepted: true }) : { accepted: false },
  };
  adapters.applyCommand(simulation, { kind: "upgrade", slot: 0, choiceId: "weapon:uwu" });
  assert.deepEqual(applied, [["p0", "weapon:uwu"]]);
  assert.throws(() => adapters.applyCommand(simulation, { kind: "upgrade", slot: 0, choiceId: "weapon:mines" }), /rejected/);
});

test("game adapter routes packaged joins through the deterministic deployment seam", () => {
  const calls = [];
  const simulation = {
    joinInProgressNormalization: true, players: [],
    deployLateJoin: (info, options) => calls.push({ info, options }),
  };
  createGameReplayAdapters().applyCommand(simulation, {
    kind: "join", slot: 2, specialist: "sola", packageId: "signature", catchUpRanks: 4,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { packageId: "signature", catchUpRanks: 4 });
  assert.equal(calls[0].info.replaySlot, 2);
  assert.equal(calls[0].info.specialist, "sola");
  assert.match(calls[0].info.id, /^replay-2-1$/);
});

test("game adapter preserves the legacy add-player seam only when normalization is disabled", () => {
  const calls = [];
  const simulation = {
    joinInProgressNormalization: false, players: [],
    addPlayer: (...args) => calls.push(args),
    deployLateJoin: () => assert.fail("legacy joins must not use normalized deployment"),
  };
  createGameReplayAdapters().applyCommand(simulation, { kind: "join", slot: 1, specialist: "echo" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].replaySlot, 1);
  assert.equal(calls[0][0].specialist, "echo");
});

test("timeline rejects a simulation with mismatched participation compatibility before playback", () => {
  const { replay, adapters } = genericReplay();
  adapters.createSimulation = () => ({
    value: 0, gameplayVersion: replay.features.gameplayVersion, objectiveEvents: true,
    squadSynergies: true, sharedParticipationCredit: false, synergyRegistryVersion: replay.features.registryVersion,
  });
  assert.throws(() => new VerifiedReplayTimeline(replay, adapters), /shared-participation-credit flag mismatch/);
});

test("timeline rejects a simulation with mismatched downed activity before playback", () => {
  const { replay, adapters } = genericReplay();
  adapters.createSimulation = () => ({
    value: 0, gameplayVersion: replay.features.gameplayVersion, objectiveEvents: true,
    squadSynergies: true, sharedParticipationCredit: true, downedActivity: false, synergyRegistryVersion: replay.features.registryVersion,
  });
  assert.throws(() => new VerifiedReplayTimeline(replay, adapters), /downed-activity flag mismatch/);
});

test("timeline rejects a simulation with mismatched join normalization before playback", () => {
  const { replay, adapters } = genericReplay();
  adapters.createSimulation = () => ({
    value: 0, gameplayVersion: replay.features.gameplayVersion, objectiveEvents: true,
    squadSynergies: true, sharedParticipationCredit: true, downedActivity: true,
    joinInProgressNormalization: false, synergyRegistryVersion: replay.features.registryVersion,
  });
  assert.throws(() => new VerifiedReplayTimeline(replay, adapters), /join-in-progress-normalization flag mismatch/);
});

test("game adapter replays authoritative reroll, banish, skip, and replacement decisions", () => {
  const adapters = createGameReplayAdapters();
  const sim = new Simulation({ players: [{ id: "p0", name: "P", specialist: "zuri", replaySlot: 0 }] }, { seed: "0123456789abcdef0123456789abcdef" });
  sim.beginUpgradeChoice();
  adapters.applyCommand(sim, { kind: "draft-reroll", slot: 0 });
  const banish = sim.pendingChoices.p0.find(({ kind }) => kind === "weapon" || kind === "passive");
  adapters.applyCommand(sim, { kind: "draft-banish", slot: 0, choiceId: banish.id });
  adapters.applyCommand(sim, { kind: "draft-skip", slot: 0 });
  assert.equal(sim.gold, 30);
  assert.equal(sim.players[0].draft.rerolls, 1);
  assert.equal(sim.players[0].draft.banishes, 1);
  assert.equal(sim.players[0].draft.skips, 0);

  const full = new Simulation({ players: [{ id: "p0", name: "P", specialist: "zuri", replaySlot: 0 }] });
  full.players[0].weapons = { signature: { level: 1, evolved: false }, aura: { level: 1, evolved: false }, mines: { level: 1, evolved: false }, crossbow: { level: 1, evolved: false }, drone: { level: 1, evolved: false } };
  full.beginUpgradeChoice();
  full.pendingChoices.p0 = [{ id: "weapon:uwu", kind: "weapon" }];
  adapters.applyCommand(full, { kind: "draft-replace", slot: 0, choiceId: "weapon:uwu", replacementId: "drone" });
  assert.ok(full.players[0].weapons.uwu && !full.players[0].weapons.drone);
});
