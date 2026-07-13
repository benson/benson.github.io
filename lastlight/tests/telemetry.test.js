import test from "node:test";
import assert from "node:assert/strict";
import { buildRunTelemetry, submitRunTelemetry } from "../telemetry.js";

function completedRun(overrides = {}) {
  return {
    map: "warehouse",
    difficulty: "story",
    duration: 240,
    time: 240,
    bossElapsed: 18.25,
    stage: "won",
    wave: 6,
    level: 12,
    kills: 321,
    gold: 98.6,
    roomId: "SECRET-ROOM",
    players: [
      { id: "private-a", name: "Benson", specialist: "zuri", damage: 1200.25, kills: 200, xpCollected: 440, damageTaken: 51.2, revives: 1, traveled: 900.12 },
      { id: "private-b", name: "Friend", specialist: "echo", damage: 800, kills: 121, xpCollected: 390.25, damageTaken: 42, revives: 0, traveled: 840 },
    ],
    ...overrides,
  };
}

const participationTotals = Object.freeze({
  effectiveHealing: 120.26,
  effectiveShielding: 98.44,
  shieldDamagePrevented: 51.25,
  mitigationPrevented: 32.04,
  damageAssists: 7,
  controlAssists: 3,
  revives: 2,
  reviveSeconds: 5.26,
  objectivePresenceSeconds: 44.44,
  objectiveMovement: 812.28,
  objectiveCompletions: 4,
  eliteParticipations: 9,
  apexParticipations: 2,
});

test("completed-run telemetry contains aggregate balancing data and no player identity", () => {
  const payload = buildRunTelemetry(completedRun(), "2026.07.10.1+dev");
  assert.deepEqual(payload, {
    schemaVersion: 1,
    build: "2026.07.10.1dev",
    map: "warehouse",
    difficulty: "story",
    outcome: "won",
    specialists: ["echo", "zuri"],
    playerCount: 2,
    plannedDurationSeconds: 240,
    elapsedSeconds: 258.3,
    waveReached: 7,
    levelReached: 12,
    totalKills: 321,
    goldEarned: 99,
    xpCollected: 830.3,
    damageDealt: 2000.3,
    damageTaken: 93.2,
    revives: 1,
    distanceTraveled: 1740.1,
  });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /Benson|Friend|private-|SECRET-ROOM/);
});

test("synergy telemetry v2 contains only allowlisted ids and bounded aggregate totals", () => {
  const payload = buildRunTelemetry(completedRun({
    synergyTelemetry: {
      ids: ["ultimate-resonance", "breach-window", "moving-screen"],
      totals: {
        triggers: 9,
        damage: 321.26,
        shielding: 84.44,
        mitigated: 26.05,
        formationSeconds: 73.27,
        ultimateChains: 2,
      },
    },
  }), "build-8");
  assert.equal(payload.schemaVersion, 2);
  assert.deepEqual(payload.synergyIds, ["breach-window", "moving-screen", "ultimate-resonance"]);
  assert.deepEqual(payload.synergyTotals, {
    triggers: 9,
    damage: 321.3,
    shielding: 84.4,
    mitigated: 26.1,
    formationSeconds: 73.3,
    ultimateChains: 2,
  });
  assert.doesNotMatch(JSON.stringify(payload), /Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId/i);
});

test("live game telemetry reads the engine aggregate method without exposing per-slot stats", () => {
  const run = completedRun();
  run.synergyTelemetry = () => ({
    ids: ["moving-screen"],
    totals: { triggers: 1, damage: 0, shielding: 0, mitigated: 12, formationSeconds: 120, ultimateChains: 0 },
  });
  const payload = buildRunTelemetry(run, "build-9");
  assert.equal(payload.schemaVersion, 2);
  assert.deepEqual(payload.synergyIds, ["moving-screen"]);
  assert.equal(payload.synergyTotals.formationSeconds, 120);
  assert.equal(Object.hasOwn(payload, "stats"), false);
});

test("participation telemetry v3 is exact, aggregate-only, and retains synergy totals", () => {
  const run = completedRun({
    synergyTelemetry: () => ({
      ids: ["moving-screen"],
      totals: { triggers: 1, damage: 0, shielding: 0, mitigated: 12, formationSeconds: 120, ultimateChains: 0 },
    }),
    participationTelemetry: () => ({ ...participationTotals }),
  });
  const payload = buildRunTelemetry(run, "build-10");
  assert.equal(payload.schemaVersion, 3);
  assert.deepEqual(payload.synergyIds, ["moving-screen"]);
  assert.equal(payload.synergyTotals.mitigated, 12);
  assert.deepEqual(payload.participationTotals, {
    ...participationTotals,
    effectiveHealing: 120.3,
    effectiveShielding: 98.4,
    shieldDamagePrevented: 51.3,
    mitigationPrevented: 32,
    reviveSeconds: 5.3,
    objectivePresenceSeconds: 44.4,
    objectiveMovement: 812.3,
  });
  assert.doesNotMatch(JSON.stringify(payload), /Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId|contributors|slots/i);
});

test("participation v3 supplies an empty synergy aggregate when no synergy method is present", () => {
  const payload = buildRunTelemetry(completedRun({ participationTelemetry: participationTotals }), "build-11");
  assert.equal(payload.schemaVersion, 3);
  assert.deepEqual(payload.synergyIds, []);
  assert.deepEqual(payload.synergyTotals, {
    triggers: 0, damage: 0, shielding: 0, mitigated: 0, formationSeconds: 0, ultimateChains: 0,
  });
});

test("participation telemetry fails closed on identity, non-finite, over-cap, and fractional count fields", () => {
  assert.throws(() => buildRunTelemetry(completedRun({
    participationTelemetry: { ...participationTotals, replaySlot: 1 },
  }), "build"), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(completedRun({
    participationTelemetry: { ...participationTotals, effectiveHealing: Number.NaN },
  }), "build"), /Invalid participation total: effectiveHealing/);
  assert.throws(() => buildRunTelemetry(completedRun({
    participationTelemetry: { ...participationTotals, objectiveMovement: 1_000_000_001 },
  }), "build"), /Invalid participation total: objectiveMovement/);
  assert.throws(() => buildRunTelemetry(completedRun({
    participationTelemetry: { ...participationTotals, damageAssists: 1.5 },
  }), "build"), /Invalid participation total: damageAssists/);
});

test("synergy telemetry fails closed on unknown ids, identity fields, and totals beyond exact caps", () => {
  const valid = {
    ids: ["breach-window"],
    totals: { triggers: 1, damage: 2, shielding: 0, mitigated: 0, formationSeconds: 0, ultimateChains: 0 },
  };
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ...valid, ids: ["private-combo"] },
  }), "build"), /Invalid synergy ids/);
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ...valid, contributors: ["private-a"] },
  }), "build"), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ...valid, totals: { ...valid.totals, playerName: "Benson" } },
  }), "build"), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ...valid, totals: { ...valid.totals, triggers: 1_000_001 } },
  }), "build"), /Invalid synergy total: triggers/);
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ...valid, totals: { ...valid.totals, ultimateChains: 0.5 } },
  }), "build"), /Invalid synergy total: ultimateChains/);
  assert.throws(() => buildRunTelemetry(completedRun({
    synergyTelemetry: { ids: [], totals: { ...valid.totals, damage: 1 } },
  }), "build"), /require at least one synergy id/);
});

test("telemetry can only be built for completed, recognized runs", () => {
  assert.throws(() => buildRunTelemetry(completedRun({ stage: "running" }), "build"), /completed runs/);
  assert.throws(() => buildRunTelemetry(completedRun({ map: "somewhere-private" }), "build"), /Unknown map/);
  assert.throws(() => buildRunTelemetry(completedRun({ players: [] }), "build"), /at least one specialist/);
});

test("submitRunTelemetry posts JSON without credentials and returns the payload", async () => {
  let request;
  const payload = await submitRunTelemetry(completedRun(), "build-7", {
    endpoint: "https://relay.example/telemetry",
    fetch: async (url, init) => {
      request = { url, init };
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(request.url, "https://relay.example/telemetry");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "omit");
  assert.equal(request.init.keepalive, true);
  assert.deepEqual(JSON.parse(request.init.body), payload);
});
