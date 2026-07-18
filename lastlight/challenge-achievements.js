import { fnv1a64 } from "./replay.js?v=20260718.4";

export const CHALLENGE_ACHIEVEMENT_SCHEMA = "lastlight.challenge-achievements.v1";
export const CHALLENGE_ACHIEVEMENT_REGISTRY_VERSION = "lastlight.challenge-achievements.registry.v1";
export const CHALLENGE_ACHIEVEMENT_STORAGE_VERSION = 1;
export const CHALLENGE_ACHIEVEMENT_STORAGE_KEY = "lastlight:challenge-achievements:v1";
export const MAX_CHALLENGE_ACHIEVEMENT_CLAIMS = 64;

const entry = (id, category, scope, predicate, name, summary, reward, icon) => ({
  id, category, scope, predicate, target: 1, name, summary, reward, icon,
});
const reward = (kind, id, name) => ({ kind, id, name, gameplayPower: false });

export const CHALLENGE_ACHIEVEMENT_REGISTRY = deepFreeze({
  schema: CHALLENGE_ACHIEVEMENT_REGISTRY_VERSION,
  entries: [
    entry("build:minimalist-victory", "build", "local", "minimalist-victory", "Lean doctrine", "Win with no more than two weapons while dealing at least 25,000 damage.", reward("title", "lean-doctrine", "Lean Doctrine"), "assets/archive/long-range.webp"),
    entry("build:full-loadout", "build", "local", "full-loadout", "Packed manifest", "Finish with six weapons and six passive upgrades.", reward("badge", "packed-manifest", "Packed Manifest"), "assets/archive/card-collector.webp"),
    entry("build:evolution-triad", "build", "local", "evolution-triad", "Triple authorization", "Finish with at least three evolved weapons.", reward("badge", "triple-authorization", "Triple Authorization"), "assets/archive/elite-access-card.webp"),
    entry("build:signature-specialist", "build", "local", "signature-specialist", "Signature specialist", "Win using only the specialist signature weapon and deal at least 12,000 damage.", reward("lore", "signature-specialist", "Signature Specialist"), "assets/archive/mission-critical.webp"),
    entry("survival:clean-extraction", "survival", "local", "clean-extraction", "Clean extraction", "Win while taking no more than 10 vitality of damage.", reward("badge", "clean-extraction", "Clean Extraction"), "assets/archive/squad-shield.webp"),
    entry("survival:distance-runner", "survival", "local", "distance-runner", "Cross-country line", "Win after traveling at least 25,000 battlefield units.", reward("title", "cross-country-line", "Cross-country Line"), "assets/archive/cross-country.webp"),
    entry("teamwork:field-medic", "teamwork", "local", "field-medic", "Field medic", "Provide at least 500 effective healing and shielding in one operation.", reward("badge", "field-medic", "Field Medic"), "assets/archive/healthback.webp"),
    entry("teamwork:moving-screen", "teamwork", "local", "moving-screen", "Moving wall", "Maintain qualified Moving Screen formation for at least 600 ticks.", reward("lore", "moving-wall", "Moving Wall"), "assets/archive/with-haste.webp"),
    entry("teamwork:rescue-chain", "teamwork", "squad", "rescue-chain", "Rescue chain", "Complete at least three qualified squad revives.", reward("badge", "rescue-chain", "Rescue Chain"), "assets/archive/celebration.webp"),
    entry("teamwork:resonant-squad", "teamwork", "squad", "resonant-squad", "Resonant squad", "Trigger at least five squad synergies including two ultimate chains.", reward("cosmetic", "resonant-signal", "Resonant Signal"), "assets/archive/ultra-rapid-fire-r.webp"),
    entry("operation:clean-sweep", "operation", "squad", "clean-sweep", "Clean sweep", "Win after clearing every campaign mutation encounter in the operation.", reward("badge", "clean-sweep", "Clean Sweep"), "assets/archive/elite-bomber.webp"),
    entry("operation:breach-cascade", "operation", "squad", "breach-cascade", "Cascade breaker", "Win an Extreme operation after surviving all three elite surge waves.", reward("title", "cascade-breaker", "Cascade Breaker"), "assets/archive/spray-and-pray.webp"),
    entry("operation:objective-discipline", "operation", "squad", "objective-discipline", "Objective discipline", "Complete at least three qualified operation objectives.", reward("lore", "objective-discipline", "Objective Discipline"), "assets/archive/relay-ball.webp"),
    entry("operation:apex-cohort", "operation", "squad", "apex-cohort", "Apex cohort", "Win with at least two eligible specialists who all qualify for apex participation.", reward("badge", "apex-cohort", "Apex Cohort"), "assets/archive/larger-than-life.webp"),
    entry("discovery:signal-triad", "discovery", "squad", "signal-triad", "Signal triad", "Catalog at least three rare discoveries in one completed operation.", reward("lore", "signal-triad", "Signal Triad"), "assets/archive/treasure-runner.webp"),
    entry("discovery:mixed-intel", "discovery", "squad", "mixed-intel", "Mixed intelligence", "Catalog rare discoveries from at least three distinct categories in one operation.", reward("cosmetic", "mixed-intel-signal", "Mixed Intelligence Signal"), "assets/archive/experienced-fighter.webp"),
    entry("specialist:balanced-contribution", "specialist", "local", "balanced-contribution", "Full-spectrum operator", "Deal 20,000 damage, provide 200 effective support, and complete qualified objective work.", reward("title", "full-spectrum-operator", "Full-spectrum Operator"), "assets/archive/fired-up.webp"),
    entry("specialist:priority-hunter", "specialist", "local", "priority-hunter", "Priority hunter", "Qualify for five elite participations and one apex participation in the same operation.", reward("badge", "priority-hunter", "Priority Hunter"), "assets/archive/elite-bomber.webp"),
  ],
});

export const CHALLENGE_ACHIEVEMENT_IDS = Object.freeze(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.map(({ id }) => id));
const ID_SET = new Set(CHALLENGE_ACHIEVEMENT_IDS);
const CATEGORIES = Object.freeze(["build", "survival", "teamwork", "operation", "discovery", "specialist"]);
const PREDICATES = new Set(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.map(({ predicate }) => predicate));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exact(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }

function canonicalIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => ID_SET.has(id)))].sort((left, right) => left.localeCompare(right));
}

export function validateChallengeAchievementRegistry(value) {
  const errors = [];
  if (!exact(value, ["schema", "entries"]) || value.schema !== CHALLENGE_ACHIEVEMENT_REGISTRY_VERSION || !Array.isArray(value.entries)) return ["challenge registry: invalid root"];
  const ids = new Set(), rewards = new Set();
  for (const [index, item] of value.entries.entries()) {
    const path = `entries.${index}`;
    if (!exact(item, ["id", "category", "scope", "predicate", "target", "name", "summary", "reward", "icon"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (!/^(?:build|survival|teamwork|operation|discovery|specialist):[a-z][a-z0-9-]{0,39}$/.test(item.id) || ids.has(item.id)) errors.push(`${path}: id invalid or duplicate`);
    ids.add(item.id);
    if (!CATEGORIES.includes(item.category) || !["local", "squad"].includes(item.scope) || !PREDICATES.has(item.predicate) || item.target !== 1) errors.push(`${path}: classification invalid`);
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 64 || typeof item.summary !== "string" || !item.summary.trim() || item.summary.length > 200) errors.push(`${path}: presentation invalid`);
    if (!exact(item.reward, ["kind", "id", "name", "gameplayPower"]) || !["badge", "title", "lore", "cosmetic"].includes(item.reward?.kind) || !/^[a-z][a-z0-9-]{0,47}$/.test(item.reward?.id || "") || rewards.has(item.reward?.id) || typeof item.reward?.name !== "string" || item.reward.name.length > 64 || item.reward.gameplayPower !== false) errors.push(`${path}: reward invalid`);
    rewards.add(item.reward?.id);
    if (typeof item.icon !== "string" || !/^assets\/archive\/[a-z0-9-]+\.webp$/.test(item.icon)) errors.push(`${path}: icon invalid`);
  }
  if (value.entries.length !== 18 || CATEGORIES.some((category) => !value.entries.some((item) => item.category === category))) errors.push("entries: coverage mismatch");
  return errors;
}

export function challengeAchievementDefinition(id) {
  return CHALLENGE_ACHIEVEMENT_REGISTRY.entries.find((item) => item.id === id) || null;
}

function eligiblePlayers(report) { return report.players.filter((player) => player.campaignEligible); }
function localPlayer(report, slot) { return report.players.find((player) => player.slot === slot && player.campaignEligible) || null; }
function sum(players, read) { return players.reduce((total, player) => total + Number(read(player) || 0), 0); }
function support(player) { return Number(player.participation.effectiveHealing) + Number(player.participation.effectiveShielding); }

function predicateComplete(predicate, report, player) {
  const players = eligiblePlayers(report);
  switch (predicate) {
    case "minimalist-victory": return report.outcome === "won" && player.weapons.length <= 2 && player.damage >= 25_000;
    case "full-loadout": return player.weapons.length === 6 && player.passives.length === 6;
    case "evolution-triad": return player.weapons.filter(({ evolved }) => evolved).length >= 3;
    case "signature-specialist": return report.outcome === "won" && player.weapons.length === 1 && player.weapons[0].id === "signature" && player.damage >= 12_000;
    case "clean-extraction": return report.outcome === "won" && player.damageTaken <= 10;
    case "distance-runner": return report.outcome === "won" && player.distance >= 25_000;
    case "field-medic": return support(player) >= 500;
    case "moving-screen": return player.synergy.formationTicks >= 600;
    case "rescue-chain": return sum(players, (member) => member.participation.revives) >= 3;
    case "resonant-squad": return sum(players, (member) => member.synergy.triggers) >= 5 && sum(players, (member) => member.synergy.ultimateChains) >= 2;
    case "clean-sweep": return report.outcome === "won" && report.mutations.enabled && report.mutations.encounters >= 1 && report.mutations.clears === report.mutations.encounters;
    case "breach-cascade": return report.outcome === "won" && report.difficulty === "extreme" && report.mutations.surgeWaves === 3;
    case "objective-discipline": return sum(players, (member) => member.participation.objectiveCompletions) >= 3;
    case "apex-cohort": return report.outcome === "won" && players.length >= 2 && players.every((member) => member.participation.apexParticipations >= 1);
    case "signal-triad": return report.discoveries.length >= 3;
    case "mixed-intel": return new Set(report.discoveries.map((id) => id.split(":")[0])).size >= 3;
    case "balanced-contribution": return player.damage >= 20_000 && support(player) >= 200 && (player.participation.objectiveCompletions >= 1 || player.participation.objectiveMovement >= 250);
    case "priority-hunter": return player.participation.eliteParticipations >= 5 && player.participation.apexParticipations >= 1;
    default: return false;
  }
}

function validateTerminalEvidence(report) {
  if (!report || !["lastlight.squad-run-report.v4", "lastlight.squad-run-report.v5"].includes(report.schema) || !/^[0-9a-f]{16}$/.test(report.fingerprint || "") || !["won", "lost"].includes(report.outcome) || !["story", "hard", "extreme"].includes(report.difficulty) || !Array.isArray(report.discoveries) || !Array.isArray(report.players) || report.players.length < 1 || report.players.length > 4) throw new TypeError("Invalid terminal challenge evidence");
  if (!report.mutations || !integer(report.mutations.encounters, 0, 100) || !integer(report.mutations.clears, 0, 100) || !integer(report.mutations.failures, 0, 100) || report.mutations.clears + report.mutations.failures !== report.mutations.encounters || !integer(report.mutations.surgeWaves, 0, 3)) throw new TypeError("Invalid terminal challenge mutation evidence");
  for (const player of report.players) {
    if (!integer(player.slot, 0, 3) || typeof player.campaignEligible !== "boolean" || !Array.isArray(player.weapons) || !Array.isArray(player.passives) || !player.participation || !player.synergy) throw new TypeError("Invalid terminal challenge player evidence");
    for (const field of ["damage", "damageTaken", "distance"]) if (typeof player[field] !== "number" || !Number.isFinite(player[field]) || player[field] < 0) throw new TypeError("Invalid terminal challenge metric evidence");
  }
}

export function evaluateChallengeAchievements(report, slot = null) {
  validateTerminalEvidence(report);
  if (slot !== null && !integer(slot, 0, 3)) throw new TypeError("Invalid challenge replay slot");
  const player = slot === null ? null : localPlayer(report, slot);
  const squadEligible = eligiblePlayers(report).length > 0;
  return deepFreeze(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.filter((item) => item.scope === "squad" ? squadEligible && predicateComplete(item.predicate, report, null) : player && predicateComplete(item.predicate, report, player)).map(({ id }) => id));
}

export function emptyChallengeAchievementState() {
  return { schema: CHALLENGE_ACHIEVEMENT_SCHEMA, storageVersion: CHALLENGE_ACHIEVEMENT_STORAGE_VERSION, registryVersion: CHALLENGE_ACHIEVEMENT_REGISTRY_VERSION, completed: [], appliedClaims: [] };
}

export function normalizeChallengeAchievementState(value) {
  return {
    ...emptyChallengeAchievementState(), completed: canonicalIds(value?.completed),
    appliedClaims: [...new Set((Array.isArray(value?.appliedClaims) ? value.appliedClaims : []).filter((claim) => /^[0-9a-f]{16}$/.test(claim)))].slice(-MAX_CHALLENGE_ACHIEVEMENT_CLAIMS),
  };
}

export function validateChallengeAchievementState(value) {
  if (!exact(value, ["schema", "storageVersion", "registryVersion", "completed", "appliedClaims"]) || value.schema !== CHALLENGE_ACHIEVEMENT_SCHEMA || value.storageVersion !== CHALLENGE_ACHIEVEMENT_STORAGE_VERSION || value.registryVersion !== CHALLENGE_ACHIEVEMENT_REGISTRY_VERSION) return false;
  const normalized = normalizeChallengeAchievementState(value);
  return normalized.completed.length === value.completed.length && normalized.completed.every((id, index) => id === value.completed[index])
    && normalized.appliedClaims.length === value.appliedClaims.length && normalized.appliedClaims.every((id, index) => id === value.appliedClaims[index]);
}

export function loadChallengeAchievementState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(CHALLENGE_ACHIEVEMENT_STORAGE_KEY) || "null");
    return deepFreeze(validateChallengeAchievementState(parsed) ? parsed : normalizeChallengeAchievementState(parsed));
  } catch { return deepFreeze(emptyChallengeAchievementState()); }
}

export function saveChallengeAchievementState(storage, value) {
  const normalized = normalizeChallengeAchievementState(value);
  storage?.setItem?.(CHALLENGE_ACHIEVEMENT_STORAGE_KEY, JSON.stringify(normalized));
  return deepFreeze(normalized);
}

export function awardChallengeAchievements(state, report, slot = null) {
  const current = normalizeChallengeAchievementState(state), scope = slot === null ? "squad" : `slot-${slot}`;
  const eligible = evaluateChallengeAchievements(report, slot), claim = fnv1a64(`${report.fingerprint}:challenge-achievements:${scope}`);
  if (current.appliedClaims.includes(claim)) return deepFreeze({ state: current, award: null });
  const completed = eligible.filter((id) => !current.completed.includes(id));
  current.completed = canonicalIds([...current.completed, ...eligible]);
  current.appliedClaims = [...current.appliedClaims, claim].slice(-MAX_CHALLENGE_ACHIEVEMENT_CLAIMS);
  return deepFreeze({ state: current, award: { completed, total: current.completed.length, available: CHALLENGE_ACHIEVEMENT_IDS.length } });
}

export function challengeAchievementTelemetry(state, newlyCompleted = []) {
  const current = normalizeChallengeAchievementState(state), categories = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const id of current.completed) categories[challengeAchievementDefinition(id).category]++;
  return deepFreeze({ completedCount: current.completed.length, newlyCompletedCount: canonicalIds(newlyCompleted).length, categories });
}

const registryErrors = validateChallengeAchievementRegistry(CHALLENGE_ACHIEVEMENT_REGISTRY);
if (registryErrors.length) throw new Error(`Invalid challenge achievement registry:\n- ${registryErrors.join("\n- ")}`);
