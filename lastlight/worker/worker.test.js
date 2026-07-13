import test from "node:test";
import assert from "node:assert/strict";
import worker, { Room, normalizeCode, operatorRuntimeConfig, safeProfile, sanitizeRunTelemetry } from "./worker.js";
import { createMigrationCapabilities, createMigrationCheckpoint, createMigrationReady } from "../host-migration.js";
import { createPingBroadcast, createPingRequest } from "../ping-contract.js";
import {
  createDraftRecommendationRequest, createDraftRecommendationState, createDraftRecommendationSync,
} from "../draft-recommendation-contract.js";

const migrationCompatibility = {
  build: "2026.07.13.1", balanceVersion: "2026.07.13-apex.1", balanceHash: "fnv1a32:873c43bc",
  configVersion: "release-2026.07.13.8", gameplayVersion: "downed-v1", objectiveEvents: true,
  squadSynergies: true, sharedParticipationCredit: true, downedActivity: true, registryVersion: "lastlight.squad-synergy.v1", recoveryVersion: 6,
};
const migrationCapabilities = createMigrationCapabilities(migrationCompatibility);
const migrationSocket = () => ({ sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } });

const validTelemetry = {
  schemaVersion: 1,
  build: "2026.07.10.1",
  map: "warehouse",
  difficulty: "story",
  outcome: "won",
  specialists: ["zuri", "echo"],
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
};
const validTelemetryV2 = {
  ...validTelemetry,
  schemaVersion: 2,
  synergyIds: ["ultimate-resonance", "breach-window", "moving-screen"],
  synergyTotals: {
    triggers: 9,
    damage: 321.3,
    shielding: 84.4,
    mitigated: 26.1,
    formationSeconds: 73.3,
    ultimateChains: 2,
  },
};
const validTelemetryV3 = {
  ...validTelemetryV2,
  schemaVersion: 3,
  participationTotals: {
    effectiveHealing: 120.3,
    effectiveShielding: 98.4,
    shieldDamagePrevented: 51.3,
    mitigationPrevented: 32,
    damageAssists: 7,
    controlAssists: 3,
    revives: 2,
    reviveSeconds: 5.3,
    objectivePresenceSeconds: 44.4,
    objectiveMovement: 812.3,
    objectiveCompletions: 4,
    eliteParticipations: 9,
    apexParticipations: 2,
  },
};

function telemetryRequest(payload = validTelemetry, init = {}) {
  return new Request("https://lastlight-relay.example/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://bensonperry.com", ...init.headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    ...init,
  });
}

test("room codes are normalized and bounded", () => {
  assert.equal(normalizeCode(" ab-19z! "), "AB9Z");
  assert.equal(normalizeCode("ABCDEFG"), "ABCDEF");
});

test("profiles discard markup and constrain specialist ids", () => {
  assert.deepEqual(safeProfile({ name: "<b>Nova</b>", specialist: "nova", ready: 1 }), {
    name: "bNovab", specialist: "nova", ready: true, resumeToken: "",
  });
  assert.equal(safeProfile({ specialist: "../../bad" }).specialist, "zuri");
  assert.equal(safeProfile({ resumeToken: "abc" }).resumeToken, "");
  assert.equal(safeProfile({ resumeToken: "a".repeat(24) }).resumeToken, "a".repeat(24));
});

test("rolling telemetry accepts v1, v2, and v3 as fixed aggregate schemas", () => {
  const run = sanitizeRunTelemetry(validTelemetry);
  assert.deepEqual(run.specialists, ["echo", "zuri"]);
  assert.equal(run.damageDealt, 2000.3);
  assert.equal(Object.hasOwn(run, "name"), false);
  const v2 = sanitizeRunTelemetry(validTelemetryV2);
  assert.deepEqual(v2.synergyIds, ["breach-window", "moving-screen", "ultimate-resonance"]);
  assert.deepEqual(v2.synergyTotals, validTelemetryV2.synergyTotals);
  const v3 = sanitizeRunTelemetry(validTelemetryV3);
  assert.deepEqual(v3.participationTotals, validTelemetryV3.participationTotals);
  assert.equal(Object.hasOwn(v3, "players"), false);
});

test("telemetry endpoint writes one identity-free Analytics Engine datapoint", async () => {
  const writes = [];
  const response = await worker.fetch(telemetryRequest(), {
    RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    blobs: ["run.v1", "2026.07.10.1", "warehouse", "story", "won", "squad", "echo,zuri"],
    doubles: [2, 240, 258.3, 7, 12, 321, 99, 830.3, 2000.3, 93.2, 1, 1740.1],
    indexes: ["lastlight-run-v1"],
  });
  assert.doesNotMatch(JSON.stringify(writes), /name|room|ip/i);
});

test("telemetry v2 writes a distinct aggregate-only Analytics Engine datapoint", async () => {
  const writes = [];
  const response = await worker.fetch(telemetryRequest(validTelemetryV2), {
    RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(writes, [{
    blobs: [
      "run.v2", "2026.07.10.1", "warehouse", "story", "won", "squad", "echo,zuri",
      "breach-window,moving-screen,ultimate-resonance",
    ],
    doubles: [
      2, 240, 258.3, 7, 12, 321, 99, 830.3, 2000.3, 93.2, 1, 1740.1,
      9, 321.3, 84.4, 26.1, 73.3, 2,
    ],
    indexes: ["lastlight-run-v2"],
  }]);
  assert.doesNotMatch(JSON.stringify(writes), /callsign|playerName|roomId|ipAddress|replaySlot|resumeToken/i);
});

test("telemetry v3 writes queryable core and aggregate-only participation datapoints", async () => {
  const writes = [];
  const response = await worker.fetch(telemetryRequest(validTelemetryV3), {
    RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(writes, [{
    blobs: [
      "run.v3", "2026.07.10.1", "warehouse", "story", "won", "squad", "echo,zuri",
      "breach-window,moving-screen,ultimate-resonance",
    ],
    doubles: [
      2, 240, 258.3, 7, 12, 321, 99, 830.3, 2000.3, 93.2, 1, 1740.1,
      9, 321.3, 84.4, 26.1, 73.3, 2,
    ],
    indexes: ["lastlight-run-v3"],
  }, {
    blobs: ["participation.v1", "2026.07.10.1", "warehouse", "story", "won", "squad", "echo,zuri"],
    doubles: [120.3, 98.4, 51.3, 32, 7, 3, 2, 5.3, 44.4, 812.3, 4, 9, 2],
    indexes: ["lastlight-participation-v1"],
  }]);
  assert.doesNotMatch(JSON.stringify(writes), /callsign|playerName|roomId|ipAddress|replaySlot|resumeToken|contributors|slots/i);
});

test("telemetry v3 rejects malformed participation aggregates without writing either datapoint", async () => {
  const invalidPayloads = [
    { ...validTelemetryV3, participationTotals: { ...validTelemetryV3.participationTotals, playerName: "Benson" } },
    { ...validTelemetryV3, participationTotals: { ...validTelemetryV3.participationTotals, effectiveHealing: Number.NaN } },
    { ...validTelemetryV3, participationTotals: { ...validTelemetryV3.participationTotals, objectiveMovement: 1_000_000_001 } },
    { ...validTelemetryV3, participationTotals: { ...validTelemetryV3.participationTotals, damageAssists: 1.5 } },
  ];
  for (const payload of invalidPayloads) {
    const writes = [];
    const response = await worker.fetch(telemetryRequest(payload), {
      RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
    });
    assert.equal(response.status, 400);
    assert.equal(writes.length, 0);
  }
});

test("telemetry v2 rejects unknown or duplicate ids, nested identity, and totals beyond caps", async () => {
  const invalidPayloads = [
    { ...validTelemetryV2, synergyIds: ["private-combo"] },
    { ...validTelemetryV2, synergyIds: ["breach-window", "breach-window"] },
    { ...validTelemetryV2, synergyTotals: { ...validTelemetryV2.synergyTotals, playerName: "Benson" } },
    { ...validTelemetryV2, synergyTotals: { ...validTelemetryV2.synergyTotals, damage: 1_000_000_001 } },
    { ...validTelemetryV2, synergyTotals: { ...validTelemetryV2.synergyTotals, ultimateChains: 1.5 } },
    { ...validTelemetryV2, synergyIds: [], synergyTotals: { ...validTelemetryV2.synergyTotals, triggers: 1 } },
  ];
  for (const payload of invalidPayloads) {
    const writes = [];
    const response = await worker.fetch(telemetryRequest(payload), {
      RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
    });
    assert.equal(response.status, 400);
    assert.equal(writes.length, 0);
  }
});

test("rolling telemetry schemas reject cross-version fields", () => {
  assert.throws(() => sanitizeRunTelemetry({ ...validTelemetry, synergyIds: [], synergyTotals: {} }), /Unexpected telemetry field/);
  assert.throws(() => sanitizeRunTelemetry({ ...validTelemetryV2, schemaVersion: 2, synergyTotals: undefined }), /Invalid synergyTotals/);
  assert.throws(() => sanitizeRunTelemetry({ ...validTelemetryV2, schemaVersion: 3 }), /Invalid participationTotals/);
  assert.throws(() => sanitizeRunTelemetry({ ...validTelemetryV3, schemaVersion: 4 }), /Unsupported telemetry schema/);
  assert.throws(() => sanitizeRunTelemetry({ ...validTelemetryV2, participationTotals: validTelemetryV3.participationTotals }), /Unexpected telemetry field/);
});

test("telemetry rejects identity fields instead of silently persisting them", async () => {
  const writes = [];
  const response = await worker.fetch(telemetryRequest({ ...validTelemetry, playerName: "Benson", roomId: "ABC123" }), {
    RUN_TELEMETRY: { writeDataPoint: (point) => writes.push(point) },
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unexpected telemetry field/);
  assert.equal(writes.length, 0);
});

test("telemetry endpoint enforces method, type, size, origin, and CORS", async () => {
  const env = { RUN_TELEMETRY: { writeDataPoint() { throw new Error("should not write"); } } };

  const get = await worker.fetch(new Request("https://relay.example/telemetry"), env);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("Allow"), "POST");

  const wrongType = await worker.fetch(telemetryRequest("{}", { headers: { "Content-Type": "text/plain" } }), env);
  assert.equal(wrongType.status, 415);

  const oversized = await worker.fetch(telemetryRequest(`{"padding":"${"x".repeat(8_200)}"}`), env);
  assert.equal(oversized.status, 413);

  const foreign = await worker.fetch(telemetryRequest(validTelemetry, { headers: { Origin: "https://attacker.example" } }), env);
  assert.equal(foreign.status, 403);

  const preflight = await worker.fetch(new Request("https://relay.example/telemetry", {
    method: "OPTIONS",
    headers: { Origin: "https://bensonperry.com" },
  }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /POST/);
});

test("runtime config endpoint is allowlisted, no-store, origin-aware, and read-only", async () => {
  const config = {
    schemaVersion: 4, configVersion: "rollback-42", gameplayVersion: "downed-off-v1",
    registryVersion: "lastlight.squad-synergy.v1",
    flags: {
      deterministicReplay: false, runTelemetry: false, objectiveEvents: false,
      migrationCheckpointReplication: false, hostMigrationElection: false, hostMigrationResume: false,
      contextualPings: false, upgradeRecommendations: false, squadSynergies: false, sharedParticipationCredit: false, downedActivity: false,
    },
  };
  const env = { LASTLIGHT_RUNTIME_CONFIG: JSON.stringify(config) };
  const response = await worker.fetch(new Request("https://relay.example/config", { headers: { Origin: "https://bensonperry.com" } }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(await response.json(), { config, source: "operator" });

  const mutation = await worker.fetch(new Request("https://relay.example/config", { method: "POST", headers: { Origin: "https://bensonperry.com" } }), env);
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("Allow"), "GET");
  const foreign = await worker.fetch(new Request("https://relay.example/config", { headers: { Origin: "https://attacker.example" } }), env);
  assert.equal(foreign.status, 403);
});

test("invalid operator config fails closed to immutable release defaults", () => {
  const invalid = operatorRuntimeConfig({ LASTLIGHT_RUNTIME_CONFIG: JSON.stringify({ flags: { surprise: true } }) });
  assert.equal(invalid.source, "built-in-invalid");
  assert.deepEqual(invalid.config.flags, {
    deterministicReplay: true, runTelemetry: true, objectiveEvents: true,
    migrationCheckpointReplication: true, hostMigrationElection: true, hostMigrationResume: true,
    contextualPings: true, upgradeRecommendations: true, squadSynergies: true, sharedParticipationCredit: true, downedActivity: true,
  });
  assert.equal(operatorRuntimeConfig({}).source, "built-in");
});

test("only the host can route a live-game sync to one peer", () => {
  const room = new Room({});
  const socket = () => ({ sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } });
  const host = socket(), guest = socket(), observer = socket();
  room.hostId = "host";
  room.sessions.set(host, { id: "host", name: "Host", initialized: true });
  room.sessions.set(guest, { id: "guest", name: "Guest", initialized: true });
  room.sessions.set(observer, { id: "observer", name: "Observer", initialized: true });

  room.onMessage(host, JSON.stringify({ type: "sync_game", _to: "guest", state: { level: 4 } }));
  assert.equal(host.sent.length, 0);
  assert.equal(observer.sent.length, 0);
  assert.deepEqual(guest.sent, [{ type: "sync_game", state: { level: 4 }, _from: "host" }]);

  room.onMessage(guest, JSON.stringify({ type: "sync_game", _to: "observer", state: { level: 99 } }));
  assert.equal(observer.sent.length, 0);
});

test("relay validates bounded sequenced input envelopes while preserving legacy rollout", () => {
  const room = new Room({});
  const socket = () => ({ sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } });
  const host = socket(), guest = socket();
  room.hostId = "host";
  room.sessions.set(host, { id: "host", initialized: true });
  room.sessions.set(guest, { id: "guest", initialized: true });
  const input = { x: 1, y: 0, aim: .5, autoAim: true };

  room.onMessage(guest, JSON.stringify({ type: "input", protocolVersion: 2, seq: 7, input }));
  assert.deepEqual(host.sent.pop(), { type: "input", protocolVersion: 2, seq: 7, input, _from: "guest" });
  room.onMessage(guest, JSON.stringify({ type: "input", input }));
  assert.deepEqual(host.sent.pop(), { type: "input", input, _from: "guest" });

  room.onMessage(guest, JSON.stringify({ type: "input", protocolVersion: 2, seq: -1, input }));
  room.onMessage(guest, JSON.stringify({ type: "input", protocolVersion: 2, seq: 8, input: { ...input, x: 9 } }));
  room.onMessage(guest, JSON.stringify({ type: "input", protocolVersion: 2, seq: 9, input, surprise: true }));
  assert.equal(host.sent.length, 0);
});

test("only the host can publish validated acknowledgement snapshots", () => {
  const room = new Room({});
  const socket = () => ({ sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } });
  const host = socket(), guest = socket(), observer = socket();
  room.hostId = "host";
  room.sessions.set(host, { id: "host", initialized: true });
  room.sessions.set(guest, { id: "guest", initialized: true });
  room.sessions.set(observer, { id: "observer", initialized: true });

  room.onMessage(host, JSON.stringify({ type: "snapshot", protocolVersion: 2, ack: { guest: 12 }, state: { tick: 50 } }));
  assert.deepEqual(guest.sent.pop(), { type: "snapshot", protocolVersion: 2, ack: { guest: 12 }, state: { tick: 50 }, _from: "host" });
  room.onMessage(guest, JSON.stringify({ type: "snapshot", protocolVersion: 2, ack: {}, state: { tick: 999 } }));
  assert.equal(observer.sent.length, 1);
  room.onMessage(host, JSON.stringify({ type: "snapshot", protocolVersion: 2, ack: { "bad id": 1 }, state: {} }));
  assert.equal(guest.sent.length, 0);
});

test("room identity is established by the first message instead of the request URL", () => {
  const room = new Room({});
  const socket = { sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } };
  room.sessions.set(socket, { id: "first", initialized: false, connectedAt: Date.now() });

  room.onMessage(socket, JSON.stringify({ type: "input", input: { x: 1 } }));
  assert.equal(socket.sent.length, 0);

  room.onMessage(socket, JSON.stringify({
    type: "hello",
    profile: { name: "Private Pilot", specialist: "nova", resumeToken: "a".repeat(24) },
  }));

  assert.equal(room.hostId, "first");
  assert.equal(room.sessions.get(socket).name, "Private Pilot");
  assert.equal(room.sessions.get(socket).resumeToken, "a".repeat(24));
  assert.deepEqual(socket.sent, [{ type: "welcome", id: "first", role: "host", hostId: "first", peers: [], authorityEpoch: 0, migrationProtocol: 4 }]);
});

test("reconnect tokens stay relay-private when profiles are routed", () => {
  const room = new Room({});
  const host = { sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } };
  const guest = { sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } };
  room.sessions.set(host, { id: "host", initialized: true, joinOrdinal: 0, name: "Host", specialist: "zuri", ready: true });
  room.sessions.set(guest, { id: "guest", initialized: true, joinOrdinal: 1, name: "Guest", specialist: "echo", ready: false });
  room.hostId = "host";
  room.onMessage(guest, JSON.stringify({
    type: "profile", profile: { name: "Guest", specialist: "echo", ready: true, resumeToken: "a".repeat(24) },
  }));
  assert.equal(room.sessions.get(guest).resumeToken, "a".repeat(24));
  assert.deepEqual(host.sent, [{
    type: "profile", profile: { id: "guest", name: "Guest", specialist: "echo", ready: true }, _from: "guest",
  }]);
  assert.doesNotMatch(JSON.stringify(host.sent), /resumeToken|a{24}/);
});

test("a duplicate live reconnect token cannot claim two room seats", () => {
  const room = new Room({});
  const firstSocket = migrationSocket(), secondSocket = migrationSocket();
  const first = { id: "first", initialized: false, connectedAt: Date.now(), joinOrdinal: 0 };
  const second = { id: "second", initialized: false, connectedAt: Date.now(), joinOrdinal: 1 };
  room.sessions.set(firstSocket, first); room.sessions.set(secondSocket, second);

  room.initializeSession(firstSocket, first, { name: "First", specialist: "zuri", resumeToken: "a".repeat(24) });
  room.initializeSession(secondSocket, second, { name: "Second", specialist: "echo", resumeToken: "a".repeat(24) });

  assert.equal(first.resumeToken, "a".repeat(24));
  assert.equal(second.resumeToken, "");
  assert.equal(room.hostId, "first");
  assert.equal(secondSocket.sent[0].role, "guest");
});

test("a session can only be initialized once by the hello handshake", () => {
  const room = new Room({});
  const socket = { sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } };
  const session = { id: "handshake", initialized: false, connectedAt: Date.now() };
  room.sessions.set(socket, session);

  assert.equal(room.initializeSession(socket, session, { name: "First", specialist: "echo" }), true);
  assert.equal(room.initializeSession(socket, session, { name: "Ignored", specialist: "fang" }), false);
  assert.equal(session.name, "First");
  assert.equal(session.specialist, "echo");
  assert.deepEqual(socket.sent, [{ type: "welcome", id: "handshake", role: "host", hostId: "handshake", peers: [], authorityEpoch: 0, migrationProtocol: 4 }]);
});

test("active host loss freezes routing and deterministically offers authority to the lowest replay slot", () => {
  const room = new Room({});
  const host = migrationSocket(), laterJoin = migrationSocket(), lowerSlot = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, migrationCapabilities };
  const laterSession = { id: "slot-two", initialized: true, joinOrdinal: 1, migrationCapabilities };
  const lowerSession = { id: "slot-one", initialized: true, joinOrdinal: 2, migrationCapabilities };
  room.sessions.set(host, hostSession); room.sessions.set(laterJoin, laterSession); room.sessions.set(lowerSlot, lowerSession);
  room.hostId = "host"; room.runActive = true;
  const checkpoint = createMigrationCheckpoint({
    epoch: 0, tick: 180, hash: "0123456789abcdef", ack: { "slot-one": 4, "slot-two": 8 }, compatibility: migrationCompatibility,
    roster: [{ id: "host", replaySlot: 0 }, { id: "slot-one", replaySlot: 1 }, { id: "slot-two", replaySlot: 2 }],
    simulation: { version: 6, scalars: { tick: 180 } }, replay: { currentTick: 180 },
  });
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);

  room.onClose(host);
  assert.equal(room.hostId, null);
  assert.equal(room.authorityEpoch, 1);
  assert.equal(room.migration.candidateId, "slot-one");
  assert.equal(lowerSlot.sent.at(-1).type, "migration_offer");
  assert.equal(lowerSlot.sent.at(-1).checkpoint.checkpointId, checkpoint.checkpointId);

  const ready = createMigrationReady({ ...checkpoint, epoch: 1 });
  assert.equal(room.acceptMigrationReady(lowerSession, ready), true);
  assert.equal(room.hostId, "slot-one");
  assert.equal(room.migration, null);
  assert.equal(laterJoin.sent.at(-1).type, "host_changed");
  assert.equal(laterJoin.sent.at(-1).authorityEpoch, 1);
  assert.equal(laterJoin.sent.at(-1).migrated, true);
});

test("migration rejects stale checkpoints, incompatible candidates, and forged readiness", () => {
  const room = new Room({});
  const host = migrationSocket(), guest = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, migrationCapabilities };
  const incompatible = createMigrationCapabilities({ ...migrationCompatibility, build: "2026.07.12.12" });
  const guestSession = { id: "guest", initialized: true, joinOrdinal: 1, migrationCapabilities: incompatible };
  room.sessions.set(host, hostSession); room.sessions.set(guest, guestSession); room.hostId = "host"; room.runActive = true;
  const checkpoint = createMigrationCheckpoint({
    epoch: 0, tick: 60, hash: "fedcba9876543210", ack: { guest: 1 }, compatibility: migrationCompatibility,
    roster: [{ id: "host", replaySlot: 0 }, { id: "guest", replaySlot: 1 }],
    simulation: { version: 6, scalars: { tick: 60 } }, replay: null,
  });
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), false);
  room.onClose(host);
  assert.equal(room.migration, null);
  assert.equal(room.hostId, null);
  assert.equal(guest.sent.at(-1).type, "migration_failed");
  assert.equal(room.acceptMigrationReady(guestSession, createMigrationReady({ ...checkpoint, epoch: 1 })), false);
});

function migrationFixture({ env = {}, hostToken = "a".repeat(24) } = {}) {
  const room = new Room({}, env);
  const host = migrationSocket(), successor = migrationSocket(), observer = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, migrationCapabilities, resumeToken: hostToken };
  const successorSession = { id: "successor", initialized: true, joinOrdinal: 1, migrationCapabilities };
  const observerSession = { id: "observer", initialized: true, joinOrdinal: 2, migrationCapabilities };
  room.sessions.set(host, hostSession); room.sessions.set(successor, successorSession); room.sessions.set(observer, observerSession);
  room.hostId = hostSession.id; room.runActive = true;
  const checkpoint = createMigrationCheckpoint({
    epoch: 0, tick: 180, hash: "0123456789abcdef", ack: { successor: 7, observer: 4 }, compatibility: migrationCompatibility,
    roster: [{ id: "host", replaySlot: 0 }, { id: "successor", replaySlot: 1 }, { id: "observer", replaySlot: 2 }],
    simulation: { version: 6, scalars: { tick: 180 } }, replay: { currentTick: 180 },
  });
  return { room, host, successor, observer, hostSession, successorSession, observerSession, checkpoint, hostToken };
}

function commitFixtureMigration(fixture) {
  const { room, host, successorSession, checkpoint } = fixture;
  assert.equal(room.acceptMigrationCheckpoint(fixture.hostSession, checkpoint), true);
  room.onClose(host);
  assert.equal(room.acceptMigrationReady(successorSession, createMigrationReady({ ...checkpoint, epoch: 1 })), true);
  assert.equal(room.hostId, successorSession.id);
  assert.equal(room.authorityEpoch, 1);
}

test("migration commit fences stale old-epoch input and snapshots while current-epoch traffic still routes", () => {
  const fixture = migrationFixture();
  commitFixtureMigration(fixture);
  const { room, successor, observer } = fixture;
  successor.sent.length = 0; observer.sent.length = 0;
  const input = { x: 1, y: 0, aim: .5, autoAim: true };

  room.onMessage(observer, JSON.stringify({ type: "input", protocolVersion: 3, epoch: 0, seq: 8, input }));
  assert.equal(successor.sent.length, 0, "the new authority must never receive a delayed old-epoch input");

  room.onMessage(successor, JSON.stringify({
    type: "snapshot", protocolVersion: 3, epoch: 0, snapshotSeq: 8, tick: 181, ack: {}, state: { tick: 181 },
  }));
  assert.equal(observer.sent.length, 0, "peers must never receive a delayed old-epoch authority snapshot");

  room.onMessage(observer, JSON.stringify({ type: "input", protocolVersion: 3, epoch: 1, seq: 9, input }));
  assert.deepEqual(successor.sent.pop(), { type: "input", protocolVersion: 3, epoch: 1, seq: 9, input, _from: "observer" });
  room.onMessage(successor, JSON.stringify({
    type: "snapshot", protocolVersion: 3, epoch: 1, snapshotSeq: 9, tick: 182, ack: { observer: 9 }, state: { tick: 182 },
  }));
  assert.deepEqual(observer.sent.pop(), {
    type: "snapshot", protocolVersion: 3, epoch: 1, snapshotSeq: 9, tick: 182,
    ack: { observer: 9 }, state: { tick: 182 }, _from: "successor",
  });
});

test("active host loss without a checkpoint fails closed instead of promoting an unsynchronized peer", () => {
  const room = new Room({});
  const host = migrationSocket(), guest = migrationSocket();
  room.sessions.set(host, { id: "host", initialized: true, joinOrdinal: 0, migrationCapabilities });
  room.sessions.set(guest, { id: "guest", initialized: true, joinOrdinal: 1, migrationCapabilities });
  room.hostId = "host"; room.runActive = true;

  room.onClose(host);

  assert.equal(room.hostId, null);
  assert.equal(room.authorityEpoch, 0, "a failed election must not manufacture a new authority epoch");
  assert.equal(room.migration, null);
  assert.deepEqual(guest.sent.at(-1), { type: "migration_failed", reason: "no-checkpoint" });
  assert.equal(guest.sent.some(({ type }) => type === "host_changed"), false);
});

test("disabled host migration fails closed even when a valid checkpoint exists", () => {
  const config = {
    schemaVersion: 4, configVersion: "migration-off", gameplayVersion: "downed-v1",
    registryVersion: "lastlight.squad-synergy.v1",
    flags: {
      deterministicReplay: true, runTelemetry: true, objectiveEvents: true,
      migrationCheckpointReplication: true, hostMigrationElection: false, hostMigrationResume: true,
      contextualPings: true, upgradeRecommendations: true, squadSynergies: true, sharedParticipationCredit: true, downedActivity: true,
    },
  };
  const fixture = migrationFixture({ env: { LASTLIGHT_RUNTIME_CONFIG: JSON.stringify(config) } });
  const { room, host, hostSession, checkpoint, successor } = fixture;
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);

  room.onClose(host);

  assert.equal(room.hostId, null);
  assert.equal(room.authorityEpoch, 0);
  assert.equal(room.migration, null);
  assert.deepEqual(successor.sent.at(-1), { type: "migration_failed", reason: "disabled" });
  assert.equal(successor.sent.some(({ type }) => type === "host_changed"), false);
});

test("a returning old host reclaims its checkpoint replay slot but remains a guest after migration", () => {
  const fixture = migrationFixture();
  commitFixtureMigration(fixture);
  const { room, successor, hostToken } = fixture;
  successor.sent.length = 0;
  const returning = migrationSocket();
  const returningSession = { id: "host-returned", initialized: false, connectedAt: Date.now(), joinOrdinal: 3 };
  room.sessions.set(returning, returningSession);

  assert.equal(room.initializeSession(returning, returningSession, {
    name: "Original host", specialist: "zuri", resumeToken: hostToken,
  }, migrationCapabilities), true);

  assert.equal(returningSession.replaySlot, 0);
  assert.equal(room.hostId, "successor");
  assert.deepEqual(returning.sent[0], {
    type: "welcome", id: "host-returned", role: "guest", hostId: "successor",
    peers: [
      { id: "successor", replaySlot: 1 },
      { id: "observer", replaySlot: 2 },
    ],
    authorityEpoch: 1, migrationProtocol: 4,
  });
  assert.deepEqual(successor.sent.at(-1), {
    type: "peer_joined",
    peer: { id: "host-returned", name: "Original host", specialist: "zuri", ready: false, replaySlot: 0 },
  });
});

test("a profile that reconnects during election is replayed to the committed successor", () => {
  const fixture = migrationFixture();
  const { room, host, hostSession, successor, successorSession, checkpoint, hostToken } = fixture;
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);
  room.onClose(host);
  const returning = migrationSocket();
  const returningSession = { id: "host-returned", initialized: false, connectedAt: Date.now(), joinOrdinal: 3 };
  room.sessions.set(returning, returningSession);
  assert.equal(room.initializeSession(returning, returningSession, {
    name: "Original host", specialist: "zuri", resumeToken: hostToken,
  }, migrationCapabilities), true);
  assert.equal(returningSession.pendingProfile, true);
  successor.sent.length = 0;
  assert.equal(room.acceptMigrationReady(successorSession, createMigrationReady({ ...checkpoint, epoch: 1 })), true);
  assert.deepEqual(successor.sent.at(-1), {
    type: "profile", _from: "host-returned",
    profile: { id: "host-returned", name: "Original host", specialist: "zuri", ready: false, replaySlot: 0 },
  });
  assert.equal(returningSession.pendingProfile, undefined);
});

function pingRoomFixture(env = {}) {
  const room = new Room({}, env);
  const host = migrationSocket(), guest = migrationSocket(), observer = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, name: "Host", specialist: "zuri", ready: true, resumeToken: "a".repeat(24), migrationCapabilities };
  const guestSession = { id: "guest", initialized: true, joinOrdinal: 1, name: "Guest", specialist: "echo", ready: true, resumeToken: "b".repeat(24), migrationCapabilities };
  const observerSession = { id: "observer", initialized: true, joinOrdinal: 2, name: "Observer", specialist: "nova", ready: true, resumeToken: "c".repeat(24), migrationCapabilities };
  room.sessions.set(host, hostSession); room.sessions.set(guest, guestSession); room.sessions.set(observer, observerSession); room.hostId = hostSession.id;
  const players = [
    { id: hostSession.id, replaySlot: 0 }, { id: guestSession.id, replaySlot: 1 }, { id: observerSession.id, replaySlot: 2 },
  ];
  room.onMessage(host, JSON.stringify({ type: "start", config: {}, players }));
  host.sent.length = 0; guest.sent.length = 0; observer.sent.length = 0;
  return { room, host, guest, observer, hostSession, guestSession, observerSession, players };
}

function pingRequest(seq, fields = {}) {
  return createPingRequest({ epoch: 0, seq, tick: 20 + seq, intent: "danger", x: 120, y: -80, targetKind: "ground", ...fields });
}

test("run start authenticates unique replay slots before ping routing", () => {
  const room = new Room({});
  const host = migrationSocket(), guest = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, resumeToken: "a".repeat(24) };
  const guestSession = { id: "guest", initialized: true, joinOrdinal: 1, resumeToken: "b".repeat(24) };
  room.sessions.set(host, hostSession); room.sessions.set(guest, guestSession); room.hostId = "host";

  room.onMessage(host, JSON.stringify({ type: "start", players: [{ id: "host", replaySlot: 0 }, { id: "guest", replaySlot: 0 }] }));
  assert.equal(room.runActive, false);
  assert.equal(hostSession.replaySlot, undefined); assert.equal(guestSession.replaySlot, undefined);
  assert.equal(guest.sent.length, 0);

  room.onMessage(host, JSON.stringify({ type: "start", players: [{ id: "host", replaySlot: 0 }, { id: "guest", replaySlot: 1 }] }));
  assert.equal(room.runActive, true);
  assert.equal(hostSession.replaySlot, 0); assert.equal(guestSession.replaySlot, 1);
  assert.equal(room.seatTokens.get("a".repeat(24)), 0); assert.equal(room.seatTokens.get("b".repeat(24)), 1);
});

test("legacy and disconnect-race start rosters preserve rolling compatibility", () => {
  const room = new Room({}), host = migrationSocket(), guest = migrationSocket();
  const hostSession = { id: "host", initialized: true, joinOrdinal: 0, resumeToken: "a".repeat(24) };
  const guestSession = { id: "guest", initialized: true, joinOrdinal: 1, resumeToken: "b".repeat(24) };
  room.sessions.set(host, hostSession); room.sessions.set(guest, guestSession); room.hostId = "host";
  room.onMessage(host, JSON.stringify({ type: "start", players: [{ id: "host" }, { id: "guest" }, { id: "already-left" }] }));
  assert.equal(room.runActive, true); assert.equal(hostSession.replaySlot, 0); assert.equal(guestSession.replaySlot, 1);
});

test("strict guest pings route only to the host with an authenticated replay slot", () => {
  const { room, host, guest, observer } = pingRoomFixture();
  const request = pingRequest(0);
  room.onMessage(guest, JSON.stringify(request));

  assert.deepEqual(host.sent, [{ ...request, _from: "guest", replaySlot: 1 }]);
  assert.equal(observer.sent.length, 0, "raw guest ping intent must not fan out to peers");
  assert.equal(guest.sent.length, 0);

  room.onMessage(guest, JSON.stringify({ ...pingRequest(1), unsupported: true }));
  room.onMessage(guest, JSON.stringify({ ...pingRequest(2), _from: "spoofed" }));
  room.onMessage(guest, JSON.stringify({ ...pingRequest(3), replaySlot: 3 }));
  room.onMessage(guest, JSON.stringify({ ...pingRequest(4), _to: "observer" }));
  assert.equal(host.sent.length, 1, "extra transport or unsupported fields must fail closed");
});

test("only the host can relay a strict ping broadcast and cannot forge a guest ping", () => {
  const { room, host, guest, observer } = pingRoomFixture();
  room.onMessage(guest, JSON.stringify(pingRequest(0)));
  const routed = host.sent.pop(), broadcast = createPingBroadcast(routed, 1, 30);

  room.onMessage(observer, JSON.stringify(broadcast));
  assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0);

  room.onMessage(host, JSON.stringify({ ...broadcast, seq: 99 }));
  room.onMessage(host, JSON.stringify({ ...broadcast, unsupported: true }));
  room.onMessage(host, JSON.stringify({ ...broadcast, _to: "guest" }));
  assert.equal(guest.sent.length, 0, "unmatched or malformed host broadcasts must fail closed");

  room.onMessage(host, JSON.stringify(broadcast));
  const relayed = { ...broadcast, _from: "host" };
  assert.deepEqual(guest.sent, [relayed]); assert.deepEqual(observer.sent, [relayed]);
  assert.equal(room.pendingPings.size, 0);

  const hostRequest = pingRequest(0, { intent: "help", x: 0, y: 0, targetKind: "ally" });
  room.onMessage(host, JSON.stringify(hostRequest));
  const hostPing = createPingBroadcast(host.sent.at(-1), 0, 31);
  room.onMessage(host, JSON.stringify(hostPing));
  assert.deepEqual(guest.sent.at(-1), { ...hostPing, _from: "host" });

  room.onMessage(guest, JSON.stringify(pingRequest(1, { intent: "objective", x: 10, y: 10, targetKind: "ground" })));
  const snappedRequest = host.sent.at(-1);
  const snapped = createPingBroadcast({ ...snappedRequest, x: 200, y: 150, targetKind: "objective" }, 1, 32);
  room.onMessage(host, JSON.stringify(snapped));
  assert.deepEqual(observer.sent.at(-1), { ...snapped, _from: "host" }, "host-canonicalized target coordinates must relay");
});

test("the runtime rollback flag rejects request and broadcast paths", () => {
  const config = {
    schemaVersion: 4, configVersion: "pings-off", gameplayVersion: "downed-v1",
    registryVersion: "lastlight.squad-synergy.v1",
    flags: {
      deterministicReplay: true, runTelemetry: true, objectiveEvents: true,
      migrationCheckpointReplication: true, hostMigrationElection: true, hostMigrationResume: true,
      contextualPings: false, upgradeRecommendations: true, squadSynergies: true, sharedParticipationCredit: true, downedActivity: true,
    },
  };
  const { room, host, guest, observer } = pingRoomFixture({ LASTLIGHT_RUNTIME_CONFIG: JSON.stringify(config) });
  room.onMessage(guest, JSON.stringify(pingRequest(0)));
  assert.equal(host.sent.length, 0);
  room.onMessage(host, JSON.stringify(createPingBroadcast(pingRequest(0), 0, 30)));
  assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0); assert.equal(room.pendingPings.size, 0);
});

test("ping token buckets are slot keyed across reconnect and refill one token every two seconds", () => {
  const { room, host, guest, guestSession } = pingRoomFixture();
  let now = 1_000; room.pingNow = () => now;
  for (let seq = 0; seq < 5; seq++) room.onMessage(guest, JSON.stringify(pingRequest(seq)));
  assert.equal(host.sent.length, 4); assert.equal(room.pingRate.entries.size, 1);

  room.onClose(guest); host.sent.length = 0;
  const returning = migrationSocket(), returningSession = { id: "guest-returned", initialized: false, connectedAt: now, joinOrdinal: 3 };
  room.sessions.set(returning, returningSession);
  assert.equal(room.initializeSession(returning, returningSession, { name: "Guest", specialist: "echo", resumeToken: guestSession.resumeToken }, migrationCapabilities), true);
  assert.equal(returningSession.replaySlot, 1);
  host.sent.length = 0;

  room.onMessage(returning, JSON.stringify(pingRequest(5)));
  assert.equal(host.sent.length, 0, "reconnect must not refill the replay slot bucket");
  now += 2_000;
  room.onMessage(returning, JSON.stringify(pingRequest(6)));
  assert.equal(host.sent.length, 1);
  assert.equal(host.sent[0].replaySlot, 1);
  assert.equal(host.sent[0]._from, "guest-returned");
});

test("ping rate state survives host migration while pending old-epoch pings do not", () => {
  const { room, host, guest, observer, hostSession, guestSession, observerSession } = pingRoomFixture();
  let now = 5_000; room.pingNow = () => now;
  for (let seq = 0; seq < 4; seq++) room.onMessage(observer, JSON.stringify(pingRequest(seq)));
  assert.equal(host.sent.length, 4); assert.equal(room.pendingPings.size, 4);

  const checkpoint = createMigrationCheckpoint({
    epoch: 0, tick: 180, hash: "0123456789abcdef", ack: { guest: 4, observer: 4 }, compatibility: migrationCompatibility,
    roster: [{ id: "host", replaySlot: 0 }, { id: "guest", replaySlot: 1 }, { id: "observer", replaySlot: 2 }],
    simulation: { version: 6, scalars: { tick: 180 } }, replay: { currentTick: 180 },
  });
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);
  room.onClose(host);
  assert.equal(room.pendingPings.size, 0);
  assert.equal(room.acceptMigrationReady(guestSession, createMigrationReady({ ...checkpoint, epoch: 1 })), true);
  assert.equal(room.hostId, "guest"); assert.equal(room.authorityEpoch, 1);
  guest.sent.length = 0; observer.sent.length = 0;

  room.onMessage(observer, JSON.stringify(pingRequest(4, { epoch: 0, tick: 181 })));
  room.onMessage(observer, JSON.stringify(pingRequest(5, { epoch: 1, tick: 181 })));
  assert.equal(guest.sent.length, 0, "migration must preserve the exhausted slot bucket and fence the old epoch");
  now += 2_000;
  room.onMessage(observer, JSON.stringify(pingRequest(6, { epoch: 1, tick: 182 })));
  assert.equal(guest.sent.length, 1);
  assert.equal(guest.sent[0].replaySlot, observerSession.replaySlot);
});

test("returning to lobby and starting a new run reset bounded ping state", () => {
  const { room, host, guest, players } = pingRoomFixture();
  let now = 9_000; room.pingNow = () => now;
  for (let seq = 0; seq < 4; seq++) room.onMessage(guest, JSON.stringify(pingRequest(seq)));
  assert.equal(room.pendingPings.size, 4); assert.equal(room.pingRate.entries.size, 1);

  room.onMessage(host, JSON.stringify({ type: "return_lobby", epoch: 0 }));
  assert.equal(room.runActive, false); assert.equal(room.pendingPings.size, 0); assert.equal(room.pingRate.entries.size, 0);
  room.onMessage(host, JSON.stringify({ type: "start", config: {}, players }));
  host.sent.length = 0;
  room.onMessage(guest, JSON.stringify(pingRequest(10)));
  assert.equal(host.sent.length, 1);
  assert.ok(room.pendingPings.size <= 32); assert.ok(room.pingRate.entries.size <= 4);
});

function recommendationRoomFixture() {
  const fixture = pingRoomFixture();
  fixture.room.runtimeFlags = () => ({
    contextualPings: true, upgradeRecommendations: true,
    migrationCheckpointReplication: true, hostMigrationElection: true, hostMigrationResume: true,
  });
  fixture.host.sent.length = 0; fixture.guest.sent.length = 0; fixture.observer.sent.length = 0;
  return fixture;
}

function recommendationRequest(seq, fields = {}) {
  return createDraftRecommendationRequest({
    epoch: 0, seq, targetSlot: 0, round: 3, revision: 1, optionIndex: 2, active: true, ...fields,
  });
}

test("strict draft recommendation intent routes only to the host with authenticated transport identity", () => {
  const { room, host, guest, observer } = recommendationRoomFixture();
  const request = recommendationRequest(0);
  room.onMessage(guest, JSON.stringify(request));
  assert.deepEqual(host.sent, [{ ...request, _from: "guest", recommenderSlot: 1 }]);
  assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0);

  room.onMessage(guest, JSON.stringify(request));
  room.onMessage(guest, JSON.stringify({ ...recommendationRequest(1), unsupported: true }));
  room.onMessage(guest, JSON.stringify({ ...recommendationRequest(2), _from: "spoofed" }));
  room.onMessage(guest, JSON.stringify({ ...recommendationRequest(3), epoch: 1 }));
  room.onMessage(guest, JSON.stringify({ ...recommendationRequest(4), _to: "observer" }));
  assert.equal(host.sent.length, 1, "duplicate, malformed, stale-epoch, and targeted intent must fail closed");
});

test("only a matching host-authoritative recommendation delta can fan out", () => {
  const { room, host, guest, observer } = recommendationRoomFixture();
  room.onMessage(guest, JSON.stringify(recommendationRequest(0)));
  const routed = host.sent.pop(), state = createDraftRecommendationState(routed);

  room.onMessage(observer, JSON.stringify(state));
  room.onMessage(host, JSON.stringify({ ...state, seq: 99 }));
  room.onMessage(host, JSON.stringify({ ...state, optionIndex: 1 }));
  room.onMessage(host, JSON.stringify({ ...state, unsupported: true }));
  room.onMessage(host, JSON.stringify({ ...state, _to: "guest" }));
  assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0);

  room.onMessage(host, JSON.stringify(state));
  assert.deepEqual(guest.sent, [{ ...state, _from: "host" }]);
  assert.deepEqual(observer.sent, [{ ...state, _from: "host" }]);
  assert.equal(room.pendingDraftRecommendations.size, 0);
});

test("the authority may publish its own sequenced recommendation without forging another seat", () => {
  const { room, host, guest, observer } = recommendationRoomFixture();
  const own = createDraftRecommendationState({
    ...recommendationRequest(0, { targetSlot: 1, optionIndex: 0 }), _from: "host", recommenderSlot: 0,
  });
  room.onMessage(host, JSON.stringify(own));
  assert.deepEqual(guest.sent, [{ ...own, _from: "host" }]);
  assert.deepEqual(observer.sent, [{ ...own, _from: "host" }]);
  room.onMessage(host, JSON.stringify(own));
  room.onMessage(host, JSON.stringify({ ...own, seq: 1, recommenderSlot: 2 }));
  assert.equal(guest.sent.length, 1, "duplicate authority state and forged peer attribution fail closed");
});

test("host-only recommendation sync is strict, bounded, epoch-fenced, and targeted", () => {
  const { room, host, guest, observer } = recommendationRoomFixture();
  const first = createDraftRecommendationState({ ...recommendationRequest(2, { optionIndex: 2 }), _from: "guest", recommenderSlot: 1 });
  const second = createDraftRecommendationState({ ...recommendationRequest(1, { optionIndex: 0 }), _from: "observer", recommenderSlot: 2 });
  const sync = createDraftRecommendationSync({ epoch: 0, entries: [first, second] });

  room.onMessage(guest, JSON.stringify({ ...sync, _to: "observer" }));
  room.onMessage(host, JSON.stringify(sync));
  room.onMessage(host, JSON.stringify({ ...sync, epoch: 1, _to: "guest" }));
  room.onMessage(host, JSON.stringify({ ...sync, unsupported: true, _to: "guest" }));
  assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0);

  room.onMessage(host, JSON.stringify({ ...sync, _to: "guest" }));
  assert.deepEqual(guest.sent, [{ ...sync, _from: "host" }]);
  assert.equal(observer.sent.length, 0, "targeted recovery state must not leak to other peers");
  assert.deepEqual(guest.sent[0].entries.map(({ optionIndex }) => optionIndex), [2, 0]);
});

test("draft recommendation relay rate and sequence state are bounded and reset at lifecycle fences", () => {
  const { room, host, guest, players } = recommendationRoomFixture();
  let now = 1_000; room.draftRecommendationNow = () => now;
  for (let seq = 0; seq < 13; seq++) room.onMessage(guest, JSON.stringify(recommendationRequest(seq)));
  assert.equal(host.sent.length, 12); assert.equal(room.pendingDraftRecommendations.size, 12);
  assert.equal(room.draftRecommendationRate.entries.size, 1);
  now += 250;
  room.onMessage(guest, JSON.stringify(recommendationRequest(13)));
  assert.equal(host.sent.length, 13);

  room.onMessage(host, JSON.stringify({ type: "return_lobby", epoch: 0 }));
  assert.equal(room.pendingDraftRecommendations.size, 0);
  assert.equal(room.draftRecommendationSequences.size, 0);
  assert.equal(room.draftRecommendationRate.entries.size, 0);
  room.onMessage(host, JSON.stringify({ type: "start", config: {}, players }));
  host.sent.length = 0;
  room.onMessage(guest, JSON.stringify(recommendationRequest(0)));
  assert.equal(host.sent.length, 1);
});

test("a resumed recommendation seat may restart sequence without resetting its abuse budget", () => {
  const { room, host, guest, guestSession } = recommendationRoomFixture();
  let now = 2_000; room.draftRecommendationNow = () => now;
  room.onMessage(guest, JSON.stringify(recommendationRequest(0)));
  assert.equal(host.sent.length, 1); assert.equal(room.pendingDraftRecommendations.size, 1);
  room.onClose(guest); host.sent.length = 0;

  const returning = migrationSocket();
  const returningSession = { id: "guest-returned", initialized: false, connectedAt: now, joinOrdinal: 4 };
  room.sessions.set(returning, returningSession);
  assert.equal(room.initializeSession(returning, returningSession, {
    name: "Guest", specialist: "echo", resumeToken: guestSession.resumeToken,
  }, migrationCapabilities), true);
  host.sent.length = 0;
  assert.equal(room.pendingDraftRecommendations.size, 0, "unconfirmed intent from the old connection must be discarded");
  room.onMessage(returning, JSON.stringify(recommendationRequest(0)));
  assert.equal(host.sent.length, 1, "the authenticated replacement connection gets a fresh sequence space");
  assert.equal(room.draftRecommendationRate.entries.get("1").tokens, 10, "reconnect must retain the slot-keyed rate budget");
});

test("host migration clears old-epoch recommendation intent while preserving slot rate limits", () => {
  const { room, host, observer, hostSession, guestSession } = recommendationRoomFixture();
  let now = 4_000; room.draftRecommendationNow = () => now;
  for (let seq = 0; seq < 12; seq++) room.onMessage(observer, JSON.stringify(recommendationRequest(seq)));
  assert.equal(room.pendingDraftRecommendations.size, 12);
  const checkpoint = createMigrationCheckpoint({
    epoch: 0, tick: 180, hash: "0123456789abcdef", ack: { guest: 4, observer: 4 }, compatibility: migrationCompatibility,
    roster: [{ id: "host", replaySlot: 0 }, { id: "guest", replaySlot: 1 }, { id: "observer", replaySlot: 2 }],
    simulation: { version: 6, scalars: { tick: 180 } }, replay: { currentTick: 180 },
  });
  assert.equal(room.acceptMigrationCheckpoint(hostSession, checkpoint), true);
  room.onClose(host);
  assert.equal(room.pendingDraftRecommendations.size, 0);
  assert.equal(room.draftRecommendationSequences.size, 0);
  assert.equal(room.draftRecommendationRate.entries.get("2").tokens, 0);
  assert.equal(room.acceptMigrationReady(guestSession, createMigrationReady({ ...checkpoint, epoch: 1 })), true);
  const successor = [...room.sessions.keys()].find((socket) => room.sessions.get(socket)?.id === "guest");
  successor.sent.length = 0;
  room.onMessage(observer, JSON.stringify(recommendationRequest(0, { epoch: 1 })));
  assert.equal(successor.sent.length, 0, "migration does not refill a saturated seat");
  now += 250;
  room.onMessage(observer, JSON.stringify(recommendationRequest(1, { epoch: 1 })));
  assert.equal(successor.sent.length, 1);
});

test("the upgrade recommendation rollback flag closes request, state, and sync paths", () => {
  const { room, host, guest, observer } = recommendationRoomFixture();
  room.runtimeFlags = () => ({ contextualPings: true, upgradeRecommendations: false });
  room.onMessage(guest, JSON.stringify(recommendationRequest(0)));
  room.onMessage(host, JSON.stringify(createDraftRecommendationState({
    ...recommendationRequest(0), _from: "guest", recommenderSlot: 1,
  })));
  room.onMessage(host, JSON.stringify({ ...createDraftRecommendationSync({ epoch: 0, entries: [] }), _to: "guest" }));
  assert.equal(host.sent.length, 0); assert.equal(guest.sent.length, 0); assert.equal(observer.sent.length, 0);
  assert.equal(room.pendingDraftRecommendations.size, 0);
});
