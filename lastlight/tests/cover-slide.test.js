import test from "node:test";
import assert from "node:assert/strict";
import { collidesWithCover, moveEntityWithCover } from "../engine.js";

const diagonalStructure = Object.freeze({
  id: "diagonal-structure",
  bounds: Object.freeze([0, 0, 200, 200]),
  parts: Object.freeze([Object.freeze({ points: Object.freeze([[0, 0], [200, 0], [0, 200]].map(Object.freeze)) })]),
});

test("held diagonal movement sweeps to fitted cover and preserves surface tangent", () => {
  const entity = { x: 140, y: 140, radius: 10 };
  moveEntityWithCover(entity, -100, -60, [diagonalStructure]);
  assert.ok(entity.x < 90, `expected meaningful leftward slide, got ${entity.x}`);
  assert.ok(entity.y > 125, `expected the diagonal face to carry movement downward, got ${entity.y}`);
  assert.equal(collidesWithCover(entity.x, entity.y, entity.radius, [diagonalStructure]), false);

  const before = { ...entity };
  moveEntityWithCover(entity, -10, -6, [diagonalStructure]);
  assert.ok(entity.x < before.x && entity.y > before.y, "continued held input glides along the same exact face");
  assert.equal(collidesWithCover(entity.x, entity.y, entity.radius, [diagonalStructure]), false);
});

test("compound slide resolution is byte-deterministic for identical movement", () => {
  const left = { x: 140, y: 140, radius: 10 }, right = { ...left };
  for (let frame = 0; frame < 30; frame++) {
    moveEntityWithCover(left, -10, -6, [diagonalStructure]);
    moveEntityWithCover(right, -10, -6, [diagonalStructure]);
  }
  assert.deepEqual(left, right);
});
