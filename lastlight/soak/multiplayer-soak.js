import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { Simulation, SIMULATION_TICK_RATE } from "../engine.js";
import { DEFAULT_RUNTIME_CONFIG } from "../feature-config.js";
import { canonicalSimulationState, hashSimulationState } from "../replay.js";

export const SOAK_REPORT_SCHEMA = "lastlight.multiplayer-soak.v1";

export const DEFAULT_SOAK_BUDGETS = Object.freeze({
  maxTotalEntities: 900,
  maxSnapshotBytes: 1_000_000,
  maxMessages: 5_000,
  maxPendingMessages: 64,
  maxSimulationTasks: 128,
  maxPendingUpgradeChoices: 12,
});

const SPECIALISTS = Object.freeze(["zuri", "echo", "sola", "bront"]);
const DEFAULT_SEED = "51a57e11000000000000000000000001";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${label} must be an integer from ${min} to ${max}`);
  return value;
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor((sorted.length - 1) * quantile)] * 1000) / 1000;
}

function entityCounts(simulation) {
  return Object.fromEntries(["players", "drones", "enemies", "projectiles", "hostile", "effects", "orbs", "drops", "pods", "objectives", "relayBalls", "feathers", "tasks"].map((key) => [key, simulation[key]?.length || 0]));
}

function firstDifference(left, right, path = "$", depth = 0) {
  if (Object.is(left, right)) return null;
  if (depth > 18) return { path, expected: "<depth limit>", actual: "<depth limit>" };
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") {
    return { path, expected: left, actual: right };
  }
  if (Array.isArray(left) !== Array.isArray(right)) return { path, expected: Array.isArray(left) ? "array" : "object", actual: Array.isArray(right) ? "array" : "object" };
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(left, key)) return { path: `${path}.${key}`, expected: "<missing>", actual: right[key] };
    if (!Object.hasOwn(right, key)) return { path: `${path}.${key}`, expected: left[key], actual: "<missing>" };
    const difference = firstDifference(left[key], right[key], Array.isArray(left) ? `${path}[${key}]` : `${path}.${key}`, depth + 1);
    if (difference) return difference;
  }
  return null;
}

function diagnosticValue(value) {
  const text = JSON.stringify(value);
  return text && text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export class SoakDivergenceError extends Error {
  constructor({ tick, replica, expectedHash, actualHash, difference }) {
    super(`Multiplayer soak first divergence at tick ${tick} on ${replica}: expected ${expectedHash}, got ${actualHash}; ${difference.path} expected ${diagnosticValue(difference.expected)}, got ${diagnosticValue(difference.actual)}`);
    this.name = "SoakDivergenceError";
    this.tick = tick;
    this.replica = replica;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
    this.difference = difference;
  }
}

/**
 * Reliable deterministic replication queue. BEN-809 can wrap this factory to
 * add sequence/ack instrumentation. Peer-simulation soak messages must be
 * delivered at their declared logical tick; delayed/lost delivery requires a
 * resync in beforeCheckpoint before convergence is asserted.
 */
export function createReplicationQueue({ followerCount, hooks = {} } = {}) {
  integer(followerCount, 1, 3, "followerCount");
  let sequence = 0, delivered = 0, maxPending = 0;
  const pending = [];
  return {
    enqueue(message) {
      const envelope = Object.freeze({ sequence: sequence++, ...clone(message) });
      hooks.onSend?.(envelope);
      pending.push(envelope);
      maxPending = Math.max(maxPending, pending.length);
      return envelope.sequence;
    },
    drain(tick, deliver) {
      pending.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
      while (pending.length && pending[0].tick <= tick) {
        const envelope = pending.shift();
        deliver(envelope);
        delivered++;
        hooks.onDeliver?.(envelope);
        hooks.onAck?.({ sequence: envelope.sequence, tick, target: envelope.target });
      }
    },
    pendingCount() { return pending.length; },
    metrics() { return { sent: sequence, delivered, pending: pending.length, maxPending }; },
  };
}

function recoveryToken(replicaIndex, slot) {
  return `${(replicaIndex + 1).toString(16)}${(slot + 1).toString(16)}`.padEnd(24, "0");
}

function createReplica(index, options) {
  const activeIds = new Map();
  const players = SPECIALISTS.map((specialist, slot) => {
    const id = `replica-${index}-transient-${slot}`;
    activeIds.set(slot, id);
    return { id, name: `Replica ${slot}`, specialist, replaySlot: slot, resumeToken: recoveryToken(index, slot) };
  });
  const simulation = new Simulation({
    map: options.map,
    difficulty: options.difficulty,
    duration: options.durationSeconds,
    players,
    features: {
      gameplayVersion: options.gameplayVersion, objectiveEvents: true,
      squadSynergies: true, sharedParticipationCredit: options.sharedParticipationCredit,
      downedActivity: DEFAULT_RUNTIME_CONFIG.flags.downedActivity,
      joinInProgressNormalization: options.joinInProgressNormalization,
      squadEnemyDirector: options.squadEnemyDirector,
      mapMechanics: options.mapMechanics,
      campaignMutations: options.campaignMutations,
      specialistMastery: options.specialistMastery,
      rareDiscoveries: options.rareDiscoveries,
      registryVersion: DEFAULT_RUNTIME_CONFIG.registryVersion,
    },
  }, { seed: options.seed, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH });
  // The soak exercises systems and structural growth rather than tuning. Long
  // invulnerability guarantees the four replicas reach the apex deterministically.
  for (const player of simulation.players) player.invuln = options.durationSeconds + 20;
  return { label: index === 0 ? "host" : `follower-${index}`, index, simulation, activeIds, reconnects: new Map() };
}

function applyMessage(replica, envelope) {
  const simulation = replica.simulation;
  const id = replica.activeIds.get(envelope.slot);
  if (envelope.type === "input") return id ? simulation.setInput(id, envelope.payload) : false;
  if (envelope.type === "cast") return id ? simulation.cast(id, envelope.payload.slot) : false;
  if (envelope.type === "upgrade") return id ? simulation.choose(id, envelope.payload.choiceId) : false;
  if (envelope.type === "draft-reroll") return id ? simulation.draftAction(id, { type: "reroll" }) : false;
  if (envelope.type === "draft-banish") return id ? simulation.draftAction(id, { type: "banish", choiceId: envelope.payload.choiceId }) : false;
  if (envelope.type === "draft-skip") return id ? simulation.draftAction(id, { type: "skip" }) : false;
  if (envelope.type === "grant-xp") { simulation.teamXP += simulation.xpNeed; return true; }
  if (envelope.type === "disconnect") {
    if (!id) return false;
    simulation.removePlayer(id);
    replica.activeIds.delete(envelope.slot);
    return true;
  }
  if (envelope.type === "reconnect") {
    const generation = (replica.reconnects.get(envelope.slot) || 0) + 1;
    replica.reconnects.set(envelope.slot, generation);
    const nextId = `replica-${replica.index}-reconnected-${envelope.slot}-${generation}`;
    const player = simulation.addPlayer({ id: nextId, name: `Reconnected ${envelope.slot}`, specialist: SPECIALISTS[envelope.slot], replaySlot: envelope.slot, resumeToken: recoveryToken(replica.index, envelope.slot) }, envelope.slot);
    player.invuln = Math.max(player.invuln, 8);
    replica.activeIds.set(envelope.slot, nextId);
    return true;
  }
  if (envelope.type === "finish-apex") {
    const boss = simulation.enemies.find((enemy) => enemy.boss && !enemy.dead);
    if (!boss) return false;
    const owner = replica.activeIds.get(0);
    simulation.damageEnemy(boss, boss.hp + 1, owner, true, "soak-finish");
    if (!boss.dead) {
      boss.apexPhaseIndex = 1; boss.apexPendingPhase = -1; simulation.bossPhase = 2;
      simulation.damageEnemy(boss, boss.hp + 1, owner, true, "soak-finish");
    }
    return true;
  }
  throw new TypeError(`Unsupported soak message ${envelope.type}`);
}

function pendingUpgradeCount(simulation) {
  return Object.values(simulation.pendingChoices || {}).reduce((total, choices) => total + (choices?.length || 0), 0);
}

function assertBudget(metric, limit, label) {
  if (metric > limit) throw new Error(`Multiplayer soak ${label} ${metric} exceeds structural budget ${limit}`);
}

function stableCheckpoint(replicas, tick, checkpoints, adapters, queue) {
  if (queue.pendingCount()) return;
  adapters.beforeCheckpoint?.({ tick, replicas, queue });
  const hostState = canonicalSimulationState(replicas[0].simulation);
  const expectedHash = hashSimulationState(replicas[0].simulation);
  const hashes = [{ replica: "host", hash: expectedHash }];
  for (const replica of replicas.slice(1)) {
    const actualHash = hashSimulationState(replica.simulation);
    hashes.push({ replica: replica.label, hash: actualHash });
    if (actualHash !== expectedHash) {
      const difference = firstDifference(hostState, canonicalSimulationState(replica.simulation)) || { path: "$", expected: "unknown", actual: "unknown" };
      throw new SoakDivergenceError({ tick, replica: replica.label, expectedHash, actualHash, difference });
    }
  }
  const checkpoint = Object.freeze({ tick, hash: expectedHash, replicas: hashes.length });
  checkpoints.push(checkpoint);
  adapters.onCheckpoint?.(checkpoint);
}

export function runMultiplayerSoak(options = {}) {
  const settings = {
    seed: options.seed || DEFAULT_SEED,
    map: options.map || "warehouse",
    difficulty: options.difficulty || "story",
    durationSeconds: options.durationSeconds || 60,
    gameplayVersion: options.gameplayVersion || DEFAULT_RUNTIME_CONFIG.gameplayVersion,
    sharedParticipationCredit: options.sharedParticipationCredit ?? DEFAULT_RUNTIME_CONFIG.flags.sharedParticipationCredit,
    joinInProgressNormalization: options.joinInProgressNormalization ?? DEFAULT_RUNTIME_CONFIG.flags.joinInProgressNormalization,
    squadEnemyDirector: options.squadEnemyDirector ?? DEFAULT_RUNTIME_CONFIG.flags.squadEnemyDirector,
    mapMechanics: options.mapMechanics ?? DEFAULT_RUNTIME_CONFIG.flags.mapMechanics,
    campaignMutations: options.campaignMutations ?? DEFAULT_RUNTIME_CONFIG.flags.campaignMutations,
    specialistMastery: options.specialistMastery ?? DEFAULT_RUNTIME_CONFIG.flags.specialistMastery,
    rareDiscoveries: options.rareDiscoveries ?? DEFAULT_RUNTIME_CONFIG.flags.rareDiscoveries,
    checkpointEvery: options.checkpointEvery || 300,
  };
  if (!/^[0-9a-f]{32}$/.test(settings.seed) || /^0+$/.test(settings.seed)) throw new TypeError("seed must be non-zero 128-bit lowercase hex");
  integer(settings.durationSeconds, 60, 3600, "durationSeconds");
  integer(settings.checkpointEvery, 60, 3600, "checkpointEvery");
  const budgets = Object.freeze({ ...DEFAULT_SOAK_BUDGETS, ...(options.budgets || {}) });
  const adapters = options.adapters || {};
  const replicas = Array.from({ length: 4 }, (_, index) => createReplica(index, settings));
  const queueFactory = adapters.transportFactory || createReplicationQueue;
  const queue = queueFactory({ followerCount: 3, hooks: adapters.transportHooks || {} });
  if (!queue || !["enqueue", "drain", "pendingCount", "metrics"].every((key) => typeof queue[key] === "function")) throw new TypeError("transportFactory returned an invalid replication queue");
  const checkpoints = [], timing = [], seenEvents = new Set(), peakEntities = {};
  let maxTotalEntities = 0, maxSnapshotBytes = 0, maxSimulationTasks = 0, maxPendingUpgradeChoices = 0;
  let upgrades = 0, rerolls = 0, banishes = 0, skips = 0, disconnected = false, reconnected = false, apexFinished = false;
  const draftActions = new Set();
  const disconnectTick = Math.round(settings.durationSeconds * SIMULATION_TICK_RATE * .37);
  const reconnectTick = disconnectTick + 5 * SIMULATION_TICK_RATE;
  const finishTick = settings.durationSeconds * SIMULATION_TICK_RATE + 3 * SIMULATION_TICK_RATE;
  const finalLogicalTick = finishTick + 2;

  const broadcast = (tick, type, slot, payload = {}) => {
    const message = { tick, type, slot, payload };
    applyMessage(replicas[0], message);
    for (let target = 1; target < replicas.length; target++) queue.enqueue({ ...message, target });
  };
  const drain = (tick) => queue.drain(tick, (envelope) => applyMessage(replicas[envelope.target], envelope));

  stableCheckpoint(replicas, 0, checkpoints, adapters, queue);
  for (let logicalTick = 0; logicalTick <= finalLogicalTick; logicalTick++) {
    const started = performance.now();
    if (logicalTick > 0 && logicalTick % 120 === 0) {
      for (let slot = 0; slot < 4; slot++) {
        const angle = logicalTick * .0031 + slot * Math.PI / 2;
        broadcast(logicalTick, "input", slot, { x: Math.cos(angle), y: Math.sin(angle), aim: angle + .4, autoAim: slot % 2 === 0 });
      }
    }
    if (logicalTick > 0 && logicalTick % 540 === 0) for (let slot = 0; slot < 4; slot++) broadcast(logicalTick, "cast", slot, { slot: logicalTick % 1080 ? "e" : "r" });
    if ([300, 900, 1500, 2100].includes(logicalTick)) broadcast(logicalTick, "grant-xp", 0);
    if (logicalTick === disconnectTick) { broadcast(logicalTick, "disconnect", 1); disconnected = true; }
    if (logicalTick === reconnectTick) { broadcast(logicalTick, "reconnect", 1); reconnected = true; }
    if (!apexFinished && logicalTick >= finishTick && replicas[0].simulation.stage === "boss") {
      broadcast(logicalTick, "finish-apex", 0); apexFinished = true;
    }

    if (replicas[0].simulation.pendingChoices) {
      const choices = replicas[0].simulation.pendingChoices;
      for (let slot = 0; slot < 4; slot++) {
        const id = replicas[0].activeIds.get(slot);
        const player = replicas[0].simulation.players.find((entry) => entry.id === id), round = player?.draft?.round || 0;
        const actionKey = `${round}:${slot}`;
        if (slot === 0 && player?.draft?.rerolls > 0 && !draftActions.has(`${actionKey}:reroll`)) {
          draftActions.add(`${actionKey}:reroll`); broadcast(logicalTick, "draft-reroll", slot); rerolls++; continue;
        }
        if (slot === 1 && player?.draft?.banishes > 0 && !draftActions.has(`${actionKey}:banish`)) {
          const target = (choices[id] || []).find(({ kind }) => kind === "weapon" || kind === "passive");
          if (target) { draftActions.add(`${actionKey}:banish`); broadcast(logicalTick, "draft-banish", slot, { choiceId: target.id }); banishes++; continue; }
        }
        if (slot === 2 && player?.draft?.skips > 0 && !draftActions.has(`${actionKey}:skip`)) {
          draftActions.add(`${actionKey}:skip`); broadcast(logicalTick, "draft-skip", slot); skips++; continue;
        }
        const choice = id && [...(choices[id] || [])].sort((a, b) => a.id.localeCompare(b.id))[0];
        if (choice) { broadcast(logicalTick, "upgrade", slot, { choiceId: choice.id }); upgrades++; }
      }
    }
    drain(logicalTick);
    adapters.onTick?.({ tick: logicalTick, replicas, queue });
    // Ability casts author their own short invulnerability windows. Reassert
    // the harness guard after commands so this structural convergence soak is
    // never accidentally converted into a combat-balance test.
    for (const replica of replicas) {
      for (const player of replica.simulation.players) player.invuln = Math.max(player.invuln, settings.durationSeconds + 20);
      replica.simulation.update(1 / SIMULATION_TICK_RATE);
    }
    timing.push(performance.now() - started);

    for (const event of replicas[0].simulation.events) if (event.type === "objective") seenEvents.add(event.title);
    for (const replica of replicas) {
      const counts = entityCounts(replica.simulation), total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      maxTotalEntities = Math.max(maxTotalEntities, total);
      maxSimulationTasks = Math.max(maxSimulationTasks, counts.tasks);
      maxPendingUpgradeChoices = Math.max(maxPendingUpgradeChoices, pendingUpgradeCount(replica.simulation));
      for (const [key, value] of Object.entries(counts)) peakEntities[key] = Math.max(peakEntities[key] || 0, value);
    }
    const serialized = JSON.stringify(replicas[0].simulation.snapshot());
    maxSnapshotBytes = Math.max(maxSnapshotBytes, new TextEncoder().encode(serialized).byteLength);
    const afterTick = logicalTick + 1;
    if (afterTick % settings.checkpointEvery === 0 || afterTick === finalLogicalTick + 1) stableCheckpoint(replicas, afterTick, checkpoints, adapters, queue);
  }
  drain(finalLogicalTick + 1);
  if (checkpoints.at(-1)?.tick !== finalLogicalTick + 1) stableCheckpoint(replicas, finalLogicalTick + 1, checkpoints, adapters, queue);

  const transport = queue.metrics();
  assertBudget(maxTotalEntities, budgets.maxTotalEntities, "maxTotalEntities");
  assertBudget(maxSnapshotBytes, budgets.maxSnapshotBytes, "maxSnapshotBytes");
  assertBudget(transport.sent, budgets.maxMessages, "maxMessages");
  assertBudget(transport.maxPending, budgets.maxPendingMessages, "maxPendingMessages");
  assertBudget(maxSimulationTasks, budgets.maxSimulationTasks, "maxSimulationTasks");
  assertBudget(maxPendingUpgradeChoices, budgets.maxPendingUpgradeChoices, "maxPendingUpgradeChoices");
  if (transport.pending !== 0 || transport.sent !== transport.delivered) throw new Error("Replication queue did not drain");
  if (!disconnected || !reconnected || replicas.some((replica) => !replica.activeIds.has(1))) throw new Error("Disconnect/reconnect lifecycle was not completed");
  if (upgrades < 4) throw new Error("Soak did not complete a squad upgrade draft");
  if (!rerolls || !banishes || !skips) throw new Error("Soak did not exercise every draft-control action");
  if (seenEvents.size < 3) throw new Error(`Soak observed only ${seenEvents.size} objective events`);
  if (replicas.some((replica) => replica.simulation.stage !== "won")) throw new Error("Soak did not reach a converged result");

  return Object.freeze({
    schema: SOAK_REPORT_SCHEMA,
    status: "passed",
    contract: { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, stepHz: SIMULATION_TICK_RATE, players: 4 },
    scenario: { map: settings.map, difficulty: settings.difficulty, durationSeconds: settings.durationSeconds },
    coverage: { upgrades, rerolls, banishes, skips, objectiveEvents: [...seenEvents].sort(), disconnected, reconnected, result: "won" },
    checkpoints,
    metrics: {
      logicalTicks: finalLogicalTick + 1, maxTotalEntities, maxSnapshotBytes, maxSimulationTasks, maxPendingUpgradeChoices,
      peakEntities, transport,
      timingAdvisoryMs: { p50: percentile(timing, .5), p95: percentile(timing, .95), p99: percentile(timing, .99), max: percentile(timing, 1) },
    },
    budgets,
  });
}

export function createSoakReport(results) {
  if (!Array.isArray(results) || !results.length || results.some((result) => result?.schema !== SOAK_REPORT_SCHEMA)) throw new TypeError("Validated soak results are required");
  return {
    schema: "lastlight.multiplayer-soak-report.v1",
    status: "passed",
    generatedAt: new Date().toISOString(),
    advisory: "Timing is informational; structural budgets and deterministic convergence are the release gates.",
    results,
  };
}
