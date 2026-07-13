import { fnv1a64 } from "./replay.js?v=20260713.17";

export const SPECIALIST_MASTERY_SCHEMA = "lastlight.specialist-mastery.v1";
export const SPECIALIST_MASTERY_STORAGE_VERSION = 1;
export const SPECIALIST_MASTERY_STORAGE_KEY = "lastlight:mastery:v1";
export const SPECIALIST_MASTERY_REGISTRY_VERSION = "lastlight.specialist-mastery.registry.v1";
export const SPECIALIST_MASTERY_IDS = Object.freeze(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
export const SPECIALIST_MASTERY_LEVELS = Object.freeze([0, 120, 300, 600, 1_000]);
export const MAX_MASTERY_POINTS = 10_000;
export const MAX_MASTERY_RUN_CLAIMS = 64;

const track = (name, summary, challenge, passive) => ({
  name, summary,
  challenge: { ...challenge, rewardPoints: 25 },
  starts: {
    baseline: { id: "baseline", name: "Standard issue", unlockLevel: 1, passive: null, passiveRank: 0, vitalityMultiplier: 1, summary: "The authored baseline specialist kit." },
    fieldKit: { id: "field-kit", name: "Field kit", unlockLevel: 3, passive, passiveRank: 1, vitalityMultiplier: .9, summary: "Begin with the signature-paired passive at rank one, trading ten percent maximum vitality." },
  },
  unlocks: [
    { level: 2, kind: "cosmetic", id: `${challenge.id}-signal` },
    { level: 3, kind: "start", id: "field-kit" },
    { level: 4, kind: "lore", id: `${challenge.id}-record` },
    { level: 5, kind: "badge", id: `${challenge.id}-master` },
  ],
});

export const SPECIALIST_MASTERY = deepFreeze({
  schema: SPECIALIST_MASTERY_REGISTRY_VERSION,
  levels: SPECIALIST_MASTERY_LEVELS,
  tracks: {
    zuri: track("Overclock", "Sustain pressure without surrendering the firing lane.", { id: "zuri-overclock", field: "damage", minimum: 75_000 }, "haste"),
    echo: track("Resonance", "Extend control windows that the squad can convert.", { id: "echo-resonance", field: "participation.controlAssists", minimum: 10 }, "projectiles"),
    sola: track("Aegis", "Turn projected shielding into effective protection.", { id: "sola-aegis", field: "participation.effectiveShielding", minimum: 500 }, "armor"),
    bront: track("Breakwater", "Stand in the pressure and prevent real damage.", { id: "bront-breakwater", field: "participation.mitigationPrevented", minimum: 300 }, "duration"),
    fang: track("Predation", "Finish a dense operation at hunting tempo.", { id: "fang-predation", field: "kills", minimum: 250 }, "maxHealth"),
    gale: track("Current", "Move objectives while keeping the line fluid.", { id: "gale-current", field: "participation.objectiveMovement", minimum: 1_000 }, "crit"),
    rift: track("Vector", "Convert continuous movement into battlefield reach.", { id: "rift-vector", field: "distance", minimum: 25_000 }, "move"),
    nova: track("Guidance", "Create effective recovery under live pressure.", { id: "nova-guidance", field: "participation.effectiveHealing", minimum: 400 }, "xp"),
    vesper: track("Collection", "Control the pickup field and secure operation data.", { id: "vesper-collection", field: "xpCollected", minimum: 3_000 }, "pickup"),
  },
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

function integer(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }

function validateStart(value, path, errors) {
  if (!exact(value, ["id", "name", "unlockLevel", "passive", "passiveRank", "vitalityMultiplier", "summary"])) { errors.push(`${path}: fields mismatch`); return; }
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(value.id) || typeof value.name !== "string" || !value.name.trim() || typeof value.summary !== "string" || !value.summary.trim()) errors.push(`${path}: presentation invalid`);
  if (!integer(value.unlockLevel, 1, 5) || !integer(value.passiveRank, 0, 1) || ![1, .9].includes(value.vitalityMultiplier)) errors.push(`${path}: tuning invalid`);
  if ((value.passive === null) !== (value.passiveRank === 0) || value.passive !== null && !/^[a-z][A-Za-z0-9]{0,23}$/.test(value.passive)) errors.push(`${path}: passive invalid`);
}

export function validateSpecialistMasteryRegistry(value) {
  const errors = [];
  if (!exact(value, ["schema", "levels", "tracks"]) || value.schema !== SPECIALIST_MASTERY_REGISTRY_VERSION) return ["mastery registry: invalid root"];
  if (!Array.isArray(value.levels) || value.levels.length !== 5 || value.levels.some((threshold, index) => !integer(threshold, 0, MAX_MASTERY_POINTS) || index && threshold <= value.levels[index - 1])) errors.push("levels: invalid");
  if (!exact(value.tracks, SPECIALIST_MASTERY_IDS)) errors.push("tracks: coverage mismatch");
  const challengeIds = new Set();
  for (const id of SPECIALIST_MASTERY_IDS) {
    const entry = value.tracks?.[id], path = `tracks.${id}`;
    if (!exact(entry, ["name", "summary", "challenge", "starts", "unlocks"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (typeof entry.name !== "string" || !entry.name.trim() || typeof entry.summary !== "string" || !entry.summary.trim()) errors.push(`${path}: presentation invalid`);
    if (!exact(entry.challenge, ["id", "field", "minimum", "rewardPoints"]) || !/^[a-z][a-z0-9-]{0,47}$/.test(entry.challenge?.id || "") || !/^(?:damage|kills|distance|xpCollected|participation\.[A-Za-z]+)$/.test(entry.challenge?.field || "") || typeof entry.challenge?.minimum !== "number" || !Number.isFinite(entry.challenge.minimum) || entry.challenge.minimum <= 0 || entry.challenge.rewardPoints !== 25) errors.push(`${path}.challenge: invalid`);
    if (challengeIds.has(entry.challenge?.id)) errors.push(`${path}.challenge: duplicate`); challengeIds.add(entry.challenge?.id);
    if (!exact(entry.starts, ["baseline", "fieldKit"])) errors.push(`${path}.starts: coverage mismatch`);
    else { validateStart(entry.starts.baseline, `${path}.starts.baseline`, errors); validateStart(entry.starts.fieldKit, `${path}.starts.fieldKit`, errors); }
    if (!Array.isArray(entry.unlocks) || entry.unlocks.length !== 4 || entry.unlocks.some((unlock, index) => !exact(unlock, ["level", "kind", "id"]) || unlock.level !== index + 2 || !["cosmetic", "start", "lore", "badge"].includes(unlock.kind) || typeof unlock.id !== "string")) errors.push(`${path}.unlocks: invalid`);
  }
  return errors;
}

export function masteryLevel(points) {
  if (!integer(points, 0, MAX_MASTERY_POINTS)) throw new TypeError("Invalid mastery points");
  let level = 1;
  for (let index = 1; index < SPECIALIST_MASTERY_LEVELS.length; index++) if (points >= SPECIALIST_MASTERY_LEVELS[index]) level = index + 1;
  return level;
}

function emptyTrack() { return { points: 0, level: 1, completedChallenges: [], selectedStart: "baseline" }; }

export function emptySpecialistMasteryState() {
  return { schema: SPECIALIST_MASTERY_SCHEMA, storageVersion: SPECIALIST_MASTERY_STORAGE_VERSION, registryVersion: SPECIALIST_MASTERY_REGISTRY_VERSION, tracks: Object.fromEntries(SPECIALIST_MASTERY_IDS.map((id) => [id, emptyTrack()])), appliedClaims: [] };
}

export function validateSpecialistMasteryState(value) {
  if (!exact(value, ["schema", "storageVersion", "registryVersion", "tracks", "appliedClaims"]) || value.schema !== SPECIALIST_MASTERY_SCHEMA || value.storageVersion !== SPECIALIST_MASTERY_STORAGE_VERSION || value.registryVersion !== SPECIALIST_MASTERY_REGISTRY_VERSION || !exact(value.tracks, SPECIALIST_MASTERY_IDS)) return false;
  for (const id of SPECIALIST_MASTERY_IDS) {
    const state = value.tracks[id], definition = SPECIALIST_MASTERY.tracks[id];
    if (!exact(state, ["points", "level", "completedChallenges", "selectedStart"]) || !integer(state.points, 0, MAX_MASTERY_POINTS) || state.level !== masteryLevel(state.points)) return false;
    if (!Array.isArray(state.completedChallenges) || state.completedChallenges.length > 1 || state.completedChallenges.some((challenge) => challenge !== definition.challenge.id) || new Set(state.completedChallenges).size !== state.completedChallenges.length) return false;
    if (!["baseline", "field-kit"].includes(state.selectedStart) || state.selectedStart === "field-kit" && state.level < definition.starts.fieldKit.unlockLevel) return false;
  }
  return Array.isArray(value.appliedClaims) && value.appliedClaims.length <= MAX_MASTERY_RUN_CLAIMS && value.appliedClaims.every((claim) => /^[0-9a-f]{16}$/.test(claim)) && new Set(value.appliedClaims).size === value.appliedClaims.length;
}

export function normalizeSpecialistMasteryState(value) {
  const normalized = emptySpecialistMasteryState();
  for (const id of SPECIALIST_MASTERY_IDS) {
    const source = value?.tracks?.[id], points = integer(source?.points, 0, MAX_MASTERY_POINTS) ? source.points : 0, definition = SPECIALIST_MASTERY.tracks[id];
    normalized.tracks[id] = {
      points, level: masteryLevel(points),
      completedChallenges: Array.isArray(source?.completedChallenges) && source.completedChallenges.includes(definition.challenge.id) ? [definition.challenge.id] : [],
      selectedStart: source?.selectedStart === "field-kit" && masteryLevel(points) >= 3 ? "field-kit" : "baseline",
    };
  }
  normalized.appliedClaims = [...new Set((Array.isArray(value?.appliedClaims) ? value.appliedClaims : []).filter((claim) => /^[0-9a-f]{16}$/.test(claim)))].slice(-MAX_MASTERY_RUN_CLAIMS);
  return normalized;
}

export function loadSpecialistMasteryState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(SPECIALIST_MASTERY_STORAGE_KEY) || "null");
    return validateSpecialistMasteryState(parsed) ? deepFreeze(parsed) : deepFreeze(normalizeSpecialistMasteryState(parsed));
  } catch { return deepFreeze(emptySpecialistMasteryState()); }
}

export function saveSpecialistMasteryState(storage, value) {
  const normalized = normalizeSpecialistMasteryState(value);
  storage?.setItem?.(SPECIALIST_MASTERY_STORAGE_KEY, JSON.stringify(normalized));
  return deepFreeze(normalized);
}

function fieldValue(player, field) { return field.split(".").reduce((value, key) => value?.[key], player); }

function validateMasteryRunEvidence(report) {
  if (!report || report.schema !== "lastlight.squad-run-report.v4" || !/^[0-9a-f]{16}$/.test(report.fingerprint || "") || !["won", "lost"].includes(report.outcome) || !["story", "hard", "extreme"].includes(report.difficulty) || !Array.isArray(report.players)) throw new TypeError("Invalid terminal mastery evidence");
  if (!report.mutations || !integer(report.mutations.clears, 0, 100) || !integer(report.mutations.encounters, 0, 100) || !integer(report.mutations.failures, 0, 100) || report.mutations.clears + report.mutations.failures !== report.mutations.encounters) throw new TypeError("Invalid terminal mastery mutation evidence");
  for (const player of report.players) if (!integer(player.slot, 0, 3) || !SPECIALIST_MASTERY_IDS.includes(player.specialist) || typeof player.campaignEligible !== "boolean" || ["damage", "kills", "xpCollected", "distance"].some((field) => typeof player[field] !== "number" || !Number.isFinite(player[field]) || player[field] < 0) || !player.participation || typeof player.participation !== "object") throw new TypeError("Invalid terminal mastery player evidence");
}

export function awardSpecialistMastery(state, report, slot) {
  const current = normalizeSpecialistMasteryState(state);
  validateMasteryRunEvidence(report);
  if (!integer(slot, 0, 3)) throw new TypeError("Invalid mastery replay slot");
  const player = report.players.find((candidate) => candidate.slot === slot);
  if (!player || !player.campaignEligible) return deepFreeze({ state: current, award: null });
  const claim = fnv1a64(`${report.fingerprint}:${slot}`);
  if (current.appliedClaims.includes(claim)) return deepFreeze({ state: current, award: null });
  const definition = SPECIALIST_MASTERY.tracks[player.specialist], before = current.tracks[player.specialist];
  const challengeComplete = !before.completedChallenges.includes(definition.challenge.id) && Number(fieldValue(player, definition.challenge.field) || 0) >= definition.challenge.minimum;
  const difficultyPoints = { story: 0, hard: 15, extreme: 30 }[report.difficulty];
  const earned = 40 + (report.outcome === "won" ? 20 : 0) + difficultyPoints + Math.min(15, report.mutations.clears * 3) + (challengeComplete ? definition.challenge.rewardPoints : 0);
  const points = Math.min(MAX_MASTERY_POINTS, before.points + earned), level = masteryLevel(points);
  const completedChallenges = challengeComplete ? [definition.challenge.id] : [...before.completedChallenges];
  current.tracks[player.specialist] = { ...before, points, level, completedChallenges };
  current.appliedClaims = [...current.appliedClaims, claim].slice(-MAX_MASTERY_RUN_CLAIMS);
  const unlocked = definition.unlocks.filter((unlock) => unlock.level > before.level && unlock.level <= level).map((unlock) => ({ ...unlock }));
  return deepFreeze({ state: current, award: { specialist: player.specialist, points: earned, beforeLevel: before.level, level, challenge: challengeComplete ? definition.challenge.id : null, unlocked } });
}

export function selectMasteryStart(state, specialist, startId) {
  const current = normalizeSpecialistMasteryState(state), definition = SPECIALIST_MASTERY.tracks[specialist];
  if (!definition || !["baseline", "field-kit"].includes(startId)) throw new TypeError("Invalid mastery start selection");
  const start = startId === "field-kit" ? definition.starts.fieldKit : definition.starts.baseline;
  if (current.tracks[specialist].level < start.unlockLevel) throw new RangeError("Mastery start is locked");
  current.tracks[specialist].selectedStart = startId;
  return deepFreeze(current);
}

export function masteryStartDefinition(specialist, startId = "baseline") {
  const definition = SPECIALIST_MASTERY.tracks[specialist];
  if (!definition || !["baseline", "field-kit"].includes(startId)) throw new TypeError("Invalid mastery start definition");
  return startId === "field-kit" ? definition.starts.fieldKit : definition.starts.baseline;
}

const registryErrors = validateSpecialistMasteryRegistry(SPECIALIST_MASTERY);
if (registryErrors.length) throw new Error(`Invalid specialist mastery registry:\n- ${registryErrors.join("\n- ")}`);
