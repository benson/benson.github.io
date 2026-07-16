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
  simulation.coverObstacles = [chunk.collider];
  player.x = left - player.radius - 2; player.y = top + height / 2;
  const playerImpact = segmentCoverImpact(player.x, player.y, player.x + width + player.radius * 2 + 20, player.y, player.radius, simulation.coverObstacles);
  assert.ok(playerImpact);
  simulation.movePlayer(player, width + player.radius * 2 + 20, 0);
  assert.ok(player.x < left + width / 2, "specialist cannot cross the exact opaque silhouette");
  assert.equal(simulation.collidesWithCover(player.x, player.y, player.radius), false);

  const enemy = simulation.spawnEnemy("brute", { x: left - 180, y: top + height / 2 });
  const before = enemy.x;
  const enemyImpact = segmentCoverImpact(enemy.x, enemy.y, enemy.x + 400, enemy.y, enemy.radius, simulation.coverObstacles);
  assert.ok(enemyImpact);
  simulation.moveEnemy(enemy, 0, 400);
  assert.ok(enemy.x > before);
  assert.ok(enemy.x < left + width / 2, "enemy cannot cross the same exact opaque silhouette");
  assert.equal(simulation.collidesWithCover(enemy.x, enemy.y, enemy.radius), false);

  const impact = segmentCoverImpact(left - 120, top + height / 2, left + width + 120, top + height / 2, 6, [chunk.collider]);
  assert.ok(impact);
  assert.equal(impact.obstacleIndex, 0);
  assert.ok(impact.x >= left - 6 && impact.x <= left + width + 6, "impact follows the opaque silhouette rather than the broad bounds edge");
});

test("solid layout remains client-derived instead of entering snapshots", () => {
  const simulation = new Simulation({ map: "lab", difficulty: "story", duration: 240, players: [{ id: "p", name: "P", specialist: "echo" }] }, { seed: SEED });
  const snapshot = simulation.snapshot();
  assert.equal(Object.hasOwn(snapshot, "coverObstacles"), false);
  assert.equal(Object.hasOwn(snapshot, "environmentChunks"), false);
  assert.equal(simulation.coverObstacles, coverObstaclesForMap("lab"));
});
