import { RECOVERY_SIMULATION_VERSION } from "./recovery.js?v=20260718.2";

export const HOST_MIGRATION_SCHEMA = "lastlight.host-migration.v1";
export const HOST_MIGRATION_PROTOCOL_VERSION = 10;
export const MAX_AUTHORITY_EPOCH = 0x7fffffff;
export const MAX_MIGRATION_CHECKPOINT_BYTES = 1_500_000;
export const MIGRATION_CHECKPOINT_INTERVAL_TICKS = 60;
export const MIGRATION_PREPARE_TIMEOUT_MS = 6_000;

const SAFE_ID = /^[A-Za-z0-9_-]{1,32}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BALANCE_HASH = /^[a-z0-9]+:[0-9a-f]{8,64}$/;
const STATE_HASH = /^[0-9a-f]{16}$/;
const CHECKPOINT_ID = /^e[0-9]+-t[0-9]+-[0-9a-f]{16}$/;
const FORBIDDEN_PRIVATE_FIELDS = new Set(["resumeToken", "reconnectKey", "clientToken", "callsign", "roomCode", "contact", "email"]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

function safeString(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function encodedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertAnonymousPayload(value) {
  const pending = [value], seen = new WeakSet();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, entry] of Object.entries(current)) {
      if (FORBIDDEN_PRIVATE_FIELDS.has(key)) throw new TypeError(`migration checkpoint contains private field ${key}`);
      if (entry && typeof entry === "object") pending.push(entry);
    }
  }
}

export function validateMigrationCompatibility(value) {
  exactKeys(value, [
    "build", "balanceVersion", "balanceHash", "configVersion", "gameplayVersion", "objectiveEvents",
    "squadSynergies", "sharedParticipationCredit", "downedActivity", "joinInProgressNormalization", "squadEnemyDirector", "mapMechanics", "campaignMutations", "specialistMastery", "rareDiscoveries", "registryVersion", "recoveryVersion",
  ], "migration compatibility");
  if (typeof value.objectiveEvents !== "boolean") throw new TypeError("migration compatibility objectiveEvents is invalid");
  if (typeof value.squadSynergies !== "boolean") throw new TypeError("migration compatibility squadSynergies is invalid");
  if (typeof value.sharedParticipationCredit !== "boolean") throw new TypeError("migration compatibility sharedParticipationCredit is invalid");
  if (typeof value.downedActivity !== "boolean") throw new TypeError("migration compatibility downedActivity is invalid");
  if (typeof value.joinInProgressNormalization !== "boolean") throw new TypeError("migration compatibility joinInProgressNormalization is invalid");
  if (typeof value.squadEnemyDirector !== "boolean") throw new TypeError("migration compatibility squadEnemyDirector is invalid");
  if (typeof value.mapMechanics !== "boolean") throw new TypeError("migration compatibility mapMechanics is invalid");
  if (typeof value.campaignMutations !== "boolean") throw new TypeError("migration compatibility campaignMutations is invalid");
  if (typeof value.specialistMastery !== "boolean") throw new TypeError("migration compatibility specialistMastery is invalid");
  if (typeof value.rareDiscoveries !== "boolean") throw new TypeError("migration compatibility rareDiscoveries is invalid");
  return Object.freeze({
    build: safeString(value.build, SAFE_VERSION, "migration build"),
    balanceVersion: safeString(value.balanceVersion, SAFE_VERSION, "migration balance version"),
    balanceHash: safeString(value.balanceHash, BALANCE_HASH, "migration balance hash"),
    configVersion: safeString(value.configVersion, SAFE_VERSION, "migration config version"),
    gameplayVersion: safeString(value.gameplayVersion, SAFE_VERSION, "migration gameplay version"),
    objectiveEvents: value.objectiveEvents,
    squadSynergies: value.squadSynergies,
    sharedParticipationCredit: value.sharedParticipationCredit,
    downedActivity: value.downedActivity,
    joinInProgressNormalization: value.joinInProgressNormalization,
    squadEnemyDirector: value.squadEnemyDirector,
    mapMechanics: value.mapMechanics,
    campaignMutations: value.campaignMutations,
    specialistMastery: value.specialistMastery,
    rareDiscoveries: value.rareDiscoveries,
    registryVersion: safeString(value.registryVersion, SAFE_VERSION, "migration synergy registry version"),
    recoveryVersion: integer(value.recoveryVersion, RECOVERY_SIMULATION_VERSION, RECOVERY_SIMULATION_VERSION, "migration recovery version"),
  });
}

export function migrationCompatibilityMatches(left, right) {
  try {
    const a = validateMigrationCompatibility(left), b = validateMigrationCompatibility(right);
    return Object.keys(a).every((key) => a[key] === b[key]);
  } catch { return false; }
}

export function validateMigrationCapabilities(value) {
  exactKeys(value, ["schema", "protocolVersion", "compatibility"], "migration capabilities");
  if (value.schema !== HOST_MIGRATION_SCHEMA || value.protocolVersion !== HOST_MIGRATION_PROTOCOL_VERSION) {
    throw new TypeError("Unsupported host migration capabilities");
  }
  return Object.freeze({
    schema: HOST_MIGRATION_SCHEMA,
    protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION,
    compatibility: validateMigrationCompatibility(value.compatibility),
  });
}

export function createMigrationCapabilities(compatibility) {
  return validateMigrationCapabilities({
    schema: HOST_MIGRATION_SCHEMA,
    protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION,
    compatibility,
  });
}

export function validateAuthorityEpoch(value, label = "authority epoch") {
  return integer(value, 0, MAX_AUTHORITY_EPOCH, label);
}

export function validateMigrationRoster(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) throw new TypeError("migration roster is invalid");
  const ids = new Set(), slots = new Set();
  const roster = value.map((member, index) => {
    exactKeys(member, ["id", "replaySlot"], `migration roster ${index}`);
    const id = safeString(member.id, SAFE_ID, `migration roster ${index} id`);
    const replaySlot = integer(member.replaySlot, 0, 3, `migration roster ${index} replaySlot`);
    if (ids.has(id) || slots.has(replaySlot)) throw new TypeError("migration roster must use unique ids and slots");
    ids.add(id); slots.add(replaySlot);
    return Object.freeze({ id, replaySlot });
  });
  for (let index = 1; index < roster.length; index++) {
    if (roster[index - 1].replaySlot >= roster[index].replaySlot) throw new TypeError("migration roster must be ordered by replaySlot");
  }
  return Object.freeze(roster);
}

export function migrationCheckpointId(epoch, tick, hash) {
  return `e${validateAuthorityEpoch(epoch)}-t${integer(tick, 0, Number.MAX_SAFE_INTEGER, "migration tick")}-${safeString(hash, STATE_HASH, "migration hash")}`;
}

export function validateMigrationCheckpoint(value, { maxBytes = MAX_MIGRATION_CHECKPOINT_BYTES } = {}) {
  exactKeys(value, [
    "type", "schema", "protocolVersion", "epoch", "checkpointId", "tick", "hash", "ack",
    "compatibility", "roster", "simulation", "replay",
  ], "migration checkpoint");
  if (value.type !== "migration_checkpoint" || value.schema !== HOST_MIGRATION_SCHEMA || value.protocolVersion !== HOST_MIGRATION_PROTOCOL_VERSION) {
    throw new TypeError("Unsupported migration checkpoint");
  }
  const epoch = validateAuthorityEpoch(value.epoch), tick = integer(value.tick, 0, Number.MAX_SAFE_INTEGER, "migration tick");
  const hash = safeString(value.hash, STATE_HASH, "migration hash");
  if (value.checkpointId !== migrationCheckpointId(epoch, tick, hash) || !CHECKPOINT_ID.test(value.checkpointId)) {
    throw new TypeError("migration checkpoint identity is invalid");
  }
  const roster = validateMigrationRoster(value.roster), rosterIds = new Set(roster.map(({ id }) => id));
  if (!value.ack || typeof value.ack !== "object" || Array.isArray(value.ack) || Object.keys(value.ack).length > roster.length) {
    throw new TypeError("migration acknowledgement frontier is invalid");
  }
  const ack = {};
  for (const [id, sequence] of Object.entries(value.ack)) {
    if (!rosterIds.has(id)) throw new TypeError("migration acknowledgement references an unknown player");
    ack[id] = integer(sequence, 0, 0x7fffffff, "migration acknowledgement");
  }
  if (!value.simulation || value.simulation.version !== RECOVERY_SIMULATION_VERSION || value.simulation.scalars?.tick !== tick) {
    throw new TypeError("migration recovery state does not match its tick");
  }
  if (value.replay !== null && (!value.replay || value.replay.currentTick !== tick)) {
    throw new TypeError("migration replay draft does not match its tick");
  }
  assertAnonymousPayload(value.simulation);
  if (value.replay !== null) assertAnonymousPayload(value.replay);
  const checkpoint = {
    type: "migration_checkpoint", schema: HOST_MIGRATION_SCHEMA, protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION,
    epoch, checkpointId: value.checkpointId, tick, hash, ack: Object.freeze(ack),
    compatibility: validateMigrationCompatibility(value.compatibility), roster,
    simulation: value.simulation, replay: value.replay,
  };
  if (encodedBytes(checkpoint) > maxBytes) throw new TypeError("migration checkpoint exceeds size bounds");
  return Object.freeze(checkpoint);
}

export function createMigrationCheckpoint(value) {
  const checkpointId = migrationCheckpointId(value.epoch, value.tick, value.hash);
  return validateMigrationCheckpoint({ ...value, type: "migration_checkpoint", schema: HOST_MIGRATION_SCHEMA, protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION, checkpointId });
}

export function validateMigrationReady(value) {
  exactKeys(value, ["type", "schema", "protocolVersion", "epoch", "checkpointId", "tick", "hash"], "migration ready");
  if (value.type !== "migration_ready" || value.schema !== HOST_MIGRATION_SCHEMA || value.protocolVersion !== HOST_MIGRATION_PROTOCOL_VERSION) {
    throw new TypeError("Unsupported migration readiness message");
  }
  return Object.freeze({
    type: "migration_ready", schema: HOST_MIGRATION_SCHEMA, protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION,
    epoch: validateAuthorityEpoch(value.epoch), checkpointId: safeString(value.checkpointId, CHECKPOINT_ID, "migration checkpoint id"),
    tick: integer(value.tick, 0, Number.MAX_SAFE_INTEGER, "migration ready tick"), hash: safeString(value.hash, STATE_HASH, "migration ready hash"),
  });
}

export function createMigrationReady({ epoch, checkpointId, tick, hash }) {
  return validateMigrationReady({ type: "migration_ready", schema: HOST_MIGRATION_SCHEMA, protocolVersion: HOST_MIGRATION_PROTOCOL_VERSION, epoch, checkpointId, tick, hash });
}

export class AuthoritySnapshotGate {
  constructor() { this.reset(); }

  reset({ epoch = 0, hostId = "" } = {}) {
    this.epoch = validateAuthorityEpoch(epoch);
    this.hostId = hostId ? safeString(hostId, SAFE_ID, "authority host") : "";
    this.lastTick = -1;
    this.lastSequence = -1;
    this.rejected = { staleEpoch: 0, wrongHost: 0, rewind: 0, invalid: 0 };
  }

  commit({ epoch, hostId }) {
    const next = validateAuthorityEpoch(epoch);
    if (next < this.epoch) throw new TypeError("authority epoch cannot move backwards");
    this.epoch = next;
    this.hostId = safeString(hostId, SAFE_ID, "authority host");
    this.lastTick = -1;
    this.lastSequence = -1;
  }

  accept({ epoch, hostId, tick, sequence }) {
    try {
      epoch = validateAuthorityEpoch(epoch); hostId = safeString(hostId, SAFE_ID, "authority host");
      tick = integer(tick, 0, Number.MAX_SAFE_INTEGER, "snapshot tick"); sequence = integer(sequence, 0, 0x7fffffff, "snapshot sequence");
    } catch { this.rejected.invalid++; return false; }
    if (epoch !== this.epoch) { this.rejected.staleEpoch++; return false; }
    if (this.hostId && hostId !== this.hostId) { this.rejected.wrongHost++; return false; }
    if (tick < this.lastTick || (tick === this.lastTick && sequence <= this.lastSequence)) { this.rejected.rewind++; return false; }
    this.hostId = hostId; this.lastTick = tick; this.lastSequence = sequence; return true;
  }

  diagnostics() { return { epoch: this.epoch, hostKnown: Boolean(this.hostId), lastTick: this.lastTick, lastSequence: this.lastSequence, ...this.rejected }; }
}
