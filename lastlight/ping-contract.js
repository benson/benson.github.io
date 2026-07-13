export const PING_PROTOCOL_VERSION = 1;
export const PING_LIFETIME_TICKS = 180;
export const PING_RATE_CAPACITY = 4;
export const PING_RATE_REFILL_MS = 2_000;
export const PING_HOST_COOLDOWN_TICKS = 12;
export const PING_MAX_AGE_TICKS = 180;
export const MAX_PING_SEQUENCE = 0x7fffffff;
export const PING_WORLD_HALF_WIDTH = 1_800;
export const PING_WORLD_HALF_HEIGHT = 1_200;

export const PING_INTENTS = Object.freeze({
  danger: Object.freeze({ label: "Danger", glyph: "!", shape: "triangle", priority: 6 }),
  objective: Object.freeze({ label: "Objective", glyph: "◆", shape: "diamond", priority: 4 }),
  pickup: Object.freeze({ label: "Pickup", glyph: "+", shape: "square", priority: 2 }),
  help: Object.freeze({ label: "Help", glyph: "?", shape: "hexagon", priority: 7 }),
  regroup: Object.freeze({ label: "Regroup", glyph: "↙", shape: "circle", priority: 5 }),
  recommendation: Object.freeze({ label: "Recommend", glyph: "★", shape: "star", priority: 1 }),
});

export const PING_WHEEL_ORDER = Object.freeze(["danger", "objective", "pickup", "help", "regroup", "recommendation"]);
export const PING_TARGET_KINDS = Object.freeze(["ground", "enemy", "objective", "pickup", "cache", "ally"]);

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} contains missing or unsupported fields`);
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

function intent(value) {
  value = String(value || "");
  if (!Object.hasOwn(PING_INTENTS, value)) throw new TypeError("ping intent is invalid");
  return value;
}

function targetKind(value) {
  value = String(value || "");
  if (!PING_TARGET_KINDS.includes(value)) throw new TypeError("ping target kind is invalid");
  return value;
}

function coordinate(value, max, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} is invalid`);
  return integer(Math.round(value), -max, max, label);
}

function basePing(value) {
  return {
    protocolVersion: integer(value.protocolVersion, PING_PROTOCOL_VERSION, PING_PROTOCOL_VERSION, "ping protocol version"),
    epoch: integer(value.epoch, 0, MAX_PING_SEQUENCE, "ping authority epoch"),
    seq: integer(value.seq, 0, MAX_PING_SEQUENCE, "ping sequence"),
    tick: integer(value.tick, 0, MAX_PING_SEQUENCE, "ping tick"),
    intent: intent(value.intent),
    x: coordinate(value.x, PING_WORLD_HALF_WIDTH, "ping x"),
    y: coordinate(value.y, PING_WORLD_HALF_HEIGHT, "ping y"),
    targetKind: targetKind(value.targetKind),
  };
}

export function createPingRequest({ epoch = 0, seq = 0, tick = 0, intent: pingIntent, x = 0, y = 0, targetKind: kind = "ground" } = {}) {
  return sanitizePingRequest({ type: "ping", protocolVersion: PING_PROTOCOL_VERSION, epoch, seq, tick, intent: pingIntent, x, y, targetKind: kind });
}

export function sanitizePingRequest(value, { transport = false } = {}) {
  const transportKeys = transport ? ["_from", "replaySlot"] : [];
  exactKeys(value, ["type", "protocolVersion", "epoch", "seq", "tick", "intent", "x", "y", "targetKind", ...transportKeys], "ping request");
  if (value.type !== "ping") throw new TypeError("ping request type is invalid");
  const parsed = { type: "ping", ...basePing(value) };
  if (transport) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(value._from || ""))) throw new TypeError("ping sender is invalid");
    parsed._from = value._from;
    parsed.replaySlot = integer(value.replaySlot, 0, 3, "ping replay slot");
  }
  return Object.freeze(parsed);
}

export function createPingBroadcast(request, replaySlot, authoritativeTick) {
  const parsed = sanitizePingRequest(request, { transport: Boolean(request?._from) });
  return sanitizePingBroadcast({
    type: "ping_broadcast", protocolVersion: PING_PROTOCOL_VERSION, epoch: parsed.epoch, seq: parsed.seq,
    tick: authoritativeTick, replaySlot, intent: parsed.intent, x: parsed.x, y: parsed.y, targetKind: parsed.targetKind,
  });
}

export function sanitizePingBroadcast(value, { transport = false } = {}) {
  const transportKeys = transport ? ["_from"] : [];
  exactKeys(value, ["type", "protocolVersion", "epoch", "seq", "tick", "replaySlot", "intent", "x", "y", "targetKind", ...transportKeys], "ping broadcast");
  if (value.type !== "ping_broadcast") throw new TypeError("ping broadcast type is invalid");
  const parsed = { type: "ping_broadcast", ...basePing(value), replaySlot: integer(value.replaySlot, 0, 3, "ping replay slot") };
  if (transport) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(value._from || ""))) throw new TypeError("ping authority is invalid");
    parsed._from = value._from;
  }
  return Object.freeze(parsed);
}

export function pingIntentFromDelta(dx, dy, deadZone = 30) {
  if (![dx, dy, deadZone].every(Number.isFinite) || deadZone < 0) return null;
  if (Math.hypot(dx, dy) < deadZone) return null;
  const sector = Math.PI * 2 / PING_WHEEL_ORDER.length;
  const clockwiseFromUp = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return PING_WHEEL_ORDER[Math.floor((clockwiseFromUp + sector / 2) / sector) % PING_WHEEL_ORDER.length];
}

export function selectVisiblePings(pings, limit = 12) {
  limit = integer(limit, 0, 32, "ping render limit");
  return [...(Array.isArray(pings) ? pings : [])].sort((left, right) =>
    (PING_INTENTS[right.intent]?.priority || 0) - (PING_INTENTS[left.intent]?.priority || 0)
    || right.tick - left.tick || left.replaySlot - right.replaySlot || left.seq - right.seq
  ).slice(0, limit);
}

export class PingSequenceTracker {
  constructor(epoch = 0) { this.reset(epoch); }
  reset(epoch = 0) { this.epoch = integer(epoch, 0, MAX_PING_SEQUENCE, "ping authority epoch"); this.nextSequence = 0; }
  create(fields) {
    if (this.nextSequence > MAX_PING_SEQUENCE) throw new RangeError("Ping sequence space exhausted; reconnect required");
    return createPingRequest({ ...fields, epoch: this.epoch, seq: this.nextSequence++ });
  }
}

export class HostPingGate {
  constructor(epoch = 0, { cooldownTicks = PING_HOST_COOLDOWN_TICKS, maxAgeTicks = PING_MAX_AGE_TICKS } = {}) {
    this.cooldownTicks = integer(cooldownTicks, 0, 600, "ping cooldown");
    this.maxAgeTicks = integer(maxAgeTicks, 1, 3_600, "ping max age");
    this.reset(epoch);
  }
  reset(epoch = 0) {
    this.epoch = integer(epoch, 0, MAX_PING_SEQUENCE, "ping authority epoch"); this.lastSequence = new Map(); this.lastAcceptedTick = new Map();
    this.accepted = 0; this.rejected = { invalid: 0, epoch: 0, stale: 0, rate: 0 };
  }
  apply(message, authoritativeTick) {
    let parsed; try { parsed = sanitizePingRequest(message, { transport: true }); } catch { this.rejected.invalid++; return { accepted: false, reason: "invalid" }; }
    authoritativeTick = integer(authoritativeTick, 0, MAX_PING_SEQUENCE, "authoritative ping tick");
    if (parsed.epoch !== this.epoch) { this.rejected.epoch++; return { accepted: false, reason: "epoch" }; }
    if (parsed.tick < authoritativeTick - this.maxAgeTicks || parsed.tick > authoritativeTick + 30) { this.rejected.stale++; return { accepted: false, reason: "tick" }; }
    const sequenceKey = `${parsed.replaySlot}:${parsed._from}`, previousSequence = this.lastSequence.get(sequenceKey);
    if (previousSequence !== undefined && parsed.seq <= previousSequence) { this.rejected.stale++; return { accepted: false, reason: "sequence" }; }
    this.lastSequence.set(sequenceKey, parsed.seq);
    const previousTick = this.lastAcceptedTick.get(parsed.replaySlot);
    if (previousTick !== undefined && authoritativeTick - previousTick < this.cooldownTicks) { this.rejected.rate++; return { accepted: false, reason: "rate" }; }
    this.lastAcceptedTick.set(parsed.replaySlot, authoritativeTick); this.accepted++;
    return { accepted: true, ping: createPingBroadcast(parsed, parsed.replaySlot, authoritativeTick) };
  }
  diagnostics() { return { protocolVersion: PING_PROTOCOL_VERSION, epoch: this.epoch, accepted: this.accepted, rejected: { ...this.rejected }, trackedSlots: this.lastAcceptedTick.size }; }
}

export class PingTokenBucket {
  constructor({ capacity = PING_RATE_CAPACITY, refillMs = PING_RATE_REFILL_MS } = {}) {
    this.capacity = integer(capacity, 1, 16, "ping bucket capacity"); this.refillMs = integer(refillMs, 100, 60_000, "ping bucket refill"); this.entries = new Map();
  }
  take(key, now = Date.now()) {
    key = String(key || ""); if (!key) return false;
    now = Number(now); if (!Number.isFinite(now) || now < 0) return false;
    const previous = this.entries.get(key) || { tokens: this.capacity, at: now };
    const refills = Math.floor(Math.max(0, now - previous.at) / this.refillMs);
    const tokens = Math.min(this.capacity, previous.tokens + refills), at = refills ? previous.at + refills * this.refillMs : previous.at;
    if (tokens < 1) { this.entries.set(key, { tokens, at }); return false; }
    this.entries.set(key, { tokens: tokens - 1, at }); return true;
  }
  reset() { this.entries.clear(); }
}
