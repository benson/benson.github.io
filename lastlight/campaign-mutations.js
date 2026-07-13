export const CAMPAIGN_MUTATION_SCHEMA = "lastlight.campaign-mutations.v1";
export const CAMPAIGN_MUTATION_DIFFICULTIES = Object.freeze(["story", "hard", "extreme"]);
export const CAMPAIGN_MUTATION_MAPS = Object.freeze(["warehouse", "outskirts", "lab", "beachhead"]);

const MAP_PACKAGES = Object.freeze({
  warehouse: Object.freeze({ retaliation: Object.freeze(["brute", "spitter", "mite"]), surge: Object.freeze(["brute", "bomber", "hound"]), approach: "east-freight" }),
  outskirts: Object.freeze({ retaliation: Object.freeze(["hound", "bomber", "mite"]), surge: Object.freeze(["hound", "brute", "bomber"]), approach: "west-checkpoint" }),
  lab: Object.freeze({ retaliation: Object.freeze(["spitter", "mite", "brute"]), surge: Object.freeze(["spitter", "bomber", "brute"]), approach: "north-cryo" }),
  beachhead: Object.freeze({ retaliation: Object.freeze(["hound", "spitter", "bomber"]), surge: Object.freeze(["brute", "hound", "spitter"]), approach: "south-seawall" }),
});

const encounter = (enabled, warningTicks, cooldownTicks, rewardGold, rewardCards, enemyCount, eliteCount) => Object.freeze({
  enabled, warningTicks, cooldownTicks, rewardGold, rewardCards, enemyCount, eliteCount, maxPending: 1,
});

export const CAMPAIGN_MUTATIONS = deepFreeze({
  schema: CAMPAIGN_MUTATION_SCHEMA,
  difficulties: {
    story: {
      id: "base-line", name: "Base Line", summary: "Readable baseline rules with no hidden mutation encounters.", inherits: null,
      objectiveRetaliation: encounter(false, 0, 0, 0, 0, 0, 0), mapPressureAdvanceTicks: 0, surgeWaves: [], surge: encounter(false, 0, 0, 0, 0, 0, 0),
    },
    hard: {
      id: "contested-operations", name: "Contested Operations", summary: "Objectives provoke rewarded retaliation squads and accelerate operation pressure.", inherits: "story",
      objectiveRetaliation: encounter(true, 180, 300, 18, 0, 3, 1), mapPressureAdvanceTicks: 180, surgeWaves: [], surge: encounter(false, 0, 0, 0, 0, 0, 0),
    },
    extreme: {
      id: "breach-cascade", name: "Breach Cascade", summary: "Contested rules plus telegraphed elite surges at waves 2, 4, and 6.", inherits: "hard",
      objectiveRetaliation: encounter(true, 150, 240, 24, 0, 4, 1), mapPressureAdvanceTicks: 300, surgeWaves: [2, 4, 6], surge: encounter(true, 180, 300, 28, 1, 4, 1),
    },
  },
  maps: MAP_PACKAGES,
  limits: { maxObjectiveCompletions: 12, maxPressureAdvanceTicks: 900, maxResolvedEncounters: 16 },
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exact(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function boundedInteger(value, minimum, maximum) { return Number.isInteger(value) && value >= minimum && value <= maximum; }

function validateEncounter(value, path, errors) {
  const keys = ["enabled", "warningTicks", "cooldownTicks", "rewardGold", "rewardCards", "enemyCount", "eliteCount", "maxPending"];
  if (!exact(value, keys)) { errors.push(`${path}: fields mismatch`); return; }
  if (typeof value.enabled !== "boolean") errors.push(`${path}.enabled: invalid`);
  for (const [key, maximum] of [["warningTicks", 600], ["cooldownTicks", 600], ["rewardGold", 100], ["rewardCards", 2], ["enemyCount", 8], ["eliteCount", 2], ["maxPending", 1]]) {
    if (!boundedInteger(value[key], key === "maxPending" ? 1 : 0, maximum)) errors.push(`${path}.${key}: invalid`);
  }
  if (!value.enabled && ["warningTicks", "cooldownTicks", "rewardGold", "rewardCards", "enemyCount", "eliteCount"].some((key) => value[key] !== 0)) errors.push(`${path}: disabled encounter must be inert`);
  if (value.eliteCount > value.enemyCount) errors.push(`${path}: elite count exceeds formation`);
}

export function validateCampaignMutations(value) {
  const errors = [];
  if (!exact(value, ["schema", "difficulties", "maps", "limits"]) || value.schema !== CAMPAIGN_MUTATION_SCHEMA) return ["campaign mutations: invalid root"];
  if (!exact(value.difficulties, CAMPAIGN_MUTATION_DIFFICULTIES)) errors.push("difficulties: coverage mismatch");
  for (const difficulty of CAMPAIGN_MUTATION_DIFFICULTIES) {
    const entry = value.difficulties?.[difficulty], path = `difficulties.${difficulty}`;
    if (!exact(entry, ["id", "name", "summary", "inherits", "objectiveRetaliation", "mapPressureAdvanceTicks", "surgeWaves", "surge"])) { errors.push(`${path}: fields mismatch`); continue; }
    for (const key of ["id", "name", "summary"]) if (typeof entry[key] !== "string" || !entry[key].trim()) errors.push(`${path}.${key}: invalid`);
    const expectedParent = difficulty === "story" ? null : difficulty === "hard" ? "story" : "hard";
    if (entry.inherits !== expectedParent) errors.push(`${path}.inherits: invalid`);
    validateEncounter(entry.objectiveRetaliation, `${path}.objectiveRetaliation`, errors);
    validateEncounter(entry.surge, `${path}.surge`, errors);
    if (!boundedInteger(entry.mapPressureAdvanceTicks, 0, 600)) errors.push(`${path}.mapPressureAdvanceTicks: invalid`);
    if (!Array.isArray(entry.surgeWaves) || entry.surgeWaves.some((wave, index) => !boundedInteger(wave, 1, 7) || (index && wave <= entry.surgeWaves[index - 1]))) errors.push(`${path}.surgeWaves: invalid`);
    if (entry.surge.enabled !== Boolean(entry.surgeWaves.length)) errors.push(`${path}: surge identity mismatch`);
  }
  if (!exact(value.maps, CAMPAIGN_MUTATION_MAPS)) errors.push("maps: coverage mismatch");
  for (const mapId of CAMPAIGN_MUTATION_MAPS) {
    const entry = value.maps?.[mapId], path = `maps.${mapId}`;
    if (!exact(entry, ["retaliation", "surge", "approach"])) { errors.push(`${path}: fields mismatch`); continue; }
    for (const key of ["retaliation", "surge"]) if (!Array.isArray(entry[key]) || entry[key].length !== 3 || new Set(entry[key]).size !== 3) errors.push(`${path}.${key}: invalid`);
    if (typeof entry.approach !== "string" || !entry.approach.trim()) errors.push(`${path}.approach: invalid`);
  }
  if (!exact(value.limits, ["maxObjectiveCompletions", "maxPressureAdvanceTicks", "maxResolvedEncounters"])) errors.push("limits: fields mismatch");
  return errors;
}

export function campaignMutationDefinition(difficulty, registry = CAMPAIGN_MUTATIONS) {
  if (!CAMPAIGN_MUTATION_DIFFICULTIES.includes(difficulty)) throw new TypeError(`Unknown campaign difficulty: ${difficulty}`);
  return registry.difficulties[difficulty];
}

export function createCampaignMutationState(difficulty, enabled = true) {
  const definition = campaignMutationDefinition(difficulty);
  return Object.freeze({
    schema: CAMPAIGN_MUTATION_SCHEMA, enabled: Boolean(enabled && difficulty !== "story"), difficulty, packageId: definition.id,
    objectiveCompletions: 0, pressureAdvanceTicks: 0, triggeredSurgeWaves: Object.freeze([]), pending: null, active: null, readyTick: 0, encounterSequence: 0, resolvedEncounters: 0,
  });
}

export function validateCampaignMutationState(state, registry = CAMPAIGN_MUTATIONS) {
  const keys = ["schema", "enabled", "difficulty", "packageId", "objectiveCompletions", "pressureAdvanceTicks", "triggeredSurgeWaves", "pending", "active", "readyTick", "encounterSequence", "resolvedEncounters"];
  if (!exact(state, keys) || state.schema !== CAMPAIGN_MUTATION_SCHEMA || typeof state.enabled !== "boolean") return false;
  if (!CAMPAIGN_MUTATION_DIFFICULTIES.includes(state.difficulty) || state.packageId !== registry.difficulties[state.difficulty].id) return false;
  if (!boundedInteger(state.objectiveCompletions, 0, registry.limits.maxObjectiveCompletions)) return false;
  if (!boundedInteger(state.pressureAdvanceTicks, 0, registry.limits.maxPressureAdvanceTicks)) return false;
  if (!Array.isArray(state.triggeredSurgeWaves) || state.triggeredSurgeWaves.some((wave) => !registry.difficulties[state.difficulty].surgeWaves.includes(wave))) return false;
  if (!boundedInteger(state.readyTick, 0, 100_000_600) || !boundedInteger(state.encounterSequence, 0, 100) || !boundedInteger(state.resolvedEncounters, 0, registry.limits.maxResolvedEncounters)) return false;
  const validEncounter = (encounter) => encounter === null || (exact(encounter, ["id", "kind", "triggerTick", "dueTick", "wave", "objectiveKind"])
    && /^mutation-[1-9][0-9]{0,2}$/.test(encounter.id) && ["retaliation", "surge"].includes(encounter.kind)
    && boundedInteger(encounter.triggerTick, 0, 100_000_000) && boundedInteger(encounter.dueTick, encounter.triggerTick, 100_000_600)
    && boundedInteger(encounter.wave, 0, 7) && typeof encounter.objectiveKind === "string" && encounter.objectiveKind.length <= 24);
  if (!validEncounter(state.pending) || !validEncounter(state.active) || state.pending && state.active) return false;
  return true;
}

function transition(state, patch) {
  const next = Object.freeze({ ...state, ...patch });
  if (!validateCampaignMutationState(next)) throw new TypeError("Invalid campaign mutation transition");
  return next;
}

export function campaignMutationObjectiveCompleted(state, { tick, objectiveKind = "objective" } = {}) {
  if (!validateCampaignMutationState(state) || !boundedInteger(tick, 0, 100_000_000)) throw new TypeError("Invalid campaign objective transition");
  if (!state.enabled) return state;
  const definition = campaignMutationDefinition(state.difficulty), objectiveCompletions = Math.min(CAMPAIGN_MUTATIONS.limits.maxObjectiveCompletions, state.objectiveCompletions + 1);
  const pressureAdvanceTicks = Math.min(CAMPAIGN_MUTATIONS.limits.maxPressureAdvanceTicks, state.pressureAdvanceTicks + definition.mapPressureAdvanceTicks);
  if (state.pending || state.active || tick < state.readyTick || !definition.objectiveRetaliation.enabled) return transition(state, { objectiveCompletions, pressureAdvanceTicks });
  const sequence = state.encounterSequence + 1;
  return transition(state, { objectiveCompletions, pressureAdvanceTicks, encounterSequence: sequence, pending: Object.freeze({ id: `mutation-${sequence}`, kind: "retaliation", triggerTick: tick, dueTick: tick + definition.objectiveRetaliation.warningTicks, wave: 0, objectiveKind: String(objectiveKind).slice(0, 24) }) });
}

export function campaignMutationWaveStarted(state, { tick, wave } = {}) {
  if (!validateCampaignMutationState(state) || !boundedInteger(tick, 0, 100_000_000) || !boundedInteger(wave, 1, 7)) throw new TypeError("Invalid campaign wave transition");
  const definition = campaignMutationDefinition(state.difficulty);
  if (!state.enabled || state.pending || state.active || tick < state.readyTick || !definition.surgeWaves.includes(wave) || state.triggeredSurgeWaves.includes(wave)) return state;
  const sequence = state.encounterSequence + 1, triggeredSurgeWaves = Object.freeze([...state.triggeredSurgeWaves, wave]);
  return transition(state, { encounterSequence: sequence, triggeredSurgeWaves, pending: Object.freeze({ id: `mutation-${sequence}`, kind: "surge", triggerTick: tick, dueTick: tick + definition.surge.warningTicks, wave, objectiveKind: "" }) });
}

export function consumeCampaignMutationEncounter(state, tick) {
  if (!validateCampaignMutationState(state) || !boundedInteger(tick, 0, 100_000_000)) throw new TypeError("Invalid campaign encounter consumption");
  if (!state.pending || tick < state.pending.dueTick) return Object.freeze({ state, encounter: null });
  return Object.freeze({ state: transition(state, { pending: null, active: state.pending }), encounter: state.pending });
}

export function resolveCampaignMutationEncounter(state, encounterId = state?.active?.id, tick = state?.active?.dueTick) {
  if (!validateCampaignMutationState(state) || !state.active || encounterId !== state.active.id || !boundedInteger(tick, state.active.dueTick, 100_000_000)) throw new TypeError("Invalid campaign encounter resolution");
  const definition = campaignMutationDefinition(state.difficulty);
  const cooldownTicks = state.active.kind === "surge" ? definition.surge.cooldownTicks : definition.objectiveRetaliation.cooldownTicks;
  return transition(state, { active: null, readyTick: tick + cooldownTicks, resolvedEncounters: Math.min(CAMPAIGN_MUTATIONS.limits.maxResolvedEncounters, state.resolvedEncounters + 1) });
}

export function cancelCampaignMutationEncounter(state) {
  if (!validateCampaignMutationState(state)) throw new TypeError("Invalid campaign encounter cancellation");
  if (!state.pending && !state.active) return state;
  return transition(state, { pending: null, active: null });
}

const builtInErrors = validateCampaignMutations(CAMPAIGN_MUTATIONS);
if (builtInErrors.length) throw new Error(`Invalid built-in campaign mutations:\n- ${builtInErrors.join("\n- ")}`);
