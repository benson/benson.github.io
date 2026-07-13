import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RUNTIME_CONFIG, RUNTIME_CONFIG_STORAGE_KEY, gameplayFeatureContract,
  loadRuntimeConfig, runtimeConfigEndpoint, serializeRuntimeConfig, validateRuntimeConfig,
} from "../feature-config.js";

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), entries };
}

const operatorConfig = {
  schemaVersion: 13, configVersion: "rollback-47", gameplayVersion: "rare-discoveries-off-v1", registryVersion: "lastlight.squad-synergy.v1",
  flags: {
    deterministicReplay: false, runTelemetry: false, objectiveEvents: false,
    migrationCheckpointReplication: false, hostMigrationElection: false, hostMigrationResume: false,
    contextualPings: false, upgradeRecommendations: false,
    squadSynergies: false,
    sharedParticipationCredit: false,
    downedActivity: false,
    joinInProgressNormalization: false,
    squadEnemyDirector: false,
    mapMechanics: false,
    campaignMutations: false, specialistMastery: false, rareDiscoveries: false, challengeAchievements: false, seededOperations: false,
    sharedSquadRunArchive: false,
  },
};

test("runtime config is a strict allowlisted immutable contract", () => {
  assert.deepEqual(validateRuntimeConfig(operatorConfig), operatorConfig);
  assert.throws(() => validateRuntimeConfig({ ...operatorConfig, endpoint: "https://example.com" }), /unsupported/);
  assert.throws(() => validateRuntimeConfig({ ...operatorConfig, flags: { ...operatorConfig.flags, surprise: true } }), /unsupported/);
  assert.throws(() => validateRuntimeConfig({ ...operatorConfig, flags: { ...operatorConfig.flags, runTelemetry: "no" } }), /boolean/);
  assert.equal(Object.isFrozen(DEFAULT_RUNTIME_CONFIG.flags), true);
  assert.deepEqual(gameplayFeatureContract(operatorConfig), {
    gameplayVersion: "rare-discoveries-off-v1", objectiveEvents: false, squadSynergies: false,
    sharedParticipationCredit: false, downedActivity: false, joinInProgressNormalization: false, squadEnemyDirector: false, mapMechanics: false,
    campaignMutations: false, specialistMastery: false, rareDiscoveries: false,
    registryVersion: "lastlight.squad-synergy.v1",
  });
  assert.doesNotMatch(serializeRuntimeConfig(operatorConfig), /name|room|token/i);
});

test("relay URLs map to the origin-only config endpoint", () => {
  assert.equal(runtimeConfigEndpoint("wss://relay.example/room/"), "https://relay.example/config");
  assert.equal(runtimeConfigEndpoint("ws://localhost:8787/room/", "http://localhost:4173/lastlight/"), "http://localhost:8787/config");
});

test("fresh server config is validated and retained without identity", async () => {
  const storage = memoryStorage();
  const result = await loadRuntimeConfig({
    endpoint: "https://relay.example/config", storage,
    fetchImpl: async (_url, init) => {
      assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "omit");
      return new Response(JSON.stringify({ config: operatorConfig, source: "operator" }), { status: 200 });
    },
  });
  assert.equal(result.source, "operator");
  assert.deepEqual(result.config, operatorConfig);
  assert.doesNotMatch(storage.entries.get(RUNTIME_CONFIG_STORAGE_KEY), /callsign|room|token/i);
});

test("network failure uses a validated last-known-good config then built-in defaults", async () => {
  const stored = JSON.stringify({ savedAt: "2026-07-11T12:00:00.000Z", config: operatorConfig });
  const failed = () => Promise.reject(new Error("offline"));
  const cached = await loadRuntimeConfig({ endpoint: "https://relay.example/config", storage: memoryStorage({ [RUNTIME_CONFIG_STORAGE_KEY]: stored }), fetchImpl: failed });
  assert.equal(cached.source, "last-known-good");
  assert.deepEqual(cached.config, operatorConfig);

  const fallback = await loadRuntimeConfig({ endpoint: "https://relay.example/config", storage: memoryStorage({ [RUNTIME_CONFIG_STORAGE_KEY]: "{}" }), fetchImpl: failed });
  assert.equal(fallback.source, "built-in");
  assert.deepEqual(fallback.config, DEFAULT_RUNTIME_CONFIG);
});

test("oversized config responses fail closed", async () => {
  const result = await loadRuntimeConfig({
    endpoint: "https://relay.example/config", storage: memoryStorage(),
    fetchImpl: async () => new Response(`{"padding":"${"x".repeat(4_200)}"}`, { status: 200 }),
  });
  assert.equal(result.source, "built-in");
  assert.equal(result.status, "fallback");
});

test("startup timeout is bounded", async () => {
  const started = Date.now();
  const result = await loadRuntimeConfig({
    endpoint: "https://relay.example/config", storage: memoryStorage(), timeoutMs: 50,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
  });
  assert.equal(result.status, "timeout");
  assert.ok(Date.now() - started < 500);
});
