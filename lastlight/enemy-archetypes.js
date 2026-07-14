export const ENEMY_IDENTITY_SCHEMA = "lastlight.enemy-identity.v1";
export const ENEMY_IDENTITY_VERSION = 1;
export const ELITE_AFFIX_FORK_LABEL = "elite-affix-v1";
export const MAX_ELITE_AFFIXES = 1;

export const ENEMY_ARCHETYPE_IDS = Object.freeze(["mite", "hound", "spitter", "brute", "bomber", "shark"]);
export const ENEMY_HANDLER_IDS = Object.freeze([
  "swarm-contact-v1", "charge-v1", "kite-shot-v1", "slam-v1", "detonate-v1", "siege-charge-v1",
]);
export const ELITE_AFFIX_IDS = Object.freeze(["hasted", "shielded", "volatile"]);

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export function codePointCompare(left, right) {
  const a = String(left), b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

// These records are behavior-only. Baseline health, damage, speed, radius, and
// XP remain in the balance enemy table so presentation data is never consulted
// by the simulation.
export const ENEMY_ARCHETYPES = deepFreeze({
  mite: { handler: "swarm-contact-v1", role: "swarm", contactCooldown: 0.8, weave: 0.18 },
  hound: { handler: "charge-v1", role: "flanker", contactCooldown: 0.8, triggerRange: 390, windup: 0.5, active: 0.3, recovery: 0.7, cooldown: 3, chargeSpeed: 440 },
  spitter: { handler: "kite-shot-v1", role: "suppressor", preferredRange: 330, retreatRange: 260, windup: 0.55, cooldownMin: 1.6, cooldownMax: 2.4, projectileSpeed: 260, projectileRadius: 9, projectileLife: 4 },
  brute: { handler: "slam-v1", role: "blocker", contactCooldown: 0.9, triggerRange: 125, windup: 0.8, recovery: 1.4, cooldown: 2.4, radius: 115 },
  bomber: { handler: "detonate-v1", role: "area-denial", triggerRange: 70, windup: 0.5, radius: 170 },
  shark: { handler: "siege-charge-v1", role: "linebreaker", contactCooldown: 1.3, triggerRange: 520, windup: 0.9, active: 0.6, recovery: 1.2, cooldown: 4, chargeSpeed: 360, endpointRadius: 150 },
});

// Explicit phase weights replace overlapping first-match thresholds. Every
// phase totals 100, so one bounded integer draw selects one archetype.
export const ENEMY_SPAWN_PHASES = deepFreeze([
  { after: 0, weights: { mite: 100 } },
  { after: 0.13, weights: { mite: 62, hound: 38 } },
  { after: 0.34, weights: { mite: 45, hound: 33, brute: 22 } },
  { after: 0.52, weights: { mite: 35, hound: 32, spitter: 20, brute: 13 } },
  { after: 0.68, weights: { mite: 25, hound: 25, spitter: 20, brute: 12, bomber: 18 } },
]);

export const ELITE_AFFIXES = deepFreeze({
  hasted: { weight: 35, speedMultiplier: 1.2, cooldownMultiplier: 0.8 },
  shielded: { weight: 35, shieldMaxHealth: 0.35 },
  volatile: { weight: 30, windup: 0.55, radius: 150, damageMultiplier: 1.25, excludes: ["bomber"] },
});

export const ENEMY_ELITE_TUNING = deepFreeze({
  radiusMultiplier: 1.45,
  healthMultiplier: 7,
  speedMultiplier: 0.88,
  damageMultiplier: 1.4,
  xpMultiplier: 4,
  affixCount: MAX_ELITE_AFFIXES,
  affixes: ELITE_AFFIXES,
});

export const ENEMY_IDENTITY_CONTRACT = deepFreeze({
  version: ENEMY_IDENTITY_SCHEMA,
  archetypes: ENEMY_ARCHETYPES,
  spawnPhases: ENEMY_SPAWN_PHASES,
  elite: ENEMY_ELITE_TUNING,
});

const ARCHETYPE_FIELDS = deepFreeze({
  mite: ["handler", "role", "contactCooldown", "weave"],
  hound: ["handler", "role", "contactCooldown", "triggerRange", "windup", "active", "recovery", "cooldown", "chargeSpeed"],
  spitter: ["handler", "role", "preferredRange", "retreatRange", "windup", "cooldownMin", "cooldownMax", "projectileSpeed", "projectileRadius", "projectileLife"],
  brute: ["handler", "role", "contactCooldown", "triggerRange", "windup", "recovery", "cooldown", "radius"],
  bomber: ["handler", "role", "triggerRange", "windup", "radius"],
  shark: ["handler", "role", "contactCooldown", "triggerRange", "windup", "active", "recovery", "cooldown", "chargeSpeed", "endpointRadius"],
});

const AFFIX_FIELDS = deepFreeze({
  hasted: ["weight", "speedMultiplier", "cooldownMultiplier"],
  shielded: ["weight", "shieldMaxHealth"],
  volatile: ["weight", "windup", "radius", "damageMultiplier", "excludes"],
});

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(codePointCompare), wanted = [...expected].sort(codePointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function positiveFinite(value) { return Number.isFinite(value) && value > 0; }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }

function exactCoverage(value, ids) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort(codePointCompare).join(",") === [...ids].sort(codePointCompare).join(",");
}

export function validateSpawnPhases(phases = ENEMY_SPAWN_PHASES, archetypes = ENEMY_ARCHETYPES) {
  const errors = [];
  if (!Array.isArray(phases) || !phases.length) return ["spawnPhases: non-empty array required"];
  let prior = -1;
  for (const [index, record] of phases.entries()) {
    const path = `spawnPhases.${index}`;
    if (!exactKeys(record, ["after", "weights"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (!Number.isFinite(record.after) || record.after < 0 || record.after > 1 || record.after <= prior || (index === 0 && record.after !== 0)) errors.push(`${path}.after: must be strictly increasing from zero through one`);
    prior = record.after;
    if (!record.weights || typeof record.weights !== "object" || Array.isArray(record.weights) || !Object.keys(record.weights).length) { errors.push(`${path}.weights: required`); continue; }
    let total = 0;
    for (const [id, weight] of Object.entries(record.weights)) {
      if (!archetypes[id]) errors.push(`${path}.weights.${id}: unknown archetype`);
      if (!positiveInteger(weight)) errors.push(`${path}.weights.${id}: must be a positive safe integer`);
      else total += weight;
    }
    if (total !== 100) errors.push(`${path}.weights: must total 100`);
  }
  return errors;
}

export function validateEliteAffixes(affixes = ELITE_AFFIXES) {
  const errors = [];
  if (!exactCoverage(affixes, ELITE_AFFIX_IDS)) return ["elite.affixes: exact coverage mismatch"];
  let totalWeight = 0;
  for (const id of ELITE_AFFIX_IDS) {
    const record = affixes[id], path = `elite.affixes.${id}`;
    if (!exactKeys(record, AFFIX_FIELDS[id])) { errors.push(`${path}: fields mismatch`); continue; }
    if (!positiveInteger(record.weight)) errors.push(`${path}.weight: must be a positive safe integer`);
    else totalWeight += record.weight;
    for (const [key, value] of Object.entries(record)) {
      if (key === "weight" || key === "excludes") continue;
      if (!positiveFinite(value)) errors.push(`${path}.${key}: must be > 0`);
    }
    if (id === "shielded" && record.shieldMaxHealth > 1) errors.push(`${path}.shieldMaxHealth: must be <= 1`);
    if (id === "volatile") {
      if (!Array.isArray(record.excludes) || new Set(record.excludes).size !== record.excludes.length || record.excludes.some((entry) => !ENEMY_ARCHETYPE_IDS.includes(entry))) errors.push(`${path}.excludes: invalid`);
      if (!record.excludes?.includes("bomber")) errors.push(`${path}.excludes: bomber required`);
    }
  }
  if (totalWeight !== 100) errors.push("elite.affixes: weights must total 100");
  return errors;
}

// `enemyStats` is optional to keep this module independent of balance-config;
// when supplied, it proves the behavior contract covers the same enemy ids.
export function validateEnemyIdentityContract(candidate = ENEMY_IDENTITY_CONTRACT, enemyStats = null) {
  const errors = [];
  if (!exactKeys(candidate, ["version", "archetypes", "spawnPhases", "elite"])) return ["contract: fields mismatch"];
  if (candidate.version !== ENEMY_IDENTITY_SCHEMA) errors.push("version: unsupported");
  if (!exactCoverage(candidate.archetypes, ENEMY_ARCHETYPE_IDS)) errors.push("archetypes: exact coverage mismatch");
  for (const id of ENEMY_ARCHETYPE_IDS) {
    const record = candidate.archetypes?.[id], path = `archetypes.${id}`;
    if (!exactKeys(record, ARCHETYPE_FIELDS[id])) { errors.push(`${path}: fields mismatch`); continue; }
    if (record.handler !== ENEMY_ARCHETYPES[id].handler || !ENEMY_HANDLER_IDS.includes(record.handler)) errors.push(`${path}.handler: unsupported`);
    if (typeof record.role !== "string" || !record.role) errors.push(`${path}.role: required`);
    for (const [key, value] of Object.entries(record)) if (key !== "handler" && key !== "role" && !positiveFinite(value)) errors.push(`${path}.${key}: must be > 0`);
    if (id === "spitter" && record.retreatRange >= record.preferredRange) errors.push(`${path}: retreatRange must be below preferredRange`);
    if (record.cooldownMin !== undefined && record.cooldownMax < record.cooldownMin) errors.push(`${path}: cooldown range is inverted`);
  }
  if (enemyStats && !exactCoverage(enemyStats, ENEMY_ARCHETYPE_IDS)) errors.push("archetypes: enemy stat coverage mismatch");
  errors.push(...validateSpawnPhases(candidate.spawnPhases, candidate.archetypes));
  if (!exactKeys(candidate.elite, ["radiusMultiplier", "healthMultiplier", "speedMultiplier", "damageMultiplier", "xpMultiplier", "affixCount", "affixes"])) errors.push("elite: fields mismatch");
  else {
    for (const key of ["radiusMultiplier", "healthMultiplier", "speedMultiplier", "damageMultiplier", "xpMultiplier"]) if (!positiveFinite(candidate.elite[key])) errors.push(`elite.${key}: must be > 0`);
    if (!Number.isSafeInteger(candidate.elite.affixCount) || candidate.elite.affixCount < 0 || candidate.elite.affixCount > MAX_ELITE_AFFIXES) errors.push(`elite.affixCount: must be from 0 to ${MAX_ELITE_AFFIXES}`);
    errors.push(...validateEliteAffixes(candidate.elite.affixes));
  }
  return errors;
}

export function spawnPhaseAt(progress, phases = ENEMY_SPAWN_PHASES) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new RangeError("Spawn progress must be finite from zero to one");
  if (!Array.isArray(phases) || !phases.length) throw new TypeError("Spawn phases must be a non-empty array");
  let selected = phases[0];
  for (const record of phases) {
    if (progress < record.after) break;
    selected = record;
  }
  return selected;
}

function requireIntegerRng(rng) {
  if (!rng || typeof rng.int !== "function") throw new TypeError("A deterministic RNG with int() is required");
  return rng;
}

function weightedChoice(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!positiveInteger(total)) throw new TypeError("Weighted choices require a positive integer total");
  let roll = requireIntegerRng(rng).int(total);
  for (const [id, weight] of entries) {
    if (roll < weight) return id;
    roll -= weight;
  }
  throw new RangeError("Weighted choice did not resolve");
}

export function selectSpawnArchetype(rng, progress, phases = ENEMY_SPAWN_PHASES) {
  const errors = validateSpawnPhases(phases);
  if (errors.length) throw new TypeError(errors.join("; "));
  const active = spawnPhaseAt(progress, phases);
  return weightedChoice(rng, Object.entries(active.weights).sort(([left], [right]) => codePointCompare(left, right)));
}

export function eliteAffixEligibility(context = {}, affixId, definitions = ELITE_AFFIXES) {
  const record = definitions?.[affixId], typeId = context.typeId ?? context.archetypeId;
  if (!record) return Object.freeze({ eligible: false, reason: "unknown-affix" });
  if (!["scheduled-elite", "practice-laboratory"].includes(context.spawnContext) || context.elite !== true) return Object.freeze({ eligible: false, reason: "not-scheduled-elite" });
  if (context.eventType) return Object.freeze({ eligible: false, reason: "event-enemy" });
  if (context.miniboss) return Object.freeze({ eligible: false, reason: "miniboss" });
  if (context.boss) return Object.freeze({ eligible: false, reason: "boss" });
  if (!ENEMY_ARCHETYPE_IDS.includes(typeId)) return Object.freeze({ eligible: false, reason: "unknown-archetype" });
  if ((record.excludes || record.excludedArchetypeIds || []).includes(typeId)) return Object.freeze({ eligible: false, reason: "incompatible-archetype" });
  return Object.freeze({ eligible: true, reason: "eligible" });
}

// Callers derive this RNG from a stable run-root fork and enemy id. Selection
// advances only that supplied child stream, never the simulation gameplay RNG.
export function selectEliteAffixes({ rng, context, count = MAX_ELITE_AFFIXES, definitions = ELITE_AFFIXES } = {}) {
  requireIntegerRng(rng);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ELITE_AFFIXES) throw new RangeError(`Elite affix count must be from 0 to ${MAX_ELITE_AFFIXES}`);
  const errors = validateEliteAffixes(definitions);
  if (errors.length) throw new TypeError(errors.join("; "));
  const candidates = Object.entries(definitions)
    .filter(([id]) => eliteAffixEligibility(context, id, definitions).eligible)
    .sort(([left], [right]) => codePointCompare(left, right));
  if (!count || !candidates.length) return Object.freeze([]);
  const selected = [], pool = [...candidates];
  while (selected.length < count && pool.length) {
    const id = weightedChoice(rng, pool.map(([candidateId, record]) => [candidateId, record.weight]));
    selected.push(id);
    pool.splice(pool.findIndex(([candidateId]) => candidateId === id), 1);
  }
  return Object.freeze(selected.sort(codePointCompare));
}

export function createEnemyBehaviorState(tick = 0) {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new TypeError("Enemy behavior tick must be a non-negative safe integer");
  return deepFreeze({
    behaviorState: "approach", behaviorStartedTick: tick, behaviorUntilTick: tick,
    abilityReadyTick: tick, actionSequence: 0, attackAngle: 0, behaviorHitIds: [],
  });
}

export function createEliteAffixState(affixIds = [], maxHealth = 0, definitions = ELITE_AFFIXES) {
  if (!Array.isArray(affixIds) || affixIds.length > MAX_ELITE_AFFIXES || new Set(affixIds).size !== affixIds.length || affixIds.some((id) => !ELITE_AFFIX_IDS.includes(id))) throw new TypeError("Elite affix ids are invalid");
  if (!Number.isFinite(maxHealth) || maxHealth < 0) throw new TypeError("Elite maximum health must be finite and non-negative");
  const state = {};
  if (affixIds.includes("shielded")) state.shield = maxHealth * definitions.shielded.shieldMaxHealth;
  return deepFreeze(state);
}

