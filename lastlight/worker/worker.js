const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 512_000;
const MAX_TELEMETRY_BYTES = 8_192;

const TELEMETRY_FIELDS = new Set([
  "schemaVersion", "build", "map", "difficulty", "outcome", "specialists", "playerCount",
  "plannedDurationSeconds", "elapsedSeconds", "waveReached", "levelReached", "totalKills",
  "goldEarned", "xpCollected", "damageDealt", "damageTaken", "revives", "distanceTraveled",
]);
const TELEMETRY_MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const TELEMETRY_DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const TELEMETRY_OUTCOMES = new Set(["won", "lost"]);
const TELEMETRY_SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function safeProfile(value = {}) {
  return {
    name: String(value.name || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16) || "Rookie",
    specialist: /^[a-z]{3,8}$/.test(value.specialist) ? value.specialist : "zuri",
    ready: Boolean(value.ready),
  };
}

function telemetryNumber(value, field, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`Invalid ${field}`);
  }
  const normalized = integer ? Math.round(value) : Math.round(value * 10) / 10;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function sanitizeRunTelemetry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Telemetry must be an object");
  for (const key of Object.keys(value)) {
    if (!TELEMETRY_FIELDS.has(key)) throw new TypeError(`Unexpected telemetry field: ${key}`);
  }
  if (value.schemaVersion !== 1) throw new TypeError("Unsupported telemetry schema");
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

  return {
    schemaVersion: 1,
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
}

function telemetryDataPoint(run) {
  return {
    // Ordered fields are intentionally documented here because Analytics Engine exposes them as blobN/doubleN.
    blobs: ["run.v1", run.build, run.map, run.difficulty, run.outcome, run.playerCount === 1 ? "solo" : "squad", run.specialists.join(",")],
    doubles: [
      run.playerCount, run.plannedDurationSeconds, run.elapsedSeconds, run.waveReached, run.levelReached,
      run.totalKills, run.goldEarned, run.xpCollected, run.damageDealt, run.damageTaken,
      run.revives, run.distanceTraveled,
    ],
    // A shared sampling key prevents this aggregate dataset from becoming a pseudonymous user log.
    indexes: ["lastlight-run-v1"],
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "lastlight-relay", now: new Date().toISOString() }, { headers: corsHeaders(request) });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (url.pathname === "/telemetry" || url.pathname === "/telemetry/") return handleTelemetry(request, env);
    const match = url.pathname.match(/^\/room\/([A-Za-z2-9]{4,6})\/?$/);
    if (!match) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders(request) });
    const code = normalizeCode(match[1]);
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map();
    this.hostId = null;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (this.sessions.size >= MAX_PLAYERS) return new Response("Squad full", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const url = new URL(request.url);
    const profile = safeProfile({ name: url.searchParams.get("name"), specialist: url.searchParams.get("specialist") });
    const id = crypto.randomUUID().slice(0, 8);
    if (!this.hostId) this.hostId = id;
    this.sessions.set(server, { id, ...profile, connectedAt: Date.now() });
    const peers = [...this.sessions.values()].filter((peer) => peer.id !== id).map(publicPeer);
    server.send(JSON.stringify({ type: "welcome", id, role: id === this.hostId ? "host" : "guest", peers }));
    this.broadcast({ type: "peer_joined", peer: publicPeer(this.sessions.get(server)) }, server);

    server.addEventListener("message", (event) => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(socket, raw) {
    const session = this.sessions.get(socket);
    if (!session) return;
    const bytes = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) { socket.close(1009, "Message too large"); return; }
    let message;
    try { message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!message || typeof message.type !== "string") return;
    if (message.type === "profile") {
      const profile = safeProfile(message.profile);
      Object.assign(session, profile);
      message.profile = { id: session.id, ...profile };
    }
    const allowed = new Set(["profile", "lobby_state", "start", "return_lobby", "input", "cast", "choice", "snapshot"]);
    if (!allowed.has(message.type)) return;
    message._from = session.id;
    this.broadcast(message, socket);
  }

  onClose(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.broadcast({ type: "peer_left", id: session.id });
    if (session.id === this.hostId) {
      this.hostId = this.sessions.values().next().value?.id || null;
      if (this.hostId) this.broadcast({ type: "host_changed", id: this.hostId });
    }
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const socket of this.sessions.keys()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { this.onClose(socket); }
    }
  }
}

function publicPeer(session) {
  return { id: session.id, name: session.name, specialist: session.specialist, ready: session.ready };
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

