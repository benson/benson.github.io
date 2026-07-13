export const DRAFT_RECOMMENDATION_PROTOCOL_VERSION = 1;
export const DRAFT_RECOMMENDATION_MAX_SYNC_ENTRIES = 12;
export const DRAFT_RECOMMENDATION_RATE_CAPACITY = 12;
export const DRAFT_RECOMMENDATION_RATE_REFILL_MS = 250;
export const MAX_DRAFT_RECOMMENDATION_SEQUENCE = 0x7fffffff;

const PLAYER_ID = /^[A-Za-z0-9_-]{1,32}$/;

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} is invalid`);
  return value;
}

function sender(value, label) {
  value = String(value || "");
  if (!PLAYER_ID.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function baseRecommendation(value) {
  return {
    protocolVersion: integer(value.protocolVersion, DRAFT_RECOMMENDATION_PROTOCOL_VERSION, DRAFT_RECOMMENDATION_PROTOCOL_VERSION, "draft recommendation protocol version"),
    epoch: integer(value.epoch, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation authority epoch"),
    seq: integer(value.seq, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation sequence"),
    targetSlot: integer(value.targetSlot, 0, 3, "draft recommendation target slot"),
    round: integer(value.round, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation round"),
    revision: integer(value.revision, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation revision"),
    optionIndex: integer(value.optionIndex, 0, 2, "draft recommendation option index"),
    active: Boolean(value.active),
  };
}

export function createDraftRecommendationRequest({ epoch = 0, seq = 0, targetSlot = 0, round = 0, revision = 0, optionIndex = 0, active = true } = {}) {
  return sanitizeDraftRecommendationRequest({
    type: "draft_recommendation", protocolVersion: DRAFT_RECOMMENDATION_PROTOCOL_VERSION,
    epoch, seq, targetSlot, round, revision, optionIndex, active,
  });
}

export function sanitizeDraftRecommendationRequest(value, { transport = false } = {}) {
  exactKeys(value, [
    "type", "protocolVersion", "epoch", "seq", "targetSlot", "round", "revision", "optionIndex", "active",
    ...(transport ? ["_from", "recommenderSlot"] : []),
  ], "draft recommendation request");
  if (value.type !== "draft_recommendation" || typeof value.active !== "boolean") throw new TypeError("draft recommendation request is invalid");
  const parsed = { type: "draft_recommendation", ...baseRecommendation(value) };
  if (transport) {
    parsed._from = sender(value._from, "draft recommendation sender");
    parsed.recommenderSlot = integer(value.recommenderSlot, 0, 3, "draft recommendation recommender slot");
  }
  return Object.freeze(parsed);
}

export function createDraftRecommendationState(request, recommenderSlot = request?.recommenderSlot) {
  const parsed = sanitizeDraftRecommendationRequest(request, { transport: Boolean(request?._from) });
  return sanitizeDraftRecommendationState({
    type: "draft_recommendation_state", protocolVersion: DRAFT_RECOMMENDATION_PROTOCOL_VERSION,
    epoch: parsed.epoch, seq: parsed.seq, targetSlot: parsed.targetSlot, round: parsed.round,
    revision: parsed.revision, optionIndex: parsed.optionIndex, active: parsed.active, recommenderSlot,
  });
}

export function sanitizeDraftRecommendationState(value, { transport = false } = {}) {
  exactKeys(value, [
    "type", "protocolVersion", "epoch", "seq", "targetSlot", "round", "revision", "optionIndex", "active", "recommenderSlot",
    ...(transport ? ["_from"] : []),
  ], "draft recommendation state");
  if (value.type !== "draft_recommendation_state" || typeof value.active !== "boolean") throw new TypeError("draft recommendation state is invalid");
  const parsed = {
    type: "draft_recommendation_state", ...baseRecommendation(value),
    recommenderSlot: integer(value.recommenderSlot, 0, 3, "draft recommendation recommender slot"),
  };
  if (transport) parsed._from = sender(value._from, "draft recommendation authority");
  return Object.freeze(parsed);
}

function compareRecommendations(left, right) {
  return left.targetSlot - right.targetSlot || left.recommenderSlot - right.recommenderSlot
    || left.optionIndex - right.optionIndex || left.seq - right.seq;
}

export function createDraftRecommendationSync({ epoch = 0, entries = [] } = {}) {
  return sanitizeDraftRecommendationSync({
    type: "draft_recommendation_sync", protocolVersion: DRAFT_RECOMMENDATION_PROTOCOL_VERSION, epoch, entries,
  });
}

export function sanitizeDraftRecommendationSync(value, { transport = false } = {}) {
  exactKeys(value, ["type", "protocolVersion", "epoch", "entries", ...(transport ? ["_from"] : [])], "draft recommendation sync");
  if (value.type !== "draft_recommendation_sync") throw new TypeError("draft recommendation sync type is invalid");
  const protocolVersion = integer(value.protocolVersion, DRAFT_RECOMMENDATION_PROTOCOL_VERSION, DRAFT_RECOMMENDATION_PROTOCOL_VERSION, "draft recommendation sync protocol version");
  const epoch = integer(value.epoch, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation sync epoch");
  if (!Array.isArray(value.entries) || value.entries.length > DRAFT_RECOMMENDATION_MAX_SYNC_ENTRIES) throw new TypeError("draft recommendation sync entries are invalid");
  const entries = value.entries.map((entry) => sanitizeDraftRecommendationState(entry));
  if (entries.some((entry) => entry.epoch !== epoch || !entry.active)) throw new TypeError("draft recommendation sync entry is stale or inactive");
  const keys = new Set();
  for (const entry of entries) {
    const key = `${entry.targetSlot}:${entry.recommenderSlot}`;
    if (keys.has(key)) throw new TypeError("draft recommendation sync contains duplicate entries");
    keys.add(key);
  }
  entries.sort(compareRecommendations);
  const parsed = { type: "draft_recommendation_sync", protocolVersion, epoch, entries: Object.freeze(entries) };
  if (transport) parsed._from = sender(value._from, "draft recommendation sync authority");
  return Object.freeze(parsed);
}

export class DraftRecommendationSequenceTracker {
  constructor(epoch = 0) { this.reset(epoch); }
  reset(epoch = 0) {
    this.epoch = integer(epoch, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation authority epoch");
    this.nextSequence = 0;
  }
  create(fields = {}) {
    if (this.nextSequence > MAX_DRAFT_RECOMMENDATION_SEQUENCE) throw new RangeError("Draft recommendation sequence space exhausted; reconnect required");
    return createDraftRecommendationRequest({ ...fields, epoch: this.epoch, seq: this.nextSequence++ });
  }
}

export class HostDraftRecommendationGate {
  constructor(epoch = 0) { this.reset(epoch); }
  reset(epoch = 0) {
    this.epoch = integer(epoch, 0, MAX_DRAFT_RECOMMENDATION_SEQUENCE, "draft recommendation authority epoch");
    this.lastSequence = new Map();
  }
  apply(message, { round, revision } = {}) {
    let parsed;
    try { parsed = sanitizeDraftRecommendationRequest(message, { transport: true }); }
    catch { return { accepted: false, reason: "invalid" }; }
    if (parsed.epoch !== this.epoch) return { accepted: false, reason: "epoch" };
    if (parsed.round !== round || parsed.revision !== revision) return { accepted: false, reason: "phase" };
    const key = `${parsed.recommenderSlot}:${parsed._from}`;
    const previous = this.lastSequence.get(key);
    if (previous !== undefined && parsed.seq <= previous) return { accepted: false, reason: "sequence" };
    this.lastSequence.set(key, parsed.seq);
    return { accepted: true, recommendation: createDraftRecommendationState(parsed, parsed.recommenderSlot) };
  }
}

export class DraftRecommendationTokenBucket {
  constructor({ capacity = DRAFT_RECOMMENDATION_RATE_CAPACITY, refillMs = DRAFT_RECOMMENDATION_RATE_REFILL_MS } = {}) {
    this.capacity = integer(capacity, 1, 64, "draft recommendation bucket capacity");
    this.refillMs = integer(refillMs, 50, 60_000, "draft recommendation bucket refill");
    this.entries = new Map();
  }
  take(key, now = Date.now()) {
    key = String(key || "");
    now = Number(now);
    if (!key || !Number.isFinite(now) || now < 0) return false;
    const previous = this.entries.get(key) || { tokens: this.capacity, at: now };
    const refills = Math.floor(Math.max(0, now - previous.at) / this.refillMs);
    const tokens = Math.min(this.capacity, previous.tokens + refills);
    const at = refills ? previous.at + refills * this.refillMs : previous.at;
    if (tokens < 1) { this.entries.set(key, { tokens, at }); return false; }
    this.entries.set(key, { tokens: tokens - 1, at });
    return true;
  }
  reset() { this.entries.clear(); }
}
