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
