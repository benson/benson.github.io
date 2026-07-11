export const REPLAY_SCHEMA = "lastlight.replay.v1";
export const REPLAY_SCHEMA_VERSION = 1;
export const REPLAY_STEP_HZ = 60;
export const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
export const MAX_REPLAY_TICK = 216_000;
export const MAX_REPLAY_COMMANDS = 100_000;
export const MAX_COMMANDS_PER_TICK = 32;
export const MAX_REPLAY_CHECKPOINTS = 721;

const MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
const SAFE_ID = /^[A-Za-z0-9._-]{1,32}$/;
const BALANCE_HASH = /^[a-z0-9]+:[0-9a-f]{8,64}$/;
const STATE_HASH = /^[0-9a-f]{16}$/;
const SEED = /^[0-9a-f]{32}$/;
const CHOICE = /^[a-z][a-z0-9:_-]{0,39}$/;

const ownKeys = (value) => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];

function assertExactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${path} has unexpected or missing fields`);
  }
}

function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${path} must be an integer from ${min} to ${max}`);
  return value;
}

function safeString(value, pattern, path) {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`${path} is invalid`);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) throw new TypeError("Canonical state contains a non-finite number");
  if (Object.is(value, -0)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function canonicalize(value) {
  if (typeof value === "number") return normalizeNumber(value);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Set) return [...value].map(canonicalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  throw new TypeError(`Canonical state contains unsupported ${typeof value}`);
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function fnv1a64(value) {
  const text = typeof value === "string" ? value : canonicalStringify(value);
  const bytes = new TextEncoder().encode(text);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function hashCanonicalState(value) {
  return fnv1a64(canonicalStringify(value));
}

function anonymousPlayerMap(simulation) {
  const map = new Map();
  for (const player of simulation.players || []) {
    if (!Number.isInteger(player.replaySlot) || player.replaySlot < 0 || player.replaySlot > 3) {
      throw new TypeError("Every replayed player must have an anonymous replaySlot");
    }
    map.set(player.id, `p${player.replaySlot}`);
  }
  for (const entry of simulation.disconnectedPlayers?.values?.() || []) {
    const player = entry?.player;
    if (player && Number.isInteger(player.replaySlot)) map.set(player.id, `p${player.replaySlot}`);
  }
  return map;
}

function replayEntity(value, playerMap) {
  if (value instanceof Set) return [...value].sort();
  if (Array.isArray(value)) return value.map((entry) => replayEntity(entry, playerMap));
  if (!value || typeof value !== "object") return playerMap.get(value) || value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "name" || key === "reconnectKey" || child === undefined) continue;
    if ((key === "id" && Object.hasOwn(value, "replaySlot")) || key === "owner" || key === "ownerId" || key === "playerId") {
      result[key] = playerMap.get(child) || child;
    } else result[key] = replayEntity(child, playerMap);
  }
  return result;
}

function replayKeyedObject(value, playerMap) {
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [playerMap.get(key) || key, replayEntity(child, playerMap)]));
}

/**
 * Return every future-affecting simulation value while replacing transient
 * relay identities with anonymous replay slots and excluding UI-only events.
 */
export function canonicalSimulationState(simulation) {
  if (!simulation || typeof simulation.snapshot !== "function" || typeof simulation.deterministicState !== "function") {
    throw new TypeError("A deterministic Lastlight Simulation is required");
  }
  const playerMap = anonymousPlayerMap(simulation);
  const snapshot = simulation.snapshot();
  delete snapshot.events;
  snapshot.players = (simulation.players || [])
    .map((player) => replayEntity(player, playerMap))
    .sort((a, b) => a.replaySlot - b.replaySlot);
  for (const key of ["drones", "enemies", "projectiles", "hostile", "effects", "orbs", "drops", "pods", "objectives", "relayBalls", "feathers"]) {
    snapshot[key] = replayEntity(simulation[key] || [], playerMap);
  }
  snapshot.pendingChoices = replayKeyedObject(simulation.pendingChoices, playerMap);
  snapshot.choiceReady = replayKeyedObject(simulation.choiceReady, playerMap);
  snapshot.selectedChoices = replayKeyedObject(simulation.selectedChoices, playerMap);
  snapshot.determinism = replayEntity(simulation.deterministicState(), playerMap);
  snapshot.disconnectedPlayers = [...(simulation.disconnectedPlayers?.values?.() || [])]
    .map((entry) => ({ leftTick: entry.leftTick, player: replayEntity(entry.player, playerMap) }))
    .sort((a, b) => a.player.replaySlot - b.player.replaySlot);
  return canonicalize(snapshot);
}

export function hashSimulationState(simulation) {
  return hashCanonicalState(canonicalSimulationState(simulation));
}

export function quantizeReplayInput(input = {}) {
  let x = Number(input.x || 0), y = Number(input.y || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("Input axes must be finite");
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  const aim = Number(input.aim || 0);
  if (!Number.isFinite(aim)) throw new TypeError("Input aim must be finite");
  const wrapped = ((aim % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return {
    x: Math.max(-127, Math.min(127, Math.round(x * 127))),
    y: Math.max(-127, Math.min(127, Math.round(y * 127))),
    aim: Math.round(wrapped / (Math.PI * 2) * 4095) % 4096,
    auto: input.autoAim ? 1 : 0,
  };
}

export function dequantizeReplayInput(input) {
  assertExactKeys(input, ["x", "y", "aim", "auto"], "input");
  integer(input.x, -127, 127, "input.x");
  integer(input.y, -127, 127, "input.y");
  integer(input.aim, 0, 4095, "input.aim");
  integer(input.auto, 0, 1, "input.auto");
  return { x: input.x / 127, y: input.y / 127, aim: input.aim / 4095 * Math.PI * 2, autoAim: Boolean(input.auto) };
}

function validateCommand(tuple, index) {
  if (!Array.isArray(tuple) || tuple.length < 3) throw new TypeError(`commands.${index} must be a tuple`);
  const [tick, ordinal, kind] = tuple;
  integer(tick, 0, MAX_REPLAY_TICK, `commands.${index}.tick`);
  integer(ordinal, 0, MAX_REPLAY_COMMANDS, `commands.${index}.ordinal`);
  if (typeof kind !== "string") throw new TypeError(`commands.${index}.kind is invalid`);
  const slot = (position = 3) => integer(tuple[position], 0, 3, `commands.${index}.slot`);
  if (kind === "i") {
    if (tuple.length !== 8) throw new TypeError(`commands.${index} input tuple length is invalid`);
    slot(); integer(tuple[4], -127, 127, `commands.${index}.x`); integer(tuple[5], -127, 127, `commands.${index}.y`);
    integer(tuple[6], 0, 4095, `commands.${index}.aim`); integer(tuple[7], 0, 1, `commands.${index}.auto`);
  } else if (kind === "c") {
    if (tuple.length !== 5) throw new TypeError(`commands.${index} cast tuple length is invalid`);
    slot(); if (tuple[4] !== "e" && tuple[4] !== "r") throw new TypeError(`commands.${index}.cast is invalid`);
  } else if (kind === "u") {
    if (tuple.length !== 5) throw new TypeError(`commands.${index} upgrade tuple length is invalid`);
    slot(); safeString(tuple[4], CHOICE, `commands.${index}.choice`);
  } else if (kind === "j") {
    if (tuple.length !== 5) throw new TypeError(`commands.${index} join tuple length is invalid`);
    slot(); if (!SPECIALISTS.has(tuple[4])) throw new TypeError(`commands.${index}.specialist is invalid`);
  } else if (kind === "l") {
    if (tuple.length !== 4) throw new TypeError(`commands.${index} leave tuple length is invalid`);
    slot();
  } else if (kind === "r") {
    if (tuple.length !== 4 && tuple.length !== 5) throw new TypeError(`commands.${index} reconnect tuple length is invalid`);
    slot(); if (tuple.length === 5 && !SPECIALISTS.has(tuple[4])) throw new TypeError(`commands.${index}.specialist is invalid`);
  } else if (kind === "a") {
    if (tuple.length !== 3) throw new TypeError(`commands.${index} abandon tuple length is invalid`);
  } else throw new TypeError(`commands.${index}.kind is unsupported`);
  return tuple;
}

export function validateReplay(value, expected = {}) {
  assertExactKeys(value, ["schema", "build", "balance", "engine", "seed", "run", "roster", "commands", "checkpoints", "finalTick", "finalHash"], "replay");
  if (value.schema !== REPLAY_SCHEMA) throw new TypeError("Unsupported replay schema");
  safeString(value.build, SAFE_ID, "build");
  assertExactKeys(value.balance, ["version", "hash"], "balance");
  safeString(value.balance.version, SAFE_ID, "balance.version");
  safeString(value.balance.hash, BALANCE_HASH, "balance.hash");
  assertExactKeys(value.engine, ["stepHz", "rng"], "engine");
  if (value.engine.stepHz !== REPLAY_STEP_HZ) throw new TypeError("Unsupported replay step rate");
  safeString(value.engine.rng, SAFE_ID, "engine.rng");
  safeString(value.seed, SEED, "seed");
  assertExactKeys(value.run, ["map", "difficulty", "duration"], "run");
  if (!MAPS.has(value.run.map)) throw new TypeError("run.map is invalid");
  if (!DIFFICULTIES.has(value.run.difficulty)) throw new TypeError("run.difficulty is invalid");
  integer(value.run.duration, 60, 3600, "run.duration");

  if (!Array.isArray(value.roster) || value.roster.length < 1 || value.roster.length > 4) throw new TypeError("roster must contain one to four specialists");
  const slots = new Set();
  for (const [index, member] of value.roster.entries()) {
    assertExactKeys(member, ["slot", "specialist"], `roster.${index}`);
    integer(member.slot, 0, 3, `roster.${index}.slot`);
    if (slots.has(member.slot)) throw new TypeError("roster slots must be unique");
    slots.add(member.slot);
    if (!SPECIALISTS.has(member.specialist)) throw new TypeError(`roster.${index}.specialist is invalid`);
  }

  if (!Array.isArray(value.commands) || value.commands.length > MAX_REPLAY_COMMANDS) throw new TypeError("commands exceed replay bounds");
  let previousTick = -1, previousOrdinal = -1, commandsAtTick = 0;
  for (const [index, command] of value.commands.entries()) {
    validateCommand(command, index);
    const [tick, ordinal] = command;
    if (tick < previousTick || ordinal <= previousOrdinal) throw new TypeError("commands must be ordered by tick and globally increasing ordinal");
    commandsAtTick = tick === previousTick ? commandsAtTick + 1 : 1;
    if (commandsAtTick > MAX_COMMANDS_PER_TICK) throw new TypeError("too many commands at one tick");
    previousTick = tick; previousOrdinal = ordinal;
  }

  if (!Array.isArray(value.checkpoints) || value.checkpoints.length > MAX_REPLAY_CHECKPOINTS) throw new TypeError("checkpoints exceed replay bounds");
  let checkpointTick = -1;
  for (const [index, checkpoint] of value.checkpoints.entries()) {
    if (!Array.isArray(checkpoint) || checkpoint.length !== 2) throw new TypeError(`checkpoints.${index} must be a tuple`);
    integer(checkpoint[0], 0, MAX_REPLAY_TICK, `checkpoints.${index}.tick`);
    if (checkpoint[0] % 300 !== 0 || checkpoint[0] <= checkpointTick) throw new TypeError("checkpoints must be unique ordered five-second ticks");
    safeString(checkpoint[1], STATE_HASH, `checkpoints.${index}.hash`);
    checkpointTick = checkpoint[0];
  }
  integer(value.finalTick, 0, MAX_REPLAY_TICK, "finalTick");
  safeString(value.finalHash, STATE_HASH, "finalHash");
  if (previousTick > value.finalTick || checkpointTick > value.finalTick) throw new TypeError("finalTick precedes replay data");

  if (expected.build && value.build !== expected.build) throw new TypeError("Replay build mismatch");
  if (expected.balanceVersion && value.balance.version !== expected.balanceVersion) throw new TypeError("Replay balance version mismatch");
  if (expected.balanceHash && value.balance.hash !== expected.balanceHash) throw new TypeError("Replay balance hash mismatch");
  if (expected.rng && value.engine.rng !== expected.rng) throw new TypeError("Replay RNG mismatch");
  if (expected.stepHz && value.engine.stepHz !== expected.stepHz) throw new TypeError("Replay step rate mismatch");

  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_REPLAY_BYTES) throw new TypeError("Replay exceeds 2 MB");
  return clone(value);
}

export function decodeReplayCommand(tuple) {
  validateCommand(tuple, 0);
  const [tick, ordinal, kind] = tuple;
  if (kind === "i") return { tick, ordinal, kind: "input", slot: tuple[3], input: dequantizeReplayInput({ x: tuple[4], y: tuple[5], aim: tuple[6], auto: tuple[7] }) };
  if (kind === "c") return { tick, ordinal, kind: "cast", slot: tuple[3], cast: tuple[4] };
  if (kind === "u") return { tick, ordinal, kind: "upgrade", slot: tuple[3], choiceId: tuple[4] };
  if (kind === "j") return { tick, ordinal, kind: "join", slot: tuple[3], specialist: tuple[4] };
  if (kind === "l") return { tick, ordinal, kind: "leave", slot: tuple[3] };
  if (kind === "r") return { tick, ordinal, kind: "reconnect", slot: tuple[3], specialist: tuple[4] };
  return { tick, ordinal, kind: "abandon" };
}

export class ReplayRecorder {
  constructor({ build, balanceVersion, balanceHash, rng, seed, run }) {
    this.header = { build, balanceVersion, balanceHash, rng, seed, run: clone(run) };
    this.actualToSlot = new Map();
    this.roster = new Map();
    this.knownSlots = new Map();
    this.commands = [];
    this.checkpoints = [];
    this.lastInputs = new Map();
    this.ordinal = 0;
  }

  registerPlayer(actualId, specialist, { slot, tick = 0, initial = false, reconnect = false } = {}) {
    if (actualId === null || actualId === undefined) throw new TypeError("A transient player id is required");
    if (!SPECIALISTS.has(specialist)) throw new TypeError("Unknown specialist");
    const assigned = slot === undefined ? [0, 1, 2, 3].find((candidate) => !this.knownSlots.has(candidate)) : slot;
    integer(assigned, 0, 3, "slot");
    const activeOwner = [...this.actualToSlot.entries()].find(([, activeSlot]) => activeSlot === assigned)?.[0];
    if (activeOwner !== undefined && activeOwner !== actualId) throw new TypeError("Replay slot already belongs to an active player");
    this.actualToSlot.set(actualId, assigned);
    this.knownSlots.set(assigned, specialist);
    if (initial) this.roster.set(assigned, specialist);
    if (!initial) this.push(tick, reconnect ? "r" : "j", assigned, specialist);
    return assigned;
  }

  slotFor(actualId) {
    const slot = this.actualToSlot.get(actualId);
    if (slot === undefined) throw new TypeError("Player is not registered for replay");
    return slot;
  }

  push(tick, kind, ...payload) {
    const tuple = [tick, this.ordinal++, kind, ...payload];
    validateCommand(tuple, this.commands.length);
    this.commands.push(tuple);
    return tuple;
  }

  recordInput(actualId, tick, input) {
    const slot = this.slotFor(actualId), quantized = quantizeReplayInput(input);
    const key = `${quantized.x}/${quantized.y}/${quantized.aim}/${quantized.auto}`;
    if (this.lastInputs.get(slot) === key) return null;
    this.lastInputs.set(slot, key);
    return this.push(tick, "i", slot, quantized.x, quantized.y, quantized.aim, quantized.auto);
  }

  recordCast(actualId, tick, cast) { return this.push(tick, "c", this.slotFor(actualId), cast); }
  recordUpgrade(actualId, tick, choiceId) { return this.push(tick, "u", this.slotFor(actualId), choiceId); }
  recordLeave(actualId, tick) { const slot = this.slotFor(actualId); this.actualToSlot.delete(actualId); return this.push(tick, "l", slot); }
  recordAbandon(tick) { return this.push(tick, "a"); }

  addCheckpoint(tick, hash) {
    integer(tick, 0, MAX_REPLAY_TICK, "checkpoint tick");
    safeString(hash, STATE_HASH, "checkpoint hash");
    this.checkpoints.push([tick, hash]);
  }

  finalize(finalTick, finalHash) {
    const replay = {
      schema: REPLAY_SCHEMA,
      build: this.header.build,
      balance: { version: this.header.balanceVersion, hash: this.header.balanceHash },
      engine: { stepHz: REPLAY_STEP_HZ, rng: this.header.rng },
      seed: this.header.seed,
      run: clone(this.header.run),
      roster: [...this.roster.entries()].sort(([a], [b]) => a - b).map(([slot, specialist]) => ({ slot, specialist })),
      commands: clone(this.commands), checkpoints: clone(this.checkpoints), finalTick, finalHash,
    };
    return validateReplay(replay);
  }
}

export class ReplayDriver {
  constructor(replay, adapters, expected = {}) {
    this.replay = validateReplay(replay, expected);
    if (!adapters || typeof adapters.createSimulation !== "function" || typeof adapters.applyCommand !== "function" || typeof adapters.stepSimulation !== "function" || typeof adapters.hashState !== "function") {
      throw new TypeError("ReplayDriver requires createSimulation, applyCommand, stepSimulation, and hashState adapters");
    }
    this.adapters = adapters;
  }

  run() {
    const simulation = this.adapters.createSimulation(this.replay);
    const checkpoints = new Map(this.replay.checkpoints);
    let commandIndex = 0;
    for (let tick = 0; tick <= this.replay.finalTick; tick++) {
      if (checkpoints.has(tick)) {
        const actual = this.adapters.hashState(simulation);
        if (actual !== checkpoints.get(tick)) throw new Error(`Replay diverged at tick ${tick}: expected ${checkpoints.get(tick)}, got ${actual}`);
      }
      while (this.replay.commands[commandIndex]?.[0] === tick) {
        this.adapters.applyCommand(simulation, decodeReplayCommand(this.replay.commands[commandIndex++]));
      }
      if (tick < this.replay.finalTick) this.adapters.stepSimulation(simulation, 1 / REPLAY_STEP_HZ, tick);
    }
    const finalHash = this.adapters.hashState(simulation);
    if (finalHash !== this.replay.finalHash) throw new Error(`Replay final hash mismatch: expected ${this.replay.finalHash}, got ${finalHash}`);
    return { simulation, finalHash, finalTick: this.replay.finalTick };
  }
}
