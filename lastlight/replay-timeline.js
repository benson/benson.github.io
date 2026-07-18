import { REPLAY_STEP_HZ, decodeReplayCommand, replayGameplayFeatures, validateReplay } from "./replay.js?v=20260718.5";

function clampInteger(value, min, max, label) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return Math.max(min, Math.min(max, number));
}

export class ReplayVerificationError extends Error {
  constructor({ kind, tick, expected, actual }) {
    super(`Replay ${kind} verification failed at tick ${tick}: expected ${expected}, got ${actual}`);
    this.name = "ReplayVerificationError";
    this.kind = kind;
    this.tick = tick;
    this.expected = expected;
    this.actual = actual;
  }
}

export class VerifiedReplayTimeline {
  constructor(replay, adapters, expected = {}) {
    this.replay = validateReplay(replay, expected);
    if (!adapters || typeof adapters.createSimulation !== "function" || typeof adapters.applyCommand !== "function" || typeof adapters.stepSimulation !== "function" || typeof adapters.hashState !== "function") {
      throw new TypeError("VerifiedReplayTimeline requires createSimulation, applyCommand, stepSimulation, and hashState adapters");
    }
    this.adapters = adapters;
    this.checkpoints = new Map(this.replay.checkpoints);
    this.frameRemainder = 0;
    this.reset();
  }

  reset() {
    this.simulation = this.adapters.createSimulation(this.replay);
    const features = replayGameplayFeatures(this.replay);
    if (Object.hasOwn(this.simulation, "gameplayVersion") && this.simulation.gameplayVersion !== features.gameplayVersion) throw new Error("Replay gameplay feature version mismatch");
    if (Object.hasOwn(this.simulation, "objectiveEvents") && this.simulation.objectiveEvents !== features.objectiveEvents) throw new Error("Replay objective-events flag mismatch");
    if (Object.hasOwn(this.simulation, "squadSynergies") && this.simulation.squadSynergies !== features.squadSynergies) throw new Error("Replay squad-synergies flag mismatch");
    if (Object.hasOwn(this.simulation, "sharedParticipationCredit") && this.simulation.sharedParticipationCredit !== features.sharedParticipationCredit) throw new Error("Replay shared-participation-credit flag mismatch");
    if (Object.hasOwn(this.simulation, "downedActivity") && this.simulation.downedActivity !== features.downedActivity) throw new Error("Replay downed-activity flag mismatch");
    if (Object.hasOwn(this.simulation, "joinInProgressNormalization") && this.simulation.joinInProgressNormalization !== features.joinInProgressNormalization) throw new Error("Replay join-in-progress-normalization flag mismatch");
    if (Object.hasOwn(this.simulation, "synergyRegistryVersion") && this.simulation.synergyRegistryVersion !== features.registryVersion) throw new Error("Replay synergy registry version mismatch");
    this.tick = 0;
    this.commandIndex = 0;
    this.complete = false;
    this.finalVerified = false;
    this.lastVerifiedTick = null;
    this.verifiedCheckpoints = 0;
    this.frameRemainder = 0;
    this.verifyCheckpoint();
    if (this.replay.finalTick === 0) this.finish();
    this.adapters.onReset?.(this.simulation);
    return this.state();
  }

  verifyCheckpoint() {
    const expected = this.checkpoints.get(this.tick);
    if (!expected) return false;
    const actual = this.adapters.hashState(this.simulation);
    if (actual !== expected) throw new ReplayVerificationError({ kind: "checkpoint", tick: this.tick, expected, actual });
    this.lastVerifiedTick = this.tick;
    this.verifiedCheckpoints++;
    return true;
  }

  applyCommandsAtCurrentTick() {
    while (this.replay.commands[this.commandIndex]?.[0] === this.tick) {
      this.adapters.applyCommand(this.simulation, decodeReplayCommand(this.replay.commands[this.commandIndex++]));
    }
  }

  finish() {
    if (this.complete) return this.state();
    this.applyCommandsAtCurrentTick();
    const actual = this.adapters.hashState(this.simulation);
    if (actual !== this.replay.finalHash) throw new ReplayVerificationError({ kind: "final hash", tick: this.tick, expected: this.replay.finalHash, actual });
    this.complete = true;
    this.finalVerified = true;
    return this.state();
  }

  step(count = 1) {
    const steps = clampInteger(count, 0, this.replay.finalTick, "step count");
    for (let index = 0; index < steps && !this.complete; index++) {
      if (this.tick >= this.replay.finalTick) { this.finish(); break; }
      this.applyCommandsAtCurrentTick();
      this.adapters.stepSimulation(this.simulation, 1 / REPLAY_STEP_HZ, this.tick);
      this.tick++;
      this.verifyCheckpoint();
      if (this.tick === this.replay.finalTick) this.finish();
    }
    return this.state();
  }

  seek(targetTick) {
    const target = clampInteger(targetTick, 0, this.replay.finalTick, "target tick");
    if (target < this.tick || this.complete && target < this.replay.finalTick) this.reset();
    if (target > this.tick) this.step(target - this.tick);
    else if (target === this.replay.finalTick && !this.complete) this.finish();
    this.frameRemainder = 0;
    return this.state();
  }

  advance(frameSeconds, speed = 1) {
    const seconds = Math.max(0, Math.min(.25, Number(frameSeconds) || 0));
    const rate = Number(speed);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 8) throw new RangeError("Replay speed must be greater than zero and at most 8");
    this.frameRemainder += seconds * REPLAY_STEP_HZ * rate;
    const steps = Math.floor(this.frameRemainder);
    this.frameRemainder -= steps;
    if (steps) this.step(steps);
    return this.state();
  }

  state() {
    return Object.freeze({
      tick: this.tick,
      seconds: this.tick / REPLAY_STEP_HZ,
      durationSeconds: this.replay.finalTick / REPLAY_STEP_HZ,
      progress: this.replay.finalTick ? this.tick / this.replay.finalTick : 1,
      complete: this.complete,
      finalVerified: this.finalVerified,
      lastVerifiedTick: this.lastVerifiedTick,
      verifiedCheckpoints: this.verifiedCheckpoints,
      simulation: this.simulation,
    });
  }
}
