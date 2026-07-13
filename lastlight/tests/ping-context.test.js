import test from "node:test";
import assert from "node:assert/strict";
import { createPingRequest } from "../ping-contract.js";
import { resolveContextualPing } from "../ping-context.js";

const game = (fields = {}) => ({
  stage: "running",
  players: [{ id: "peer", replaySlot: 1, x: 10, y: 20 }, { id: "ally", replaySlot: 2, x: 80, y: 20 }],
  enemies: [{ id: "b", x: 110, y: 100 }, { id: "a", x: 90, y: 100 }],
  hostile: [], objectives: [{ id: "objective", x: 200, y: 100 }], relayBalls: [],
  drops: [{ id: "drop", x: 300, y: 100 }], orbs: [], pods: [{ id: "cache", x: 400, y: 100 }],
  ...fields,
});
const request = (intent, x, y, targetKind = "ground", fields = {}) => ({
  ...createPingRequest({ epoch: 0, seq: 1, tick: 20, intent, x, y, targetKind }),
  _from: "peer", replaySlot: 1, ...fields,
});

test("the host resolves each contextual family from current authoritative state", () => {
  assert.deepEqual(resolveContextualPing(game(), request("danger", 100, 100)), { x: 90, y: 100, targetKind: "enemy" });
  assert.deepEqual(resolveContextualPing(game(), request("objective", 190, 100)), { x: 200, y: 100, targetKind: "objective" });
  assert.deepEqual(resolveContextualPing(game(), request("pickup", 305, 100)), { x: 300, y: 100, targetKind: "pickup" });
  assert.deepEqual(resolveContextualPing(game(), request("recommendation", 395, 100, "cache")), { x: 400, y: 100, targetKind: "cache" });
  assert.deepEqual(resolveContextualPing(game(), request("help", 999, 999)), { x: 10, y: 20, targetKind: "ally" });
  assert.deepEqual(resolveContextualPing(game(), request("regroup", 50, 60)), { x: 50, y: 60, targetKind: "ground" });
});

test("context resolution rejects spoofing, stale stages, and sender-distant targets", () => {
  assert.equal(resolveContextualPing(game(), request("danger", 1500, 1000)), null);
  assert.equal(resolveContextualPing(game({ stage: "won" }), request("danger", 100, 100)), null);
  assert.equal(resolveContextualPing(game(), request("danger", 100, 100, "ground", { replaySlot: 3 })), null);
});

test("equal-distance targets resolve by stable entity id without mutating host state", () => {
  const state = game({ enemies: [{ id: "z", x: 90, y: 100 }, { id: "a", x: 110, y: 100 }] });
  const before = JSON.stringify(state);
  assert.deepEqual(resolveContextualPing(state, request("danger", 100, 100)), { x: 110, y: 100, targetKind: "enemy" });
  assert.equal(JSON.stringify(state), before);
});
