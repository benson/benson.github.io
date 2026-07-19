import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { circleIntersectsCollider } from "../collision-geometry.js";
import { MAP_OBSTACLES } from "../data.js";
import { TERRAIN_PROPS, TERRAIN_PROP_COLLIDERS, terrainPropsForSlots } from "../terrain-props.js";

function worldPoint(collider, pixelX, pixelY) {
  const { mask, transform } = collider;
  return {
    x: transform.x + (pixelX / mask.width - transform.anchor[0]) * transform.width,
    y: transform.y + (pixelY / mask.height - transform.anchor[1]) * transform.height,
  };
}

test("every legacy placement envelope expands into image-fitted terrain props", () => {
  assert.deepEqual(terrainPropsForSlots(MAP_OBSTACLES), TERRAIN_PROPS);
  assert.equal(TERRAIN_PROP_COLLIDERS.length, TERRAIN_PROPS.length);
  assert.ok(TERRAIN_PROPS.length > MAP_OBSTACLES.length);
  assert.ok(TERRAIN_PROPS.every((prop) => prop.collider.mask && prop.collider.transform));
  assert.ok(TERRAIN_PROPS.every((prop) => prop.collider.id === prop.id));
});

test("opaque artwork blocks while transparent pixels inside the same visual bounds remain open", () => {
  const collider = TERRAIN_PROP_COLLIDERS[0], { mask } = collider;
  let opaque = null, transparent = null;
  for (let row = 0; row < mask.height && (!opaque || !transparent); row++) {
    const runs = mask.rows[row];
    if (!opaque && runs.length) opaque = worldPoint(collider, (runs[0] + runs[1]) / 2, row + .5);
    if (!transparent) {
      let cursor = 0;
      for (let index = 0; index <= runs.length; index += 2) {
        const end = index < runs.length ? runs[index] : mask.width;
        if (end - cursor >= 8) { transparent = worldPoint(collider, (cursor + end) / 2, row + .5); break; }
        cursor = runs[index + 1] ?? mask.width;
      }
    }
  }
  assert.ok(opaque && transparent);
  assert.equal(circleIntersectsCollider(opaque.x, opaque.y, .01, collider), true);
  assert.equal(circleIntersectsCollider(transparent.x, transparent.y, .01, collider), false);
});

test("terrain rendering has no broad rectangular backing or fallback", () => {
  const source = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const start = source.indexOf("drawTerrainProp(map, prop");
  const end = source.indexOf("\n  drawGroundedQueue", start);
  const drawTerrainProp = source.slice(start, end);

  assert.match(drawTerrainProp, /prop\.collider/);
  assert.match(drawTerrainProp, /mask\.rows/);
  assert.doesNotMatch(drawTerrainProp, /collider\.bounds/);
});
