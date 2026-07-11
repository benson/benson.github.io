import test from "node:test";
import assert from "node:assert/strict";
import worker, { Room, normalizeCode, safeProfile, sanitizeRunTelemetry } from "./worker.js";

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

test("only the host can route a live-game sync to one peer", () => {
  const room = new Room({});
  const socket = () => ({ sent: [], send(payload) { this.sent.push(JSON.parse(payload)); } });
  const host = socket(), guest = socket(), observer = socket();
  room.hostId = "host";
  room.sessions.set(host, { id: "host", name: "Host" });
  room.sessions.set(guest, { id: "guest", name: "Guest" });
  room.sessions.set(observer, { id: "observer", name: "Observer" });

  room.onMessage(host, JSON.stringify({ type: "sync_game", _to: "guest", state: { level: 4 } }));
  assert.equal(host.sent.length, 0);
  assert.equal(observer.sent.length, 0);
  assert.deepEqual(guest.sent, [{ type: "sync_game", state: { level: 4 }, _from: "host" }]);

  room.onMessage(guest, JSON.stringify({ type: "sync_game", _to: "observer", state: { level: 99 } }));
  assert.equal(observer.sent.length, 0);
});
