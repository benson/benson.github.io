import { pathToFileURL } from "node:url";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { Simulation, SIMULATION_TICK_RATE } from "../engine.js";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract } from "../feature-config.js";
import {
  MAX_MIGRATION_CHECKPOINT_BYTES,
  createMigrationCheckpoint,
  validateMigrationCheckpoint,
} from "../host-migration.js";
import { canonicalSimulationState, hashSimulationState } from "../replay.js";
import { RECOVERY_SIMULATION_VERSION } from "../recovery.js";

export const HOST_MIGRATION_SOAK_SCHEMA = "lastlight.host-migration-soak.v1";
export const DEFAULT_HOST_MIGRATION_SOAK_SEED = "a057a11ce00000000000000000000001";

const MIGRATION_STEPS = Object.freeze({
  running: 60,
  draft: 120,
  apex: 200,
});
const INPUTS = Object.freeze([
  Object.freeze({ x: 1, y: 0, aim: 0, autoAim: false }),
  Object.freeze({ x: .7071067811865476, y: .7071067811865476, aim: Math.PI / 4, autoAim: true }),
  Object.freeze({ x: 0, y: 1, aim: Math.PI / 2, autoAim: false }),
  Object.freeze({ x: -.7071067811865476, y: .7071067811865476, aim: Math.PI * 3 / 4, autoAim: true }),
  Object.freeze({ x: -1, y: 0, aim: Math.PI, autoAim: false }),
  Object.freeze({ x: 0, y: -1, aim: Math.PI * 3 / 2, autoAim: true }),
]);

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function wireClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function encodedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function playerAtSlot(simulation, replaySlot) {
  const player = simulation.players.find((entry) => entry.replaySlot === replaySlot);
  if (!player) throw new Error(`Missing replay slot ${replaySlot}`);
  return player;
}

function firstDifference(left, right, path = "$", depth = 0) {
  if (Object.is(left, right)) return null;
  if (depth > 18) return { path, expected: "<depth limit>", actual: "<depth limit>" };
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") {
    return { path, expected: left, actual: right };
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    return { path, expected: Array.isArray(left) ? "array" : "object", actual: Array.isArray(right) ? "array" : "object" };
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(left, key)) return { path: `${path}.${key}`, expected: "<missing>", actual: right[key] };
    if (!Object.hasOwn(right, key)) return { path: `${path}.${key}`, expected: left[key], actual: "<missing>" };
    const nextPath = Array.isArray(left) ? `${path}[${key}]` : `${path}.${key}`;
    const difference = firstDifference(left[key], right[key], nextPath, depth + 1);
    if (difference) return difference;
  }
  return null;
}

export class HostMigrationSoakDivergenceError extends Error {
  constructor({ label, tick, expectedHash, actualHash, difference }) {
    super(`Host migration soak diverged at ${label} (tick ${tick}): expected ${expectedHash}, got ${actualHash}; first difference ${difference?.path || "unknown"}`);
    this.name = "HostMigrationSoakDivergenceError";
    this.label = label;
    this.tick = tick;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
    this.difference = difference;
  }
}

export class HostMigrationSoakBudgetError extends Error {
  constructor({ bytes, maxBytes }) {
    super(`Host migration checkpoint used ${bytes} bytes, exceeding the ${maxBytes}-byte soak budget`);
    this.name = "HostMigrationSoakBudgetError";
    this.bytes = bytes;
    this.maxBytes = maxBytes;
  }
}

function assertConverged(control, authority, label) {
  const expectedHash = hashSimulationState(control);
  const actualHash = hashSimulationState(authority);
  if (expectedHash !== actualHash) {
    const expected = canonicalSimulationState(control);
    const actual = canonicalSimulationState(authority);
    throw new HostMigrationSoakDivergenceError({
      label,
      tick: control.tick,
      expectedHash,
      actualHash,
      difference: firstDifference(expected, actual),
    });
  }
  return expectedHash;
}

function makeSimulation(seed, idPrefix) {
  const features = gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG);
  const simulation = new Simulation({
    map: "warehouse",
    difficulty: "story",
    duration: 60,
    players: [
      { id: `${idPrefix}-p0`, name: "Specialist 1", specialist: "zuri", replaySlot: 0 },
      { id: `${idPrefix}-p1`, name: "Specialist 2", specialist: "echo", replaySlot: 1 },
    ],
    features,
  }, { seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, features });
  for (const player of simulation.players) player.invuln = 999;
  return simulation;
}

function applyInputs(simulation, logicalStep) {
  for (const replaySlot of [0, 1]) {
    const player = playerAtSlot(simulation, replaySlot);
    const inputIndex = (Math.floor(logicalStep / 24) + replaySlot * 2) % INPUTS.length;
    if (!simulation.setInput(player.id, INPUTS[inputIndex])) throw new Error(`Input rejected for replay slot ${replaySlot}`);
  }
}

function beginDraft(control, authority) {
  control.beginUpgradeChoice();
  authority.beginUpgradeChoice();
  if (!control.paused || !authority.paused || control.pauseReason !== "upgrade" || authority.pauseReason !== "upgrade") {
    throw new Error("Draft coverage did not enter an upgrade pause");
  }
  assertConverged(control, authority, "draft opened");
}

function resolveDraft(control, authority) {
  for (const replaySlot of [0, 1]) {
    const controlPlayer = playerAtSlot(control, replaySlot);
    const authorityPlayer = playerAtSlot(authority, replaySlot);
    const controlOptions = control.pendingChoices?.[controlPlayer.id]?.map(({ id }) => id) || [];
    const authorityOptions = authority.pendingChoices?.[authorityPlayer.id]?.map(({ id }) => id) || [];
    if (JSON.stringify(controlOptions) !== JSON.stringify(authorityOptions) || !controlOptions.length) {
      throw new Error(`Draft offers differ for replay slot ${replaySlot}`);
    }
    const choiceId = controlOptions[replaySlot % controlOptions.length];
    const controlChoice = control.choose(controlPlayer.id, choiceId);
    const authorityChoice = authority.choose(authorityPlayer.id, choiceId);
    if (!controlChoice.accepted || !authorityChoice.accepted) throw new Error(`Draft choice rejected for replay slot ${replaySlot}`);
  }
  if (control.paused || authority.paused || control.pendingChoices || authority.pendingChoices) {
    throw new Error("Draft coverage did not resume both simulations");
  }
  assertConverged(control, authority, "draft resolved");
}

function beginApexWindup(control, authority) {
  for (const simulation of [control, authority]) {
    simulation.spawnBoss();
    const boss = simulation.enemies.find((enemy) => enemy.boss);
    if (!boss) throw new Error("Apex coverage failed to spawn a boss");
    boss.apexReadyTick = simulation.tick;
    simulation.updateBoss(boss, 1 / SIMULATION_TICK_RATE, simulation.players);
    if (boss.apexActionState !== "windup" || !boss.apexGeometry) {
      throw new Error("Apex coverage failed to enter a locked windup");
    }
  }
  assertConverged(control, authority, "apex windup opened");
}

function migrationCompatibility() {
  return Object.freeze({
    build: "host-migration-soak-v1",
    balanceVersion: BALANCE_VERSION,
    balanceHash: BALANCE_HASH,
    configVersion: DEFAULT_RUNTIME_CONFIG.configVersion,
    gameplayVersion: DEFAULT_RUNTIME_CONFIG.gameplayVersion,
    objectiveEvents: true,
    squadSynergies: DEFAULT_RUNTIME_CONFIG.flags.squadSynergies,
    sharedParticipationCredit: DEFAULT_RUNTIME_CONFIG.flags.sharedParticipationCredit,
    downedActivity: DEFAULT_RUNTIME_CONFIG.flags.downedActivity,
    joinInProgressNormalization: DEFAULT_RUNTIME_CONFIG.flags.joinInProgressNormalization,
    squadEnemyDirector: DEFAULT_RUNTIME_CONFIG.flags.squadEnemyDirector,
    mapMechanics: DEFAULT_RUNTIME_CONFIG.flags.mapMechanics,
    campaignMutations: DEFAULT_RUNTIME_CONFIG.flags.campaignMutations,
    registryVersion: DEFAULT_RUNTIME_CONFIG.registryVersion,
    recoveryVersion: RECOVERY_SIMULATION_VERSION,
  });
}

function promote({ control, authority, epoch, logicalStep, label, maxCheckpointBytes }) {
  const sourceHash = assertConverged(control, authority, `${label} before checkpoint`);
  const recovery = authority.exportRecoveryState();
  const roster = [...authority.players]
    .sort((left, right) => left.replaySlot - right.replaySlot)
    .map(({ id, replaySlot }) => ({ id, replaySlot }));
  const ack = Object.fromEntries(roster.map(({ id, replaySlot }) => [id, logicalStep * 2 + replaySlot]));
  const checkpoint = createMigrationCheckpoint({
    epoch,
    tick: authority.tick,
    hash: sourceHash,
    ack,
    compatibility: migrationCompatibility(),
    roster,
    simulation: recovery,
    replay: null,
  });
  const bytes = encodedBytes(checkpoint);
  if (bytes > maxCheckpointBytes) throw new HostMigrationSoakBudgetError({ bytes, maxBytes: maxCheckpointBytes });

  const recoveryText = JSON.stringify(checkpoint.simulation);
  for (const { id } of roster) {
    if (recoveryText.includes(id)) throw new Error(`Recovery payload leaked transient identity ${id}`);
  }

  // Exercise the same JSON boundary as a replicated checkpoint instead of
  // restoring from an in-memory object that could retain richer JS values.
  const received = validateMigrationCheckpoint(wireClone(checkpoint), { maxBytes: maxCheckpointBytes });
  const promotedEpoch = epoch + 1;
  const playerIdsBySlot = Object.fromEntries(roster.map(({ replaySlot }) => [replaySlot, `e${promotedEpoch}-p${replaySlot}`]));
  const promoted = Simulation.fromRecoveryState(received.simulation, { playerIdsBySlot });
  const restoredHash = assertConverged(control, promoted, `${label} after restore`);
  if (restoredHash !== received.hash) throw new Error(`${label} restored hash does not match its checkpoint`);

  return {
    authority: promoted,
    epoch: promotedEpoch,
    record: Object.freeze({
      label,
      checkpointEpoch: epoch,
      promotedEpoch,
      tick: received.tick,
      checkpointId: received.checkpointId,
      bytes,
      sourceHash,
      restoredHash,
      identityRemapped: roster.every(({ id, replaySlot }) => id !== playerIdsBySlot[replaySlot]),
    }),
  };
}

/**
 * Run an uninterrupted control beside an authority that is replaced from real
 * strict recovery checkpoints. Every subsequent command is addressed by replay
 * slot so transient relay identities can change without changing game state.
 */
export function runHostMigrationSoak({
  seed = DEFAULT_HOST_MIGRATION_SOAK_SEED,
  steps = 320,
  maxCheckpointBytes = MAX_MIGRATION_CHECKPOINT_BYTES,
} = {}) {
  if (!/^[0-9a-f]{32}$/.test(seed)) throw new TypeError("seed must be a lowercase 32-character hexadecimal value");
  integer(steps, MIGRATION_STEPS.apex + 1, 10_000, "steps");
  integer(maxCheckpointBytes, 1, MAX_MIGRATION_CHECKPOINT_BYTES, "maxCheckpointBytes");

  const control = makeSimulation(seed, "control");
  let authority = makeSimulation(seed, "e0");
  let epoch = 0;
  let comparisons = 0;
  const checkpoints = [];
  assertConverged(control, authority, "initial state");
  comparisons++;

  for (let logicalStep = 0; logicalStep < steps; logicalStep++) {
    applyInputs(control, logicalStep);
    applyInputs(authority, logicalStep);

    if (logicalStep === MIGRATION_STEPS.running) {
      const promotion = promote({ control, authority, epoch, logicalStep, label: "running", maxCheckpointBytes });
      authority = promotion.authority; epoch = promotion.epoch; checkpoints.push(promotion.record);
    }
    if (logicalStep === MIGRATION_STEPS.draft) {
      beginDraft(control, authority);
      const promotion = promote({ control, authority, epoch, logicalStep, label: "draft-paused", maxCheckpointBytes });
      authority = promotion.authority; epoch = promotion.epoch; checkpoints.push(promotion.record);
      resolveDraft(control, authority);
    }
    if (logicalStep === MIGRATION_STEPS.apex) {
      beginApexWindup(control, authority);
      const promotion = promote({ control, authority, epoch, logicalStep, label: "apex-windup", maxCheckpointBytes });
      authority = promotion.authority; epoch = promotion.epoch; checkpoints.push(promotion.record);
    }

    control.update(1 / SIMULATION_TICK_RATE);
    authority.update(1 / SIMULATION_TICK_RATE);
    assertConverged(control, authority, `logical step ${logicalStep}`);
    comparisons++;
  }

  const finalHash = assertConverged(control, authority, "final state");
  comparisons++;
  const maxBytes = Math.max(...checkpoints.map(({ bytes }) => bytes));
  return Object.freeze({
    schema: HOST_MIGRATION_SOAK_SCHEMA,
    status: "passed",
    seed,
    steps,
    finalTick: control.tick,
    finalHash,
    coverage: Object.freeze({
      migrations: checkpoints.length,
      repeatedMigrations: checkpoints.length >= 2,
      draftPausedCheckpoint: checkpoints.some(({ label }) => label === "draft-paused"),
      apexWindupCheckpoint: checkpoints.some(({ label }) => label === "apex-windup"),
      identityRemaps: checkpoints.filter(({ identityRemapped }) => identityRemapped).length,
    }),
    metrics: Object.freeze({ comparisons, maxCheckpointBytes: maxBytes, checkpointBudgetBytes: maxCheckpointBytes }),
    checkpoints: Object.freeze(checkpoints),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(runHostMigrationSoak(), null, 2)}\n`);
}
