export const REPLAY_SCHEMA = "lastlight.replay.v5";
export const REPLAY_SCHEMA_VERSION = 5;
export const LEGACY_REPLAY_SCHEMA_V4 = "lastlight.replay.v4";
export const LEGACY_REPLAY_SCHEMA_V3 = "lastlight.replay.v3";
export const LEGACY_REPLAY_SCHEMA_V2 = "lastlight.replay.v2";
export const LEGACY_REPLAY_SCHEMA = "lastlight.replay.v1";
export const REPLAY_STEP_HZ = 60;
export const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
export const MAX_REPLAY_TICK = 216_000;
export const MAX_REPLAY_COMMANDS = 100_000;
export const MAX_COMMANDS_PER_TICK = 32;
export const MAX_REPLAY_CHECKPOINTS = 721;
export const REPLAY_DRAFT_SCHEMA = "lastlight.replay-draft.v2";
export const LEGACY_REPLAY_DRAFT_SCHEMA = "lastlight.replay-draft.v1";

const MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
const SAFE_ID = /^[A-Za-z0-9._-]{1,32}$/;
const BALANCE_HASH = /^[a-z0-9]+:[0-9a-f]{8,64}$/;
const STATE_HASH = /^[0-9a-f]{16}$/;
const SEED = /^[0-9a-f]{32}$/;
const CHOICE = /^[A-Za-z][A-Za-z0-9:_-]{0,39}$/;
const FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const NO_SYNERGY_REGISTRY_VERSION = "none";
const LEGACY_FEATURES = Object.freeze({
  configVersion: "builtin-2026.07.11.3", gameplayVersion: "events-v1", objectiveEvents: true,
  squadSynergies: false, registryVersion: NO_SYNERGY_REGISTRY_VERSION,
});
const CURRENT_FEATURES = Object.freeze({
  configVersion: "release-2026.07.13.6", gameplayVersion: "synergies-v1", objectiveEvents: true,
  squadSynergies: true, registryVersion: "lastlight.squad-synergy.v1",
});

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
    if (["name", "reconnectKey", "resumeToken", "reconnectToken", "clientToken"].includes(key) || child === undefined) continue;
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

function validateCommand(tuple, index, allowDraftActions = true) {
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
  } else if (allowDraftActions && (kind === "q" || kind === "s")) {
    if (tuple.length !== 4) throw new TypeError(`commands.${index} draft tuple length is invalid`);
    slot();
  } else if (allowDraftActions && kind === "b") {
    if (tuple.length !== 5) throw new TypeError(`commands.${index} banish tuple length is invalid`);
    slot(); safeString(tuple[4], CHOICE, `commands.${index}.choice`);
  } else if (allowDraftActions && kind === "x") {
    if (tuple.length !== 6) throw new TypeError(`commands.${index} replacement tuple length is invalid`);
    slot(); safeString(tuple[4], CHOICE, `commands.${index}.choice`); safeString(tuple[5], CHOICE, `commands.${index}.replacement`);
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

/** Normalize simulation-affecting replay features without mutating legacy manifests. */
export function replayGameplayFeatures(value) {
  if (value?.schema === REPLAY_SCHEMA) {
    return Object.freeze({
      gameplayVersion: value.features.gameplayVersion,
      objectiveEvents: value.features.objectiveEvents,
      squadSynergies: value.features.squadSynergies,
      registryVersion: value.features.registryVersion,
    });
  }
  return Object.freeze({
    gameplayVersion: value?.features?.gameplayVersion || LEGACY_FEATURES.gameplayVersion,
    objectiveEvents: value?.features?.objectiveEvents ?? LEGACY_FEATURES.objectiveEvents,
    squadSynergies: false,
    registryVersion: NO_SYNERGY_REGISTRY_VERSION,
  });
}

export function validateReplay(value, expected = {}) {
  const currentSchema = value?.schema === REPLAY_SCHEMA;
  const legacyV4Schema = value?.schema === LEGACY_REPLAY_SCHEMA_V4;
  const legacyV3Schema = value?.schema === LEGACY_REPLAY_SCHEMA_V3;
  const legacyV2Schema = value?.schema === LEGACY_REPLAY_SCHEMA_V2;
  const legacySchema = value?.schema === LEGACY_REPLAY_SCHEMA;
  const hasFeatures = currentSchema || legacyV4Schema || legacyV3Schema || legacyV2Schema;
  if (!currentSchema && !legacyV4Schema && !legacyV3Schema && !legacyV2Schema && !legacySchema) throw new TypeError("Unsupported replay schema");
  assertExactKeys(value, ["schema", "build", "balance", "engine", "seed", "run", ...(hasFeatures ? ["features"] : []), "roster", "commands", "checkpoints", "finalTick", "finalHash"], "replay");
  safeString(value.build, SAFE_ID, "build");
  assertExactKeys(value.balance, ["version", "hash"], "balance");
  safeString(value.balance.version, SAFE_ID, "balance.version");
  safeString(value.balance.hash, BALANCE_HASH, "balance.hash");
  assertExactKeys(value.engine, ["stepHz", "rng"], "engine");
  if (value.engine.stepHz !== REPLAY_STEP_HZ) throw new TypeError("Unsupported replay step rate");
  safeString(value.engine.rng, SAFE_ID, "engine.rng");
  safeString(value.seed, SEED, "seed");
  const features = hasFeatures ? value.features : LEGACY_FEATURES;
  if (hasFeatures) {
    assertExactKeys(features, ["configVersion", "gameplayVersion", "objectiveEvents", ...(currentSchema ? ["squadSynergies", "registryVersion"] : [])], "features");
    safeString(features.configVersion, FEATURE_ID, "features.configVersion");
    safeString(features.gameplayVersion, FEATURE_ID, "features.gameplayVersion");
    if (typeof features.objectiveEvents !== "boolean") throw new TypeError("features.objectiveEvents must be boolean");
    if (currentSchema) {
      if (typeof features.squadSynergies !== "boolean") throw new TypeError("features.squadSynergies must be boolean");
      safeString(features.registryVersion, FEATURE_ID, "features.registryVersion");
    }
  }
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
    validateCommand(command, index, currentSchema || legacyV4Schema);
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
  if (expected.gameplayVersion && features.gameplayVersion !== expected.gameplayVersion) throw new TypeError("Replay gameplay feature version mismatch");
  const normalizedFeatures = replayGameplayFeatures(value);
  if (expected.squadSynergies !== undefined && normalizedFeatures.squadSynergies !== expected.squadSynergies) throw new TypeError("Replay squad-synergies flag mismatch");
  if (expected.registryVersion && normalizedFeatures.registryVersion !== expected.registryVersion) throw new TypeError("Replay synergy registry version mismatch");

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
  if (kind === "q") return { tick, ordinal, kind: "draft-reroll", slot: tuple[3] };
  if (kind === "b") return { tick, ordinal, kind: "draft-banish", slot: tuple[3], choiceId: tuple[4] };
  if (kind === "s") return { tick, ordinal, kind: "draft-skip", slot: tuple[3] };
  if (kind === "x") return { tick, ordinal, kind: "draft-replace", slot: tuple[3], choiceId: tuple[4], replacementId: tuple[5] };
  if (kind === "j") return { tick, ordinal, kind: "join", slot: tuple[3], specialist: tuple[4] };
  if (kind === "l") return { tick, ordinal, kind: "leave", slot: tuple[3] };
  if (kind === "r") return { tick, ordinal, kind: "reconnect", slot: tuple[3], specialist: tuple[4] };
  return { tick, ordinal, kind: "abandon" };
}

export class ReplayRecorder {
  constructor({
    build, balanceVersion, balanceHash,
    featureConfigVersion = CURRENT_FEATURES.configVersion, gameplayVersion = CURRENT_FEATURES.gameplayVersion,
    objectiveEvents = CURRENT_FEATURES.objectiveEvents, squadSynergies = CURRENT_FEATURES.squadSynergies,
    registryVersion = CURRENT_FEATURES.registryVersion, rng, seed, run,
  }) {
    safeString(featureConfigVersion, FEATURE_ID, "featureConfigVersion");
    safeString(gameplayVersion, FEATURE_ID, "gameplayVersion");
    if (typeof objectiveEvents !== "boolean") throw new TypeError("objectiveEvents must be boolean");
    if (typeof squadSynergies !== "boolean") throw new TypeError("squadSynergies must be boolean");
    safeString(registryVersion, FEATURE_ID, "registryVersion");
    this.header = {
      build, balanceVersion, balanceHash, featureConfigVersion, gameplayVersion, objectiveEvents,
      squadSynergies, registryVersion, rng, seed, run: clone(run),
    };
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
    if (activeOwner !== undefined && activeOwner !== actualId) {
      if (!reconnect) throw new TypeError("Replay slot already belongs to an active player");
      this.actualToSlot.delete(activeOwner);
      this.push(tick, "l", assigned);
    }
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

  recordInput(actualId, tick, input, { coalesceSameTick = false } = {}) {
    const slot = this.slotFor(actualId), quantized = quantizeReplayInput(input);
    const key = `${quantized.x}/${quantized.y}/${quantized.aim}/${quantized.auto}`;
    if (this.lastInputs.get(slot) === key) return null;
    this.lastInputs.set(slot, key);
    // A paused simulation can receive many pointer samples without advancing a
    // fixed tick. Only the final adjacent input for a slot can affect the next
    // simulation step, so replace it instead of overflowing the tick budget.
    const previous = this.commands.at(-1);
    if (coalesceSameTick && previous?.[0] === tick && previous[2] === "i" && previous[3] === slot) {
      const tuple = [tick, previous[1], "i", slot, quantized.x, quantized.y, quantized.aim, quantized.auto];
      validateCommand(tuple, this.commands.length - 1);
      this.commands[this.commands.length - 1] = tuple;
      return tuple;
    }
    return this.push(tick, "i", slot, quantized.x, quantized.y, quantized.aim, quantized.auto);
  }

  recordCast(actualId, tick, cast) { return this.push(tick, "c", this.slotFor(actualId), cast); }
  recordUpgrade(actualId, tick, choiceId) { return this.push(tick, "u", this.slotFor(actualId), choiceId); }
  recordDraftReroll(actualId, tick) { return this.push(tick, "q", this.slotFor(actualId)); }
  recordDraftBanish(actualId, tick, choiceId) { return this.push(tick, "b", this.slotFor(actualId), choiceId); }
  recordDraftSkip(actualId, tick) { return this.push(tick, "s", this.slotFor(actualId)); }
  recordDraftReplacement(actualId, tick, choiceId, replacementId) { return this.push(tick, "x", this.slotFor(actualId), choiceId, replacementId); }
  recordLeave(actualId, tick) { const slot = this.slotFor(actualId); this.actualToSlot.delete(actualId); return this.push(tick, "l", slot); }
  recordAbandon(tick) { return this.push(tick, "a"); }

  addCheckpoint(tick, hash) {
    integer(tick, 0, MAX_REPLAY_TICK, "checkpoint tick");
    safeString(hash, STATE_HASH, "checkpoint hash");
    this.checkpoints.push([tick, hash]);
  }

  exportDraft(currentTick) {
    integer(currentTick, 0, MAX_REPLAY_TICK, "currentTick");
    return {
      schema: REPLAY_DRAFT_SCHEMA,
      currentTick,
      header: clone(this.header),
      roster: [...this.roster.entries()].sort(([a], [b]) => a - b).map(([slot, specialist]) => ({ slot, specialist })),
      knownSlots: [...this.knownSlots.entries()].sort(([a], [b]) => a - b).map(([slot, specialist]) => ({ slot, specialist })),
      commands: clone(this.commands),
      checkpoints: clone(this.checkpoints),
      lastInputs: [...this.lastInputs.entries()].sort(([a], [b]) => a - b),
      ordinal: this.ordinal,
    };
  }

  static fromDraft(draft, players = []) {
    assertExactKeys(draft, ["schema", "currentTick", "header", "roster", "knownSlots", "commands", "checkpoints", "lastInputs", "ordinal"], "replay draft");
    const currentDraft = draft.schema === REPLAY_DRAFT_SCHEMA, legacyDraft = draft.schema === LEGACY_REPLAY_DRAFT_SCHEMA;
    if (!currentDraft && !legacyDraft) throw new TypeError("Unsupported replay draft schema");
    integer(draft.currentTick, 0, MAX_REPLAY_TICK, "replay draft currentTick");
    assertExactKeys(draft.header, [
      "build", "balanceVersion", "balanceHash", "featureConfigVersion", "gameplayVersion", "objectiveEvents",
      ...(currentDraft ? ["squadSynergies", "registryVersion"] : []), "rng", "seed", "run",
    ], "replay draft header");
    const draftFeatures = currentDraft
      ? { squadSynergies: draft.header.squadSynergies, registryVersion: draft.header.registryVersion }
      : { squadSynergies: false, registryVersion: NO_SYNERGY_REGISTRY_VERSION };
    const validationReplay = {
      schema: currentDraft ? REPLAY_SCHEMA : LEGACY_REPLAY_SCHEMA_V4,
      build: draft.header.build,
      balance: { version: draft.header.balanceVersion, hash: draft.header.balanceHash },
      features: {
        configVersion: draft.header.featureConfigVersion, gameplayVersion: draft.header.gameplayVersion,
        objectiveEvents: draft.header.objectiveEvents, ...(currentDraft ? draftFeatures : {}),
      },
      engine: { stepHz: REPLAY_STEP_HZ, rng: draft.header.rng },
      seed: draft.header.seed,
      run: draft.header.run,
      roster: draft.roster,
      commands: draft.commands,
      checkpoints: draft.checkpoints,
      finalTick: draft.currentTick,
      finalHash: "0000000000000000",
    };
    validateReplay(validationReplay);
    if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > MAX_REPLAY_BYTES) throw new TypeError("Replay draft exceeds size bounds");
    if (!Array.isArray(draft.knownSlots) || draft.knownSlots.length < draft.roster.length || draft.knownSlots.length > 4) throw new TypeError("Replay draft knownSlots are invalid");
    const knownSlots = new Map();
    for (const [index, member] of draft.knownSlots.entries()) {
      assertExactKeys(member, ["slot", "specialist"], `replay draft knownSlots.${index}`);
      integer(member.slot, 0, 3, `replay draft knownSlots.${index}.slot`);
      if (knownSlots.has(member.slot) || !SPECIALISTS.has(member.specialist)) throw new TypeError("Replay draft knownSlots are invalid");
      knownSlots.set(member.slot, member.specialist);
    }
    if (!Array.isArray(draft.lastInputs) || draft.lastInputs.length > 4) throw new TypeError("Replay draft lastInputs are invalid");
    const lastInputs = new Map();
    for (const [index, entry] of draft.lastInputs.entries()) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError(`replay draft lastInputs.${index} is invalid`);
      integer(entry[0], 0, 3, `replay draft lastInputs.${index}.slot`);
      if (typeof entry[1] !== "string" || !/^-?\d+\/-?\d+\/\d+\/[01]$/.test(entry[1])) throw new TypeError(`replay draft lastInputs.${index}.value is invalid`);
      lastInputs.set(entry[0], entry[1]);
    }
    integer(draft.ordinal, 0, MAX_REPLAY_COMMANDS, "replay draft ordinal");
    const lastOrdinal = draft.commands.at(-1)?.[1] ?? -1;
    if (draft.ordinal <= lastOrdinal) throw new TypeError("Replay draft ordinal must follow recorded commands");

    const recorder = new ReplayRecorder({ ...draft.header, ...draftFeatures });
    recorder.roster = new Map(draft.roster.map(({ slot, specialist }) => [slot, specialist]));
    recorder.knownSlots = knownSlots;
    recorder.commands = clone(draft.commands);
    recorder.checkpoints = clone(draft.checkpoints);
    recorder.lastInputs = lastInputs;
    recorder.ordinal = draft.ordinal;
    for (const player of players) {
      integer(player.replaySlot, 0, 3, "recovery player replaySlot");
      if (knownSlots.get(player.replaySlot) !== player.specialist) throw new TypeError("Recovery player does not match replay draft");
      recorder.actualToSlot.set(player.id, player.replaySlot);
    }
    return recorder;
  }

  finalize(finalTick, finalHash) {
    const replay = {
      schema: REPLAY_SCHEMA,
      build: this.header.build,
      balance: { version: this.header.balanceVersion, hash: this.header.balanceHash },
      features: {
        configVersion: this.header.featureConfigVersion, gameplayVersion: this.header.gameplayVersion,
        objectiveEvents: this.header.objectiveEvents, squadSynergies: this.header.squadSynergies,
        registryVersion: this.header.registryVersion,
      },
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
    const features = replayGameplayFeatures(this.replay);
    if (Object.hasOwn(simulation, "gameplayVersion") && simulation.gameplayVersion !== features.gameplayVersion) {
      throw new Error(`Replay gameplay feature version mismatch: expected ${features.gameplayVersion}, got ${simulation.gameplayVersion}`);
    }
    if (Object.hasOwn(simulation, "objectiveEvents") && simulation.objectiveEvents !== features.objectiveEvents) {
      throw new Error("Replay objective-events flag mismatch");
    }
    if (Object.hasOwn(simulation, "squadSynergies") && simulation.squadSynergies !== features.squadSynergies) {
      throw new Error("Replay squad-synergies flag mismatch");
    }
    if (Object.hasOwn(simulation, "synergyRegistryVersion") && simulation.synergyRegistryVersion !== features.registryVersion) {
      throw new Error("Replay synergy registry version mismatch");
    }
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
