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
const MAX_PENDING_SESSIONS = 4;
export const ROOM_ADMISSION_PROTOCOL_VERSION = 2;
const JOIN_PACKAGES = new Set(["signature", "assault", "survival"]);
const ACTIVE_RUN_BROADCASTS = new Set([
  "lobby_state", "start", "sync_game", "return_lobby", "input", "cast", "cast_audio", "choice", "draft_action", "snapshot",
  "ping", "ping_broadcast", "draft_recommendation", "draft_recommendation_state", "draft_recommendation_sync",
]);
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
const TELEMETRY_V3_FIELDS = new Set([...TELEMETRY_V2_FIELDS, "participationTotals"]);
const TELEMETRY_V4_FIELDS = new Set([...TELEMETRY_V3_FIELDS, "directorTotals"]);
const TELEMETRY_V5_FIELDS = new Set([...TELEMETRY_V4_FIELDS, "mutationPackageId", "mutationTotals"]);
const TELEMETRY_V6_FIELDS = new Set([...TELEMETRY_V5_FIELDS, "masterySpecialist", "masteryLevelBand", "masteryChallengeCompletions", "masteryMilestoneUnlocks", "masterySelectedStart"]);
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
const TELEMETRY_PARTICIPATION_TOTAL_FIELDS = Object.freeze([
  "effectiveHealing", "effectiveShielding", "shieldDamagePrevented", "mitigationPrevented",
  "damageAssists", "controlAssists", "revives", "reviveSeconds", "objectivePresenceSeconds",
  "objectiveMovement", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const TELEMETRY_PARTICIPATION_INTEGER_FIELDS = new Set([
  "damageAssists", "controlAssists", "revives", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const TELEMETRY_PARTICIPATION_TOTAL_CAPS = Object.freeze({
  effectiveHealing: 1_000_000_000,
  effectiveShielding: 1_000_000_000,
  shieldDamagePrevented: 1_000_000_000,
  mitigationPrevented: 1_000_000_000,
  damageAssists: 1_000_000,
  controlAssists: 1_000_000,
  revives: 10_000,
  reviveSeconds: 16_000,
  objectivePresenceSeconds: 16_000,
  objectiveMovement: 1_000_000_000,
  objectiveCompletions: 10_000,
  eliteParticipations: 1_000_000,
  apexParticipations: 10_000,
});
const TELEMETRY_DIRECTOR_TOTAL_FIELDS = Object.freeze([
  "decisions", "peakSquadSize", "lane", "pincer", "split", "surround", "objective",
  "column", "flankPair", "wedge", "arc", "objectivePressure", "eliteEscorts",
]);
const TELEMETRY_MUTATION_PACKAGES = new Set(["base-line", "contested-operations", "breach-cascade"]);
const TELEMETRY_MUTATION_TOTAL_FIELDS = Object.freeze(["encounters", "clears", "failures", "objectiveCompletions", "surgeWaves"]);

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function safeProfile(value = {}) {
  return {
    name: String(value.name || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16) || "Rookie",
    specialist: /^[a-z]{3,8}$/.test(value.specialist) ? value.specialist : "zuri",
    masteryStart: value.masteryStart === "field-kit" ? "field-kit" : "baseline",
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
  if (![1, 2, 3, 4, 5, 6].includes(value.schemaVersion)) throw new TypeError("Unsupported telemetry schema");
  const allowedFields = value.schemaVersion === 6 ? TELEMETRY_V6_FIELDS : value.schemaVersion === 5 ? TELEMETRY_V5_FIELDS : value.schemaVersion === 4 ? TELEMETRY_V4_FIELDS : value.schemaVersion === 3 ? TELEMETRY_V3_FIELDS : value.schemaVersion === 2 ? TELEMETRY_V2_FIELDS : TELEMETRY_V1_FIELDS;
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
  if (value.schemaVersion >= 2) {
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
  if (value.schemaVersion >= 3) {
    telemetryExactKeys(value.participationTotals, TELEMETRY_PARTICIPATION_TOTAL_FIELDS, "participationTotals");
    const participationTotals = Object.fromEntries(TELEMETRY_PARTICIPATION_TOTAL_FIELDS.map((field) => {
      const integer = TELEMETRY_PARTICIPATION_INTEGER_FIELDS.has(field);
      if (integer && !Number.isInteger(value.participationTotals[field])) throw new TypeError(`Invalid participationTotals.${field}`);
      return [
        field,
        telemetryNumber(value.participationTotals[field], `participationTotals.${field}`, 0, TELEMETRY_PARTICIPATION_TOTAL_CAPS[field], integer),
      ];
    }));
    run.participationTotals = participationTotals;
  }
  if (value.schemaVersion >= 4) {
    telemetryExactKeys(value.directorTotals, TELEMETRY_DIRECTOR_TOTAL_FIELDS, "directorTotals");
    const directorTotals = Object.fromEntries(TELEMETRY_DIRECTOR_TOTAL_FIELDS.map((field) => [
      field,
      telemetryNumber(value.directorTotals[field], `directorTotals.${field}`, 0, field === "peakSquadSize" ? 4 : 1_000_000_000, true),
    ]));
    const approaches = ["lane", "pincer", "split", "surround", "objective"].reduce((sum, field) => sum + directorTotals[field], 0);
    const formations = ["column", "flankPair", "wedge", "arc"].reduce((sum, field) => sum + directorTotals[field], 0);
    if (approaches !== directorTotals.decisions || formations !== directorTotals.decisions) throw new TypeError("Director decision totals do not reconcile");
    if ((directorTotals.decisions === 0) !== (directorTotals.peakSquadSize === 0) || (directorTotals.decisions > 0 && directorTotals.peakSquadSize < 2)) throw new TypeError("Director squad-size band does not reconcile");
    if (directorTotals.objectivePressure !== directorTotals.objective) throw new TypeError("Director objective totals do not reconcile");
    run.directorTotals = directorTotals;
  }
  if (value.schemaVersion >= 5) {
    if (!TELEMETRY_MUTATION_PACKAGES.has(value.mutationPackageId)) throw new TypeError("Invalid mutationPackageId");
    telemetryExactKeys(value.mutationTotals, TELEMETRY_MUTATION_TOTAL_FIELDS, "mutationTotals");
    const mutationTotals = Object.fromEntries(TELEMETRY_MUTATION_TOTAL_FIELDS.map((field) => [
      field, telemetryNumber(value.mutationTotals[field], `mutationTotals.${field}`, 0, 1_000_000, true),
    ]));
    if (mutationTotals.clears + mutationTotals.failures !== mutationTotals.encounters) throw new TypeError("Mutation encounter totals do not reconcile");
    Object.assign(run, { mutationPackageId: value.mutationPackageId, mutationTotals });
  }
  if (value.schemaVersion === 6) {
    if (!TELEMETRY_SPECIALISTS.has(value.masterySpecialist) || !["1-2", "3-4", "5"].includes(value.masteryLevelBand) || !["baseline", "field-kit"].includes(value.masterySelectedStart)) throw new TypeError("Invalid mastery telemetry identity");
    Object.assign(run, {
      masterySpecialist: value.masterySpecialist, masteryLevelBand: value.masteryLevelBand,
      masteryChallengeCompletions: telemetryNumber(value.masteryChallengeCompletions, "masteryChallengeCompletions", 0, 1, true),
      masteryMilestoneUnlocks: telemetryNumber(value.masteryMilestoneUnlocks, "masteryMilestoneUnlocks", 0, 4, true),
      masterySelectedStart: value.masterySelectedStart,
    });
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
  if (run.schemaVersion >= 2) {
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

function roomProtocolVersion(value) {
  return Number(value) === ROOM_ADMISSION_PROTOCOL_VERSION ? ROOM_ADMISSION_PROTOCOL_VERSION : 1;
}

function sanitizeJoinRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid join request");
  const keys = Object.keys(value).sort(), expected = ["packageId", "protocolVersion", "specialist", "type"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new TypeError("Invalid join request fields");
  if (value.type !== "join_request" || value.protocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION) throw new TypeError("Unsupported join request");
  const specialist = String(value.specialist || "");
  if (!TELEMETRY_SPECIALISTS.has(specialist)) throw new TypeError("Invalid join specialist");
  const packageId = String(value.packageId || "");
  if (!JOIN_PACKAGES.has(packageId)) throw new TypeError("Invalid join package");
  return Object.freeze({ type: "join_request", protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, specialist, packageId });
}

function sanitizeAdmissionResolution(value, type) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid admission resolution");
  const expected = type === "join_committed"
    ? ["admissionId", "protocolVersion", "replaySlot", "type"]
    : ["admissionId", "protocolVersion", "reason", "replaySlot", "type"];
  const keys = Object.keys(value).sort(), wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new TypeError("Invalid admission resolution fields");
  if (value.type !== type || value.protocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION) throw new TypeError("Unsupported admission resolution");
  const replaySlot = Number(value.replaySlot);
  if (!Number.isInteger(replaySlot) || replaySlot < 0 || replaySlot >= MAX_PLAYERS) throw new TypeError("Invalid admission replay slot");
  const admissionId = String(value.admissionId || "");
  if (!/^a[0-9]+-[A-Za-z0-9_-]{1,32}-[0-3]$/.test(admissionId)) throw new TypeError("Invalid admission id");
  if (type === "join_committed") return Object.freeze({ type, protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, admissionId, replaySlot });
  const reason = String(value.reason || "");
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(reason)) throw new TypeError("Invalid admission rejection reason");
  return Object.freeze({ type, protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, admissionId, replaySlot, reason });
}

function participationDataPoint(run) {
  return {
    blobs: [
      "participation.v1", run.build, run.map, run.difficulty, run.outcome,
      run.playerCount === 1 ? "solo" : "squad", run.specialists.join(","),
    ],
    doubles: TELEMETRY_PARTICIPATION_TOTAL_FIELDS.map((field) => run.participationTotals[field]),
    indexes: ["lastlight-participation-v1"],
  };
}

function directorDataPoint(run) {
  return {
    blobs: ["squad-director.v1", run.build, run.map, run.difficulty, run.outcome, run.directorTotals.peakSquadSize === 4 ? "full" : run.directorTotals.peakSquadSize === 3 ? "trio" : run.directorTotals.peakSquadSize === 2 ? "duo" : "off"],
    doubles: TELEMETRY_DIRECTOR_TOTAL_FIELDS.map((field) => run.directorTotals[field]),
    indexes: ["lastlight-squad-director-v1"],
  };
}

function mutationDataPoint(run) {
  return {
    blobs: ["campaign-mutations.v1", run.build, run.map, run.difficulty, run.outcome, run.mutationPackageId],
    doubles: TELEMETRY_MUTATION_TOTAL_FIELDS.map((field) => run.mutationTotals[field]),
    indexes: ["lastlight-campaign-mutations-v1"],
  };
}

function masteryDataPoint(run) {
  return {
    blobs: ["specialist-mastery.v1", run.build, run.map, run.difficulty, run.outcome, run.masterySpecialist, run.masteryLevelBand, run.masterySelectedStart],
    doubles: [run.masteryChallengeCompletions, run.masteryMilestoneUnlocks],
    indexes: ["lastlight-specialist-mastery-v1"],
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
  if (run.schemaVersion >= 3) env.RUN_TELEMETRY.writeDataPoint(participationDataPoint(run));
  if (run.schemaVersion >= 4) env.RUN_TELEMETRY.writeDataPoint(directorDataPoint(run));
  if (run.schemaVersion >= 5) env.RUN_TELEMETRY.writeDataPoint(mutationDataPoint(run));
  if (run.schemaVersion === 6) env.RUN_TELEMETRY.writeDataPoint(masteryDataPoint(run));
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
    this.runSeats = new Map();
    this.runCompatibility = null;
    this.runRoomProtocolVersion = 1;
    this.nextAdmissionOrdinal = 0;
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
    if (this.sessions.size >= MAX_PLAYERS + MAX_PENDING_SESSIONS) return new Response("Squad connection queue full", { status: 409 });
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

  hostSession() { return this.connectedSessions().find((peer) => peer.id === this.hostId) || null; }

  isActiveRunSession(peer) {
    return peer?.admissionState === "active" || (peer?.admissionState === undefined && Number.isInteger(peer?.replaySlot));
  }

  activeRunSessions() {
    return this.connectedSessions().filter((peer) => this.isActiveRunSession(peer));
  }

  runPeers(exceptId = "") {
    const peers = this.runActive ? this.activeRunSessions() : this.connectedSessions().filter((peer) => peer.admissionState !== "denied");
    return peers.filter((peer) => peer.id !== exceptId).map(publicPeer);
  }

  admissionCompatibilityMatches(session) {
    if (session.roomProtocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION || this.runRoomProtocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION) return false;
    if (!session.migrationCapabilities || !this.runCompatibility) return false;
    return migrationCompatibilityMatches(session.migrationCapabilities.compatibility, this.runCompatibility);
  }

  freshAdmissionReason(session) {
    if (!this.runActive) return "run-inactive";
    if (!this.hostId && !this.migration) return "no-authority";
    if (this.runtimeFlags().joinInProgressNormalization === false) return "disabled";
    if (!session.resumeToken) return "identity-required";
    if (!this.admissionCompatibilityMatches(session)) return "incompatible";
    if (this.runSeats.size >= MAX_PLAYERS) return "squad-full";
    return "";
  }

  availableRunSlot() {
    return [0, 1, 2, 3].find((slot) => !this.runSeats.has(slot));
  }

  nextAdmissionId(session, replaySlot) {
    return `a${this.nextAdmissionOrdinal++}-${session.id}-${replaySlot}`;
  }

  bindRunSeat(session, replaySlot, { kind, specialist = session.specialist, packageId = "" } = {}) {
    const seat = this.runSeats.get(replaySlot) || {
      replaySlot, resumeToken: session.resumeToken || "", specialist, packageId: packageId || "", status: "reserved", currentId: "",
    };
    if (seat.currentId && seat.currentId !== session.id && this.connectedSessions().some((peer) => peer.id === seat.currentId)) return null;
    seat.currentId = session.id;
    seat.specialist = kind === "fresh" ? specialist : seat.specialist || specialist;
    if (kind === "fresh") seat.packageId = packageId;
    if (kind === "fresh") seat.status = "pending-fresh";
    if (!seat.resumeToken && session.resumeToken) seat.resumeToken = session.resumeToken;
    this.runSeats.set(replaySlot, seat);
    if (seat.resumeToken) this.seatTokens.set(seat.resumeToken, replaySlot);
    Object.assign(session, {
      replaySlot, specialist: seat.specialist, packageId: seat.packageId || "", admissionKind: kind,
      admissionState: this.migration ? "queued" : "pending", admissionDelivered: false, checkpointed: false,
    });
    session.admissionId ||= this.nextAdmissionId(session, replaySlot);
    this.resetDraftRecommendationSeat(replaySlot);
    return seat;
  }

  welcomeAdmission(session, kind, fields = {}) {
    return { kind, ...fields, roomProtocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION };
  }

  sendWelcome(socket, session, admission = null) {
    const payload = {
      type: "welcome", id: session.id, role: session.id === this.hostId ? "host" : "guest", hostId: this.hostId,
      peers: this.runPeers(session.id), authorityEpoch: this.authorityEpoch, migrationProtocol: HOST_MIGRATION_PROTOCOL_VERSION,
    };
    if (session.roomProtocolVersion === ROOM_ADMISSION_PROTOCOL_VERSION) {
      payload.roomProtocolVersion = ROOM_ADMISSION_PROTOCOL_VERSION;
      payload.runActive = this.runActive;
      payload.admission = admission;
    }
    socket.send(JSON.stringify(payload));
  }

  denyActiveSession(socket, session, reason) {
    session.admissionKind = "denied"; session.admissionState = "denied";
    if (session.roomProtocolVersion === ROOM_ADMISSION_PROTOCOL_VERSION) {
      this.sendWelcome(socket, session, this.welcomeAdmission(session, "denied", { reason }));
      try { socket.close(1008, reason); } catch {}
    } else {
      socket.send(JSON.stringify({ type: "admission_denied", protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, reason }));
      try { socket.close(1008, reason); } catch {}
    }
    return true;
  }

  routeRunAdmission(session) {
    if (!this.runActive || !this.hostId || this.migration || !session.admissionId || session.admissionDelivered) return false;
    const host = this.hostSession();
    if (!host) return false;
    if (host.roomProtocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION) {
      if (session.admissionKind !== "reconnect") return false;
      session.admissionState = "active";
      const seat = this.runSeats.get(session.replaySlot); if (seat) seat.status = "active";
      session.admissionDelivered = true;
      return this.sendTo(host.id, { type: "profile", profile: publicPeer(session), _from: session.id });
    }
    const message = {
      type: "run_admission", protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION,
      admissionId: session.admissionId, kind: session.admissionKind, replaySlot: session.replaySlot,
      profile: publicPeer(session), _from: session.id,
      ...(session.admissionKind === "fresh" ? { packageId: session.packageId } : {}),
    };
    if (!this.sendTo(host.id, message)) return false;
    session.admissionDelivered = true;
    return true;
  }

  initializeSession(socket, session, rawProfile, rawCapabilities = null, rawRoomProtocolVersion = 1) {
    if (session.initialized) return false;
    const profile = safeProfile(rawProfile);
    const duplicateToken = profile.resumeToken && this.connectedSessions().some((peer) => peer.id !== session.id && peer.resumeToken === profile.resumeToken);
    if (duplicateToken && !this.runActive) profile.resumeToken = "";
    let migrationCapabilities = null;
    try { if (rawCapabilities) migrationCapabilities = validateMigrationCapabilities(rawCapabilities); } catch { migrationCapabilities = null; }
    Object.assign(session, profile, {
      initialized: true, migrationCapabilities, roomProtocolVersion: roomProtocolVersion(rawRoomProtocolVersion), admissionState: this.runActive ? "pending" : "lobby",
    });
    clearTimeout(session.handshakeTimer); delete session.handshakeTimer;

    if (!this.runActive) {
      if (this.connectedSessions().length > MAX_PLAYERS) {
        session.admissionState = "denied";
        if (session.roomProtocolVersion === ROOM_ADMISSION_PROTOCOL_VERSION) this.sendWelcome(socket, session, this.welcomeAdmission(session, "denied", { reason: "squad-full" }));
        else try { socket.close(1008, "Squad full"); } catch {}
        return true;
      }
      if (!this.hostId && !this.migration) this.hostId = session.id;
      this.sendWelcome(socket, session, session.roomProtocolVersion === ROOM_ADMISSION_PROTOCOL_VERSION ? null : undefined);
      this.broadcast({ type: "peer_joined", peer: publicPeer(session) }, socket);
      return true;
    }

    if (duplicateToken) return this.denyActiveSession(socket, session, "identity-in-use");
    if (!this.hostId && !this.migration) return this.denyActiveSession(socket, session, "no-authority");
    const replaySlot = profile.resumeToken ? this.seatTokens.get(profile.resumeToken) : undefined;
    if (Number.isInteger(replaySlot)) {
      const seat = this.runSeats.get(replaySlot);
      if (seat?.status === "rejected") return this.denyActiveSession(socket, session, "seat-unavailable");
      if (session.roomProtocolVersion === ROOM_ADMISSION_PROTOCOL_VERSION && this.runCompatibility && !this.admissionCompatibilityMatches(session)) {
        return this.denyActiveSession(socket, session, "incompatible");
      }
      const kind = seat?.status === "pending-fresh" ? "fresh" : "reconnect";
      if (!this.bindRunSeat(session, replaySlot, { kind, specialist: seat?.specialist || profile.specialist, packageId: seat?.packageId || "" })) {
        return this.denyActiveSession(socket, session, "identity-in-use");
      }
      this.sendWelcome(socket, session, this.welcomeAdmission(session, this.migration ? "waiting" : kind, { slot: replaySlot }));
      if (!this.migration) this.routeRunAdmission(session);
      return true;
    }

    const reason = this.freshAdmissionReason(session);
    if (reason) return this.denyActiveSession(socket, session, reason);
    session.admissionKind = "fresh"; session.admissionState = this.migration ? "waiting" : "selecting";
    this.sendWelcome(socket, session, this.welcomeAdmission(session, this.migration ? "waiting" : "fresh"));
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

  handleJoinRequest(session, raw) {
    if (!this.runActive || session.roomProtocolVersion !== ROOM_ADMISSION_PROTOCOL_VERSION
      || session.admissionKind !== "fresh" || !["selecting", "waiting"].includes(session.admissionState)) return false;
    let request; try { request = sanitizeJoinRequest(raw); } catch { return false; }
    const reason = this.freshAdmissionReason(session);
    if (reason) {
      session.admissionKind = "denied"; session.admissionState = "denied";
      this.sendTo(session.id, { type: "admission_denied", protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, reason });
      return false;
    }
    const replaySlot = this.availableRunSlot();
    if (!Number.isInteger(replaySlot)) return false;
    session.specialist = request.specialist; session.packageId = request.packageId;
    if (!this.bindRunSeat(session, replaySlot, { kind: "fresh", specialist: request.specialist, packageId: request.packageId })) return false;
    if (this.migration) { session.admissionState = "queued"; return true; }
    return this.routeRunAdmission(session);
  }

  resolveRunAdmission(session, raw, targetId, type) {
    if (!this.runActive || session.id !== this.hostId || !targetId || targetId === session.id) return false;
    const target = this.connectedSessions().find((peer) => peer.id === targetId);
    if (!target || !["pending", "queued"].includes(target.admissionState)) return false;
    let resolution; try { resolution = sanitizeAdmissionResolution(raw, type); } catch { return false; }
    if (resolution.admissionId !== target.admissionId || resolution.replaySlot !== target.replaySlot) return false;
    const seat = this.runSeats.get(target.replaySlot);
    if (!seat || seat.currentId !== target.id) return false;
    if (type === "join_committed") {
      target.admissionState = "active"; target.checkpointed = false; seat.status = "active";
      this.sendTo(target.id, resolution);
      this.broadcast({
        type: "peer_joined", peer: publicPeer(target),
        admission: { protocolVersion: ROOM_ADMISSION_PROTOCOL_VERSION, kind: target.admissionKind, replaySlot: target.replaySlot },
      }, socketForSession(this.sessions, target));
      return true;
    }
    target.admissionState = "denied"; seat.status = "rejected"; seat.currentId = "";
    this.sendTo(target.id, resolution);
    return true;
  }

  assignRunReplaySlots(players) {
    const connected = this.connectedSessions().filter((session) => session.admissionState !== "denied");
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
    this.seatTokens.clear(); this.runSeats.clear();
    for (let index = 0; index < players.length; index++) {
      const player = players[index], replaySlot = Number.isInteger(player?.replaySlot) ? Number(player.replaySlot) : index;
      const connectedSession = byId.get(String(player?.id || ""));
      this.runSeats.set(replaySlot, {
        replaySlot, resumeToken: connectedSession?.resumeToken || "", specialist: connectedSession?.specialist || String(player?.specialist || "zuri"),
        packageId: "", status: connectedSession ? "active" : "reserved", currentId: connectedSession?.id || "",
      });
    }
    for (const session of connected) {
      session.replaySlot = assignments.get(session.id);
      session.admissionKind = "initial"; session.admissionState = "active"; session.admissionDelivered = true; session.checkpointed = true;
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
      this.initializeSession(socket, session, message.profile, message.migrationCapabilities, message.roomProtocolVersion);
      return;
    }
    if (message.type === "profile") {
      const profile = safeProfile(message.profile);
      if (this.runActive) {
        if (session.admissionKind === "fresh" && ["selecting", "waiting"].includes(session.admissionState)) {
          Object.assign(session, { name: profile.name, specialist: profile.specialist, masteryStart: "baseline", ready: profile.ready });
        }
        return;
      }
      Object.assign(session, { name: profile.name, specialist: profile.specialist, masteryStart: profile.masteryStart, ready: profile.ready });
      message.profile = {
        id: session.id, name: profile.name, specialist: profile.specialist, masteryStart: session.masteryStart, ready: profile.ready,
        ...(Number.isInteger(session.replaySlot) ? { replaySlot: session.replaySlot } : {}),
      };
    }
    const targetId = typeof message._to === "string" ? message._to : "";
    delete message._to;
    if (message.type === "migration_checkpoint") { this.acceptMigrationCheckpoint(session, message); return; }
    if (message.type === "migration_ready") { this.acceptMigrationReady(session, message); return; }
    if (message.type === "join_request") { this.handleJoinRequest(session, message); return; }
    if (message.type === "join_committed" || message.type === "join_rejected") {
      this.resolveRunAdmission(session, message, targetId, message.type); return;
    }
    if (this.migration) return;
    if (this.runActive && !this.isActiveRunSession(session)) return;
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
      this.runActive = true; this.migrationCheckpoint = null; this.authorityEpoch = 0;
      this.runCompatibility = session.migrationCapabilities?.compatibility || null;
      this.runRoomProtocolVersion = session.roomProtocolVersion;
      this.resetPingState(); this.resetDraftRecommendationState();
    } else if (message.type === "return_lobby" && session.id === this.hostId) {
      this.runActive = false; this.migrationCheckpoint = null; this.clearMigration(); this.resetPingState(); this.resetDraftRecommendationState();
      this.seatTokens.clear(); this.runSeats.clear(); this.runCompatibility = null; this.runRoomProtocolVersion = 1; this.nextAdmissionOrdinal = 0;
      for (const peer of this.connectedSessions()) {
        delete peer.replaySlot; delete peer.admissionId; delete peer.admissionKind; delete peer.packageId; delete peer.admissionDelivered;
        peer.admissionState = "lobby";
      }
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
    const seat = Number.isInteger(session.replaySlot) ? this.runSeats.get(session.replaySlot) : null;
    if (seat?.currentId === session.id) { seat.currentId = ""; if (seat.status === "active") seat.status = "reserved"; }
    if (!this.runActive || this.isActiveRunSession(session)) this.broadcast({ type: "peer_left", id: session.id });
    if (session.id === this.hostId) {
      if (this.runActive) this.beginMigration(session.id);
      else {
        const successor = this.connectedSessions().filter((peer) => peer.admissionState !== "denied").sort((a, b) => a.joinOrdinal - b.joinOrdinal)[0];
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
      connected.checkpointed = true;
      if (connected.resumeToken) this.seatTokens.set(connected.resumeToken, member.replaySlot);
      const seat = this.runSeats.get(member.replaySlot) || {
        replaySlot: member.replaySlot, resumeToken: connected.resumeToken || "", specialist: connected.specialist || "zuri", packageId: "", status: "active", currentId: connected.id,
      };
      seat.currentId = connected.id; seat.status = "active";
      if (!seat.resumeToken && connected.resumeToken) seat.resumeToken = connected.resumeToken;
      this.runSeats.set(member.replaySlot, seat);
    }
    this.runCompatibility ||= checkpoint.compatibility;
    this.migrationCheckpoint = checkpoint;
    return true;
  }

  eligibleMigrationCandidates(excluded = new Set()) {
    const checkpoint = this.migrationCheckpoint;
    if (!checkpoint) return [];
    const slots = new Map(checkpoint.roster.map(({ id, replaySlot }) => [id, replaySlot]));
    return this.activeRunSessions()
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
    const checkpointIds = new Set(checkpoint.roster.map(({ id }) => id));
    for (const peer of this.connectedSessions()) {
      if (peer.id === session.id || !Number.isInteger(peer.replaySlot) || checkpointIds.has(peer.id)) continue;
      const seat = this.runSeats.get(peer.replaySlot);
      if (!seat || seat.currentId !== peer.id || seat.status === "rejected" || peer.admissionState === "denied") continue;
      peer.checkpointed = false;
      peer.admissionKind = peer.admissionKind === "fresh" ? "fresh" : "reconnect";
      peer.admissionState = "pending"; peer.admissionDelivered = false;
      peer.admissionId ||= this.nextAdmissionId(peer, peer.replaySlot);
      this.routeRunAdmission(peer);
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
      if (this.runActive && ACTIVE_RUN_BROADCASTS.has(message.type) && !this.isActiveRunSession(session)) continue;
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
  return { id: session.id, name: session.name, specialist: session.specialist, masteryStart: session.masteryStart === "field-kit" ? "field-kit" : "baseline", ready: session.ready, ...(Number.isInteger(session.replaySlot) ? { replaySlot: session.replaySlot } : {}) };
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

