import test from "node:test";
import assert from "node:assert/strict";
import {
  GuestInputSequenceTracker, HostInputSequenceGate, MAX_INPUT_SEQUENCE, MAX_PENDING_INPUTS,
  MULTIPLAYER_PROTOCOL_VERSION, createSnapshotMessage, sanitizeInputMessage, sanitizeSnapshotMessage,
} from "../protocol.js";
import { ReplayRecorder } from "../replay.js";

const input = { x: 1, y: 0, aim: .5, autoAim: true };
const modern = (seq) => ({ type: "input", protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, seq, input, _from: "guest-1" });

test("host applies only newer valid v2 sequences", () => {
  const gate = new HostInputSequenceGate();
  assert.equal(gate.apply("guest-1", modern(4)).accepted, true);
  assert.deepEqual(gate.acknowledgements(), { "guest-1": 4 });
  assert.equal(gate.apply("guest-1", modern(4)).reason, "stale-sequence");
  assert.equal(gate.apply("guest-1", modern(3)).reason, "stale-sequence");
  assert.equal(gate.apply("guest-1", modern(6)).accepted, true);
  assert.deepEqual(gate.diagnostics(), { protocolVersion: 2, sequencedPeers: 1, rejectedStale: 2, rejectedInvalid: 0 });
});

test("deterministic replay records accepted host order without transport metadata", () => {
  const gate = new HostInputSequenceGate();
  const recorder = new ReplayRecorder({
    build: "2026.07.11.4", balanceVersion: "2026.07.11-baseline.1", balanceHash: "fnv1a32:7e33be79",
    rng: "xoshiro128ss-v1", seed: "0123456789abcdef0123456789abcdef",
    run: { map: "warehouse", difficulty: "story", duration: 240 },
  });
  recorder.registerPlayer("guest-1", "zuri", { slot: 0, initial: true });
  for (const message of [modern(8), modern(7), { ...modern(10), input: { ...input, y: 1 } }]) {
    const accepted = gate.apply("guest-1", message);
    if (accepted.accepted) recorder.recordInput("guest-1", 12, accepted.input);
  }
  recorder.addCheckpoint(0, "0000000000000000");
  const replay = recorder.finalize(12, "1111111111111111");
  assert.equal(replay.commands.length, 2);
  assert.doesNotMatch(JSON.stringify(replay), /protocolVersion|"seq"|guest-1/);
});

test("rolling compatibility accepts legacy input only before that peer speaks v2", () => {
  const gate = new HostInputSequenceGate(), legacy = { type: "input", input, _from: "guest-1" };
  assert.deepEqual(gate.apply("guest-1", legacy), { accepted: true, legacy: true, input });
  gate.apply("guest-1", modern(0));
  assert.equal(gate.apply("guest-1", legacy).reason, "legacy-after-v2");
  gate.remove("guest-1");
  assert.equal(gate.apply("guest-1", legacy).accepted, true);
});

test("input and acknowledgement schemas are exact and bounded", () => {
  assert.throws(() => sanitizeInputMessage({ ...modern(1), surprise: true }, { transport: true }), /unsupported/);
  assert.throws(() => sanitizeInputMessage(modern(MAX_INPUT_SEQUENCE + 1), { transport: true }), /sequence/);
  assert.throws(() => sanitizeInputMessage({ ...modern(1), input: { ...input, x: 2 } }, { transport: true }), /input x/);
  assert.throws(() => createSnapshotMessage({}, { a: 1, b: 2, c: 3, d: 4, e: 5 }), /squad bounds/);
});

test("guest tracks bounded pending inputs and acknowledgement health without identity", () => {
  const tracker = new GuestInputSequenceTracker();
  assert.equal(tracker.create(input, 100).seq, 0);
  assert.equal(tracker.create(input, 110).seq, 1);
  assert.equal(tracker.acknowledge(0, 150), true);
  assert.deepEqual(tracker.diagnostics(175), {
    protocolVersion: 2, mode: "v2", lastSentSequence: 1, lastAcknowledgedSequence: 0,
    pendingInputs: 1, oldestPendingMs: 65, acknowledgementAgeMs: 25,
    droppedPending: 0, invalidAcknowledgements: 0,
  });
  assert.doesNotMatch(JSON.stringify(tracker.diagnostics(175)), /guest|player|room|token/i);
  assert.equal(tracker.acknowledge(8, 180), false);
  for (let index = 0; index < MAX_PENDING_INPUTS + 10; index++) tracker.create(input, 200 + index);
  assert.equal(tracker.diagnostics(999).pendingInputs, MAX_PENDING_INPUTS);
  assert.equal(tracker.diagnostics(999).droppedPending, 11);
  tracker.reset();
  assert.equal(tracker.diagnostics(999).pendingInputs, 0);
});

test("new snapshot envelopes acknowledge v2 while legacy snapshots remain readable", () => {
  const snapshot = createSnapshotMessage({ level: 3 }, { "guest-1": 9 });
  assert.deepEqual(sanitizeSnapshotMessage(snapshot), snapshot);
  assert.deepEqual(sanitizeSnapshotMessage({ type: "snapshot", state: { level: 2 } }), { type: "snapshot", state: { level: 2 } });
  assert.throws(() => sanitizeSnapshotMessage({ ...snapshot, ack: { "bad id": 1 } }), /player id/);
});
