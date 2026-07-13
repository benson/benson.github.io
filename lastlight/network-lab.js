/**
 * Developer-only adverse-network simulator. This module never imports or
 * advances gameplay RNG and never mutates message payloads.
 */

export const NETWORK_LAB_QUERY_PARAM = "llNetwork";
export const NETWORK_LAB_SEED_PARAM = "llNetworkSeed";
export const NETWORK_LAB_LIMITS = Object.freeze({
  // Migration checkpoints are capped at 1.5 MB before their transport
  // envelope is added. Keep the lab aligned with the relay's 1.55 MB wire
  // ceiling so adverse-network tests exercise migration instead of dropping
  // every valid checkpoint at the simulator boundary.
  maxMessageBytes: 1_550_000,
  // The cap is enforced independently for upstream and downstream queues.
  // Five maximum-size checkpoints can be delayed at once; a sixth fails
  // closed instead of letting a lossy/reordered test grow without bound.
  maxQueueBytes: 8 * 1024 * 1024,
  maxQueueMessages: 256,
  maxDelayMs: 10_000,
  maxReorderMs: 2_000,
});

const DIRECTION_KEYS = ["upstream", "downstream"];
const SAFE_SEED = /^[A-Za-z0-9._-]{1,64}$/;

const direction = (delayMs, jitterMs, loss, duplication, reordering, reorderWindowMs) => Object.freeze({
  delayMs, jitterMs, loss, duplication, reordering, reorderWindowMs,
});

export const NETWORK_LAB_PROFILES = Object.freeze({
  healthy: Object.freeze({
    upstream: direction(8, 2, 0, 0, 0, 0), downstream: direction(8, 2, 0, 0, 0, 0), forcedDisconnect: null,
  }),
  regional: Object.freeze({
    upstream: direction(65, 18, .003, .001, .01, 24), downstream: direction(85, 24, .004, .002, .015, 32), forcedDisconnect: null,
  }),
  mobile: Object.freeze({
    upstream: direction(115, 65, .025, .008, .07, 90), downstream: direction(145, 80, .035, .012, .09, 120), forcedDisconnect: null,
  }),
  lossy: Object.freeze({
    upstream: direction(175, 110, .12, .025, .16, 180), downstream: direction(220, 140, .15, .035, .2, 240), forcedDisconnect: null,
  }),
  reconnect: Object.freeze({
    upstream: direction(80, 30, .01, 0, .03, 50), downstream: direction(110, 45, .015, 0, .05, 75),
    forcedDisconnect: Object.freeze({ direction: "downstream", afterMessages: 24 }),
  }),
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, allowed) {
  return plainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function finiteRange(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

export function validateNetworkLabProfile(source) {
  if (!exactKeys(source, ["upstream", "downstream", "forcedDisconnect"])) throw new TypeError("Network profile contains unknown fields.");
  const result = {};
  for (const key of DIRECTION_KEYS) {
    const value = source[key];
    if (!exactKeys(value, ["delayMs", "jitterMs", "loss", "duplication", "reordering", "reorderWindowMs"])) throw new TypeError(`${key} profile contains unknown fields.`);
    result[key] = Object.freeze({
      delayMs: finiteRange(value.delayMs, 0, NETWORK_LAB_LIMITS.maxDelayMs, `${key}.delayMs`),
      jitterMs: finiteRange(value.jitterMs, 0, NETWORK_LAB_LIMITS.maxDelayMs, `${key}.jitterMs`),
      loss: finiteRange(value.loss, 0, 1, `${key}.loss`),
      duplication: finiteRange(value.duplication, 0, 1, `${key}.duplication`),
      reordering: finiteRange(value.reordering, 0, 1, `${key}.reordering`),
      reorderWindowMs: finiteRange(value.reorderWindowMs, 0, NETWORK_LAB_LIMITS.maxReorderMs, `${key}.reorderWindowMs`),
    });
  }
  if (source.forcedDisconnect == null) result.forcedDisconnect = null;
  else {
    const forced = source.forcedDisconnect;
    if (!exactKeys(forced, ["direction", "afterMessages"]) || !DIRECTION_KEYS.includes(forced.direction)) throw new TypeError("forcedDisconnect is invalid.");
    if (!Number.isSafeInteger(forced.afterMessages) || forced.afterMessages < 1 || forced.afterMessages > 100_000) throw new RangeError("forcedDisconnect.afterMessages is out of bounds.");
    result.forcedDisconnect = Object.freeze({ direction: forced.direction, afterMessages: forced.afterMessages });
  }
  return Object.freeze(result);
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

export function resolveNetworkLabActivation({ url = globalThis.location?.href, development = false, profile = "", seed = "" } = {}) {
  let parsed;
  try { parsed = new URL(url || "https://invalid.local/"); } catch { return Object.freeze({ enabled: false, reason: "invalid_url" }); }
  const requestedProfile = profile || parsed.searchParams.get(NETWORK_LAB_QUERY_PARAM) || "";
  if (!requestedProfile) return Object.freeze({ enabled: false, reason: "not_requested" });
  if (typeof requestedProfile !== "string" || !Object.hasOwn(NETWORK_LAB_PROFILES, requestedProfile)) return Object.freeze({ enabled: false, reason: "unknown_profile" });
  if (development !== true && !isLocalHostname(parsed.hostname)) return Object.freeze({ enabled: false, reason: "untrusted_origin" });
  const requestedSeed = seed || parsed.searchParams.get(NETWORK_LAB_SEED_PARAM) || `lastlight-${requestedProfile}`;
  if (typeof requestedSeed !== "string" || !SAFE_SEED.test(requestedSeed)) return Object.freeze({ enabled: false, reason: "invalid_seed" });
  return Object.freeze({ enabled: true, reason: "enabled", profile: requestedProfile, seed: requestedSeed });
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0 || 0x9e3779b9;
}

function randomStream(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function payloadBytes(payload) {
  if (typeof payload === "string") return new TextEncoder().encode(payload).byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  throw new TypeError("Network lab payloads must be strings, ArrayBuffers, or typed-array views.");
}

function copyPayload(payload) {
  if (typeof payload === "string") return payload;
  if (payload instanceof ArrayBuffer) return payload.slice(0);
  return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength).slice();
}

function emptyStats() {
  return { submitted: 0, enqueued: 0, delivered: 0, dropped: 0, duplicated: 0, reordered: 0, bytesIn: 0, bytesDelivered: 0, queueMessages: 0, queueBytes: 0, peakQueueMessages: 0, peakQueueBytes: 0, deliveryErrors: 0, dropReasons: {} };
}

export class NetworkLab {
  constructor({
    profile = "healthy", seed = "lastlight-network-lab", enabled = false,
    limits = {}, now = () => performance.now(), setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer), onForcedDisconnect = () => {}, onError = () => {},
  } = {}) {
    if (!enabled) throw new Error("NetworkLab requires an explicit enabled activation.");
    this.profileName = typeof profile === "string" ? profile : "custom";
    const selected = typeof profile === "string" ? NETWORK_LAB_PROFILES[profile] : profile;
    if (typeof profile === "string" && !Object.hasOwn(NETWORK_LAB_PROFILES, profile)) throw new RangeError(`Unknown network profile: ${String(profile)}.`);
    if (!selected) throw new RangeError(`Unknown network profile: ${String(profile)}.`);
    this.profile = validateNetworkLabProfile(selected);
    if (typeof seed !== "string" || !SAFE_SEED.test(seed)) throw new TypeError("Network lab seed must be 1-64 safe characters.");
    this.seed = seed;
    if (!exactKeys(limits, Object.keys(NETWORK_LAB_LIMITS))) throw new TypeError("Network lab limits contain unknown fields.");
    this.limits = Object.freeze({ ...NETWORK_LAB_LIMITS, ...limits });
    for (const [key, maximum] of Object.entries(NETWORK_LAB_LIMITS)) {
      finiteRange(this.limits[key], 1, maximum, `limits.${key}`);
      if (!Number.isSafeInteger(this.limits[key])) throw new TypeError(`limits.${key} must be a safe integer.`);
    }
    this.now = now; this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.onForcedDisconnect = onForcedDisconnect; this.onError = onError;
    this.active = true; this.disconnectTriggered = false;
    this.resetState();
  }

  resetState() {
    this.queues = { upstream: [], downstream: [] };
    this.queueBytes = { upstream: 0, downstream: 0 };
    this.timers = { upstream: null, downstream: null };
    this.timerDue = { upstream: Infinity, downstream: Infinity };
    this.sequences = { upstream: 0, downstream: 0 };
    this.random = { upstream: randomStream(`${this.seed}:upstream`), downstream: randomStream(`${this.seed}:downstream`) };
    this.stats = { upstream: emptyStats(), downstream: emptyStats() };
  }

  upstream(payload, deliver) { return this.submit("upstream", payload, deliver); }
  downstream(payload, deliver) { return this.submit("downstream", payload, deliver); }

  submit(key, payload, deliver) {
    if (!DIRECTION_KEYS.includes(key)) throw new RangeError(`Unknown network direction: ${String(key)}.`);
    if (typeof deliver !== "function") throw new TypeError("Network lab delivery callback is required.");
    if (!this.active) return this.drop(key, "inactive");
    const bytes = payloadBytes(payload), stats = this.stats[key], sequence = ++this.sequences[key];
    stats.submitted += 1; stats.bytesIn += bytes;
    if (bytes > this.limits.maxMessageBytes) return this.drop(key, "message_bytes");

    const forced = this.profile.forcedDisconnect;
    if (!this.disconnectTriggered && forced?.direction === key && sequence >= forced.afterMessages) {
      this.disconnectTriggered = true;
      this.clearQueues("forced_disconnect");
      this.drop(key, "forced_disconnect");
      try { this.onForcedDisconnect({ profile: this.profileName, direction: key, sequence }); }
      catch (error) { try { this.onError(error); } catch { /* Diagnostics remain usable if both hooks fail. */ } }
      return false;
    }

    const random = this.random[key], config = this.profile[key];
    if (random() < config.loss) return this.drop(key, "profile_loss");
    const accepted = this.enqueue(key, copyPayload(payload), bytes, deliver, sequence, false, random, config);
    if (accepted && random() < config.duplication) {
      if (this.enqueue(key, copyPayload(payload), bytes, deliver, sequence, true, random, config)) stats.duplicated += 1;
    }
    this.arm(key);
    return accepted;
  }

  enqueue(key, payload, bytes, deliver, sequence, duplicate, random, config) {
    const queue = this.queues[key];
    if (queue.length >= this.limits.maxQueueMessages) return this.drop(key, "queue_messages");
    if (this.queueBytes[key] + bytes > this.limits.maxQueueBytes) return this.drop(key, "queue_bytes");
    const queuedAt = this.now(), jitter = (random() * 2 - 1) * config.jitterMs;
    let delay = Math.min(this.limits.maxDelayMs, Math.max(0, config.delayMs + jitter)), reordered = false;
    if (config.reorderWindowMs > 0 && random() < config.reordering) {
      const window = Math.min(config.reorderWindowMs, this.limits.maxReorderMs);
      delay = Math.min(this.limits.maxDelayMs, Math.max(0, delay + (random() * 2 - 1) * window));
      reordered = true; this.stats[key].reordered += 1;
    }
    const dueAt = queuedAt + delay;
    queue.push({ payload, bytes, deliver, sequence, duplicate, dueAt, reordered });
    queue.sort((left, right) => left.dueAt - right.dueAt || left.sequence - right.sequence || Number(left.duplicate) - Number(right.duplicate));
    this.queueBytes[key] += bytes;
    const stats = this.stats[key]; stats.enqueued += 1; this.syncQueueStats(key);
    return true;
  }

  arm(key) {
    if (!this.queues[key].length || !this.active) return;
    const earliest = this.queues[key][0].dueAt;
    if (this.timers[key] != null && this.timerDue[key] <= earliest) return;
    if (this.timers[key] != null) this.clearTimer(this.timers[key]);
    const delay = Math.max(0, this.queues[key][0].dueAt - this.now());
    this.timerDue[key] = earliest;
    this.timers[key] = this.setTimer(() => { this.timers[key] = null; this.timerDue[key] = Infinity; this.drain(key); this.arm(key); }, delay);
  }

  drain(key, through = this.now()) {
    if (!DIRECTION_KEYS.includes(key)) throw new RangeError(`Unknown network direction: ${String(key)}.`);
    if (!Number.isFinite(through)) throw new TypeError("Drain time must be finite.");
    const queue = this.queues[key], ready = [];
    while (queue.length && queue[0].dueAt <= through) ready.push(queue.shift());
    for (const entry of ready) {
      this.queueBytes[key] -= entry.bytes;
      try { entry.deliver(entry.payload); this.stats[key].delivered += 1; this.stats[key].bytesDelivered += entry.bytes; }
      catch (error) { this.stats[key].deliveryErrors += 1; try { this.onError(error); } catch { /* Diagnostics still record the callback failure. */ } }
    }
    this.syncQueueStats(key);
    return ready.length;
  }

  drop(key, reason, count = 1) {
    const stats = this.stats[key]; stats.dropped += count; stats.dropReasons[reason] = (stats.dropReasons[reason] || 0) + count;
    return false;
  }

  syncQueueStats(key) {
    const stats = this.stats[key]; stats.queueMessages = this.queues[key].length; stats.queueBytes = this.queueBytes[key];
    stats.peakQueueMessages = Math.max(stats.peakQueueMessages, stats.queueMessages);
    stats.peakQueueBytes = Math.max(stats.peakQueueBytes, stats.queueBytes);
  }

  clearQueues(reason = "reset") {
    for (const key of DIRECTION_KEYS) {
      if (this.timers[key] != null) this.clearTimer(this.timers[key]);
      this.timers[key] = null; this.timerDue[key] = Infinity;
      const count = this.queues[key].length;
      if (count) this.drop(key, reason, count);
      this.queues[key] = []; this.queueBytes[key] = 0; this.syncQueueStats(key);
    }
  }

  reset({ seed = this.seed } = {}) {
    if (typeof seed !== "string" || !SAFE_SEED.test(seed)) throw new TypeError("Network lab seed must be 1-64 safe characters.");
    this.clearQueues("reset"); this.seed = seed; this.disconnectTriggered = false; this.active = true; this.resetState();
    return this.diagnostics();
  }

  teardown() {
    if (!this.active) return this.diagnostics();
    this.clearQueues("teardown"); this.active = false;
    return this.diagnostics();
  }

  diagnostics() {
    const copy = (stats) => ({ ...stats, dropReasons: { ...stats.dropReasons } });
    return Object.freeze({ active: this.active, profile: this.profileName, seed: this.seed, disconnectTriggered: this.disconnectTriggered, upstream: copy(this.stats.upstream), downstream: copy(this.stats.downstream), limits: { ...this.limits } });
  }
}

export function createActivatedNetworkLab(activation, options = {}) {
  if (!activation?.enabled) return null;
  return new NetworkLab({ ...options, enabled: true, profile: activation.profile, seed: activation.seed });
}
