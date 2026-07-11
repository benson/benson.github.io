const DATASET = "lastlight_runs";
export const AGGREGATE_SCHEMA = "lastlight.dashboard.aggregate.v1";
export const DEFAULT_MIN_COHORT = 5;

const DIMENSIONS = ["build", "map", "difficulty", "mode", "specialists"];
const TOTALS = [
  "runs", "wins", "sumElapsedSeconds", "sumPlannedSeconds", "sumWaveReached",
  "sumLevelReached", "sumKills", "sumDamageDealt", "sumDamageTaken", "sumRevives",
];
const FORBIDDEN_KEY = /(?:callsign|identity|player(?:id|name)?|room|squad(?:code)?|resume|token|replay|seed|hash|ip(?:address)?)/i;
const SPECIALISTS = new Set(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);

function finite(value, label, { integer = false, min = 0 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${label} must be a finite ${integer ? "integer " : ""}number >= ${min}`);
  }
  return value;
}

function cleanDimension(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) throw new TypeError(`Invalid ${label}`);
  return value;
}

function assertNoPrivateKeys(value, path = "payload") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new TypeError(`Private field rejected at ${path}.${key}`);
    assertNoPrivateKeys(child, `${path}.${key}`);
  }
}

export function validateAggregatePayload(value, { minCohort = DEFAULT_MIN_COHORT } = {}) {
  finite(minCohort, "minCohort", { integer: true, min: 5 });
  assertNoPrivateKeys(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Aggregate payload must be an object");
  const allowedTop = new Set(["schema", "generatedAt", "windowDays", "cohorts"]);
  for (const key of Object.keys(value)) if (!allowedTop.has(key)) throw new TypeError(`Unknown aggregate field: ${key}`);
  if (value.schema !== AGGREGATE_SCHEMA) throw new TypeError("Unsupported aggregate schema");
  if (!Number.isFinite(Date.parse(value.generatedAt))) throw new TypeError("Invalid generatedAt");
  finite(value.windowDays, "windowDays", { integer: true, min: 1 });
  if (value.windowDays > 90) throw new TypeError("windowDays must be <= 90");
  if (!Array.isArray(value.cohorts)) throw new TypeError("cohorts must be an array");

  const allowedCohort = new Set([...DIMENSIONS, ...TOTALS]);
  const cohorts = value.cohorts.map((cohort, index) => {
    if (!cohort || typeof cohort !== "object" || Array.isArray(cohort)) throw new TypeError(`cohorts[${index}] must be an object`);
    for (const key of Object.keys(cohort)) if (!allowedCohort.has(key)) throw new TypeError(`Unknown cohort field: ${key}`);
    const specialists = cleanDimension(cohort.specialists, "specialists", /^[a-z]+(?:,[a-z]+){0,3}$/).split(",");
    if (specialists.some((id) => !SPECIALISTS.has(id)) || specialists.join(",") !== [...specialists].sort().join(",")) {
      throw new TypeError("Invalid specialists composition");
    }
    const normalized = {
      build: cleanDimension(cohort.build, "build", /^[A-Za-z0-9._-]{1,32}$/),
      map: cleanDimension(cohort.map, "map", /^(warehouse|outskirts|lab|beachhead)$/),
      difficulty: cleanDimension(cohort.difficulty, "difficulty", /^(story|hard|extreme)$/),
      mode: cleanDimension(cohort.mode, "mode", /^(solo|squad)$/),
      specialists: specialists.join(","),
    };
    for (const field of TOTALS) normalized[field] = finite(cohort[field], `cohorts[${index}].${field}`, { min: 0 });
    if (!Number.isInteger(normalized.runs) || !Number.isInteger(normalized.wins) || normalized.wins > normalized.runs) {
      throw new TypeError("runs and wins must be valid integer counts");
    }
    if (normalized.runs < minCohort) throw new TypeError(`Cohort below minimum threshold (${minCohort})`);
    return Object.freeze(normalized);
  });
  return Object.freeze({ schema: AGGREGATE_SCHEMA, generatedAt: value.generatedAt, windowDays: value.windowDays, cohorts: Object.freeze(cohorts) });
}

export function buildAnalyticsQuery({ windowDays = 30, minCohort = DEFAULT_MIN_COHORT } = {}) {
  finite(windowDays, "windowDays", { integer: true, min: 1 });
  finite(minCohort, "minCohort", { integer: true, min: 5 });
  if (windowDays > 90 || minCohort > 1000) throw new TypeError("Query bounds exceeded");
  return `SELECT
  blob2 AS build, blob3 AS map, blob4 AS difficulty, blob6 AS mode, blob7 AS specialists,
  SUM(_sample_interval) AS runs,
  SUM(IF(blob5 = 'won', _sample_interval, 0)) AS wins,
  SUM(double3 * _sample_interval) AS sumElapsedSeconds,
  SUM(double2 * _sample_interval) AS sumPlannedSeconds,
  SUM(double4 * _sample_interval) AS sumWaveReached,
  SUM(double5 * _sample_interval) AS sumLevelReached,
  SUM(double6 * _sample_interval) AS sumKills,
  SUM(double9 * _sample_interval) AS sumDamageDealt,
  SUM(double10 * _sample_interval) AS sumDamageTaken,
  SUM(double11 * _sample_interval) AS sumRevives
FROM ${DATASET}
WHERE index1 = 'lastlight-run-v1'
  AND blob1 = 'run.v1'
  AND timestamp >= NOW() - INTERVAL ${windowDays} DAY
GROUP BY build, map, difficulty, mode, specialists
HAVING runs >= ${minCohort}
ORDER BY runs DESC`;
}

function aggregate(cohorts, keyOf) {
  const groups = new Map();
  for (const cohort of cohorts) {
    const entries = keyOf(cohort);
    for (const [key, label] of entries) {
      const row = groups.get(key) || { key, label, ...Object.fromEntries(TOTALS.map((field) => [field, 0])) };
      for (const field of TOTALS) row[field] += cohort[field];
      groups.set(key, row);
    }
  }
  return [...groups.values()];
}

function publicMetric(row) {
  const runs = row.runs || 1;
  return Object.freeze({
    label: row.label,
    runs: row.runs,
    wins: row.wins,
    defeats: row.runs - row.wins,
    winRate: row.wins / runs,
    averageSurvivalSeconds: row.sumElapsedSeconds / runs,
    averageSurvivalRatio: row.sumPlannedSeconds ? row.sumElapsedSeconds / row.sumPlannedSeconds : 0,
    averageWave: row.sumWaveReached / runs,
    averageLevel: row.sumLevelReached / runs,
    averageKills: row.sumKills / runs,
    averageDamageDealt: row.sumDamageDealt / runs,
    averageDamageTaken: row.sumDamageTaken / runs,
    averageRevives: row.sumRevives / runs,
  });
}

export function buildDashboardModel(payload, { minCohort = DEFAULT_MIN_COHORT } = {}) {
  const safe = validateAggregatePayload(payload, { minCohort });
  const include = (rows) => rows.filter((row) => row.runs >= minCohort).sort((a, b) => b.runs - a.runs || a.label.localeCompare(b.label)).map(publicMetric);
  const overview = include(aggregate(safe.cohorts, () => [["all", "All eligible runs"]]));
  const difficulties = include(aggregate(safe.cohorts, (row) => [[row.difficulty, row.difficulty]]));
  const maps = include(aggregate(safe.cohorts, (row) => [[row.map, row.map]]));
  const modes = include(aggregate(safe.cohorts, (row) => [[row.mode, row.mode]]));
  const specialists = include(aggregate(safe.cohorts, (row) => row.specialists.split(",").map((id) => [id, id])));
  const builds = include(aggregate(safe.cohorts, (row) => [[row.build, row.build]]));
  return Object.freeze({
    generatedAt: safe.generatedAt,
    windowDays: safe.windowDays,
    minCohort,
    overview,
    difficulties,
    maps,
    modes,
    specialists,
    builds,
    unavailable: Object.freeze([
      "Weapon selection and weapon-specific performance are not collected in run.v1.",
      "Reconnect and network performance rates are not collected in run.v1.",
      "Client error and crash rates are not collected in run.v1.",
      "Death causes are not collected; defeats are shown only as lost runs.",
    ]),
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function percent(value) { return `${(value * 100).toFixed(1)}%`; }
function number(value, digits = 0) { return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits }); }

function table(title, rows) {
  const body = rows.length ? rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${number(row.runs)}</td><td>${percent(row.winRate)}</td><td>${number(row.defeats)}</td><td>${number(row.averageSurvivalSeconds, 1)}s</td><td>${percent(row.averageSurvivalRatio)}</td><td>${number(row.averageWave, 1)}</td><td>${number(row.averageLevel, 1)}</td><td>${number(row.averageKills, 1)}</td><td>${number(row.averageDamageDealt, 1)}</td><td>${number(row.averageDamageTaken, 1)}</td><td>${number(row.averageRevives, 2)}</td></tr>`).join("") : `<tr><td colspan="12">No cohort clears the privacy threshold.</td></tr>`;
  return `<section><h2>${escapeHtml(title)}</h2><div class="table"><table><thead><tr><th>Cohort</th><th>Runs</th><th>Win rate</th><th>Defeats</th><th>Avg survival</th><th>Duration survived</th><th>Avg wave</th><th>Avg level</th><th>Avg kills</th><th>Avg damage out</th><th>Avg damage in</th><th>Avg revives</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

export function renderDashboardHtml(model) {
  if (!model || !Array.isArray(model.overview) || !Array.isArray(model.unavailable)) throw new TypeError("A dashboard model is required");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Lastlight internal playtest report</title><style>:root{color-scheme:dark;font:14px/1.45 system-ui;background:#07111b;color:#e7f4f5}body{margin:0;padding:32px}main{max-width:1500px;margin:auto}h1{font-size:28px;margin:0}h2{margin:32px 0 12px;color:#67f5dd;text-transform:uppercase;font-size:15px;letter-spacing:.08em}.meta,.notice{color:#9db1ba}.notice{padding:14px;border:1px solid #29404b;background:#0c1a26}.table{overflow:auto;border:1px solid #29404b}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:9px 12px;text-align:right;border-bottom:1px solid #203440}th:first-child{text-align:left}thead{background:#102535;color:#9feadd}tbody tr:hover{background:#10202d}ul{line-height:1.7}@media print{body{padding:0}}</style></head><body><main><h1>Lastlight internal playtest report</h1><p class="meta">Aggregate-only · ${escapeHtml(model.windowDays)}-day window · minimum cohort ${escapeHtml(model.minCohort)} · generated ${escapeHtml(model.generatedAt)}</p><p class="notice">Privacy guardrail: cohorts smaller than ${escapeHtml(model.minCohort)} runs are excluded before this file is generated. This report contains no raw runs or player/session identifiers.</p>${table("Overview", model.overview)}${table("Difficulty", model.difficulties)}${table("Map", model.maps)}${table("Mode", model.modes)}${table("Specialist presence", model.specialists)}${table("Build comparison", model.builds)}<section><h2>Not yet measurable</h2><ul>${model.unavailable.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></main></body></html>`;
}

export function normalizeApiRows(rows, { generatedAt = new Date().toISOString(), windowDays = 30, minCohort = DEFAULT_MIN_COHORT } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Analytics response rows must be an array");
  const payload = { schema: AGGREGATE_SCHEMA, generatedAt, windowDays, cohorts: rows.map((row) => Object.fromEntries([...DIMENSIONS, ...TOTALS].map((field) => [field, typeof row[field] === "string" && TOTALS.includes(field) ? Number(row[field]) : row[field]]))) };
  return validateAggregatePayload(payload, { minCohort });
}
