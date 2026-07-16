import test from "node:test";
import assert from "node:assert/strict";
import { MAP_OBSTACLES } from "../data.js";
import {
  ENVIRONMENT_CHUNK_MAP_IDS, ENVIRONMENT_CHUNK_QUALITY_TIERS, LASTLIGHT_ENVIRONMENT_CHUNKS,
  environmentChunkClearance, environmentChunkCollisionRect, environmentChunkLayout, environmentChunkObstacles, environmentChunksForBounds,
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
    assert.ok(map.frames.every(({ collision, layer, footprint }) => collision === "solid" && layer === "grounded" && footprint.length === 4));
  }
  const invalid = structuredClone(LASTLIGHT_ENVIRONMENT_CHUNKS);
  invalid.maps.lab.frames[0].collision = "none";
  assert.match(validateEnvironmentChunks(invalid).join("\n"), /invalid index\/layer\/collision/);
});

test("world layouts are deterministic, map-authored, and exact at every quality tier", () => {
  for (const mapId of ENVIRONMENT_CHUNK_MAP_IDS) {
    const layouts = Object.fromEntries(ENVIRONMENT_CHUNK_QUALITY_TIERS.map((tier) => [tier, environmentChunkLayout({ mapId, tier, obstacles: MAP_OBSTACLES })]));
    assert.equal(layouts.high.length, 4);
    assert.equal(layouts.reduced.length, 4);
    assert.equal(layouts.minimal.length, 4);
    assert.deepEqual(layouts.high, environmentChunkLayout({ mapId, tier: "high", obstacles: MAP_OBSTACLES }));
    assert.deepEqual(layouts.reduced, layouts.high);
    assert.deepEqual(layouts.minimal, layouts.high);
    assert.equal(new Set(layouts.high.map(({ frame }) => frame)).size, 4);
    for (const chunk of layouts.high) {
      assert.equal(chunk.mapId, mapId);
      assert.equal(chunk.collision, "solid");
      assert.deepEqual(chunk.collisionRect, environmentChunkCollisionRect(chunk));
      assert.ok(chunk.collisionRect[2] >= 60 && chunk.collisionRect[3] >= 60);
      assert.ok(environmentChunkClearance(chunk, { obstacles: MAP_OBSTACLES }));
    }
    assert.deepEqual(environmentChunkObstacles({ mapId, obstacles: MAP_OBSTACLES }), layouts.minimal.map(({ collisionRect }) => collisionRect));
  }
  assert.notDeepEqual(environmentChunkLayout({ mapId: "warehouse", obstacles: MAP_OBSTACLES }), environmentChunkLayout({ mapId: "lab", obstacles: MAP_OBSTACLES }));
  assert.equal(stableChunkUnit("same"), stableChunkUnit("same"));
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
