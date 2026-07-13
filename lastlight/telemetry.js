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
const PARTICIPATION_TOTAL_FIELDS = Object.freeze([
  "effectiveHealing", "effectiveShielding", "shieldDamagePrevented", "mitigationPrevented",
  "damageAssists", "controlAssists", "revives", "reviveSeconds", "objectivePresenceSeconds",
  "objectiveMovement", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const PARTICIPATION_INTEGER_FIELDS = new Set([
  "damageAssists", "controlAssists", "revives", "objectiveCompletions", "eliteParticipations", "apexParticipations",
]);
const PARTICIPATION_TOTAL_CAPS = Object.freeze({
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
const DIRECTOR_TOTAL_FIELDS = Object.freeze([
  "decisions", "peakSquadSize", "lane", "pincer", "split", "surround", "objective",
  "column", "flankPair", "wedge", "arc", "objectivePressure", "eliteEscorts",
]);
const DIRECTOR_COUNT_CAP = 1_000_000_000;
const MUTATION_PACKAGE_IDS = new Set(["base-line", "contested-operations", "breach-cascade"]);
const MUTATION_TOTAL_FIELDS = Object.freeze(["encounters", "clears", "failures", "objectiveCompletions", "surgeWaves"]);
const MASTERY_LEVEL_BANDS = new Set(["1-2", "3-4", "5"]);
const DISCOVERY_CATEGORIES = Object.freeze(["event", "affix", "boon", "augment"]);

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

function emptySynergyTelemetry() {
  return buildSynergyTelemetry({
    ids: [],
    totals: Object.fromEntries(SYNERGY_TOTAL_FIELDS.map((field) => [field, 0])),
  });
}

function buildParticipationTelemetry(value) {
  exactKeys(value, PARTICIPATION_TOTAL_FIELDS, "Participation totals");
  const participationTotals = {};
  for (const field of PARTICIPATION_TOTAL_FIELDS) {
    const number = value[field];
    const integer = PARTICIPATION_INTEGER_FIELDS.has(field);
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > PARTICIPATION_TOTAL_CAPS[field] || (integer && !Number.isInteger(number))) {
      throw new TypeError(`Invalid participation total: ${field}`);
    }
    participationTotals[field] = rounded(number, integer);
  }
  return participationTotals;
}

function emptyParticipationTelemetry() {
  return Object.fromEntries(PARTICIPATION_TOTAL_FIELDS.map((field) => [field, 0]));
}

function buildDirectorTelemetry(value) {
  exactKeys(value, DIRECTOR_TOTAL_FIELDS, "Director totals");
  const directorTotals = {};
  for (const field of DIRECTOR_TOTAL_FIELDS) {
    const number = value[field], maximum = field === "peakSquadSize" ? 4 : DIRECTOR_COUNT_CAP;
    if (!Number.isInteger(number) || number < 0 || number > maximum) throw new TypeError(`Invalid director total: ${field}`);
    directorTotals[field] = number;
  }
  const approaches = ["lane", "pincer", "split", "surround", "objective"].reduce((sum, field) => sum + directorTotals[field], 0);
  const formations = ["column", "flankPair", "wedge", "arc"].reduce((sum, field) => sum + directorTotals[field], 0);
  if (approaches !== directorTotals.decisions || formations !== directorTotals.decisions) throw new TypeError("Director decision totals do not reconcile");
  if ((directorTotals.decisions === 0) !== (directorTotals.peakSquadSize === 0)) throw new TypeError("Director squad-size band does not reconcile");
  if (directorTotals.decisions > 0 && directorTotals.peakSquadSize < 2) throw new TypeError("Director requires a squad");
  if (directorTotals.objectivePressure !== directorTotals.objective) throw new TypeError("Director objective totals do not reconcile");
  return directorTotals;
}

function buildMutationTelemetry(value) {
  exactKeys(value, ["packageId", ...MUTATION_TOTAL_FIELDS], "Mutation telemetry");
  if (!MUTATION_PACKAGE_IDS.has(value.packageId)) throw new TypeError("Invalid mutation package id");
  const mutationTotals = {};
  for (const field of MUTATION_TOTAL_FIELDS) {
    const number = value[field];
    if (!Number.isInteger(number) || number < 0 || number > 1_000_000) throw new TypeError(`Invalid mutation total: ${field}`);
    mutationTotals[field] = number;
  }
  if (mutationTotals.clears + mutationTotals.failures !== mutationTotals.encounters) throw new TypeError("Mutation encounter totals do not reconcile");
  return { mutationPackageId: value.packageId, mutationTotals };
}

function buildMasteryTelemetry(value) {
  exactKeys(value, ["specialist", "levelBand", "challengeCompletions", "milestoneUnlocks", "selectedStart"], "Mastery telemetry");
  if (!SPECIALISTS.has(value.specialist) || !MASTERY_LEVEL_BANDS.has(value.levelBand) || !["baseline", "field-kit"].includes(value.selectedStart)) throw new TypeError("Invalid mastery telemetry identity");
  if (!Number.isInteger(value.challengeCompletions) || value.challengeCompletions < 0 || value.challengeCompletions > 1 || !Number.isInteger(value.milestoneUnlocks) || value.milestoneUnlocks < 0 || value.milestoneUnlocks > 4) throw new TypeError("Invalid mastery telemetry totals");
  return {
    masterySpecialist: value.specialist, masteryLevelBand: value.levelBand,
    masteryChallengeCompletions: value.challengeCompletions, masteryMilestoneUnlocks: value.milestoneUnlocks,
    masterySelectedStart: value.selectedStart,
  };
}

function buildRareDiscoveryTelemetry(value) {
  exactKeys(value, ["discoveredCount", "newlyRevealedCount", "categories"], "Rare discovery telemetry");
  exactKeys(value.categories, DISCOVERY_CATEGORIES, "Rare discovery categories");
  if (!Number.isInteger(value.discoveredCount) || value.discoveredCount < 0 || value.discoveredCount > 27
    || !Number.isInteger(value.newlyRevealedCount) || value.newlyRevealedCount < 0 || value.newlyRevealedCount > value.discoveredCount) throw new TypeError("Invalid rare discovery totals");
  const categories = {};
  for (const category of DISCOVERY_CATEGORIES) {
    const count = value.categories[category];
    if (!Number.isInteger(count) || count < 0 || count > 27) throw new TypeError(`Invalid rare discovery category: ${category}`);
    categories[category] = count;
  }
  if (Object.values(categories).reduce((sum, count) => sum + count, 0) !== value.discoveredCount) throw new TypeError("Rare discovery categories do not reconcile");
  return { rareDiscoveryCount: value.discoveredCount, rareDiscoveryNewCount: value.newlyRevealedCount, rareDiscoveryCategories: categories };
}

export function buildRunTelemetry(snapshot, build, masteryTelemetry = null, discoveryTelemetry = null) {
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
  if (snapshot.participationTelemetry !== undefined) {
    const participationTelemetry = typeof snapshot.participationTelemetry === "function"
      ? snapshot.participationTelemetry()
      : snapshot.participationTelemetry;
    if (payload.schemaVersion === 1) Object.assign(payload, emptySynergyTelemetry());
    Object.assign(payload, { schemaVersion: 3, participationTotals: buildParticipationTelemetry(participationTelemetry) });
  }
  if (snapshot.directorTelemetry !== undefined) {
    const directorTelemetry = typeof snapshot.directorTelemetry === "function"
      ? snapshot.directorTelemetry()
      : snapshot.directorTelemetry;
    if (payload.schemaVersion === 1) Object.assign(payload, emptySynergyTelemetry());
    if (payload.schemaVersion < 3) Object.assign(payload, { participationTotals: emptyParticipationTelemetry() });
    Object.assign(payload, { schemaVersion: 4, directorTotals: buildDirectorTelemetry(directorTelemetry) });
  }
  if (snapshot.mutationTelemetry !== undefined) {
    const mutationTelemetry = typeof snapshot.mutationTelemetry === "function" ? snapshot.mutationTelemetry() : snapshot.mutationTelemetry;
    if (payload.schemaVersion === 1) Object.assign(payload, emptySynergyTelemetry());
    if (payload.schemaVersion < 3) Object.assign(payload, { participationTotals: emptyParticipationTelemetry() });
    if (payload.schemaVersion < 4) Object.assign(payload, { directorTotals: buildDirectorTelemetry({ decisions: 0, peakSquadSize: 0, lane: 0, pincer: 0, split: 0, surround: 0, objective: 0, column: 0, flankPair: 0, wedge: 0, arc: 0, objectivePressure: 0, eliteEscorts: 0 }) });
    Object.assign(payload, { schemaVersion: 5, ...buildMutationTelemetry(mutationTelemetry) });
  }
  if (masteryTelemetry !== null) {
    if (payload.schemaVersion < 5) throw new TypeError("Mastery telemetry requires the current aggregate run schema");
    Object.assign(payload, { schemaVersion: 6, ...buildMasteryTelemetry(masteryTelemetry) });
  }
  if (discoveryTelemetry !== null) {
    if (payload.schemaVersion < 5) throw new TypeError("Rare discovery telemetry requires the current aggregate run schema");
    Object.assign(payload, { schemaVersion: 7, ...buildRareDiscoveryTelemetry(discoveryTelemetry) });
  }
  return payload;
}

export async function submitRunTelemetry(snapshot, build, options = {}) {
  const payload = buildRunTelemetry(snapshot, build, options.masteryTelemetry ?? null, options.discoveryTelemetry ?? null);
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
