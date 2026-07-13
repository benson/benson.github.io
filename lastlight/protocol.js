export const MULTIPLAYER_PROTOCOL_VERSION = 3;
export const LEGACY_MULTIPLAYER_PROTOCOL_VERSION = 2;
export const MAX_INPUT_SEQUENCE = 0x7fffffff;
export const MAX_PENDING_INPUTS = 256;
export const DRAFT_PROTOCOL_VERSION = 2;
export const LEGACY_DRAFT_PROTOCOL_VERSION = 1;

const PLAYER_ID = /^[A-Za-z0-9_-]{1,32}$/;
const CHOICE_ID = /^(?:weapon|passive):[A-Za-z][A-Za-z0-9]{0,23}$/;

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function sequence(value, label = "sequence") {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INPUT_SEQUENCE) throw new TypeError(`${label} is invalid`);
  return value;
}

function finiteRange(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

export function validateNetworkInput(input) {
  exactKeys(input, ["x", "y", "aim", "autoAim"], "network input");
  if (typeof input.autoAim !== "boolean") throw new TypeError("network input autoAim must be boolean");
  return Object.freeze({
    x: finiteRange(input.x, -1, 1, "network input x"),
    y: finiteRange(input.y, -1, 1, "network input y"),
    aim: finiteRange(input.aim, -Math.PI, Math.PI, "network input aim"),
    autoAim: input.autoAim,
  });
}

export function sanitizeInputMessage(value, { allowLegacy = true, transport = false } = {}) {
  const transportKeys = transport && Object.hasOwn(value || {}, "_from") ? ["_from"] : [];
  if (value?.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION) {
    exactKeys(value, ["type", "protocolVersion", "epoch", "seq", "input", ...transportKeys], "input message");
    if (value.type !== "input") throw new TypeError("input message type is invalid");
    const result = { type: "input", protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, epoch: epoch(value.epoch), seq: sequence(value.seq), input: validateNetworkInput(value.input) };
    if (transportKeys.length) result._from = value._from;
    return result;
  }
  if (value?.protocolVersion === LEGACY_MULTIPLAYER_PROTOCOL_VERSION) {
    if (!allowLegacy) throw new TypeError("Legacy input protocol is unsupported");
    exactKeys(value, ["type", "protocolVersion", "seq", "input", ...transportKeys], "legacy v2 input message");
    if (value.type !== "input") throw new TypeError("input message type is invalid");
    const result = { type: "input", protocolVersion: LEGACY_MULTIPLAYER_PROTOCOL_VERSION, seq: sequence(value.seq), input: validateNetworkInput(value.input) };
    if (transportKeys.length) result._from = value._from;
    return result;
  }
  if (!allowLegacy) throw new TypeError("Legacy input protocol is unsupported");
  exactKeys(value, ["type", "input", ...transportKeys], "legacy input message");
  if (value.type !== "input") throw new TypeError("input message type is invalid");
  const result = { type: "input", input: validateNetworkInput(value.input) };
  if (transportKeys.length) result._from = value._from;
  return result;
}

export function validateAcknowledgements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("snapshot acknowledgements must be an object");
  const entries = Object.entries(value);
  if (entries.length > 4) throw new TypeError("snapshot acknowledgements exceed squad bounds");
  const result = {};
  for (const [playerId, acknowledged] of entries) {
    if (!PLAYER_ID.test(playerId)) throw new TypeError("snapshot acknowledgement player id is invalid");
    result[playerId] = sequence(acknowledged, "snapshot acknowledgement");
  }
  return Object.freeze(result);
}

export function createSnapshotMessage(state, acknowledgements = {}, { epoch: authorityEpoch = 0, snapshotSeq = 0 } = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("snapshot state must be an object");
  return {
    type: "snapshot", protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, epoch: epoch(authorityEpoch), snapshotSeq: sequence(snapshotSeq, "snapshot sequence"),
    tick: sequence(state.tick, "snapshot tick"), ack: validateAcknowledgements(acknowledgements), state,
  };
}

export function sanitizeSnapshotMessage(value, { allowLegacy = true, transport = false } = {}) {
  const transportKeys = transport && Object.hasOwn(value || {}, "_from") ? ["_from"] : [];
  if (value?.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION) {
    exactKeys(value, ["type", "protocolVersion", "epoch", "snapshotSeq", "tick", "ack", "state", ...transportKeys], "snapshot message");
    if (value.type !== "snapshot" || !value.state || typeof value.state !== "object" || Array.isArray(value.state)) throw new TypeError("snapshot message is invalid");
    if (value.state.tick !== value.tick) throw new TypeError("snapshot tick does not match state");
    const result = createSnapshotMessage(value.state, value.ack, { epoch: value.epoch, snapshotSeq: value.snapshotSeq });
    if (transportKeys.length) result._from = value._from;
    return result;
  }
  if (value?.protocolVersion === LEGACY_MULTIPLAYER_PROTOCOL_VERSION) {
    if (!allowLegacy) throw new TypeError("Legacy snapshot protocol is unsupported");
    exactKeys(value, ["type", "protocolVersion", "ack", "state", ...transportKeys], "legacy v2 snapshot message");
    if (value.type !== "snapshot" || !value.state || typeof value.state !== "object" || Array.isArray(value.state)) throw new TypeError("snapshot message is invalid");
    const result = { type: "snapshot", protocolVersion: LEGACY_MULTIPLAYER_PROTOCOL_VERSION, ack: validateAcknowledgements(value.ack), state: value.state };
    if (transportKeys.length) result._from = value._from;
    return result;
  }
  if (!allowLegacy) throw new TypeError("Legacy snapshot protocol is unsupported");
  exactKeys(value, ["type", "state", ...transportKeys], "legacy snapshot message");
  if (value.type !== "snapshot" || !value.state || typeof value.state !== "object" || Array.isArray(value.state)) throw new TypeError("snapshot message is invalid");
  const result = { type: "snapshot", state: value.state };
  if (transportKeys.length) result._from = value._from;
  return result;
}

function epoch(value, label = "authority epoch") { return sequence(value, label); }

export function sanitizeDraftActionMessage(value, { transport = false } = {}) {
  const transportKeys = transport && Object.hasOwn(value || {}, "_from") ? ["_from"] : [];
  const action = String(value?.action || "");
  const modern = value?.protocolVersion === DRAFT_PROTOCOL_VERSION, legacy = value?.protocolVersion === LEGACY_DRAFT_PROTOCOL_VERSION;
  if (!modern && !legacy) throw new TypeError("draft action message protocol is invalid");
  const fields = ["type", "protocolVersion", ...(modern ? ["epoch"] : []), "action", "round", "revision", ...transportKeys];
  if (["pick", "banish", "replace"].includes(action)) fields.push("choiceId");
  if (action === "replace") fields.push("replacementId");
  exactKeys(value, fields, "draft action message");
  if (value.type !== "draft_action" || !["pick", "reroll", "banish", "skip", "replace"].includes(action)) throw new TypeError("draft action message is invalid");
  const result = {
    type: "draft_action", protocolVersion: value.protocolVersion, ...(modern ? { epoch: epoch(value.epoch) } : {}), action,
    round: sequence(value.round, "draft round"), revision: sequence(value.revision, "draft revision"),
  };
  if (fields.includes("choiceId")) {
    if (!CHOICE_ID.test(String(value.choiceId || ""))) throw new TypeError("draft choice id is invalid");
    result.choiceId = value.choiceId;
  }
  if (action === "replace") {
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(String(value.replacementId || ""))) throw new TypeError("draft replacement id is invalid");
    result.replacementId = value.replacementId;
  }
  if (transportKeys.length) {
    if (!PLAYER_ID.test(String(value._from || ""))) throw new TypeError("draft sender is invalid");
    result._from = value._from;
  }
  return Object.freeze(result);
}

export function createDraftActionMessage(action, authorityEpoch = 0) {
  return sanitizeDraftActionMessage({ ...action, type: "draft_action", protocolVersion: DRAFT_PROTOCOL_VERSION, epoch: authorityEpoch });
}

export class HostInputSequenceGate {
  constructor(authorityEpoch = 0) { this.reset({ epoch: authorityEpoch }); }

  reset({ epoch: authorityEpoch = 0, acknowledgements = {} } = {}) {
    this.epoch = epoch(authorityEpoch);
    this.lastApplied = new Map();
    this.modernPlayers = new Set();
    this.rejectedStale = 0;
    this.rejectedInvalid = 0;
    this.rejectedEpoch = 0;
    this.restore(acknowledgements, this.epoch);
  }

  restore(acknowledgements = {}, authorityEpoch = this.epoch) {
    this.epoch = epoch(authorityEpoch);
    const restored = validateAcknowledgements(acknowledgements);
    this.lastApplied = new Map(Object.entries(restored));
    this.modernPlayers = new Set(this.lastApplied.keys());
    return this;
  }

  apply(playerId, message) {
    if (!PLAYER_ID.test(String(playerId || ""))) { this.rejectedInvalid++; return { accepted: false, reason: "invalid-player" }; }
    let parsed;
    try { parsed = sanitizeInputMessage(message, { allowLegacy: true, transport: true }); }
    catch { this.rejectedInvalid++; return { accepted: false, reason: "invalid-message" }; }
    if (parsed.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
      if (this.epoch > 0 || this.modernPlayers.has(playerId)) { this.rejectedStale++; return { accepted: false, reason: "legacy-after-v3" }; }
      return { accepted: true, legacy: true, input: parsed.input };
    }
    if (parsed.epoch !== this.epoch) { this.rejectedEpoch++; return { accepted: false, reason: "stale-epoch" }; }
    this.modernPlayers.add(playerId);
    const last = this.lastApplied.get(playerId);
    if (last !== undefined && parsed.seq <= last) { this.rejectedStale++; return { accepted: false, reason: "stale-sequence" }; }
    this.lastApplied.set(playerId, parsed.seq);
    return { accepted: true, legacy: false, seq: parsed.seq, input: parsed.input };
  }

  remove(playerId) {
    this.lastApplied.delete(playerId);
    this.modernPlayers.delete(playerId);
  }

  acknowledgements() {
    return Object.fromEntries([...this.lastApplied.entries()].slice(0, 4));
  }

  diagnostics() {
    return { protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, epoch: this.epoch, sequencedPeers: this.modernPlayers.size, rejectedStale: this.rejectedStale, rejectedInvalid: this.rejectedInvalid, rejectedEpoch: this.rejectedEpoch };
  }
}

export class GuestInputSequenceTracker {
  constructor(authorityEpoch = 0) { this.reset({ epoch: authorityEpoch }); }

  reset({ epoch: authorityEpoch = 0 } = {}) {
    this.epoch = epoch(authorityEpoch);
    this.nextSequence = 0;
    this.lastSent = -1;
    this.lastAcknowledged = -1;
    this.lastAcknowledgedAt = 0;
    this.lastSnapshotAt = 0;
    this.mode = "awaiting-snapshot";
    this.pending = new Map();
    this.droppedPending = 0;
    this.invalidAcknowledgements = 0;
  }

  create(input, now = performance.now()) {
    if (this.nextSequence > MAX_INPUT_SEQUENCE) throw new RangeError("Input sequence space exhausted; reconnect required");
    const seq = this.nextSequence++;
    this.lastSent = seq;
    const message = { type: "input", protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, epoch: this.epoch, seq, input: validateNetworkInput(input) };
    this.pending.set(seq, { sentAt: Number(now) || 0, message });
    if (this.pending.size > MAX_PENDING_INPUTS) {
      this.pending.delete(this.pending.keys().next().value);
      this.droppedPending++;
    }
    return message;
  }

  acknowledge(value, now = performance.now()) {
    this.mode = "v3";
    this.lastSnapshotAt = Number(now) || 0;
    if (value === undefined) return false;
    try { sequence(value, "acknowledgement"); }
    catch { this.invalidAcknowledgements++; return false; }
    if (value > this.lastSent || value < this.lastAcknowledged) { this.invalidAcknowledgements++; return false; }
    if (value === this.lastAcknowledged) return true;
    this.lastAcknowledged = value;
    this.lastAcknowledgedAt = this.lastSnapshotAt;
    for (const pending of [...this.pending.keys()]) if (pending <= value) this.pending.delete(pending);
    return true;
  }

  observeLegacySnapshot(now = performance.now()) {
    this.mode = "legacy";
    this.lastSnapshotAt = Number(now) || 0;
  }

  setEpoch(authorityEpoch) { this.epoch = epoch(authorityEpoch); return this; }

  pendingMessagesAfter(acknowledged = -1) {
    return [...this.pending.entries()].filter(([seq]) => seq > acknowledged).map(([, entry]) => entry.message);
  }

  diagnostics(now = performance.now()) {
    const at = Number(now) || 0;
    const oldest = this.pending.values().next().value?.sentAt;
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      epoch: this.epoch,
      mode: this.mode,
      lastSentSequence: this.lastSent,
      lastAcknowledgedSequence: this.lastAcknowledged,
      pendingInputs: this.pending.size,
      oldestPendingMs: oldest === undefined ? 0 : Math.max(0, Math.round(at - oldest)),
      acknowledgementAgeMs: this.lastAcknowledgedAt ? Math.max(0, Math.round(at - this.lastAcknowledgedAt)) : null,
      droppedPending: this.droppedPending,
      invalidAcknowledgements: this.invalidAcknowledgements,
    };
  }
}
