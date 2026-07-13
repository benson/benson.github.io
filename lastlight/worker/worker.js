import { DEFAULT_RUNTIME_CONFIG, validateRuntimeConfig } from "../feature-config.js";
import { sanitizeDraftActionMessage, sanitizeInputMessage, sanitizeSnapshotMessage } from "../protocol.js";
import {
  HOST_MIGRATION_PROTOCOL_VERSION, MIGRATION_PREPARE_TIMEOUT_MS, migrationCompatibilityMatches,
  validateMigrationCapabilities, validateMigrationCheckpoint, validateMigrationReady,
} from "../host-migration.js";
import { PingTokenBucket, sanitizePingBroadcast, sanitizePingRequest } from "../ping-contract.js";
import {
  DraftRecommendationTokenBucket, sanitizeDraftRecommendationRequest,
  sanitizeDraftRecommendationState, sanitizeDraftRecommendationSync,
} from "../draft-recommendation-contract.js";

const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 1_550_000;
const MAX_STANDARD_MESSAGE_BYTES = 512_000;
const MAX_TELEMETRY_BYTES = 8_192;
const MAX_PENDING_PINGS = 32;
const PENDING_PING_LIFETIME_MS = 8_000;
const MAX_PENDING_DRAFT_RECOMMENDATIONS = 48;
const PENDING_DRAFT_RECOMMENDATION_LIFETIME_MS = 8_000;

const TELEMETRY_V1_FIELDS = new Set([
  "schemaVersion", "build", "map", "difficulty", "outcome", "specialists", "playerCount",
  "plannedDurationSeconds", "elapsedSeconds", "waveReached", "levelReached", "totalKills",
  "goldEarned", "xpCollected", "damageDealt", "damageTaken", "revives", "distanceTraveled",
]);
const TELEMETRY_V2_FIELDS = new Set([...TELEMETRY_V1_FIELDS, "synergyIds", "synergyTotals"]);
const TELEMETRY_MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const TELEMETRY_DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const TELEMETRY_OUTCOMES = new Set(["won", "lost"]);
const TELEMETRY_SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
const TELEMETRY_SYNERGIES = new Set(["breach-window", "ultimate-resonance", "moving-screen"]);
const TELEMETRY_SYNERGY_TOTAL_FIELDS = Object.freeze([
  "triggers", "damage", "shielding", "mitigated", "formationSeconds", "ultimateChains",
]);
const TELEMETRY_SYNERGY_TOTAL_CAPS = Object.freeze({
  triggers: 1_000_000,
  damage: 1_000_000_000,
  shielding: 1_000_000_000,
  mitigated: 1_000_000_000,
  formationSeconds: 16_000,
  ultimateChains: 10_000,
});

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function safeProfile(value = {}) {
  return {
    name: String(value.name || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16) || "Rookie",
    specialist: /^[a-z]{3,8}$/.test(value.specialist) ? value.specialist : "zuri",
    ready: Boolean(value.ready),
    resumeToken: /^[a-f0-9]{24,32}$/.test(String(value.resumeToken || "")) ? String(value.resumeToken) : "",
  };
}

function telemetryNumber(value, field, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`Invalid ${field}`);
  }
  const normalized = integer ? Math.round(value) : Math.round(value * 10) / 10;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function telemetryExactKeys(value, expected, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${field}`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`Invalid ${field}`);
  }
}

export function sanitizeRunTelemetry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Telemetry must be an object");
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new TypeError("Unsupported telemetry schema");
  const allowedFields = value.schemaVersion === 2 ? TELEMETRY_V2_FIELDS : TELEMETRY_V1_FIELDS;
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) throw new TypeError(`Unexpected telemetry field: ${key}`);
  }
  const build = String(value.build || "");
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(build)) throw new TypeError("Invalid build");
  if (!TELEMETRY_MAPS.has(value.map)) throw new TypeError("Invalid map");
  if (!TELEMETRY_DIFFICULTIES.has(value.difficulty)) throw new TypeError("Invalid difficulty");
  if (!TELEMETRY_OUTCOMES.has(value.outcome)) throw new TypeError("Invalid outcome");
  if (!Array.isArray(value.specialists) || value.specialists.length < 1 || value.specialists.length > MAX_PLAYERS) {
    throw new TypeError("Invalid specialists");
  }
  const specialists = value.specialists.map((specialist) => String(specialist));
  if (specialists.some((specialist) => !TELEMETRY_SPECIALISTS.has(specialist))) throw new TypeError("Invalid specialist");
  specialists.sort();

  const playerCount = telemetryNumber(value.playerCount, "playerCount", 1, MAX_PLAYERS, true);
  if (playerCount !== specialists.length) throw new TypeError("Specialist count does not match player count");

  const run = {
    schemaVersion: value.schemaVersion,
    build,
    map: value.map,
    difficulty: value.difficulty,
    outcome: value.outcome,
    specialists,
    playerCount,
    plannedDurationSeconds: telemetryNumber(value.plannedDurationSeconds, "plannedDurationSeconds", 60, 3_600, true),
    elapsedSeconds: telemetryNumber(value.elapsedSeconds, "elapsedSeconds", 0, 4_000),
    waveReached: telemetryNumber(value.waveReached, "waveReached", 0, 7, true),
    levelReached: telemetryNumber(value.levelReached, "levelReached", 1, 500, true),
    totalKills: telemetryNumber(value.totalKills, "totalKills", 0, 10_000_000, true),
    goldEarned: telemetryNumber(value.goldEarned, "goldEarned", 0, 10_000_000, true),
    xpCollected: telemetryNumber(value.xpCollected, "xpCollected", 0, 100_000_000),
    damageDealt: telemetryNumber(value.damageDealt, "damageDealt", 0, 1_000_000_000),
    damageTaken: telemetryNumber(value.damageTaken, "damageTaken", 0, 1_000_000_000),
    revives: telemetryNumber(value.revives, "revives", 0, 10_000, true),
    distanceTraveled: telemetryNumber(value.distanceTraveled, "distanceTraveled", 0, 1_000_000_000),
  };
  if (value.schemaVersion === 2) {
    if (!Array.isArray(value.synergyIds) || value.synergyIds.length > TELEMETRY_SYNERGIES.size) {
      throw new TypeError("Invalid synergyIds");
    }
    const synergyIds = value.synergyIds.map((id) => String(id));
    if (new Set(synergyIds).size !== synergyIds.length || synergyIds.some((id) => !TELEMETRY_SYNERGIES.has(id))) {
      throw new TypeError("Invalid synergyIds");
    }
    synergyIds.sort();
    telemetryExactKeys(value.synergyTotals, TELEMETRY_SYNERGY_TOTAL_FIELDS, "synergyTotals");
    const synergyTotals = Object.fromEntries(TELEMETRY_SYNERGY_TOTAL_FIELDS.map((field) => {
      const integer = field === "triggers" || field === "ultimateChains";
      if (integer && !Number.isInteger(value.synergyTotals[field])) throw new TypeError(`Invalid synergyTotals.${field}`);
      return [
        field,
        telemetryNumber(value.synergyTotals[field], `synergyTotals.${field}`, 0, TELEMETRY_SYNERGY_TOTAL_CAPS[field], integer),
      ];
    }));
    if (!synergyIds.length && TELEMETRY_SYNERGY_TOTAL_FIELDS.some((field) => synergyTotals[field] !== 0)) {
      throw new TypeError("Synergy totals require at least one synergy id");
    }
    Object.assign(run, { synergyIds, synergyTotals });
  }
  return run;
}

function telemetryDataPoint(run) {
  const schema = `run.v${run.schemaVersion}`;
  const blobs = [schema, run.build, run.map, run.difficulty, run.outcome, run.playerCount === 1 ? "solo" : "squad", run.specialists.join(",")];
  const doubles = [
    run.playerCount, run.plannedDurationSeconds, run.elapsedSeconds, run.waveReached, run.levelReached,
    run.totalKills, run.goldEarned, run.xpCollected, run.damageDealt, run.damageTaken,
    run.revives, run.distanceTraveled,
  ];
  if (run.schemaVersion === 2) {
    blobs.push(run.synergyIds.join(","));
    doubles.push(...TELEMETRY_SYNERGY_TOTAL_FIELDS.map((field) => run.synergyTotals[field]));
  }
  return {
    // Ordered fields are intentionally documented here because Analytics Engine exposes them as blobN/doubleN.
    blobs,
    doubles,
    // A shared sampling key prevents this aggregate dataset from becoming a pseudonymous user log.
    indexes: [`lastlight-run-v${run.schemaVersion}`],
  };
}

async function handleTelemetry(request, env) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...corsHeaders(request), Allow: "POST" } });
  }
  if (!isAllowedOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: corsHeaders(request) });
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: corsHeaders(request) });
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_TELEMETRY_BYTES) return Response.json({ error: "Payload too large" }, { status: 413, headers: corsHeaders(request) });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_TELEMETRY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413, headers: corsHeaders(request) });
  }
  let value;
  try { value = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders(request) }); }

  let run;
  try { run = sanitizeRunTelemetry(value); } catch (error) {
    return Response.json({ error: error.message || "Invalid telemetry" }, { status: 400, headers: corsHeaders(request) });
  }
  if (!env.RUN_TELEMETRY?.writeDataPoint) {
    return Response.json({ error: "Telemetry unavailable" }, { status: 503, headers: corsHeaders(request) });
  }
  env.RUN_TELEMETRY.writeDataPoint(telemetryDataPoint(run));
  return Response.json({ ok: true }, { status: 202, headers: { ...corsHeaders(request), "Cache-Control": "no-store" } });
}

export function operatorRuntimeConfig(env = {}) {
  const raw = env.LASTLIGHT_RUNTIME_CONFIG;
  if (typeof raw !== "string" || !raw.trim()) return { config: DEFAULT_RUNTIME_CONFIG, source: "built-in" };
  if (new TextEncoder().encode(raw).byteLength > 4_096) return { config: DEFAULT_RUNTIME_CONFIG, source: "built-in-invalid" };
  try {
    return { config: validateRuntimeConfig(JSON.parse(raw)), source: "operator" };
  } catch {
    // A malformed operator value must fail closed to the release defaults.
    return { config: DEFAULT_RUNTIME_CONFIG, source: "built-in-invalid" };
  }
}

function handleRuntimeConfig(request, env) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...corsHeaders(request), Allow: "GET" } });
  }
  if (!isAllowedOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: corsHeaders(request) });
  return Response.json(operatorRuntimeConfig(env), {
    headers: { ...corsHeaders(request), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "lastlight-relay", now: new Date().toISOString() }, { headers: corsHeaders(request) });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/config" || url.pathname === "/config/") return handleRuntimeConfig(request, env);
    if (url.pathname === "/telemetry" || url.pathname === "/telemetry/") return handleTelemetry(request, env);
    const match = url.pathname.match(/^\/room\/([A-Za-z2-9]{4,6})\/?$/);
    if (!match) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders(request) });
    const code = normalizeCode(match[1]);
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.hostId = null;
    this.authorityEpoch = 0;
    this.runActive = false;
    this.migrationCheckpoint = null;
    this.migration = null;
    this.nextJoinOrdinal = 0;
    this.seatTokens = new Map();
    this.pingRate = new PingTokenBucket();
    this.pendingPings = new Map();
    this.pingNow = () => Date.now();
    this.draftRecommendationRate = new DraftRecommendationTokenBucket();
    this.pendingDraftRecommendations = new Map();
    this.draftRecommendationSequences = new Map();
    this.draftRecommendationNow = () => Date.now();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (this.sessions.size >= MAX_PLAYERS) return new Response("Squad full", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    const session = { id, initialized: false, connectedAt: Date.now(), joinOrdinal: this.nextJoinOrdinal++ };
    this.sessions.set(server, session);
    session.handshakeTimer = setTimeout(() => {
      if (!session.initialized) {
        try { server.close(1008, "Handshake required"); } catch {}
        this.onClose(server);
      }
    }, 5_000);

    server.addEventListener("message", (event) => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  initializeSession(socket, session, rawProfile, rawCapabilities = null) {
    if (session.initialized) return false;
    const profile = safeProfile(rawProfile);
    if (profile.resumeToken && this.connectedSessions().some((peer) => peer.id !== session.id && peer.resumeToken === profile.resumeToken)) {
      profile.resumeToken = "";
    }
    let migrationCapabilities = null;
    try { if (rawCapabilities) migrationCapabilities = validateMigrationCapabilities(rawCapabilities); } catch { migrationCapabilities = null; }
    const replaySlot = profile.resumeToken ? this.seatTokens.get(profile.resumeToken) : undefined;
    Object.assign(session, profile, { initialized: true, migrationCapabilities, ...(Number.isInteger(replaySlot) ? { replaySlot } : {}) });
    if (Number.isInteger(replaySlot)) this.resetDraftRecommendationSeat(replaySlot);
    if (this.runActive && this.migration) session.pendingProfile = true;
    clearTimeout(session.handshakeTimer);
    delete session.handshakeTimer;
    if (!this.hostId && !this.runActive && !this.migration) this.hostId = session.id;
    const peers = [...this.sessions.values()]
      .filter((peer) => peer.initialized && peer.id !== session.id)
      .map(publicPeer);
    socket.send(JSON.stringify({
      type: "welcome", id: session.id, role: session.id === this.hostId ? "host" : "guest", hostId: this.hostId, peers,
      authorityEpoch: this.authorityEpoch, migrationProtocol: HOST_MIGRATION_PROTOCOL_VERSION,
    }));
    this.broadcast({ type: "peer_joined", peer: publicPeer(session) }, socket);
    return true;
  }

  resetPingState() {
    this.pingRate.reset();
    this.pendingPings.clear();
  }

  resetDraftRecommendationState({ resetRate = true } = {}) {
    if (resetRate) this.draftRecommendationRate.reset();
    this.pendingDraftRecommendations.clear();
    this.draftRecommendationSequences.clear();
  }

  resetDraftRecommendationSeat(replaySlot) {
    for (const [key, pending] of this.pendingDraftRecommendations) {
      if (pending.recommendation.recommenderSlot === replaySlot) this.pendingDraftRecommendations.delete(key);
    }
    for (const key of this.draftRecommendationSequences.keys()) {
      if (key.endsWith(`:${replaySlot}`)) this.draftRecommendationSequences.delete(key);
    }
  }

  assignRunReplaySlots(players) {
    const connected = this.connectedSessions();
    if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) return false;
    const byId = new Map(connected.map((session) => [session.id, session]));
    const assignments = new Map(), usedIds = new Set(), usedSlots = new Set();
    for (let index = 0; index < players.length; index++) {
      const player = players[index], id = String(player?.id || "");
      const replaySlot = Number.isInteger(player?.replaySlot) ? Number(player.replaySlot) : index;
      if (!id || usedIds.has(id) || !Number.isInteger(replaySlot) || replaySlot < 0 || replaySlot >= MAX_PLAYERS || usedSlots.has(replaySlot)) return false;
      usedIds.add(id); usedSlots.add(replaySlot);
      if (byId.has(id)) assignments.set(id, replaySlot);
    }
    if (assignments.size !== connected.length) return false;
    this.seatTokens.clear();
    for (const session of connected) {
      session.replaySlot = assignments.get(session.id);
      if (session.resumeToken) this.seatTokens.set(session.resumeToken, session.replaySlot);
    }
    return true;
  }

  pendingPingKey(ping) { return `${ping.epoch}:${ping.replaySlot}:${ping.seq}`; }

  prunePendingPings(now = this.pingNow()) {
    for (const [key, pending] of this.pendingPings) {
      if (now - pending.receivedAt >= PENDING_PING_LIFETIME_MS) this.pendingPings.delete(key);
    }
  }

  routePingRequest(session, raw) {
    if (!this.runtimeFlags().contextualPings || !this.runActive || this.migration || !this.hostId || !Number.isInteger(session.replaySlot)) return false;
    let ping; try { ping = sanitizePingRequest(raw); } catch { return false; }
    if (ping.epoch !== this.authorityEpoch) return false;
    const now = this.pingNow(); this.prunePendingPings(now);
    if (this.pendingPings.size >= MAX_PENDING_PINGS || !this.pingRate.take(String(session.replaySlot), now)) return false;
    const routed = sanitizePingRequest({ ...ping, _from: session.id, replaySlot: session.replaySlot }, { transport: true });
    const key = this.pendingPingKey(routed);
    this.pendingPings.set(key, { ping: routed, receivedAt: now });
    if (this.sendTo(this.hostId, routed)) return true;
    this.pendingPings.delete(key); return false;
  }

  relayPingBroadcast(session, raw) {
    if (!this.runtimeFlags().contextualPings || !this.runActive || this.migration || session.id !== this.hostId || !Number.isInteger(session.replaySlot)) return false;
    let ping; try { ping = sanitizePingBroadcast(raw); } catch { return false; }
    if (ping.epoch !== this.authorityEpoch) return false;
    const now = this.pingNow(); this.prunePendingPings(now);
    const key = this.pendingPingKey(ping), pending = this.pendingPings.get(key);
    if (!pending || pending.ping.intent !== ping.intent) return false;
    this.pendingPings.delete(key);
    this.broadcast({ ...ping, _from: session.id }, socketForSession(this.sessions, session));
    return true;
  }

  pendingDraftRecommendationKey(recommendation) {
    return `${recommendation.epoch}:${recommendation.recommenderSlot}:${recommendation.seq}`;
  }

  prunePendingDraftRecommendations(now = this.draftRecommendationNow()) {
    for (const [key, pending] of this.pendingDraftRecommendations) {
      if (now - pending.receivedAt >= PENDING_DRAFT_RECOMMENDATION_LIFETIME_MS) this.pendingDraftRecommendations.delete(key);
    }
  }

  routeDraftRecommendationRequest(session, raw) {
    if (!this.runtimeFlags().upgradeRecommendations || !this.runActive || this.migration || !this.hostId || !Number.isInteger(session.replaySlot)) return false;
    let recommendation;
    try { recommendation = sanitizeDraftRecommendationRequest(raw); } catch { return false; }
    if (recommendation.epoch !== this.authorityEpoch) return false;
    const sequenceKey = `${recommendation.epoch}:${session.replaySlot}`;
    const previousSequence = this.draftRecommendationSequences.get(sequenceKey);
    if (previousSequence !== undefined && recommendation.seq <= previousSequence) return false;
    this.draftRecommendationSequences.set(sequenceKey, recommendation.seq);
    const now = this.draftRecommendationNow(); this.prunePendingDraftRecommendations(now);
    if (this.pendingDraftRecommendations.size >= MAX_PENDING_DRAFT_RECOMMENDATIONS
      || !this.draftRecommendationRate.take(String(session.replaySlot), now)) return false;
    const routed = sanitizeDraftRecommendationRequest({
      ...recommendation, _from: session.id, recommenderSlot: session.replaySlot,
    }, { transport: true });
    const key = this.pendingDraftRecommendationKey(routed);
    this.pendingDraftRecommendations.set(key, { recommendation: routed, receivedAt: now });
    if (this.sendTo(this.hostId, routed)) return true;
    this.pendingDraftRecommendations.delete(key); return false;
  }

  relayDraftRecommendationState(session, raw) {
    if (!this.runtimeFlags().upgradeRecommendations || !this.runActive || this.migration
      || session.id !== this.hostId || !Number.isInteger(session.replaySlot)) return false;
    let recommendation;
    try { recommendation = sanitizeDraftRecommendationState(raw); } catch { return false; }
    if (recommendation.epoch !== this.authorityEpoch) return false;
    const now = this.draftRecommendationNow(); this.prunePendingDraftRecommendations(now);
    const key = this.pendingDraftRecommendationKey(recommendation);
    const pending = this.pendingDraftRecommendations.get(key)?.recommendation;
    if (pending) {
      if (pending.targetSlot !== recommendation.targetSlot || pending.round !== recommendation.round
        || pending.revision !== recommendation.revision || pending.optionIndex !== recommendation.optionIndex
        || pending.active !== recommendation.active) return false;
      this.pendingDraftRecommendations.delete(key);
    } else {
      if (recommendation.recommenderSlot !== session.replaySlot) return false;
      const sequenceKey = `${recommendation.epoch}:${session.replaySlot}`;
      const previousSequence = this.draftRecommendationSequences.get(sequenceKey);
      if (previousSequence !== undefined && recommendation.seq <= previousSequence) return false;
      this.draftRecommendationSequences.set(sequenceKey, recommendation.seq);
      if (!this.draftRecommendationRate.take(String(session.replaySlot), now)) return false;
    }
    this.broadcast({ ...recommendation, _from: session.id }, socketForSession(this.sessions, session));
    return true;
  }

  relayDraftRecommendationSync(session, raw, targetId) {
    if (!this.runtimeFlags().upgradeRecommendations || !this.runActive || this.migration
      || session.id !== this.hostId || !targetId || targetId === session.id) return false;
    let sync;
    try { sync = sanitizeDraftRecommendationSync(raw); } catch { return false; }
    if (sync.epoch !== this.authorityEpoch) return false;
    return this.sendTo(targetId, { ...sync, _from: session.id });
  }

  onMessage(socket, raw) {
    const session = this.sessions.get(socket);
    if (!session) return;
    const bytes = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) { socket.close(1009, "Message too large"); return; }
    let message;
    try { message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!message || typeof message.type !== "string") return;
    if (bytes > MAX_STANDARD_MESSAGE_BYTES && message.type !== "migration_checkpoint") { socket.close(1009, "Message too large"); return; }
    if (!session.initialized) {
      if (message.type !== "hello") return;
      this.initializeSession(socket, session, message.profile, message.migrationCapabilities);
      return;
    }
    if (message.type === "profile") {
      const profile = safeProfile(message.profile);
      Object.assign(session, profile);
      if (this.migration) session.pendingProfile = true;
      message.profile = {
        id: session.id, name: profile.name, specialist: profile.specialist, ready: profile.ready,
        ...(Number.isInteger(session.replaySlot) ? { replaySlot: session.replaySlot } : {}),
      };
    }
    const targetId = typeof message._to === "string" ? message._to : "";
    delete message._to;
    if (message.type === "migration_checkpoint") { this.acceptMigrationCheckpoint(session, message); return; }
    if (message.type === "migration_ready") { this.acceptMigrationReady(session, message); return; }
    if (this.migration) return;
    if (message.type === "ping") { if (!targetId) this.routePingRequest(session, message); return; }
    if (message.type === "ping_broadcast") { if (!targetId) this.relayPingBroadcast(session, message); return; }
    if (message.type === "draft_recommendation") { if (!targetId) this.routeDraftRecommendationRequest(session, message); return; }
    if (message.type === "draft_recommendation_state") { if (!targetId) this.relayDraftRecommendationState(session, message); return; }
    if (message.type === "draft_recommendation_sync") { this.relayDraftRecommendationSync(session, message, targetId); return; }
    try {
      if (message.type === "input") message = sanitizeInputMessage(message, { allowLegacy: true });
      else if (message.type === "snapshot") message = sanitizeSnapshotMessage(message, { allowLegacy: true });
      else if (message.type === "draft_action") message = { ...sanitizeDraftActionMessage(message) };
    } catch { return; }
    const allowed = new Set(["profile", "lobby_state", "start", "sync_game", "return_lobby", "input", "cast", "cast_audio", "choice", "draft_action", "snapshot"]);
    if (!allowed.has(message.type)) return;
    const hostOnly = new Set(["lobby_state", "start", "sync_game", "return_lobby", "snapshot", "cast_audio"]);
    if (hostOnly.has(message.type) && session.id !== this.hostId) return;
    if (this.runActive && this.authorityEpoch > 0 && Number(message.epoch) !== this.authorityEpoch && message.type !== "profile") return;
    if (message.type === "start" && session.id === this.hostId) {
      if (!this.assignRunReplaySlots(message.players)) return;
      this.runActive = true; this.migrationCheckpoint = null; this.authorityEpoch = 0; this.resetPingState(); this.resetDraftRecommendationState();
    } else if (message.type === "return_lobby" && session.id === this.hostId) {
      this.runActive = false; this.migrationCheckpoint = null; this.clearMigration(); this.resetPingState(); this.resetDraftRecommendationState();
    }
    message._from = session.id;
    if (targetId) {
      if (session.id !== this.hostId || !hostOnly.has(message.type)) return;
      this.sendTo(targetId, message);
      return;
    }
    this.broadcast(message, socket);
  }

  onClose(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    clearTimeout(session.handshakeTimer);
    if (!session.initialized) return;
    this.broadcast({ type: "peer_left", id: session.id });
    if (session.id === this.hostId) {
      if (this.runActive) this.beginMigration(session.id);
      else {
        const successor = this.connectedSessions().sort((a, b) => a.joinOrdinal - b.joinOrdinal)[0];
        this.hostId = successor?.id || null;
        if (this.hostId) this.broadcast({ type: "host_changed", id: this.hostId, authorityEpoch: this.authorityEpoch, migrated: false });
      }
    } else if (this.migration?.candidateId === session.id) this.tryNextMigrationCandidate();
  }

  runtimeFlags() { return operatorRuntimeConfig(this.env).config.flags; }

  connectedSessions() { return [...this.sessions.values()].filter((session) => session.initialized); }

  acceptMigrationCheckpoint(session, raw) {
    if (!this.runtimeFlags().migrationCheckpointReplication || session.id !== this.hostId || this.migration || !this.runActive) return false;
    let checkpoint; try { checkpoint = validateMigrationCheckpoint(raw); } catch { return false; }
    if (checkpoint.epoch !== this.authorityEpoch || !checkpoint.roster.some(({ id }) => id === session.id)) return false;
    if (!session.migrationCapabilities || !migrationCompatibilityMatches(session.migrationCapabilities.compatibility, checkpoint.compatibility)) return false;
    if (this.migrationCheckpoint && checkpoint.tick <= this.migrationCheckpoint.tick) return false;
    for (const member of checkpoint.roster) {
      const connected = this.connectedSessions().find(({ id }) => id === member.id);
      if (!connected) continue;
      connected.replaySlot = member.replaySlot;
      if (connected.resumeToken) this.seatTokens.set(connected.resumeToken, member.replaySlot);
    }
    this.migrationCheckpoint = checkpoint;
    return true;
  }

  eligibleMigrationCandidates(excluded = new Set()) {
    const checkpoint = this.migrationCheckpoint;
    if (!checkpoint) return [];
    const slots = new Map(checkpoint.roster.map(({ id, replaySlot }) => [id, replaySlot]));
    return this.connectedSessions()
      .filter((session) => !excluded.has(session.id) && slots.has(session.id) && session.migrationCapabilities
        && migrationCompatibilityMatches(session.migrationCapabilities.compatibility, checkpoint.compatibility))
      .sort((left, right) => slots.get(left.id) - slots.get(right.id) || left.joinOrdinal - right.joinOrdinal);
  }

  beginMigration(oldHostId) {
    const flags = this.runtimeFlags();
    this.hostId = null; this.pendingPings.clear(); this.resetDraftRecommendationState({ resetRate: false });
    if (!flags.hostMigrationElection || !flags.hostMigrationResume || !this.migrationCheckpoint) {
      this.broadcast({ type: "migration_failed", reason: !this.migrationCheckpoint ? "no-checkpoint" : "disabled" });
      return false;
    }
    this.authorityEpoch++;
    this.migration = { oldHostId, failed: new Set(), candidateId: "", timer: null };
    return this.tryNextMigrationCandidate();
  }

  tryNextMigrationCandidate() {
    if (!this.migration) return false;
    clearTimeout(this.migration.timer);
    if (this.migration.candidateId) this.migration.failed.add(this.migration.candidateId);
    const candidate = this.eligibleMigrationCandidates(this.migration.failed)[0];
    if (!candidate) {
      this.broadcast({ type: "migration_failed", reason: "no-compatible-successor", authorityEpoch: this.authorityEpoch });
      this.clearMigration(); return false;
    }
    this.migration.candidateId = candidate.id;
    this.broadcast({
      type: "migration_started", authorityEpoch: this.authorityEpoch, candidateId: candidate.id,
      checkpointId: this.migrationCheckpoint.checkpointId, tick: this.migrationCheckpoint.tick,
    });
    this.sendTo(candidate.id, {
      type: "migration_offer", authorityEpoch: this.authorityEpoch, oldHostId: this.migration.oldHostId,
      checkpoint: this.migrationCheckpoint,
    });
    this.migration.timer = setTimeout(() => this.tryNextMigrationCandidate(), MIGRATION_PREPARE_TIMEOUT_MS);
    return true;
  }

  acceptMigrationReady(session, raw) {
    if (!this.migration || session.id !== this.migration.candidateId) return false;
    let ready; try { ready = validateMigrationReady(raw); } catch { return false; }
    const checkpoint = this.migrationCheckpoint;
    if (ready.epoch !== this.authorityEpoch || ready.checkpointId !== checkpoint?.checkpointId || ready.tick !== checkpoint.tick || ready.hash !== checkpoint.hash) return false;
    const oldHostId = this.migration.oldHostId;
    this.hostId = session.id;
    this.clearMigration();
    this.broadcast({
      type: "host_changed", id: session.id, authorityEpoch: this.authorityEpoch, migrated: true,
      oldHostId, checkpointId: checkpoint.checkpointId, tick: checkpoint.tick, hash: checkpoint.hash,
    });
    for (const peer of this.connectedSessions()) {
      if (!peer.pendingProfile || peer.id === session.id) continue;
      delete peer.pendingProfile;
      this.sendTo(session.id, { type: "profile", profile: publicPeer(peer), _from: peer.id });
    }
    return true;
  }

  clearMigration() {
    clearTimeout(this.migration?.timer);
    this.migration = null;
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const [socket, session] of this.sessions.entries()) {
      if (socket === except) continue;
      if (!session.initialized) continue;
      try { socket.send(payload); } catch { this.onClose(socket); }
    }
  }

  sendTo(targetId, message) {
    const entry = [...this.sessions.entries()].find(([, session]) => session.initialized && session.id === targetId);
    if (!entry) return false;
    try { entry[0].send(JSON.stringify(message)); return true; }
    catch { this.onClose(entry[0]); return false; }
  }
}

function publicPeer(session) {
  return { id: session.id, name: session.name, specialist: session.specialist, ready: session.ready, ...(Number.isInteger(session.replaySlot) ? { replaySlot: session.replaySlot } : {}) };
}

function socketForSession(sessions, target) {
  for (const [socket, session] of sessions) if (session === target) return socket;
  return null;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = isAllowedOrigin(request);
  return {
    "Access-Control-Allow-Origin": origin && allowed ? origin : "https://bensonperry.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return !origin || origin === "https://bensonperry.com" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

