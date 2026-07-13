import test from "node:test";
import assert from "node:assert/strict";
import worker, { Room, normalizeCode, operatorRuntimeConfig, safeProfile, sanitizeRunTelemetry } from "./worker.js";
import { createMigrationCapabilities, createMigrationCheckpoint, createMigrationReady } from "../host-migration.js";

const migrationCompatibility = {
  build: "2026.07.13.1", balanceVersion: "2026.07.13-apex.1", balanceHash: "fnv1a32:873c43bc",
  configVersion: "release-2026.07.13.1", gameplayVersion: "events-v1", objectiveEvents: true,
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

test("run telemetry is normalized into a fixed aggregate schema", () => {
  const run = sanitizeRunTelemetry(validTelemetry);
  assert.deepEqual(run.specialists, ["echo", "zuri"]);
  assert.equal(run.damageDealt, 2000.3);
  assert.equal(Object.hasOwn(run, "name"), false);
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
    schemaVersion: 1, configVersion: "rollback-42", gameplayVersion: "events-off-v1",
    flags: {
      deterministicReplay: false, runTelemetry: false, objectiveEvents: false,
      migrationCheckpointReplication: false, hostMigrationElection: false, hostMigrationResume: false,
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
  assert.deepEqual(socket.sent, [{ type: "welcome", id: "first", role: "host", hostId: "first", peers: [], authorityEpoch: 0, migrationProtocol: 1 }]);
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
  assert.deepEqual(socket.sent, [{ type: "welcome", id: "handshake", role: "host", hostId: "handshake", peers: [], authorityEpoch: 0, migrationProtocol: 1 }]);
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
    simulation: { version: 3, scalars: { tick: 180 } }, replay: { currentTick: 180 },
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
    simulation: { version: 3, scalars: { tick: 60 } }, replay: null,
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
    simulation: { version: 3, scalars: { tick: 180 } }, replay: { currentTick: 180 },
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
    schemaVersion: 1, configVersion: "migration-off", gameplayVersion: "events-v1",
    flags: {
      deterministicReplay: true, runTelemetry: true, objectiveEvents: true,
      migrationCheckpointReplication: true, hostMigrationElection: false, hostMigrationResume: true,
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
    authorityEpoch: 1, migrationProtocol: 1,
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
