import test from "node:test";
import assert from "node:assert/strict";
import { MAP_OBSTACLES } from "../data.js";
import { circleIntersectsCollider } from "../collision-geometry.js";
import {
  ENVIRONMENT_CHUNK_MAP_IDS, ENVIRONMENT_CHUNK_QUALITY_TIERS, LASTLIGHT_ENVIRONMENT_CHUNKS,
  environmentChunkClearance, environmentChunkCollider, environmentChunkCollisionRect, environmentChunkLayout, environmentChunkObstacles, environmentChunksForBounds,
  stableChunkUnit, validateEnvironmentChunks,
} from "../environment-chunks.js";

function recursivelyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen);
}

test("the authored environment chunk contract is strict, immutable, and complete", () => {
  assert.deepEqual(validateEnvironmentChunks(LASTLIGHT_ENVIRONMENT_CHUNKS), []);
  assert.ok(recursivelyFrozen(LASTLIGHT_ENVIRONMENT_CHUNKS));
  assert.deepEqual(Object.keys(LASTLIGHT_ENVIRONMENT_CHUNKS.maps), [...ENVIRONMENT_CHUNK_MAP_IDS]);
  assert.deepEqual(Object.keys(LASTLIGHT_ENVIRONMENT_CHUNKS.budgets), [...ENVIRONMENT_CHUNK_QUALITY_TIERS]);
  for (const mapId of ENVIRONMENT_CHUNK_MAP_IDS) {
    const map = LASTLIGHT_ENVIRONMENT_CHUNKS.maps[mapId];
    assert.equal(map.frames.length, 4);
    assert.equal(new Set(map.frames.map(({ id }) => id)).size, 4);
    assert.equal(map.collision, "solid");
    assert.equal(map.readability, "raised-cover");
    assert.ok(map.frames.every(({ collision, layer, collisionMask }) => collision === "solid" && layer === "grounded"
      && collisionMask.width === 627 && collisionMask.height === 627
      && collisionMask.rows.length === collisionMask.height && collisionMask.rows.some((row) => row.length)));
  }
  const invalid = structuredClone(LASTLIGHT_ENVIRONMENT_CHUNKS);
  invalid.maps.lab.frames[0].collision = "none";
  assert.match(validateEnvironmentChunks(invalid).join("\n"), /invalid index\/layer\/collision/);
});

test("world layouts are deterministic, map-authored, and exact at every quality tier", () => {
  for (const mapId of ENVIRONMENT_CHUNK_MAP_IDS) {
    const layouts = Object.fromEntries(ENVIRONMENT_CHUNK_QUALITY_TIERS.map((tier) => [tier, environmentChunkLayout({ mapId, tier, obstacles: MAP_OBSTACLES })]));
    assert.equal(layouts.high.length, 8);
    assert.equal(layouts.reduced.length, 8);
    assert.equal(layouts.minimal.length, 8);
    assert.deepEqual(layouts.high, environmentChunkLayout({ mapId, tier: "high", obstacles: MAP_OBSTACLES }));
    assert.deepEqual(layouts.reduced, layouts.high);
    assert.deepEqual(layouts.minimal, layouts.high);
    assert.deepEqual([...layouts.high.reduce((counts, { frame }) => counts.set(frame, (counts.get(frame) || 0) + 1), new Map()).values()].sort(), [2, 2, 2, 2]);
    for (const chunk of layouts.high) {
      assert.equal(chunk.mapId, mapId);
      assert.equal(chunk.collision, "solid");
      assert.deepEqual(chunk.collisionRect, environmentChunkCollisionRect(chunk));
      assert.deepEqual(chunk.collider, environmentChunkCollider(chunk));
      assert.equal(chunk.collider.mask, LASTLIGHT_ENVIRONMENT_CHUNKS.maps[mapId].frames[chunk.frame].collisionMask);
      assert.ok(chunk.collisionRect[2] >= 60 && chunk.collisionRect[3] >= 60);
      assert.ok(environmentChunkClearance(chunk, { obstacles: MAP_OBSTACLES }));
    }
    assert.deepEqual(environmentChunkObstacles({ mapId, obstacles: MAP_OBSTACLES }), layouts.minimal.map(({ collider }) => collider));
  }
  assert.notDeepEqual(environmentChunkLayout({ mapId: "warehouse", obstacles: MAP_OBSTACLES }), environmentChunkLayout({ mapId: "lab", obstacles: MAP_OBSTACLES }));
  assert.equal(stableChunkUnit("same"), stableChunkUnit("same"));
});

test("every collider follows opaque atlas pixels and preserves transparent holes", () => {
  for (const mapId of ENVIRONMENT_CHUNK_MAP_IDS) {
    for (const chunk of environmentChunkLayout({ mapId, obstacles: MAP_OBSTACLES }).slice(0, 4)) {
      const { mask, transform } = chunk.collider;
      const cosine = Math.cos(transform.rotation), sine = Math.sin(transform.rotation), flip = transform.flipX ? -1 : 1;
      const worldPoint = (pixelX, pixelY) => {
        const localX = (pixelX / mask.width - transform.anchor[0]) * transform.width * flip;
        const localY = (pixelY / mask.height - transform.anchor[1]) * transform.height;
        return [transform.x + localX * cosine - localY * sine, transform.y + localX * sine + localY * cosine];
      };
      const solidRow = mask.rows.findIndex((row) => row.length);
      const solidRun = mask.rows[solidRow];
      const [solidX, solidY] = worldPoint((solidRun[0] + solidRun[1]) / 2, solidRow + .5);
      assert.equal(circleIntersectsCollider(solidX, solidY, 0, chunk.collider), true, `${mapId} opaque pixel must collide`);

      let transparent = null;
      for (let row = mask.bounds[1]; row < mask.bounds[3] && !transparent; row++) {
        const runs = mask.rows[row] || [];
        for (let column = mask.bounds[0]; column < mask.bounds[2]; column++) {
          const opaque = runs.some((value, index) => index % 2 === 0 && column >= value && column < runs[index + 1]);
          if (!opaque) { transparent = [column + .5, row + .5]; break; }
        }
      }
      assert.ok(transparent, `${mapId} frame exposes a transparent interior/corner sample`);
      const [clearX, clearY] = worldPoint(...transparent);
      assert.equal(circleIntersectsCollider(clearX, clearY, 0, chunk.collider), false, `${mapId} transparent pixel must stay traversable`);
    }
  }
});

test("viewport culling is a pure subset of the bounded world layout", () => {
  const layout = environmentChunkLayout({ mapId: "beachhead", obstacles: MAP_OBSTACLES });
  const bounds = { left: -500, top: -500, right: 500, bottom: 500 };
  const visible = environmentChunksForBounds({ mapId: "beachhead", bounds, obstacles: MAP_OBSTACLES });
  const cached = environmentChunksForBounds({ mapId: "beachhead", bounds, obstacles: MAP_OBSTACLES, layout });
  assert.ok(visible.length < layout.length);
  assert.deepEqual(cached, visible);
  assert.ok(visible.every(({ id }) => layout.some((chunk) => chunk.id === id)));
  assert.throws(() => environmentChunksForBounds({ mapId: "beachhead", bounds, layout: {} }), /chunk layout/);
  assert.throws(() => environmentChunksForBounds({ mapId: "beachhead", bounds: { left: 0 } }), /viewport bounds/);
});
