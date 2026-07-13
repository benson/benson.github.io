import { BALANCE_CONFIG, BALANCE_VERSION } from "./balance-config.js";
import { getCombatMetadata } from "./combat-metadata.js";
import { SPECIALIST_IDENTITY_CONTRACT } from "./specialist-identity.js";

export const SQUAD_SYNERGY_SCHEMA = "lastlight.squad-synergy.v1";
export const SQUAD_SYNERGY_STATE_SCHEMA = "lastlight.squad-synergy-state.v1";

const SETUP_ROLES = Object.freeze(["support", "vanguard", "controller"]);
const FOLLOWUP_ROLES = Object.freeze(["gunner", "brawler", "duelist", "skirmisher", "caster", "ranger"]);
const FOLLOWUP_PROJECTILE_MODES = Object.freeze(["counted", "single-effect"]);
const TARGET_KINDS = Object.freeze(["elite", "miniboss", "apex"]);
const CATEGORIES = Object.freeze(["complementary-roles", "coordinated-ultimate", "formation"]);
const MAX_SLOT = 3;
const ENEMY_ID = /^[A-Za-z0-9_-]{1,64}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exactKeys(errors, path, value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: must be an object`); return false; }
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) errors.push(`${path}: unexpected or missing fields`);
  return true;
}

function finite(errors, path, value, { min = 0, max = Infinity, integer = false } = {}) {
  if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) errors.push(`${path}: invalid number`);
}

function same(value, expected) { return JSON.stringify(value) === JSON.stringify(expected); }
function nonEmptyString(errors, path, value) { if (typeof value !== "string" || !value.trim()) errors.push(`${path}: required`); }

const tuning = BALANCE_CONFIG.synergies;

export const SQUAD_SYNERGY_REGISTRY = deepFreeze({
  schemaVersion: SQUAD_SYNERGY_SCHEMA,
  balanceVersion: BALANCE_VERSION,
  entries: [
    {
      id: "breach-window", name: "Breach Window", category: "complementary-roles",
      condition: {
        kind: "controlled-priority-followup", setupRoles: SETUP_ROLES, followupRoles: FOLLOWUP_ROLES,
        followupProjectileModes: FOLLOWUP_PROJECTILE_MODES, targetKinds: TARGET_KINDS,
        distinctContributors: true, controlMinimumTicks: tuning.breachWindow.controlMinimumTicks,
      },
      effect: { kind: "bounded-bonus-damage", ratio: tuning.breachWindow.bonusDamageRatio, capBase: tuning.breachWindow.bonusDamageCapBase, capPerLevel: tuning.breachWindow.bonusDamageCapPerLevel, sourceId: "synergy:breach-window" },
      timing: { windowTicks: tuning.breachWindow.followupWindowTicks, durationTicks: 0, cooldownTicks: tuning.breachWindow.targetCooldownTicks },
      caps: { trackedTargets: tuning.breachWindow.maxTrackedTargets, procsPerTick: tuning.breachWindow.maxProcsPerTick, contributors: 2 },
      attribution: { primary: "finisher", support: "setup", stats: ["triggers", "assists", "damage"] },
      presentation: { glyph: "BR", cue: "split-chevron", copy: "Control a priority target, then let a different damage role land a projectile or burst follow-up.", condition: "Priority target controlled, follow-up ready" },
    },
    {
      id: "ultimate-resonance", name: "Ultimate Resonance", category: "coordinated-ultimate",
      condition: { kind: "distinct-ultimate-chain", distinctContributors: true, minimumContributors: 2, contributorRange: tuning.ultimateResonance.contributorRange },
      effect: { kind: "radius-shield", radius: tuning.ultimateResonance.effectRadius, maxHealth: tuning.ultimateResonance.shieldMaxHealth, capMaxHealth: tuning.ultimateResonance.shieldCapMaxHealth },
      timing: { windowTicks: tuning.ultimateResonance.castWindowTicks, durationTicks: 0, cooldownTicks: tuning.ultimateResonance.teamCooldownTicks },
      caps: { windowCasts: tuning.ultimateResonance.maxWindowCasts, contributors: 2, procsPerTick: 1 },
      attribution: { primary: "contributors-evenly", support: "contributors", stats: ["triggers", "shielding", "ultimateChains"] },
      presentation: { glyph: "UR", cue: "concentric-ring", copy: "Two nearby specialists cast different ultimates within three seconds to shield their nearby squad.", condition: "Second nearby ultimate triggers the pulse" },
    },
    {
      id: "moving-screen", name: "Moving Screen", category: "formation",
      condition: {
        kind: "aligned-moving-pair", minimumContributors: 2,
        enterDistance: [tuning.movingScreen.enterDistanceMin, tuning.movingScreen.enterDistanceMax],
        stayDistance: [tuning.movingScreen.stayDistanceMin, tuning.movingScreen.stayDistanceMax],
        enterMoveRatio: tuning.movingScreen.enterMoveRatio, stayMoveRatio: tuning.movingScreen.stayMoveRatio,
        enterHeadingDegrees: tuning.movingScreen.enterHeadingDegrees, stayHeadingDegrees: tuning.movingScreen.stayHeadingDegrees,
      },
      effect: { kind: "direct-impact-mitigation", multiplier: tuning.movingScreen.directDamageMultiplier, stacks: false },
      timing: { evaluationTicks: tuning.movingScreen.evaluationIntervalTicks, enterTicks: tuning.movingScreen.enterTicks, leaveTicks: tuning.movingScreen.leaveTicks, cooldownTicks: 0 },
      caps: { links: tuning.movingScreen.maxLinks, contributors: 4, applicationsPerPlayer: 1 },
      attribution: { primary: "recipient", support: "formation", stats: ["mitigated", "formationTicks"] },
      presentation: { glyph: "MS", cue: "parallel-chevrons", copy: "Move beside a teammate in the same direction to reduce direct enemy and apex impact damage.", condition: "Aligned movement within formation range" },
    },
  ],
});

export function validateSquadSynergyRegistry(candidate = SQUAD_SYNERGY_REGISTRY) {
  const errors = [];
  if (!exactKeys(errors, "registry", candidate, ["schemaVersion", "balanceVersion", "entries"])) return errors;
  if (candidate.schemaVersion !== SQUAD_SYNERGY_SCHEMA) errors.push("registry.schemaVersion: unsupported version");
  if (candidate.balanceVersion !== BALANCE_VERSION) errors.push("registry.balanceVersion: balance mismatch");
  if (!Array.isArray(candidate.entries) || candidate.entries.length !== 3) { errors.push("registry.entries: exactly three entries required"); return errors; }
  const ids = new Set();
  for (const [index, entry] of candidate.entries.entries()) {
    const path = `registry.entries.${index}`;
    if (!exactKeys(errors, path, entry, ["id", "name", "category", "condition", "effect", "timing", "caps", "attribution", "presentation"])) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id || "") || ids.has(entry.id)) errors.push(`${path}.id: invalid or duplicate`);
    ids.add(entry.id);
    if (!CATEGORIES.includes(entry.category)) errors.push(`${path}.category: unsupported category`);
    if (typeof entry.name !== "string" || !entry.name.trim()) errors.push(`${path}.name: required`);
    exactKeys(errors, `${path}.presentation`, entry.presentation, ["glyph", "cue", "copy", "condition"]);
    exactKeys(errors, `${path}.attribution`, entry.attribution, ["primary", "support", "stats"]);
    for (const key of ["glyph", "cue", "copy", "condition"]) nonEmptyString(errors, `${path}.presentation.${key}`, entry.presentation?.[key]);
    for (const key of ["primary", "support"]) nonEmptyString(errors, `${path}.attribution.${key}`, entry.attribution?.[key]);
    if (!Array.isArray(entry.attribution?.stats) || !entry.attribution.stats.length || new Set(entry.attribution?.stats || []).size !== entry.attribution?.stats?.length) errors.push(`${path}.attribution.stats: unique values required`);
    else for (const stat of entry.attribution.stats) if (!Object.hasOwn(emptyStats(0), stat) || stat === "slot") errors.push(`${path}.attribution.stats: unsupported value ${stat}`);
  }
  if ([...ids].join(",") !== "breach-window,ultimate-resonance,moving-screen") errors.push("registry.entries: canonical order required");

  const breach = candidate.entries[0], ultimate = candidate.entries[1], formation = candidate.entries[2];
  exactKeys(errors, "breach.condition", breach?.condition, ["kind", "setupRoles", "followupRoles", "followupProjectileModes", "targetKinds", "distinctContributors", "controlMinimumTicks"]);
  exactKeys(errors, "breach.effect", breach?.effect, ["kind", "ratio", "capBase", "capPerLevel", "sourceId"]);
  exactKeys(errors, "breach.timing", breach?.timing, ["windowTicks", "durationTicks", "cooldownTicks"]);
  exactKeys(errors, "breach.caps", breach?.caps, ["trackedTargets", "procsPerTick", "contributors"]);
  if (breach?.condition?.kind !== "controlled-priority-followup" || breach?.condition?.distinctContributors !== true) errors.push("breach.condition: invalid trigger contract");
  if (breach?.effect?.kind !== "bounded-bonus-damage" || breach?.effect?.sourceId !== "synergy:breach-window") errors.push("breach.effect: invalid effect contract");
  if (JSON.stringify(breach?.condition?.setupRoles) !== JSON.stringify(SETUP_ROLES) || JSON.stringify(breach?.condition?.followupRoles) !== JSON.stringify(FOLLOWUP_ROLES)) errors.push("breach.condition: role contract mismatch");
  if (JSON.stringify(breach?.condition?.followupProjectileModes) !== JSON.stringify(FOLLOWUP_PROJECTILE_MODES) || JSON.stringify(breach?.condition?.targetKinds) !== JSON.stringify(TARGET_KINDS)) errors.push("breach.condition: source or target contract mismatch");
  for (const [path, value, integer = false] of [["breach.controlMinimumTicks", breach?.condition?.controlMinimumTicks, true], ["breach.windowTicks", breach?.timing?.windowTicks, true], ["breach.durationTicks", breach?.timing?.durationTicks, true], ["breach.cooldownTicks", breach?.timing?.cooldownTicks, true], ["breach.ratio", breach?.effect?.ratio], ["breach.capBase", breach?.effect?.capBase], ["breach.capPerLevel", breach?.effect?.capPerLevel], ["breach.trackedTargets", breach?.caps?.trackedTargets, true], ["breach.procsPerTick", breach?.caps?.procsPerTick, true], ["breach.contributors", breach?.caps?.contributors, true]]) finite(errors, path, value, { min: 0, integer });
  if (!same([breach?.condition?.controlMinimumTicks, breach?.timing?.windowTicks, breach?.timing?.durationTicks, breach?.timing?.cooldownTicks, breach?.effect?.ratio, breach?.effect?.capBase, breach?.effect?.capPerLevel, breach?.caps?.trackedTargets, breach?.caps?.procsPerTick, breach?.caps?.contributors], [tuning.breachWindow.controlMinimumTicks, tuning.breachWindow.followupWindowTicks, 0, tuning.breachWindow.targetCooldownTicks, tuning.breachWindow.bonusDamageRatio, tuning.breachWindow.bonusDamageCapBase, tuning.breachWindow.bonusDamageCapPerLevel, tuning.breachWindow.maxTrackedTargets, tuning.breachWindow.maxProcsPerTick, 2])) errors.push("breach: balance tuning mismatch");

  exactKeys(errors, "ultimate.condition", ultimate?.condition, ["kind", "distinctContributors", "minimumContributors", "contributorRange"]);
  exactKeys(errors, "ultimate.effect", ultimate?.effect, ["kind", "radius", "maxHealth", "capMaxHealth"]);
  exactKeys(errors, "ultimate.timing", ultimate?.timing, ["windowTicks", "durationTicks", "cooldownTicks"]);
  exactKeys(errors, "ultimate.caps", ultimate?.caps, ["windowCasts", "contributors", "procsPerTick"]);
  if (ultimate?.condition?.kind !== "distinct-ultimate-chain" || ultimate?.condition?.distinctContributors !== true) errors.push("ultimate.condition: invalid trigger contract");
  if (ultimate?.effect?.kind !== "radius-shield") errors.push("ultimate.effect: invalid effect contract");
  for (const [path, value, integer = false] of [["ultimate.minimumContributors", ultimate?.condition?.minimumContributors, true], ["ultimate.contributorRange", ultimate?.condition?.contributorRange], ["ultimate.radius", ultimate?.effect?.radius], ["ultimate.maxHealth", ultimate?.effect?.maxHealth], ["ultimate.capMaxHealth", ultimate?.effect?.capMaxHealth], ["ultimate.windowTicks", ultimate?.timing?.windowTicks, true], ["ultimate.durationTicks", ultimate?.timing?.durationTicks, true], ["ultimate.cooldownTicks", ultimate?.timing?.cooldownTicks, true], ["ultimate.windowCasts", ultimate?.caps?.windowCasts, true], ["ultimate.contributors", ultimate?.caps?.contributors, true], ["ultimate.procsPerTick", ultimate?.caps?.procsPerTick, true]]) finite(errors, path, value, { min: 0, integer });
  if (ultimate?.effect?.radius > ultimate?.condition?.contributorRange || ultimate?.effect?.maxHealth > ultimate?.effect?.capMaxHealth) errors.push("ultimate: invalid radius or shield cap");
  if (!same([ultimate?.condition?.minimumContributors, ultimate?.condition?.contributorRange, ultimate?.effect?.radius, ultimate?.effect?.maxHealth, ultimate?.effect?.capMaxHealth, ultimate?.timing?.windowTicks, ultimate?.timing?.durationTicks, ultimate?.timing?.cooldownTicks, ultimate?.caps?.windowCasts, ultimate?.caps?.contributors, ultimate?.caps?.procsPerTick], [2, tuning.ultimateResonance.contributorRange, tuning.ultimateResonance.effectRadius, tuning.ultimateResonance.shieldMaxHealth, tuning.ultimateResonance.shieldCapMaxHealth, tuning.ultimateResonance.castWindowTicks, 0, tuning.ultimateResonance.teamCooldownTicks, tuning.ultimateResonance.maxWindowCasts, 2, 1])) errors.push("ultimate: balance tuning mismatch");

  exactKeys(errors, "formation.condition", formation?.condition, ["kind", "minimumContributors", "enterDistance", "stayDistance", "enterMoveRatio", "stayMoveRatio", "enterHeadingDegrees", "stayHeadingDegrees"]);
  exactKeys(errors, "formation.effect", formation?.effect, ["kind", "multiplier", "stacks"]);
  exactKeys(errors, "formation.timing", formation?.timing, ["evaluationTicks", "enterTicks", "leaveTicks", "cooldownTicks"]);
  exactKeys(errors, "formation.caps", formation?.caps, ["links", "contributors", "applicationsPerPlayer"]);
  if (formation?.condition?.kind !== "aligned-moving-pair" || formation?.condition?.minimumContributors !== 2) errors.push("formation.condition: invalid trigger contract");
  if (!same(formation?.condition?.enterDistance, [tuning.movingScreen.enterDistanceMin, tuning.movingScreen.enterDistanceMax]) || !same(formation?.condition?.stayDistance, [tuning.movingScreen.stayDistanceMin, tuning.movingScreen.stayDistanceMax])) errors.push("formation.condition: invalid distance contract");
  if (formation?.effect?.kind !== "direct-impact-mitigation") errors.push("formation.effect: invalid effect contract");
  for (const [path, value, integer = false] of [["formation.enterMoveRatio", formation?.condition?.enterMoveRatio], ["formation.stayMoveRatio", formation?.condition?.stayMoveRatio], ["formation.enterHeadingDegrees", formation?.condition?.enterHeadingDegrees], ["formation.stayHeadingDegrees", formation?.condition?.stayHeadingDegrees], ["formation.multiplier", formation?.effect?.multiplier], ["formation.evaluationTicks", formation?.timing?.evaluationTicks, true], ["formation.enterTicks", formation?.timing?.enterTicks, true], ["formation.leaveTicks", formation?.timing?.leaveTicks, true], ["formation.cooldownTicks", formation?.timing?.cooldownTicks, true], ["formation.links", formation?.caps?.links, true], ["formation.contributors", formation?.caps?.contributors, true], ["formation.applicationsPerPlayer", formation?.caps?.applicationsPerPlayer, true]]) finite(errors, path, value, { min: 0, integer });
  if (formation?.effect?.multiplier <= 0 || formation?.effect?.multiplier >= 1 || formation?.effect?.stacks !== false) errors.push("formation.effect: mitigation must be bounded and non-stacking");
  if (!same([formation?.condition?.enterMoveRatio, formation?.condition?.stayMoveRatio, formation?.condition?.enterHeadingDegrees, formation?.condition?.stayHeadingDegrees, formation?.effect?.multiplier, formation?.timing?.evaluationTicks, formation?.timing?.enterTicks, formation?.timing?.leaveTicks, formation?.timing?.cooldownTicks, formation?.caps?.links, formation?.caps?.contributors, formation?.caps?.applicationsPerPlayer], [tuning.movingScreen.enterMoveRatio, tuning.movingScreen.stayMoveRatio, tuning.movingScreen.enterHeadingDegrees, tuning.movingScreen.stayHeadingDegrees, tuning.movingScreen.directDamageMultiplier, tuning.movingScreen.evaluationIntervalTicks, tuning.movingScreen.enterTicks, tuning.movingScreen.leaveTicks, 0, tuning.movingScreen.maxLinks, 4, 1])) errors.push("formation: balance tuning mismatch");
  return errors;
}

export function compileSquadSynergyRegistry(candidate = SQUAD_SYNERGY_REGISTRY) {
  const errors = validateSquadSynergyRegistry(candidate);
  if (errors.length) throw new TypeError(`Invalid squad synergy registry: ${errors.join("; ")}`);
  return deepFreeze({
    schemaVersion: candidate.schemaVersion,
    balanceVersion: candidate.balanceVersion,
    orderedIds: candidate.entries.map(({ id }) => id),
    byId: Object.fromEntries(candidate.entries.map((entry) => [entry.id, entry])),
  });
}

export const COMPILED_SQUAD_SYNERGIES = compileSquadSynergyRegistry();

function emptyStats(slot) {
  return { slot, triggers: 0, assists: 0, damage: 0, shielding: 0, mitigated: 0, formationTicks: 0, ultimateChains: 0 };
}

export function createSquadSynergyState({ enabled = true, slots = [] } = {}) {
  const unique = [...new Set(slots)].sort((a, b) => a - b);
  const state = {
    schema: SQUAD_SYNERGY_STATE_SCHEMA, enabled: Boolean(enabled), sequence: 0,
    breachTargets: [], breachProcTick: 0, breachProcsThisTick: 0,
    ultimateWindow: [], ultimateCooldownUntilTick: 0,
    formationLinks: [], stats: unique.map(emptyStats),
  };
  return validateSquadSynergyState(state);
}

function stateClone(state) { return structuredClone(state); }
function validSlot(value) { return Number.isInteger(value) && value >= 0 && value <= MAX_SLOT; }
function assertInteger(value, min, path) { if (!Number.isSafeInteger(value) || value < min) throw new TypeError(`${path} is invalid`); }
function assertFinite(value, path) { if (!Number.isFinite(value) || value < 0) throw new TypeError(`${path} is invalid`); }

export function validateSquadSynergyState(value) {
  const expected = ["schema", "enabled", "sequence", "breachTargets", "breachProcTick", "breachProcsThisTick", "ultimateWindow", "ultimateCooldownUntilTick", "formationLinks", "stats"];
  const errors = [];
  exactKeys(errors, "state", value, expected);
  if (errors.length || value.schema !== SQUAD_SYNERGY_STATE_SCHEMA || typeof value.enabled !== "boolean") throw new TypeError("Invalid squad synergy state header");
  for (const [key, min] of [["sequence", 0], ["breachProcTick", 0], ["breachProcsThisTick", 0], ["ultimateCooldownUntilTick", 0]]) assertInteger(value[key], min, `state.${key}`);
  if (value.breachProcsThisTick > tuning.breachWindow.maxProcsPerTick) throw new TypeError("state.breachProcsThisTick exceeds bounds");
  if (!Array.isArray(value.breachTargets) || value.breachTargets.length > tuning.breachWindow.maxTrackedTargets) throw new TypeError("state.breachTargets exceeds bounds");
  const targetIds = new Set();
  for (const target of value.breachTargets) {
    const keys = ["enemyId", "setupSlot", "armedTick", "expiresTick", "cooldownUntilTick"];
    const local = []; exactKeys(local, "breachTarget", target, keys); if (local.length || !ENEMY_ID.test(target.enemyId || "") || targetIds.has(target.enemyId) || !validSlot(target.setupSlot)) throw new TypeError("Invalid breach target");
    targetIds.add(target.enemyId);
    for (const key of keys.slice(2)) assertInteger(target[key], 0, `breachTarget.${key}`);
    if (target.expiresTick < target.armedTick || target.cooldownUntilTick < 0) throw new TypeError("Invalid breach target timing");
  }
  if (!Array.isArray(value.ultimateWindow) || value.ultimateWindow.length > tuning.ultimateResonance.maxWindowCasts) throw new TypeError("state.ultimateWindow exceeds bounds");
  const ultimateSlots = new Set();
  for (const cast of value.ultimateWindow) {
    const local = []; exactKeys(local, "ultimateCast", cast, ["slot", "tick", "eventSeq", "x", "y"]);
    if (local.length || !validSlot(cast.slot) || ultimateSlots.has(cast.slot)) throw new TypeError("Invalid ultimate cast");
    ultimateSlots.add(cast.slot); assertInteger(cast.tick, 0, "ultimateCast.tick"); assertInteger(cast.eventSeq, 1, "ultimateCast.eventSeq");
    if (!Number.isFinite(cast.x) || !Number.isFinite(cast.y)) throw new TypeError("Invalid ultimate cast position");
  }
  if (!Array.isArray(value.formationLinks) || value.formationLinks.length > tuning.movingScreen.maxLinks) throw new TypeError("state.formationLinks exceeds bounds");
  const linkKeys = new Set();
  for (const link of value.formationLinks) {
    const local = []; exactKeys(local, "formationLink", link, ["a", "b", "active", "qualifyingTicks", "failingTicks", "lastEvaluatedTick"]);
    const key = validSlot(link.a) && validSlot(link.b) ? formationPairKey(link.a, link.b) : "";
    if (local.length || !key || link.a >= link.b || linkKeys.has(key) || typeof link.active !== "boolean") throw new TypeError("Invalid formation link");
    linkKeys.add(key);
    for (const field of ["qualifyingTicks", "failingTicks", "lastEvaluatedTick"]) assertInteger(link[field], 0, `formationLink.${field}`);
  }
  if (!Array.isArray(value.stats) || value.stats.length > 4) throw new TypeError("state.stats exceeds bounds");
  const statSlots = new Set();
  for (const stats of value.stats) {
    const local = []; exactKeys(local, "stats", stats, ["slot", "triggers", "assists", "damage", "shielding", "mitigated", "formationTicks", "ultimateChains"]);
    if (local.length || !validSlot(stats.slot) || statSlots.has(stats.slot)) throw new TypeError("Invalid synergy stats");
    statSlots.add(stats.slot);
    for (const key of ["triggers", "assists", "damage", "shielding", "mitigated", "formationTicks", "ultimateChains"]) assertFinite(stats[key], `stats.${key}`);
    for (const key of ["triggers", "assists", "formationTicks", "ultimateChains"]) assertInteger(stats[key], 0, `stats.${key}`);
  }
  return value;
}

export function specialistRole(specialistId) { return SPECIALIST_IDENTITY_CONTRACT.specialists[specialistId]?.role?.primary || ""; }
export function qualifiesBreachSetupRole(specialistId) { return SETUP_ROLES.includes(specialistRole(specialistId)); }
export function qualifiesBreachFollowupRole(specialistId) { return FOLLOWUP_ROLES.includes(specialistRole(specialistId)); }
export function qualifiesBreachSource(sourceId, specialistId) {
  if (String(sourceId || "").startsWith("synergy:")) return false;
  const metadata = getCombatMetadata(sourceId, specialistId);
  return Boolean(metadata && FOLLOWUP_PROJECTILE_MODES.includes(metadata.projectileMode));
}

function evictBreachTargets(targets) {
  if (targets.length <= tuning.breachWindow.maxTrackedTargets) return targets;
  return [...targets].sort((a, b) => a.expiresTick - b.expiresTick || a.enemyId.localeCompare(b.enemyId)).slice(targets.length - tuning.breachWindow.maxTrackedTargets);
}

export function recordBreachControl(state, event) {
  validateSquadSynergyState(state);
  const { tick, enemyId, setupSlot, specialistId, controlTicks, targetKind } = event || {};
  if (!state.enabled) return { state, accepted: false, reason: "disabled" };
  if (!Number.isSafeInteger(tick) || tick < 0 || !ENEMY_ID.test(String(enemyId || "")) || !validSlot(setupSlot)) return { state, accepted: false, reason: "invalid-event" };
  if (!qualifiesBreachSetupRole(specialistId) || !TARGET_KINDS.includes(targetKind) || !Number.isFinite(controlTicks) || controlTicks < tuning.breachWindow.controlMinimumTicks) return { state, accepted: false, reason: "ineligible" };
  const existing = state.breachTargets.find((target) => target.enemyId === enemyId);
  if (existing?.cooldownUntilTick > tick) return { state, accepted: false, reason: "cooldown" };
  const next = stateClone(state), targets = next.breachTargets.filter((target) => target.enemyId !== enemyId && (target.expiresTick > tick || target.cooldownUntilTick > tick));
  targets.push({ enemyId, setupSlot, armedTick: tick, expiresTick: tick + tuning.breachWindow.followupWindowTicks, cooldownUntilTick: existing?.cooldownUntilTick || 0 });
  next.breachTargets = evictBreachTargets(targets); next.sequence++;
  return { state: validateSquadSynergyState(next), accepted: true, sequence: next.sequence };
}

export function resolveBreachFollowup(state, event) {
  validateSquadSynergyState(state);
  const { tick, enemyId, finisherSlot, specialistId, sourceId, actualDamage, level } = event || {};
  if (!state.enabled) return { state, accepted: false, reason: "disabled" };
  if (!Number.isSafeInteger(tick) || tick < 0 || !validSlot(finisherSlot) || !Number.isFinite(actualDamage) || actualDamage <= 0) return { state, accepted: false, reason: "invalid-event" };
  const target = state.breachTargets.find((entry) => entry.enemyId === enemyId);
  if (!target || target.expiresTick < tick || target.cooldownUntilTick > tick) return { state, accepted: false, reason: "not-armed" };
  if (target.setupSlot === finisherSlot || !qualifiesBreachFollowupRole(specialistId) || !qualifiesBreachSource(sourceId, specialistId)) return { state, accepted: false, reason: "ineligible" };
  const procs = state.breachProcTick === tick ? state.breachProcsThisTick : 0;
  if (procs >= tuning.breachWindow.maxProcsPerTick) return { state, accepted: false, reason: "tick-cap" };
  const next = stateClone(state), stored = next.breachTargets.find((entry) => entry.enemyId === enemyId);
  stored.expiresTick = tick; stored.cooldownUntilTick = tick + tuning.breachWindow.targetCooldownTicks;
  next.breachProcTick = tick; next.breachProcsThisTick = procs + 1; next.sequence++;
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const damage = Math.min(actualDamage * tuning.breachWindow.bonusDamageRatio, tuning.breachWindow.bonusDamageCapBase + tuning.breachWindow.bonusDamageCapPerLevel * safeLevel);
  return {
    state: validateSquadSynergyState(next), accepted: true,
    proc: { id: "breach-window", sequence: next.sequence, enemyId, setupSlot: target.setupSlot, finisherSlot, damage, sourceId: "synergy:breach-window" },
  };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function recordUltimateCast(state, event) {
  validateSquadSynergyState(state);
  const { tick, slot, x, y, livingSlots = [] } = event || {};
  if (!state.enabled) return { state, accepted: false, reason: "disabled" };
  if (!Number.isSafeInteger(tick) || tick < 0 || !validSlot(slot) || !Number.isFinite(x) || !Number.isFinite(y) || !livingSlots.includes(slot)) return { state, accepted: false, reason: "invalid-event" };
  if (tick < Math.max(0, ...state.ultimateWindow.map((cast) => cast.tick))) return { state, accepted: false, reason: "stale" };
  if (state.ultimateCooldownUntilTick > tick) return { state, accepted: false, reason: "cooldown" };
  const living = new Set(livingSlots.filter(validSlot));
  let window = state.ultimateWindow.filter((cast) => living.has(cast.slot) && tick - cast.tick <= tuning.ultimateResonance.castWindowTicks && cast.slot !== slot);
  const prior = [...window].reverse().find((cast) => distance(cast, { x, y }) <= tuning.ultimateResonance.contributorRange);
  const next = stateClone(state); next.sequence++;
  const cast = { slot, tick, eventSeq: next.sequence, x, y };
  if (!prior) {
    window.push(cast);
    next.ultimateWindow = window.slice(-tuning.ultimateResonance.maxWindowCasts);
    return { state: validateSquadSynergyState(next), accepted: true, triggered: false, sequence: next.sequence };
  }
  next.ultimateWindow = []; next.ultimateCooldownUntilTick = tick + tuning.ultimateResonance.teamCooldownTicks;
  return {
    state: validateSquadSynergyState(next), accepted: true, triggered: true,
    pulse: {
      id: "ultimate-resonance", sequence: next.sequence, contributorSlots: [prior.slot, slot], x, y,
      radius: tuning.ultimateResonance.effectRadius, shieldMaxHealth: tuning.ultimateResonance.shieldMaxHealth, shieldCapMaxHealth: tuning.ultimateResonance.shieldCapMaxHealth,
    },
  };
}

export function formationPairKey(left, right) {
  if (!validSlot(left) || !validSlot(right) || left === right) return "";
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function heading(player) {
  if (Number.isFinite(player?.moveVx) && Number.isFinite(player?.moveVy) && Math.hypot(player.moveVx, player.moveVy) > 0.001) return Math.atan2(player.moveVy, player.moveVx);
  return Number.isFinite(player?.movementFacing) ? player.movementFacing : 0;
}

export function headingDeltaDegrees(left, right) {
  const delta = Math.atan2(Math.sin(heading(left) - heading(right)), Math.cos(heading(left) - heading(right)));
  return Math.abs(delta) * 180 / Math.PI;
}

export function evaluateFormationPair(left, right, { active = false } = {}) {
  if (!left || !right || left.dead || right.dead || left.downed || right.downed) return false;
  const d = distance(left, right), min = active ? tuning.movingScreen.stayDistanceMin : tuning.movingScreen.enterDistanceMin;
  const max = active ? tuning.movingScreen.stayDistanceMax : tuning.movingScreen.enterDistanceMax;
  const moveRatio = active ? tuning.movingScreen.stayMoveRatio : tuning.movingScreen.enterMoveRatio;
  const headingLimit = active ? tuning.movingScreen.stayHeadingDegrees : tuning.movingScreen.enterHeadingDegrees;
  return d >= min && d <= max && Number(left.moveSpeedRatio || 0) >= moveRatio && Number(right.moveSpeedRatio || 0) >= moveRatio && headingDeltaDegrees(left, right) <= headingLimit;
}

export function advanceFormationLink(link, qualifies, elapsedTicks = tuning.movingScreen.evaluationIntervalTicks) {
  const next = { ...link }, wasActive = Boolean(link.active), ticks = Math.max(1, Math.floor(elapsedTicks));
  if (wasActive) {
    if (qualifies) next.failingTicks = 0;
    else {
      next.failingTicks += ticks;
      if (next.failingTicks >= tuning.movingScreen.leaveTicks) { next.active = false; next.qualifyingTicks = 0; next.failingTicks = 0; }
    }
  } else if (qualifies) {
    next.qualifyingTicks += ticks; next.failingTicks = 0;
    if (next.qualifyingTicks >= tuning.movingScreen.enterTicks) { next.active = true; next.qualifyingTicks = tuning.movingScreen.enterTicks; }
  } else { next.qualifyingTicks = 0; next.failingTicks = 0; }
  return { link: next, transition: next.active === wasActive ? "none" : next.active ? "enter" : "leave" };
}

export function updateFormationPairs(state, players, tick) {
  validateSquadSynergyState(state);
  if (!Number.isSafeInteger(tick) || tick < 0) throw new TypeError("Formation tick is invalid");
  if (tick % tuning.movingScreen.evaluationIntervalTicks !== 0) return { state, transitions: [] };
  const living = (players || []).filter((player) => validSlot(player?.replaySlot) && !player.dead && !player.downed).sort((a, b) => a.replaySlot - b.replaySlot);
  const current = new Map(state.formationLinks.map((link) => [formationPairKey(link.a, link.b), link])), links = [], transitions = [], retained = new Set();
  if (state.enabled) for (let left = 0; left < living.length; left++) for (let right = left + 1; right < living.length; right++) {
    const a = living[left].replaySlot, b = living[right].replaySlot, key = formationPairKey(a, b);
    retained.add(key);
    const previous = current.get(key) || { a, b, active: false, qualifyingTicks: 0, failingTicks: 0, lastEvaluatedTick: Math.max(0, tick - tuning.movingScreen.evaluationIntervalTicks) };
    const elapsed = Math.max(1, Math.min(tuning.movingScreen.evaluationIntervalTicks, tick - previous.lastEvaluatedTick));
    const result = advanceFormationLink(previous, evaluateFormationPair(living[left], living[right], { active: previous.active }), elapsed);
    result.link.lastEvaluatedTick = tick;
    if (result.link.active || result.link.qualifyingTicks || result.link.failingTicks) links.push(result.link);
    if (result.transition !== "none") transitions.push({ id: "moving-screen", type: result.transition, slots: [a, b], tick });
  }
  for (const [key, link] of current) if (!retained.has(key) && link.active) transitions.push({ id: "moving-screen", type: "leave", slots: [link.a, link.b], tick });
  const next = stateClone(state); next.formationLinks = links.slice(0, tuning.movingScreen.maxLinks);
  if (transitions.length) next.sequence += transitions.length;
  return { state: validateSquadSynergyState(next), transitions };
}

export function removeSquadSynergySlot(state, slot, tick) {
  validateSquadSynergyState(state);
  if (!validSlot(slot) || !Number.isSafeInteger(tick) || tick < 0) throw new TypeError("Synergy slot removal is invalid");
  const next = stateClone(state), transitions = [];
  for (const link of next.formationLinks) {
    if (link.a !== slot && link.b !== slot || !link.active) continue;
    transitions.push({ id: "moving-screen", type: "leave", slots: [link.a, link.b], tick });
  }
  next.formationLinks = next.formationLinks.filter((link) => link.a !== slot && link.b !== slot);
  next.ultimateWindow = next.ultimateWindow.filter((cast) => cast.slot !== slot);
  if (transitions.length) next.sequence += transitions.length;
  return { state: validateSquadSynergyState(next), transitions };
}

export function activeFormationSlots(state) {
  validateSquadSynergyState(state);
  return [...new Set(state.formationLinks.filter(({ active }) => active).flatMap(({ a, b }) => [a, b]))].sort((a, b) => a - b);
}

export function formationDamageMultiplier(state, slot) {
  return activeFormationSlots(state).includes(slot) ? tuning.movingScreen.directDamageMultiplier : 1;
}

export function addSquadSynergyStats(state, slot, changes = {}) {
  validateSquadSynergyState(state);
  if (!validSlot(slot)) throw new TypeError("Synergy stat slot is invalid");
  const next = stateClone(state); let stats = next.stats.find((entry) => entry.slot === slot);
  if (!stats) { stats = emptyStats(slot); next.stats.push(stats); next.stats.sort((a, b) => a.slot - b.slot); }
  for (const key of ["triggers", "assists", "damage", "shielding", "mitigated", "formationTicks", "ultimateChains"]) {
    if (!Object.hasOwn(changes, key)) continue;
    assertFinite(changes[key], `changes.${key}`); stats[key] += changes[key];
    if (["triggers", "assists", "formationTicks", "ultimateChains"].includes(key)) assertInteger(stats[key], 0, `stats.${key}`);
  }
  return validateSquadSynergyState(next);
}
