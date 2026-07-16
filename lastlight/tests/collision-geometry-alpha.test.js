import test from "node:test";
import assert from "node:assert/strict";
import { alphaMaskCollider, circleIntersectsCollider, sweptCircleColliderImpact } from "../collision-geometry.js";

const mask = Object.freeze({
  width: 5,
  height: 5,
  bounds: Object.freeze([0, 0, 5, 5]),
  rows: Object.freeze([
    Object.freeze([0, 1, 4, 5]),
    Object.freeze([0, 1, 4, 5]),
    Object.freeze([0, 5]),
    Object.freeze([0, 1, 4, 5]),
    Object.freeze([0, 1, 4, 5]),
  ]),
});

test("alpha-mask collision preserves holes under scale, rotation, and mirroring", () => {
  const collider = alphaMaskCollider("gate", mask, {
    x: 100, y: 80, width: 50, height: 100, rotation: Math.PI / 2, flipX: true, anchor: [.5, .5],
  });
  assert.equal(circleIntersectsCollider(100, 80, 0, collider), true, "opaque center bar rotates with the art");
  assert.equal(circleIntersectsCollider(70, 80, 0, collider), false, "transparent opening stays open after transform");
  assert.equal(circleIntersectsCollider(70, 80, 21, collider), true, "circle radius reaches the nearest opaque pixel");
  assert.deepEqual(collider.bounds.map((value) => Math.round(value)), [50, 55, 100, 50]);
});

test("swept collision cannot tunnel through a one-pixel alpha feature", () => {
  const thinMask = Object.freeze({ width: 8, height: 4, bounds: Object.freeze([4, 0, 5, 4]), rows: Object.freeze(Array.from({ length: 4 }, () => Object.freeze([4, 5]))) });
  const collider = alphaMaskCollider("thin", thinMask, { x: 0, y: 0, width: 80, height: 40, anchor: [.5, .5] });
  const impact = sweptCircleColliderImpact(-70, 0, 70, 0, 2, collider);
  assert.ok(impact);
  assert.ok(impact.t > .45 && impact.t < .6);
});
