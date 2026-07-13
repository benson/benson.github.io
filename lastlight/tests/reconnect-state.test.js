import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPARTED_HOLD_TICKS, RECONNECT_DELAYS_MS, RECONNECT_WINDOW_TICKS, RESTORED_HOLD_TICKS,
  SquadPresenceTracker, authorityStateCopy,
} from "../reconnect-state.js";

const player = (id = "first", replaySlot = 0, extra = {}) => ({ id, replaySlot, name: "Echo", specialist: "echo", hp: 8, maxHp: 10, shield: 2, ...extra });

test("authority recovery copy distinguishes transport, synchronization, migration, restoration, and terminal reasons", () => {
  assert.deepEqual(RECONNECT_DELAYS_MS, [400, 800, 1_500, 3_000, 5_000, 8_000]);
  assert.match(authorityStateCopy("reconnecting", { attempt: 1, nextRetryMs: 800 }).progress, /Attempt 2 of 6 in 0\.8 seconds/);
  assert.match(authorityStateCopy("synchronizing").copy, /loadout/);
  assert.match(authorityStateCopy("migrating", { tick: 360 }).copy, /tick 360/);
  assert.equal(authorityStateCopy("restored").terminal, false);
  for (const [reason, title] of [["no-checkpoint", "NO SAFE CHECKPOINT"], ["no-compatible-successor", "NO COMPATIBLE SUCCESSOR"], ["disabled", "RECOVERY DISABLED"], ["missing-candidate-state", "RESTORE STATE MISSING"], ["reconnect-exhausted", "RELAY UNREACHABLE"]]) {
    assert.equal(authorityStateCopy("unavailable", { reason }).title, title);
  }
});

test("presence is keyed by anonymous replay slot and preserves last visible public state", () => {
  const tracker = new SquadPresenceTracker();
  tracker.reset([player()], 20);
  tracker.disconnect({ id: "first" }, 30);
  assert.deepEqual(tracker.view()[0], {
    id: "first", replaySlot: 0, name: "Echo", specialist: "echo", hp: 8, maxHp: 10, shield: 2,
    status: "reconnecting", statusSinceTick: 30, deadlineTick: 30 + RECONNECT_WINDOW_TICKS,
  });
  assert.doesNotMatch(JSON.stringify(tracker.view()), /token|callsign|room/i);
});

test("the recovery boundary is inclusive and restoration retains the same seat", () => {
  const within = new SquadPresenceTracker(); within.reset([player()], 0); within.disconnect(player(), 10);
  const restored = within.restore(player("replacement", 0, { hp: 7 }), 10 + RECONNECT_WINDOW_TICKS);
  assert.equal(restored.status, "restored"); assert.equal(restored.id, "replacement"); assert.equal(restored.replaySlot, 0);

  const expired = new SquadPresenceTracker(); expired.reset([player()], 0); expired.disconnect(player(), 10);
  expired.advance(11 + RECONNECT_WINDOW_TICKS);
  assert.equal(expired.view()[0].status, "departed");
  const newcomer = expired.restore(player("newcomer", 0), 12 + RECONNECT_WINDOW_TICKS);
  assert.equal(newcomer.status, "connected"); assert.equal(newcomer.id, "newcomer");
});

test("stale active snapshots cannot falsely restore a disconnected seat", () => {
  const tracker = new SquadPresenceTracker(); tracker.reset([player()], 0); tracker.disconnect(player(), 4);
  tracker.observe([player("first", 0, { hp: 6 })], 5);
  assert.equal(tracker.view()[0].status, "reconnecting");
  tracker.observe([player("second", 0, { hp: 6 })], 6);
  assert.equal(tracker.view()[0].status, "restored");
});

test("duplicate events are idempotent and a different seat cannot claim recovery", () => {
  const tracker = new SquadPresenceTracker(); tracker.reset([player(), player("other", 1)], 0);
  const first = tracker.disconnect({ id: "first" }, 10), duplicate = tracker.disconnect({ id: "first" }, 11);
  assert.equal(duplicate.statusSinceTick, first.statusSinceTick);
  tracker.restore(player("other-new", 1), 12);
  assert.equal(tracker.view().find(({ replaySlot }) => replaySlot === 0).status, "reconnecting");
  assert.equal(tracker.view().find(({ replaySlot }) => replaySlot === 1).id, "other-new");
});

test("restored and departed presentation holds expire without leaking stale seats", () => {
  const tracker = new SquadPresenceTracker(); tracker.reset([player()], 0); tracker.disconnect(player(), 1); tracker.restore(player("returned"), 2);
  tracker.advance(2 + RESTORED_HOLD_TICKS - 1); assert.equal(tracker.view()[0].status, "restored");
  tracker.advance(2 + RESTORED_HOLD_TICKS); assert.equal(tracker.view()[0].status, "connected");
  tracker.disconnect(player("returned"), 200); tracker.depart(0, 201);
  tracker.advance(201 + DEPARTED_HOLD_TICKS - 1); assert.equal(tracker.view()[0].status, "departed");
  tracker.advance(201 + DEPARTED_HOLD_TICKS); assert.equal(tracker.view().length, 0);
});

test("invalid or identity-bearing-shaped presence inputs are rejected or normalized", () => {
  const tracker = new SquadPresenceTracker();
  assert.throws(() => tracker.connect(player("x", 4)), /replay slot/);
  assert.throws(() => tracker.connect(player("x", 0, { specialist: "<script>" })), /specialist/);
  tracker.connect(player("x", 0, { name: "A".repeat(100) }));
  assert.equal(tracker.view()[0].name.length, 32);
});
