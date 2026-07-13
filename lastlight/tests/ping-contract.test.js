import test from "node:test";
import assert from "node:assert/strict";
import {
  HostPingGate, PING_INTENTS, PING_LIFETIME_TICKS, PING_PROTOCOL_VERSION, PING_WHEEL_ORDER,
  PING_WORLD_HALF_HEIGHT, PING_WORLD_HALF_WIDTH,
  PingSequenceTracker, PingTokenBucket, createPingBroadcast, createPingRequest, pingIntentFromDelta,
  sanitizePingBroadcast, sanitizePingRequest, selectVisiblePings,
} from "../ping-contract.js";

const request = (fields = {}) => createPingRequest({ epoch: 2, seq: 3, tick: 100, intent: "danger", x: 12.4, y: -20.6, targetKind: "enemy", ...fields });
const transport = (fields = {}) => ({ ...request(fields), _from: "peer-1", replaySlot: 1 });

test("the ping contract has six strict authored non-color identities", () => {
  assert.deepEqual(PING_WHEEL_ORDER, ["danger", "objective", "pickup", "help", "regroup", "recommendation"]);
  assert.equal(Object.keys(PING_INTENTS).length, 6); assert.equal(PING_PROTOCOL_VERSION, 1); assert.equal(PING_LIFETIME_TICKS, 180);
  for (const ping of Object.values(PING_INTENTS)) assert.ok(ping.label && ping.glyph && ping.shape && ping.priority);
});

test("request and broadcast sanitizers quantize coordinates and reject identity or arbitrary payloads", () => {
  assert.deepEqual(request(), { type: "ping", protocolVersion: 1, epoch: 2, seq: 3, tick: 100, intent: "danger", x: 12, y: -21, targetKind: "enemy" });
  assert.equal(sanitizePingRequest(transport(), { transport: true }).replaySlot, 1);
  const broadcast = createPingBroadcast(transport(), 1, 104); assert.equal(broadcast.tick, 104); assert.equal(broadcast.replaySlot, 1);
  assert.equal(sanitizePingBroadcast({ ...broadcast, _from: "host" }, { transport: true })._from, "host");
  assert.deepEqual([PING_WORLD_HALF_WIDTH, PING_WORLD_HALF_HEIGHT], [1800, 1200]);
  assert.throws(() => request({ x: 1801 }), /ping x/);
  assert.throws(() => request({ y: -1201 }), /ping y/);
  for (const invalid of [
    { ...request(), intent: "free text" }, { ...request(), x: Infinity }, { ...request(), callsign: "secret" },
    { ...request(), token: "a".repeat(24) }, { ...transport(), replaySlot: 4 },
  ]) assert.throws(() => sanitizePingRequest(invalid, { transport: Object.hasOwn(invalid, "_from") }), /ping/);
});

test("wheel selection has a stable dead zone and six clockwise sectors", () => {
  assert.equal(pingIntentFromDelta(0, 0), null);
  assert.equal(pingIntentFromDelta(0, -50), "danger");
  assert.equal(pingIntentFromDelta(50, -30), "objective");
  assert.equal(pingIntentFromDelta(50, 30), "pickup");
  assert.equal(pingIntentFromDelta(0, 50), "help");
  assert.equal(pingIntentFromDelta(-50, 30), "regroup");
  assert.equal(pingIntentFromDelta(-50, -30), "recommendation");
});

test("the client sequence is epoch scoped and the host rejects stale, wrong-epoch, old, and rapid messages", () => {
  const client = new PingSequenceTracker(2); assert.equal(client.create({ tick: 100, intent: "help", x: 0, y: 0, targetKind: "ground" }).seq, 0);
  assert.equal(client.create({ tick: 101, intent: "help", x: 0, y: 0, targetKind: "ground" }).seq, 1); client.reset(3); assert.equal(client.create({ tick: 1, intent: "help", x: 0, y: 0, targetKind: "ground" }).seq, 0);
  const gate = new HostPingGate(2, { cooldownTicks: 12, maxAgeTicks: 180 });
  assert.equal(gate.apply(transport(), 104).accepted, true);
  assert.equal(gate.apply(transport(), 105).reason, "sequence");
  assert.equal(gate.apply(transport({ seq: 4 }), 105).reason, "rate");
  assert.equal(gate.apply(transport({ seq: 5, epoch: 1 }), 120).reason, "epoch");
  assert.equal(gate.apply(transport({ seq: 6, tick: 1 }), 200).reason, "tick");
  assert.equal(gate.apply(transport({ seq: 7, tick: 120 }), 120).accepted, true);
});

test("relay token buckets are bounded, refill exactly, and remain keyed independently", () => {
  const bucket = new PingTokenBucket();
  for (let i = 0; i < 4; i++) assert.equal(bucket.take("seat-1", 1_000), true);
  assert.equal(bucket.take("seat-1", 1_000), false); assert.equal(bucket.take("seat-1", 2_999), false); assert.equal(bucket.take("seat-1", 3_000), true);
  assert.equal(bucket.take("seat-2", 3_000), true); assert.equal(bucket.entries.size, 2);
});

test("render budgeting is deterministic and independent of arrival order", () => {
  const pings = [
    { ...createPingBroadcast(transport({ intent: "pickup", seq: 1 }), 1, 10) },
    { ...createPingBroadcast(transport({ intent: "help", seq: 2 }), 1, 9) },
    { ...createPingBroadcast(transport({ intent: "danger", seq: 3 }), 1, 11) },
  ];
  assert.deepEqual(selectVisiblePings(pings, 2).map(({ intent }) => intent), ["help", "danger"]);
  assert.deepEqual(selectVisiblePings([...pings].reverse(), 2), selectVisiblePings(pings, 2));
});
