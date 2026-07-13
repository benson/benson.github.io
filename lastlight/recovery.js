export const RECOVERY_SCHEMA = "lastlight.run-recovery.v10";
export const RECOVERY_STORAGE_KEY = "lastlight:run-recovery:v10";
export const RECOVERY_SIMULATION_VERSION = 12;
export const MAX_RECOVERY_BYTES = 1_500_000;
export const RECOVERY_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

const FORBIDDEN_KEYS = /^(callsign|room|roomCode|resume|resumeToken|contact|clientId|actualToSlot)$/i;

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} has unexpected fields`);
}

function assertPrivacy(value, path = "recovery") {
  if (Array.isArray(value)) { value.forEach((entry, index) => assertPrivacy(entry, `${path}.${index}`)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new TypeError(`${path}.${key} is not permitted in recovery state`);
    assertPrivacy(entry, `${path}.${key}`);
  }
}

function finiteInteger(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${path} is invalid`);
  return value;
}

export function runtimeRecoveryIdentity(config) {
  return Object.freeze({
    configVersion: String(config?.configVersion || ""),
    gameplayVersion: String(config?.gameplayVersion || ""),
    objectiveEvents: Boolean(config?.flags?.objectiveEvents ?? config?.objectiveEvents),
    squadSynergies: Boolean(config?.flags?.squadSynergies ?? config?.squadSynergies),
    sharedParticipationCredit: Boolean(config?.flags?.sharedParticipationCredit ?? config?.sharedParticipationCredit),
    downedActivity: Boolean(config?.flags?.downedActivity ?? config?.downedActivity),
    joinInProgressNormalization: Boolean(config?.flags?.joinInProgressNormalization ?? config?.joinInProgressNormalization),
    squadEnemyDirector: Boolean(config?.flags?.squadEnemyDirector ?? config?.squadEnemyDirector),
    mapMechanics: Boolean(config?.flags?.mapMechanics ?? config?.mapMechanics),
    campaignMutations: Boolean(config?.flags?.campaignMutations ?? config?.campaignMutations),
    specialistMastery: Boolean(config?.flags?.specialistMastery ?? config?.specialistMastery),
    rareDiscoveries: Boolean(config?.flags?.rareDiscoveries ?? config?.rareDiscoveries),
    registryVersion: String(config?.registryVersion || ""),
  });
}

export function createRunRecovery({ build, runtime, source, localSlot, simulation, replay = null, savedAt = Date.now() }) {
  const checkpoint = {
    schema: RECOVERY_SCHEMA,
    build,
    savedAt,
    expiresAt: savedAt + RECOVERY_MAX_AGE_MS,
    source,
    localSlot,
    runtime: { ...runtime },
    simulation,
    replay,
  };
  return validateRunRecovery(checkpoint, { build, runtime, now: savedAt });
}

export function validateRunRecovery(value, { build, runtime, now = Date.now() } = {}) {
  exactKeys(value, ["schema", "build", "savedAt", "expiresAt", "source", "localSlot", "runtime", "simulation", "replay"], "recovery");
  if (value.schema !== RECOVERY_SCHEMA) throw new TypeError("Unsupported recovery schema");
  if (typeof value.build !== "string" || value.build !== build) throw new TypeError("Recovery build mismatch");
  finiteInteger(value.savedAt, 0, Number.MAX_SAFE_INTEGER, "savedAt");
  finiteInteger(value.expiresAt, value.savedAt, Number.MAX_SAFE_INTEGER, "expiresAt");
  if (value.expiresAt - value.savedAt !== RECOVERY_MAX_AGE_MS || value.savedAt > now + 5 * 60_000 || value.expiresAt <= now) throw new TypeError("Recovery checkpoint is stale");
  if (value.source !== "solo" && value.source !== "host") throw new TypeError("Recovery source is invalid");
  finiteInteger(value.localSlot, 0, 3, "localSlot");
  exactKeys(value.runtime, ["configVersion", "gameplayVersion", "objectiveEvents", "squadSynergies", "sharedParticipationCredit", "downedActivity", "joinInProgressNormalization", "squadEnemyDirector", "mapMechanics", "campaignMutations", "specialistMastery", "rareDiscoveries", "registryVersion"], "runtime");
  if (typeof value.runtime.objectiveEvents !== "boolean" || typeof value.runtime.squadSynergies !== "boolean"
    || typeof value.runtime.sharedParticipationCredit !== "boolean" || typeof value.runtime.downedActivity !== "boolean"
    || typeof value.runtime.joinInProgressNormalization !== "boolean" || typeof value.runtime.squadEnemyDirector !== "boolean"
    || typeof value.runtime.mapMechanics !== "boolean" || typeof value.runtime.campaignMutations !== "boolean"
    || typeof value.runtime.specialistMastery !== "boolean" || typeof value.runtime.rareDiscoveries !== "boolean") throw new TypeError("Recovery runtime flags are invalid");
  if (!runtime || value.runtime.configVersion !== runtime.configVersion || value.runtime.gameplayVersion !== runtime.gameplayVersion
    || value.runtime.objectiveEvents !== runtime.objectiveEvents || value.runtime.squadSynergies !== runtime.squadSynergies
    || value.runtime.sharedParticipationCredit !== runtime.sharedParticipationCredit
    || value.runtime.downedActivity !== runtime.downedActivity
    || value.runtime.joinInProgressNormalization !== runtime.joinInProgressNormalization
    || value.runtime.squadEnemyDirector !== runtime.squadEnemyDirector
    || value.runtime.mapMechanics !== runtime.mapMechanics
    || value.runtime.campaignMutations !== runtime.campaignMutations
    || value.runtime.specialistMastery !== runtime.specialistMastery
    || value.runtime.rareDiscoveries !== runtime.rareDiscoveries
    || value.runtime.registryVersion !== runtime.registryVersion) {
    throw new TypeError("Recovery runtime configuration mismatch");
  }
  if (!value.simulation || value.simulation.version !== RECOVERY_SIMULATION_VERSION || !Array.isArray(value.simulation.players) || !value.simulation.players.some((player) => player.replaySlot === value.localSlot)) {
    throw new TypeError("Recovery simulation is invalid");
  }
  if (value.replay !== null && (typeof value.replay !== "object" || value.replay.currentTick !== value.simulation.scalars?.tick)) throw new TypeError("Recovery replay identity is invalid");
  assertPrivacy(value);
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > MAX_RECOVERY_BYTES) throw new TypeError("Recovery checkpoint exceeds size bounds");
  return value;
}

export function saveRunRecovery(storage, value) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_RECOVERY_BYTES) throw new TypeError("Recovery checkpoint exceeds size bounds");
  storage.setItem(RECOVERY_STORAGE_KEY, json);
  return value;
}

export function loadRunRecovery(storage, expected) {
  const raw = storage.getItem(RECOVERY_STORAGE_KEY);
  if (!raw) return null;
  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_RECOVERY_BYTES) throw new TypeError("Recovery checkpoint exceeds size bounds");
    return validateRunRecovery(JSON.parse(raw), expected);
  } catch {
    try { storage.removeItem(RECOVERY_STORAGE_KEY); } catch { /* Storage is optional. */ }
    return null;
  }
}

export function clearRunRecovery(storage) {
  try { storage.removeItem(RECOVERY_STORAGE_KEY); } catch { /* Storage is optional. */ }
}
