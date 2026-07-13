const MAPS = new Set(["warehouse", "outskirts", "lab", "beachhead"]);
const DIFFICULTIES = new Set(["story", "hard", "extreme"]);
const SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
const SYNERGY_IDS = new Set(["breach-window", "ultimate-resonance", "moving-screen"]);
const SYNERGY_TOTAL_FIELDS = Object.freeze([
  "triggers", "damage", "shielding", "mitigated", "formationSeconds", "ultimateChains",
]);
const SYNERGY_TOTAL_CAPS = Object.freeze({
  triggers: 1_000_000,
  damage: 1_000_000_000,
  shielding: 1_000_000_000,
  mitigated: 1_000_000_000,
  formationSeconds: 16_000,
  ultimateChains: 10_000,
});

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

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
}

function buildSynergyTelemetry(value) {
  exactKeys(value, ["ids", "totals"], "Synergy telemetry");
  if (!Array.isArray(value.ids) || value.ids.length > SYNERGY_IDS.size) throw new TypeError("Invalid synergy ids");
  const synergyIds = value.ids.map((id) => String(id));
  if (new Set(synergyIds).size !== synergyIds.length || synergyIds.some((id) => !SYNERGY_IDS.has(id))) {
    throw new TypeError("Invalid synergy ids");
  }
  synergyIds.sort();

  exactKeys(value.totals, SYNERGY_TOTAL_FIELDS, "Synergy totals");
  const synergyTotals = {};
  for (const field of SYNERGY_TOTAL_FIELDS) {
    const number = finite(value.totals[field], Number.NaN);
    const integer = field === "triggers" || field === "ultimateChains";
    if (!Number.isFinite(number) || number < 0 || number > SYNERGY_TOTAL_CAPS[field] || (integer && !Number.isInteger(number))) {
      throw new TypeError(`Invalid synergy total: ${field}`);
    }
    synergyTotals[field] = rounded(number, integer);
  }
  if (!synergyIds.length && SYNERGY_TOTAL_FIELDS.some((field) => synergyTotals[field] !== 0)) {
    throw new TypeError("Synergy totals require at least one synergy id");
  }
  return { synergyIds, synergyTotals };
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

  const payload = {
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
  if (snapshot.synergyTelemetry !== undefined) {
    const synergyTelemetry = typeof snapshot.synergyTelemetry === "function"
      ? snapshot.synergyTelemetry()
      : snapshot.synergyTelemetry;
    Object.assign(payload, { schemaVersion: 2, ...buildSynergyTelemetry(synergyTelemetry) });
  }
  return payload;
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
