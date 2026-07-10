const MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);

export const DEFAULT_TELEMETRY_ENDPOINT = "https://lastlight-relay.bensonperry.workers.dev/telemetry";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, integer = false) {
  const number = Math.max(0, finite(value));
  return integer ? Math.round(number) : Math.round(number * 10) / 10;
}

function idOf(value) {
  return typeof value === "string" ? value : value?.id;
}

export function buildRunTelemetry(snapshot, build) {
  if (!snapshot || typeof snapshot !== "object") throw new TypeError("A result snapshot is required");
  if (snapshot.stage !== "won" && snapshot.stage !== "lost") throw new TypeError("Telemetry is only recorded for completed runs");

  const map = idOf(snapshot.map);
  const difficulty = idOf(snapshot.difficulty);
  if (!MAPS.has(map) || !DIFFICULTIES.has(difficulty)) throw new TypeError("Unknown map or difficulty");
  const players = Array.isArray(snapshot.players) ? snapshot.players.slice(0, 4) : [];
  if (!players.length) throw new TypeError("A completed run must include at least one specialist");
  const specialists = players.map((player) => player?.specialist);
  if (specialists.some((specialist) => !SPECIALISTS.has(specialist))) throw new TypeError("Unknown specialist");

  const sum = (field) => players.reduce((total, player) => total + Math.max(0, finite(player?.[field])), 0);
  const safeBuild = String(build || "unknown").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32) || "unknown";

  return {
    schemaVersion: 1,
    build: safeBuild,
    map,
    difficulty,
    outcome: snapshot.stage,
    specialists: specialists.sort(),
    playerCount: players.length,
    plannedDurationSeconds: rounded(snapshot.duration, true),
    elapsedSeconds: rounded(finite(snapshot.time) + finite(snapshot.bossElapsed)),
    waveReached: rounded(snapshot.stage === "won" || finite(snapshot.bossElapsed) > 0 ? 7 : snapshot.wave, true),
    levelReached: Math.max(1, rounded(snapshot.level, true)),
    totalKills: rounded(snapshot.kills ?? sum("kills"), true),
    goldEarned: rounded(snapshot.gold, true),
    xpCollected: rounded(sum("xpCollected")),
    damageDealt: rounded(sum("damage")),
    damageTaken: rounded(sum("damageTaken")),
    revives: rounded(sum("revives"), true),
    distanceTraveled: rounded(sum("traveled")),
  };
}

export async function submitRunTelemetry(snapshot, build, options = {}) {
  const payload = buildRunTelemetry(snapshot, build);
  const request = options.fetch || globalThis.fetch;
  if (typeof request !== "function") throw new TypeError("fetch is unavailable");
  const response = await request(options.endpoint || DEFAULT_TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit",
    keepalive: true,
  });
  if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);
  return payload;
}
