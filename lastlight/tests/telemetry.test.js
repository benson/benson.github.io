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
const directorTotals = Object.freeze({
  decisions: 8, peakSquadSize: 4, lane: 2, pincer: 2, split: 1, surround: 1, objective: 2,
  column: 2, flankPair: 1, wedge: 3, arc: 2, objectivePressure: 2, eliteEscorts: 1,
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

test("squad-director telemetry v4 is reconciled, bounded, and aggregate-only", () => {
  const payload = buildRunTelemetry(completedRun({
    participationTelemetry: () => ({ ...participationTotals }),
    directorTelemetry: () => ({ ...directorTotals }),
  }), "build-12");
  assert.equal(payload.schemaVersion, 4);
  assert.deepEqual(payload.directorTotals, directorTotals);
  assert.doesNotMatch(JSON.stringify(payload), /Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId|positions|slots/i);
});

test("campaign-mutation telemetry v5 is reconciled, allowlisted, and aggregate-only", () => {
  const payload = buildRunTelemetry(completedRun({
    mutationTelemetry: () => ({ packageId: "breach-cascade", encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 }),
  }), "build-14");
  assert.equal(payload.schemaVersion, 5);
  assert.equal(payload.mutationPackageId, "breach-cascade");
  assert.deepEqual(payload.mutationTotals, { encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 });
  assert.doesNotMatch(JSON.stringify(payload), /Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId|positions|slots/i);
  assert.throws(() => buildRunTelemetry(completedRun({ mutationTelemetry: { packageId: "unknown", encounters: 0, clears: 0, failures: 0, objectiveCompletions: 0, surgeWaves: 0 } }), "build"), /package id/);
  assert.throws(() => buildRunTelemetry(completedRun({ mutationTelemetry: { packageId: "breach-cascade", encounters: 2, clears: 2, failures: 1, objectiveCompletions: 0, surgeWaves: 0 } }), "build"), /do not reconcile/);
});

test("specialist-mastery telemetry v6 is bounded, aggregate-only, and requires the current run schema", () => {
  const run = completedRun({ mutationTelemetry: { packageId: "breach-cascade", encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 } });
  const mastery = { specialist: "zuri", levelBand: "3-4", challengeCompletions: 1, milestoneUnlocks: 2, selectedStart: "field-kit" };
  const payload = buildRunTelemetry(run, "build-15", mastery);
  assert.equal(payload.schemaVersion, 6);
  assert.deepEqual({
    specialist: payload.masterySpecialist, levelBand: payload.masteryLevelBand,
    challengeCompletions: payload.masteryChallengeCompletions, milestoneUnlocks: payload.masteryMilestoneUnlocks,
    selectedStart: payload.masterySelectedStart,
  }, mastery);
  assert.doesNotMatch(JSON.stringify(payload), /Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId|position|slot/i);
  assert.throws(() => buildRunTelemetry(completedRun(), "build", mastery), /current aggregate run schema/);
  assert.throws(() => buildRunTelemetry(run, "build", { ...mastery, replaySlot: 0 }), /unexpected fields/);
});

test("rare-discovery telemetry v7 is reconciled, aggregate-only, and independent of mastery", () => {
  const run = completedRun({ mutationTelemetry: { packageId: "breach-cascade", encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 } });
  const discoveries = { discoveredCount: 9, newlyRevealedCount: 2, categories: { event: 2, affix: 1, boon: 4, augment: 2 } };
  const payload = buildRunTelemetry(run, "build-16", null, discoveries);
  assert.equal(payload.schemaVersion, 7);
  assert.equal(payload.rareDiscoveryCount, 9);
  assert.equal(payload.rareDiscoveryNewCount, 2);
  assert.deepEqual(payload.rareDiscoveryCategories, discoveries.categories);
  assert.doesNotMatch(JSON.stringify(payload), /discoveryId|Benson|Friend|private-|SECRET-ROOM|replaySlot|playerName|roomId|position|slot/i);
  assert.throws(() => buildRunTelemetry(completedRun(), "build", null, discoveries), /current aggregate run schema/);
  assert.throws(() => buildRunTelemetry(run, "build", null, { ...discoveries, callsign: "Private" }), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(run, "build", null, { ...discoveries, categories: { ...discoveries.categories, event: 3 } }), /do not reconcile/);
});

test("challenge-achievement telemetry v8 is reconciled, aggregate-only, and independent of discovery ids", () => {
  const run = completedRun({ mutationTelemetry: { packageId: "breach-cascade", encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 } });
  const achievements = { completedCount: 6, newlyCompletedCount: 2, categories: { build: 2, survival: 1, teamwork: 1, operation: 1, discovery: 1, specialist: 0 } };
  const payload = buildRunTelemetry(run, "build-17", null, null, achievements);
  assert.equal(payload.schemaVersion, 8);
  assert.equal(payload.challengeAchievementCount, 6);
  assert.equal(payload.challengeAchievementNewCount, 2);
  assert.deepEqual(payload.challengeAchievementCategories, achievements.categories);
  assert.doesNotMatch(JSON.stringify(payload), /achievementId|predicate|fingerprint|callsign|roomId|replaySlot|slot/i);
  assert.throws(() => buildRunTelemetry(completedRun(), "build", null, null, achievements), /current aggregate run schema/);
  assert.throws(() => buildRunTelemetry(run, "build", null, null, { ...achievements, room: "Private" }), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(run, "build", null, null, { ...achievements, categories: { ...achievements.categories, build: 3 } }), /do not reconcile/);
});

test("seeded-operation telemetry v9 is reconciled and omits schedule identity", () => {
  const run = completedRun({ mutationTelemetry: { packageId: "breach-cascade", encounters: 5, clears: 4, failures: 1, objectiveCompletions: 3, surgeWaves: 2 } });
  const seeded = { kind: "daily", outcome: "won", completed: true, map: "warehouse", difficulty: "story", scoreBand: "gold" };
  const payload = buildRunTelemetry(run, "build-18", null, null, null, seeded);
  assert.equal(payload.schemaVersion, 9);
  assert.equal(payload.seededOperationKind, "daily");
  assert.equal(payload.seededOperationCompleted, true);
  assert.equal(payload.seededOperationScoreBand, "gold");
  assert.doesNotMatch(JSON.stringify(payload), /scheduleId|configHash|callsign|roomId|replaySlot|"seed"|position/i);
  assert.throws(() => buildRunTelemetry(run, "build", null, null, null, { ...seeded, map: "lab" }), /matching current/);
  assert.throws(() => buildRunTelemetry(run, "build", null, null, null, { ...seeded, completed: false }), /Invalid seeded/);
  assert.throws(() => buildRunTelemetry(run, "build", null, null, null, { ...seeded, scheduleId: "daily:2026-07-13" }), /unexpected fields/);
});

test("squad-director telemetry fails closed on identity, inconsistent totals, and invalid squad bands", () => {
  assert.throws(() => buildRunTelemetry(completedRun({ directorTelemetry: { ...directorTotals, roomId: "SECRET" } }), "build"), /unexpected fields/);
  assert.throws(() => buildRunTelemetry(completedRun({ directorTelemetry: { ...directorTotals, pincer: 3 } }), "build"), /do not reconcile/);
  assert.throws(() => buildRunTelemetry(completedRun({ directorTelemetry: { ...directorTotals, peakSquadSize: 1 } }), "build"), /requires a squad/);
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
