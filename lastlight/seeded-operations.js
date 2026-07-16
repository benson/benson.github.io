import { CHALLENGE_ACHIEVEMENT_REGISTRY } from "./challenge-achievements.js?v=20260715.3";

export const SEEDED_OPERATION_SCHEMA = "lastlight.seeded-operation.v1";
export const SEEDED_OPERATION_DESCRIPTOR_SCHEMA = "lastlight.seeded-operation-report.v1";
export const SEEDED_OPERATION_STORAGE_SCHEMA = "lastlight.seeded-operation-records.v1";
export const SEEDED_OPERATION_STORAGE_KEY = "lastlight:seeded-operation-records:v1";
export const SEEDED_OPERATION_MAX_RECORDS = 64;

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;
const MAPS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);
const DIFFICULTIES = Object.freeze(["story", "hard", "extreme"]);
const MODIFIER_BY_DIFFICULTY = Object.freeze({ story: "baseline", hard: "contested-operations", extreme: "breach-cascade" });
const REWARDS = Object.freeze({
  daily: Object.freeze({ type: "badge", id: "daily-line", name: "Daily Line", gameplayPower: false }),
  weekly: Object.freeze({ type: "title", id: "weekly-standard", name: "Weekly Standard", gameplayPower: false }),
});
const challengeIds = Object.freeze(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.map((entry) => entry.id));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} contains unsupported fields`);
}

function utcDayStart(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Seeded operation time is invalid");
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

function windowFor(kind, now) {
  const day = utcDayStart(now);
  if (kind === "daily") return { start: day, end: day + DAY_MS };
  if (kind !== "weekly") throw new TypeError("Seeded operation kind is invalid");
  const weekday = new Date(day).getUTCDay();
  const start = day - ((weekday + 6) % 7) * DAY_MS;
  return { start, end: start + WEEK_MS };
}

function windowFromId(id) {
  const match = /^(daily|weekly):(\d{4}-\d{2}-\d{2})$/.exec(String(id));
  if (!match) throw new TypeError("Seeded operation id is invalid");
  const start = Date.parse(`${match[2]}T00:00:00.000Z`);
  if (!Number.isFinite(start) || isoDay(start) !== match[2]) throw new TypeError("Seeded operation id date is invalid");
  const window = windowFor(match[1], new Date(start));
  if (window.start !== start) throw new TypeError("Weekly operation ids must use the UTC Monday boundary");
  return { kind: match[1], ...window };
}

function boundedIndex(hash, offset, length) {
  return Number.parseInt(hash.slice(offset, offset + 4), 16) % length;
}

function unsignedContract(kind, start, end) {
  const id = `${kind}:${isoDay(start)}`;
  const identity = fnv1a64(`${SEEDED_OPERATION_SCHEMA}:${id}`);
  const map = MAPS[boundedIndex(identity, 0, MAPS.length)];
  const difficulty = kind === "daily"
    ? DIFFICULTIES[boundedIndex(identity, 4, 2)]
    : DIFFICULTIES[1 + boundedIndex(identity, 4, 2)];
  const duration = kind === "daily" ? 240 : 900;
  const count = kind === "daily" ? 2 : 4;
  const picked = [];
  for (let cursor = 0; picked.length < count && cursor < challengeIds.length * 2; cursor++) {
    const candidate = challengeIds[(boundedIndex(identity, 8, challengeIds.length) + cursor * 7) % challengeIds.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return {
    schema: SEEDED_OPERATION_SCHEMA,
    id,
    kind,
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
    map,
    difficulty,
    duration,
    seed: `${fnv1a64(`${id}:simulation:v1:a`)}${fnv1a64(`${id}:simulation:v1:b`)}`,
    modifierId: MODIFIER_BY_DIFFICULTY[difficulty],
    challengeIds: picked.sort(),
    reward: REWARDS[kind],
  };
}

export function seededOperationFromId(id) {
  const { kind, start, end } = windowFromId(id);
  const body = unsignedContract(kind, start, end);
  return deepFreeze({ ...body, configHash: fnv1a64(canonicalStringify(body)) });
}

export function seededOperationFor(kind, now = new Date()) {
  const { start, end } = windowFor(kind, now);
  return seededOperationFromId(`${kind}:${isoDay(start)}`);
}

export function validateSeededOperation(value) {
  exactKeys(value, ["schema", "id", "kind", "windowStart", "windowEnd", "map", "difficulty", "duration", "seed", "modifierId", "challengeIds", "reward", "configHash"], "seeded operation");
  const expected = seededOperationFromId(value.id);
  if (canonicalStringify(value) !== canonicalStringify(expected)) throw new TypeError("Seeded operation contract does not match its deterministic schedule");
  return value;
}

export function seededOperationDescriptor(value) {
  const operation = validateSeededOperation(value);
  return deepFreeze({ schema: SEEDED_OPERATION_DESCRIPTOR_SCHEMA, id: operation.id, kind: operation.kind, configHash: operation.configHash });
}

export function validateSeededOperationDescriptor(value, report = null) {
  exactKeys(value, ["schema", "id", "kind", "configHash"], "seeded operation report descriptor");
  if (value.schema !== SEEDED_OPERATION_DESCRIPTOR_SCHEMA || !["daily", "weekly"].includes(value.kind) || !/^[0-9a-f]{16}$/.test(value.configHash)) throw new TypeError("Seeded operation report descriptor is invalid");
  const expected = seededOperationFromId(value.id);
  if (value.kind !== expected.kind || value.configHash !== expected.configHash) throw new TypeError("Seeded operation report descriptor does not match the schedule");
  if (report && (report.map !== expected.map || report.difficulty !== expected.difficulty)) throw new TypeError("Seeded operation report configuration does not match the schedule");
  return value;
}

export function emptySeededOperationRecords() {
  return deepFreeze({ schema: SEEDED_OPERATION_STORAGE_SCHEMA, records: [] });
}

function normalizeBest(value) {
  exactKeys(value, ["outcome", "score", "elapsed", "squadKills"], "seeded operation best result");
  if (!['won', 'lost'].includes(value.outcome) || !Number.isSafeInteger(value.score) || value.score < 0 || value.score > 2_000_000_000 || typeof value.elapsed !== "number" || !Number.isFinite(value.elapsed) || value.elapsed < 0 || value.elapsed > 4_000 || !Number.isSafeInteger(value.squadKills) || value.squadKills < 0 || value.squadKills > 10_000_000) throw new TypeError("Seeded operation best result is invalid");
  return { outcome: value.outcome, score: value.score, elapsed: Math.round(value.elapsed * 10) / 10, squadKills: value.squadKills };
}

export function normalizeSeededOperationRecords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== SEEDED_OPERATION_STORAGE_SCHEMA || !Array.isArray(value.records)) return emptySeededOperationRecords();
  const records = [];
  for (const item of value.records) {
    try {
      exactKeys(item, ["id", "kind", "configHash", "completed", "best"], "seeded operation record");
      const operation = seededOperationFromId(item.id);
      if (item.kind !== operation.kind || item.configHash !== operation.configHash || typeof item.completed !== "boolean") throw new TypeError("Seeded operation record identity is invalid");
      const best = normalizeBest(item.best);
      if (item.completed !== (best.outcome === "won")) throw new TypeError("Seeded operation completion does not reconcile");
      if (!records.some((record) => record.id === item.id)) records.push(deepFreeze({ id: item.id, kind: item.kind, configHash: item.configHash, completed: item.completed, best }));
    } catch { /* Malformed records are isolated. */ }
    if (records.length >= SEEDED_OPERATION_MAX_RECORDS) break;
  }
  records.sort((left, right) => right.id.localeCompare(left.id));
  return deepFreeze({ schema: SEEDED_OPERATION_STORAGE_SCHEMA, records });
}

export function loadSeededOperationRecords(storage = globalThis.localStorage) {
  try { return normalizeSeededOperationRecords(JSON.parse(storage?.getItem?.(SEEDED_OPERATION_STORAGE_KEY) || "null")); }
  catch { return emptySeededOperationRecords(); }
}

export function saveSeededOperationRecords(storage, value) {
  const normalized = normalizeSeededOperationRecords(value);
  try { storage?.setItem?.(SEEDED_OPERATION_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Storage is optional. */ }
  return normalized;
}

export function seededOperationScore(report) {
  if (!report || !["won", "lost"].includes(report.outcome) || !Number.isSafeInteger(report.squadKills) || typeof report.elapsed !== "number" || !Number.isFinite(report.elapsed)) throw new TypeError("A valid terminal report is required");
  const win = report.outcome === "won" ? 1_000_000_000 : 0;
  const speed = report.outcome === "won" ? Math.max(0, 4_000_000 - Math.round(report.elapsed * 1_000)) : Math.round(report.elapsed * 100);
  return Math.min(2_000_000_000, win + speed + Math.min(10_000_000, report.squadKills));
}

export function recordSeededOperationResult(state, report) {
  const current = normalizeSeededOperationRecords(state);
  if (!report?.seededOperation) return deepFreeze({ state: current, changed: false, record: null });
  const descriptor = validateSeededOperationDescriptor(report.seededOperation, report);
  const operation = seededOperationFromId(descriptor.id);
  const best = normalizeBest({ outcome: report.outcome, score: seededOperationScore(report), elapsed: report.elapsed, squadKills: report.squadKills });
  const previous = current.records.find((record) => record.id === descriptor.id);
  if (previous && previous.best.score >= best.score) return deepFreeze({ state: current, changed: false, record: previous });
  const record = deepFreeze({ id: descriptor.id, kind: descriptor.kind, configHash: descriptor.configHash, completed: best.outcome === "won", best });
  const records = [record, ...current.records.filter((item) => item.id !== record.id)].slice(0, SEEDED_OPERATION_MAX_RECORDS);
  return deepFreeze({ state: normalizeSeededOperationRecords({ schema: SEEDED_OPERATION_STORAGE_SCHEMA, records }), changed: true, record, reward: best.outcome === "won" ? clone(operation.reward) : null });
}

export function seededOperationTelemetry(report) {
  if (!report?.seededOperation) return null;
  const descriptor = validateSeededOperationDescriptor(report.seededOperation, report);
  const score = seededOperationScore(report);
  return deepFreeze({ kind: descriptor.kind, outcome: report.outcome, completed: report.outcome === "won", map: report.map, difficulty: report.difficulty, scoreBand: score >= 1_003_000_000 ? "gold" : score >= 1_000_000_000 ? "silver" : "attempt" });
}
