import test from "node:test";
import assert from "node:assert/strict";
import { MAP_OBSTACLES } from "../data.js";
import { Simulation, coverObstaclesForMap, segmentCoverImpact } from "../engine.js";
import { environmentChunkLayout } from "../environment-chunks.js";

const SEED = "1234567890abcdef1234567890abcdef";

test("every operation promotes eight visible landmarks into deterministic solid cover", () => {
  for (const mapId of ["warehouse", "outskirts", "lab", "beachhead"]) {
    const layout = environmentChunkLayout({ mapId, tier: "minimal", obstacles: MAP_OBSTACLES });
    const obstacles = coverObstaclesForMap(mapId);
    assert.equal(layout.length, 8);
    assert.equal(obstacles.length, MAP_OBSTACLES.length + 8);
    assert.deepEqual(obstacles.slice(MAP_OBSTACLES.length), layout.map(({ collider }) => collider));
  }
});

test("authored structures block specialists, enemies, and ordinary projectile segments", () => {
  const simulation = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [{ id: "p", name: "P", specialist: "zuri" }] }, { seed: SEED });
  const [chunk] = environmentChunkLayout({ mapId: "warehouse", tier: "minimal", obstacles: MAP_OBSTACLES });
  const [left, top, width, height] = chunk.collisionRect, player = simulation.players[0];
  player.x = left - player.radius - 2; player.y = top + height / 2;
  simulation.movePlayer(player, width + player.radius * 2 + 20, 0);
  assert.ok(player.x <= left - player.radius + .01);

  const enemy = simulation.spawnEnemy("brute", { x: left - 180, y: top + height / 2 });
  const before = enemy.x;
  simulation.moveEnemy(enemy, 0, 400);
  assert.ok(enemy.x > before);
  assert.ok(enemy.x <= left - enemy.radius + .01);

  const impact = segmentCoverImpact(left - 120, top + height / 2, left + width + 120, top + height / 2, 6, simulation.coverObstacles);
  assert.ok(impact);
  assert.ok(impact.obstacleIndex >= MAP_OBSTACLES.length);
  assert.ok(impact.x >= left - 6 && impact.x <= left + width + 6, "impact follows the opaque silhouette rather than the broad bounds edge");
});

test("solid layout remains client-derived instead of entering snapshots", () => {
  const simulation = new Simulation({ map: "lab", difficulty: "story", duration: 240, players: [{ id: "p", name: "P", specialist: "echo" }] }, { seed: SEED });
  const snapshot = simulation.snapshot();
  assert.equal(Object.hasOwn(snapshot, "coverObstacles"), false);
  assert.equal(Object.hasOwn(snapshot, "environmentChunks"), false);
  assert.equal(simulation.coverObstacles, coverObstaclesForMap("lab"));
});
