import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CORRIDOR_CANDIDATES,
  accumulateMovementDistance,
  bestCorridorTarget,
  movementDistance,
  nearestUnhitTarget,
  orderEntitiesByDistance,
  scoreCorridorCandidates,
} from "../projectile-decisions.js";

const entity = (id, x, y, radius) => ({ id, x, y, ...(radius === undefined ? {} : { radius }) });

test("entities are ordered by distance then stable id without mutating input", () => {
  const input = [entity("far", 4, 0), entity("z", 0, 2), entity("a", 0, -2), entity("near", 1, 0)];
  assert.deepEqual(orderEntitiesByDistance({ x: 0, y: 0 }, input).map(({ id }) => id), ["near", "a", "z", "far"]);
  assert.deepEqual(input.map(({ id }) => id), ["far", "z", "a", "near"]);
});

test("nearest unhit target is range bounded with deterministic ties", () => {
  const targets = [entity("z", 3, 4), entity("a", -3, -4), entity("near-hit", 2, 0), entity("outside", 5.01, 0)];
  assert.equal(nearestUnhitTarget({ x: 0, y: 0 }, targets, { range: 5, hitIds: new Set(["near-hit"]) }).id, "a");
  assert.equal(nearestUnhitTarget({ x: 0, y: 0 }, targets, { range: 1 }), null);
  assert.equal(nearestUnhitTarget({ x: 0, y: 0 }, targets, { hitIds: ["near-hit", "a", "z", "outside"] }), null);
});

test("corridor scoring is bounded and ranks score, distance, then id", () => {
  const aligned = [entity("z", 10, 0), entity("a", 10, 0), entity("far", 20, 0), entity("side", 0, 10)];
  const ranked = scoreCorridorCandidates({ x: 0, y: 0 }, aligned, { range: 25, halfWidth: 1 });
  assert.deepEqual(ranked.map(({ entity: target }) => target.id), ["a", "z", "far", "side"]);
  assert.deepEqual(ranked.map(({ score }) => score), [3, 3, 3, 1]);
  assert.deepEqual(ranked[0].direction, { x: 1, y: 0 });
  assert.equal(bestCorridorTarget({ x: 0, y: 0 }, aligned, { range: 25, halfWidth: 1 }).entity.id, "a");

  const crowded = Array.from({ length: 20 }, (_, index) => entity(`e${String(index).padStart(2, "0")}`, index + 1, index % 2));
  assert.equal(scoreCorridorCandidates({ x: 0, y: 0 }, crowded, { range: 100, halfWidth: 2 }).length, MAX_CORRIDOR_CANDIDATES);
  assert.equal(scoreCorridorCandidates({ x: 0, y: 0 }, crowded, { range: 100, halfWidth: 2, maxCandidates: 4 }).length, 4);
});

test("corridor width includes authored target radius and hit ids are caller controlled", () => {
  const targets = [entity("aim", 10, 0), entity("large", 15, 3, 2.1), entity("miss", 15, 3, 1.9)];
  const ranked = scoreCorridorCandidates({ x: 0, y: 0 }, targets, { range: 20, halfWidth: 1, hitIds: ["miss"] });
  assert.equal(ranked.find(({ entity: target }) => target.id === "aim").score, 2);
  assert.deepEqual(ranked.map(({ entity: target }) => target.id).sort(), ["aim", "large"]);
});

test("movement helpers accumulate path length rather than displacement", () => {
  assert.equal(movementDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  const first = accumulateMovementDistance(0, { x: 0, y: 0 }, { x: 3, y: 4 });
  assert.equal(accumulateMovementDistance(first, { x: 3, y: 4 }, { x: 0, y: 8 }), 10);
});

test("invalid, ambiguous, and nonfinite inputs fail closed", () => {
  assert.throws(() => orderEntitiesByDistance({ x: Number.NaN, y: 0 }, []), /origin\.x must be finite/);
  assert.throws(() => orderEntitiesByDistance({ x: 0, y: 0 }, [entity("same", 0, 0), entity("same", 1, 0)]), /must be unique/);
  assert.throws(() => orderEntitiesByDistance({ x: 0, y: 0 }, [entity("bad", Infinity, 0)]), /must be finite/);
  assert.throws(() => nearestUnhitTarget({ x: 0, y: 0 }, [], { range: Infinity }), /range must be finite/);
  assert.throws(() => nearestUnhitTarget({ x: 0, y: 0 }, [], { hitIds: "id" }), /hitIds must be an iterable/);
  assert.throws(() => scoreCorridorCandidates({ x: 0, y: 0 }, [], { range: 10, halfWidth: 1, maxCandidates: 13 }), /integer from 1 to 12/);
  assert.throws(() => scoreCorridorCandidates({ x: 0, y: 0 }, [], { range: 10, halfWidth: -1 }), /halfWidth must be nonnegative/);
  assert.throws(() => movementDistance({ x: 0, y: 0 }, { x: 1, y: Number.NaN }), /current\.y must be finite/);
  assert.throws(() => accumulateMovementDistance(-1, { x: 0, y: 0 }, { x: 1, y: 0 }), /total must be nonnegative/);
});
