import { SeededRng } from "./rng.js?v=20260711.2";

export const SQUAD_DIRECTOR_VERSION = "lastlight.squad-director.v1";
export const DIRECTOR_APPROACHES = Object.freeze(["lane", "pincer", "split", "surround", "objective"]);
export const DIRECTOR_FORMATIONS = Object.freeze(["column", "flank-pair", "wedge", "arc"]);

const TAU = Math.PI * 2;
const MAX_SEQUENCE = 1_000_000_000;
const METRIC_KEYS = Object.freeze([
  ...DIRECTOR_APPROACHES.map((id) => `approach:${id}`),
  ...DIRECTOR_FORMATIONS.map((id) => `formation:${id}`),
  "objectivePressure", "eliteEscorts",
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} fields mismatch`);
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function increment(value) { return Math.min(Number.MAX_SAFE_INTEGER, value + 1); }

export function createSquadDirectorState(enabled = true) {
  return freeze({
    version: SQUAD_DIRECTOR_VERSION,
    enabled: Boolean(enabled),
    sequence: 0,
    peakSquadSize: 0,
    lastSignalTick: 0,
    lastApproach: "lane",
    metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
  });
}

export function validateSquadDirectorState(value) {
  exactKeys(value, ["version", "enabled", "sequence", "peakSquadSize", "lastSignalTick", "lastApproach", "metrics"], "director state");
  if (value.version !== SQUAD_DIRECTOR_VERSION || typeof value.enabled !== "boolean") throw new TypeError("director state identity is invalid");
  for (const key of ["sequence", "lastSignalTick"]) if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > MAX_SEQUENCE) throw new TypeError(`director state ${key} is invalid`);
  if (!Number.isInteger(value.peakSquadSize) || value.peakSquadSize < 0 || value.peakSquadSize > 4) throw new TypeError("director state peak squad size is invalid");
  if (!DIRECTOR_APPROACHES.includes(value.lastApproach)) throw new TypeError("director state approach is invalid");
  exactKeys(value.metrics, METRIC_KEYS, "director metrics");
  for (const [key, count] of Object.entries(value.metrics)) if (!Number.isSafeInteger(count) || count < 0) throw new TypeError(`director metric ${key} is invalid`);
  return freeze(structuredClone(value));
}

export function squadDirectorContext(players = [], objective = null) {
  const standing = players
    .filter((player) => player && !player.dead && !player.downed && Number.isFinite(player.x) && Number.isFinite(player.y))
    .map((player, index) => ({ slot: Number.isInteger(player.replaySlot) ? player.replaySlot : index, x: player.x, y: player.y }))
    .sort((left, right) => left.slot - right.slot)
    .slice(0, 4);
  const centroid = standing.length
    ? { x: standing.reduce((sum, player) => sum + player.x, 0) / standing.length, y: standing.reduce((sum, player) => sum + player.y, 0) / standing.length }
    : { x: 0, y: 0 };
  const spread = standing.reduce((max, player) => Math.max(max, Math.hypot(player.x - centroid.x, player.y - centroid.y)), 0);
  const activeObjective = objective && Number.isFinite(objective.x) && Number.isFinite(objective.y) && !objective.done
    ? { x: objective.x, y: objective.y, kind: String(objective.kind || "objective").slice(0, 24) }
    : null;
  return freeze({ standing, squadSize: standing.length, centroid, spread, objective: activeObjective });
}

function weightedPick(rng, weights) {
  const entries = Object.entries(weights || {}).filter(([, weight]) => Number.isFinite(weight) && weight > 0).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) throw new RangeError("director requires at least one eligible archetype");
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rng.float(0, total);
  for (const [id, weight] of entries) { cursor -= weight; if (cursor < 0) return id; }
  return entries.at(-1)[0];
}

function typeForRole(rng, role, weights, archetypes) {
  const candidates = Object.keys(weights || {}).filter((id) => weights[id] > 0 && archetypes?.[id]?.role === role).sort();
  return candidates.length ? candidates[rng.int(candidates.length)] : weightedPick(rng, weights);
}

function chooseApproach(context, sequence) {
  if (context.objective && sequence % 3 === 0) return "objective";
  if (context.spread >= 520) return "split";
  if (context.squadSize >= 4) return "surround";
  if (context.squadSize >= 2 && sequence % 2 === 1) return "pincer";
  return "lane";
}

function chooseFormation(approach, size) {
  if (approach === "surround") return "arc";
  if (approach === "objective") return "wedge";
  if (approach === "pincer" && size === 2) return "flank-pair";
  if (approach === "pincer") return "wedge";
  return "column";
}

function desiredRoles(context, progress) {
  if (context.squadSize >= 4) return progress >= .68
    ? ["area-denial", "blocker", "flanker", "suppressor"]
    : ["flanker", "suppressor", "swarm", "blocker"];
  if (context.squadSize === 3) return context.objective
    ? ["blocker", "flanker", "suppressor"]
    : ["flanker", "suppressor", "swarm"];
  return ["flanker", "swarm"];
}

function formationPoint({ target, baseAngle, approach, formation, index, size, distance, spacing }) {
  let angle = baseAngle, radius = distance;
  if (approach === "pincer") angle += index % 2 ? Math.PI : 0;
  else if (approach === "split") angle += index % 2 ? Math.PI * .72 : 0;
  else if (approach === "surround") angle += index * (TAU / Math.max(1, size));
  if (formation === "column") radius += index * spacing;
  else if (formation === "wedge") angle += (index - (size - 1) / 2) * .18;
  else if (formation === "arc") angle += (index - (size - 1) / 2) * .1;
  return { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius, angle };
}

export function planSquadFormation({
  seed, state, tick = 0, progress = 0, players = [], objective = null,
  phaseWeights, archetypes, maxSize = 4, distanceMin = 650, distanceMax = 880,
  worldWidth = 2400, worldHeight = 1600, eliteEscort = false,
} = {}) {
  const current = validateSquadDirectorState(state);
  const context = squadDirectorContext(players, objective);
  if (!current.enabled || context.squadSize < 2) return freeze({ state: current, decision: null });
  const sequence = current.sequence + 1;
  if (sequence > MAX_SEQUENCE) throw new RangeError("director decision sequence exhausted");
  const rng = SeededRng.fromHex(seed).fork(`${SQUAD_DIRECTOR_VERSION}:${eliteEscort ? "elite" : "wave"}:${sequence}`);
  const size = clamp(Math.floor(maxSize), 1, Math.min(4, context.squadSize));
  const approach = chooseApproach(context, sequence), formation = chooseFormation(approach, size);
  const target = approach === "objective" && context.objective ? context.objective : context.centroid;
  const baseAngle = rng.float(0, TAU), distance = rng.float(distanceMin, distanceMax), spacing = 54;
  const roles = desiredRoles(context, clamp(progress, 0, 1));
  const units = Array.from({ length: size }, (_, index) => {
    const point = formationPoint({ target, baseAngle, approach, formation, index, size, distance, spacing });
    return freeze({
      type: typeForRole(rng, roles[index % roles.length], phaseWeights, archetypes),
      x: clamp(point.x, -worldWidth / 2 + 30, worldWidth / 2 - 30),
      y: clamp(point.y, -worldHeight / 2 + 30, worldHeight / 2 - 30),
      lane: index,
    });
  });
  const signal = tick >= current.lastSignalTick + 1_800 && approach !== current.lastApproach;
  const metrics = { ...current.metrics };
  metrics[`approach:${approach}`] = increment(metrics[`approach:${approach}`]);
  metrics[`formation:${formation}`] = increment(metrics[`formation:${formation}`]);
  if (approach === "objective") metrics.objectivePressure = increment(metrics.objectivePressure);
  if (eliteEscort) metrics.eliteEscorts = increment(metrics.eliteEscorts);
  const nextState = validateSquadDirectorState({
    ...current, sequence, peakSquadSize: Math.max(current.peakSquadSize, context.squadSize), lastApproach: approach,
    lastSignalTick: signal ? tick : current.lastSignalTick,
    metrics,
  });
  return freeze({ state: nextState, decision: { sequence, approach, formation, target, units, signal, eliteEscort } });
}
