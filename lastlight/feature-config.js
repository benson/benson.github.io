export const RUNTIME_CONFIG_SCHEMA_VERSION = 10;
export const RUNTIME_CONFIG_STORAGE_KEY = "lastlight:runtime-config:v10";
export const SQUAD_SYNERGY_REGISTRY_VERSION = "lastlight.squad-synergy.v1";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FLAG_NAMES = Object.freeze([
  "deterministicReplay", "runTelemetry", "objectiveEvents",
  "migrationCheckpointReplication", "hostMigrationElection", "hostMigrationResume",
  "contextualPings",
  "upgradeRecommendations",
  "squadSynergies",
  "sharedParticipationCredit",
  "downedActivity",
  "joinInProgressNormalization",
  "squadEnemyDirector",
  "mapMechanics",
  "campaignMutations",
  "specialistMastery",
  "sharedSquadRunArchive",
]);
const MAX_RUNTIME_CONFIG_BYTES = 4_096;

export const DEFAULT_RUNTIME_CONFIG = deepFreeze({
  schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION,
  configVersion: "release-2026.07.13.15",
  gameplayVersion: "specialist-mastery-v1",
  registryVersion: SQUAD_SYNERGY_REGISTRY_VERSION,
  flags: {
    deterministicReplay: true,
    runTelemetry: true,
    objectiveEvents: true,
    migrationCheckpointReplication: true,
    hostMigrationElection: true,
    hostMigrationResume: true,
    contextualPings: true,
    upgradeRecommendations: true,
    squadSynergies: true,
    sharedParticipationCredit: true,
    downedActivity: true,
    joinInProgressNormalization: true,
    squadEnemyDirector: true,
    mapMechanics: true,
    campaignMutations: true,
    specialistMastery: true,
    sharedSquadRunArchive: true,
  },
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

/** Validate an operator or cached runtime config without accepting arbitrary keys. */
export function validateRuntimeConfig(value) {
  exactKeys(value, ["schemaVersion", "configVersion", "gameplayVersion", "registryVersion", "flags"], "runtime config");
  if (value.schemaVersion !== RUNTIME_CONFIG_SCHEMA_VERSION) throw new TypeError("Unsupported runtime config schema");
  exactKeys(value.flags, FLAG_NAMES, "runtime config flags");
  for (const name of FLAG_NAMES) {
    if (typeof value.flags[name] !== "boolean") throw new TypeError(`runtime config flag ${name} must be boolean`);
  }
  const config = {
    schemaVersion: value.schemaVersion,
    configVersion: identifier(value.configVersion, "configVersion"),
    gameplayVersion: identifier(value.gameplayVersion, "gameplayVersion"),
    registryVersion: identifier(value.registryVersion, "registryVersion"),
    flags: Object.fromEntries(FLAG_NAMES.map((name) => [name, value.flags[name]])),
  };
  return deepFreeze(config);
}

/** The only runtime data allowed to affect deterministic simulation. */
export function gameplayFeatureContract(config = DEFAULT_RUNTIME_CONFIG) {
  const validated = validateRuntimeConfig(config);
  return deepFreeze({
    gameplayVersion: validated.gameplayVersion,
    objectiveEvents: validated.flags.objectiveEvents,
    squadSynergies: validated.flags.squadSynergies,
    sharedParticipationCredit: validated.flags.sharedParticipationCredit,
    downedActivity: validated.flags.downedActivity,
    joinInProgressNormalization: validated.flags.joinInProgressNormalization,
    squadEnemyDirector: validated.flags.squadEnemyDirector,
    mapMechanics: validated.flags.mapMechanics,
    campaignMutations: validated.flags.campaignMutations,
    specialistMastery: validated.flags.specialistMastery,
    registryVersion: validated.registryVersion,
  });
}

export function validateGameplayFeatureContract(value = gameplayFeatureContract()) {
  exactKeys(value, ["gameplayVersion", "objectiveEvents", "squadSynergies", "sharedParticipationCredit", "downedActivity", "joinInProgressNormalization", "squadEnemyDirector", "mapMechanics", "campaignMutations", "specialistMastery", "registryVersion"], "gameplay feature contract");
  if (typeof value.objectiveEvents !== "boolean") throw new TypeError("objectiveEvents must be boolean");
  if (typeof value.squadSynergies !== "boolean") throw new TypeError("squadSynergies must be boolean");
  if (typeof value.sharedParticipationCredit !== "boolean") throw new TypeError("sharedParticipationCredit must be boolean");
  if (typeof value.downedActivity !== "boolean") throw new TypeError("downedActivity must be boolean");
  if (typeof value.joinInProgressNormalization !== "boolean") throw new TypeError("joinInProgressNormalization must be boolean");
  if (typeof value.squadEnemyDirector !== "boolean") throw new TypeError("squadEnemyDirector must be boolean");
  if (typeof value.mapMechanics !== "boolean") throw new TypeError("mapMechanics must be boolean");
  if (typeof value.campaignMutations !== "boolean") throw new TypeError("campaignMutations must be boolean");
  if (typeof value.specialistMastery !== "boolean") throw new TypeError("specialistMastery must be boolean");
  return deepFreeze({
    gameplayVersion: identifier(value.gameplayVersion, "gameplayVersion"), objectiveEvents: value.objectiveEvents,
    squadSynergies: value.squadSynergies, sharedParticipationCredit: value.sharedParticipationCredit, downedActivity: value.downedActivity,
    joinInProgressNormalization: value.joinInProgressNormalization, squadEnemyDirector: value.squadEnemyDirector, mapMechanics: value.mapMechanics, campaignMutations: value.campaignMutations, specialistMastery: value.specialistMastery,
    registryVersion: identifier(value.registryVersion, "registryVersion"),
  });
}

export function runtimeConfigEndpoint(relayBase, pageUrl = globalThis.location?.href || "https://bensonperry.com/lastlight/") {
  const relay = new URL(relayBase, pageUrl);
  relay.protocol = relay.protocol === "wss:" ? "https:" : relay.protocol === "ws:" ? "http:" : relay.protocol;
  relay.pathname = "/config";
  relay.search = "";
  relay.hash = "";
  return relay.toString();
}

function readLastKnownGood(storage) {
  try {
    if (!storage?.getItem) return null;
    const saved = JSON.parse(storage.getItem(RUNTIME_CONFIG_STORAGE_KEY) || "null");
    exactKeys(saved, ["savedAt", "config"], "cached runtime config");
    if (typeof saved.savedAt !== "string" || !Number.isFinite(Date.parse(saved.savedAt))) throw new TypeError("cached timestamp is invalid");
    return validateRuntimeConfig(saved.config);
  } catch {
    return null;
  }
}

function saveLastKnownGood(storage, config) {
  try {
    storage?.setItem?.(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), config }));
  } catch {
    // Storage is optional and never blocks startup.
  }
}

/** Fetch once at startup. Failure is bounded and falls back to validated local state. */
export async function loadRuntimeConfig({
  endpoint,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  timeoutMs = 1_500,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("A runtime config endpoint is required");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(50, Math.min(5_000, Number(timeoutMs) || 1_500)));
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET", cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Runtime config request failed (${response.status})`);
    if (Number(response.headers.get("Content-Length") || 0) > MAX_RUNTIME_CONFIG_BYTES) throw new TypeError("Runtime config response is too large");
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RUNTIME_CONFIG_BYTES) throw new TypeError("Runtime config response is too large");
    const payload = JSON.parse(raw);
    exactKeys(payload, ["config", "source"], "runtime config response");
    if (payload.source !== "operator" && payload.source !== "built-in" && payload.source !== "built-in-invalid") {
      throw new TypeError("runtime config source is invalid");
    }
    const config = validateRuntimeConfig(payload.config);
    saveLastKnownGood(storage, config);
    return { config, source: payload.source, status: "fresh" };
  } catch (error) {
    const cached = readLastKnownGood(storage);
    return {
      config: cached || DEFAULT_RUNTIME_CONFIG,
      source: cached ? "last-known-good" : "built-in",
      status: error?.name === "AbortError" ? "timeout" : "fallback",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function serializeRuntimeConfig(config) {
  return JSON.stringify(clone(validateRuntimeConfig(config)));
}
