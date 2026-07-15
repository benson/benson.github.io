import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";

const create = () => new Simulation({
  map: "warehouse", difficulty: "story", duration: 240,
  players: [{ id: "p1", name: "One", specialist: "zuri", replaySlot: 0 }],
}, { seed: "88990000111122223333444455556666" });

test("enemy damage publishes one bounded semantic contact in snapshots", () => {
  const sim = create(), player = sim.players[0], enemy = sim.spawnEnemy("hound");
  enemy.x = player.x + 40; enemy.y = player.y;
  sim.damageEnemy(enemy, 7, player.id, true, "signature");
  const [impact] = sim.snapshot({ presentation: true }).impactEvents;
  assert.equal(impact.kind, "enemy-hit");
  assert.equal(impact.ownerId, player.id);
  assert.equal(impact.targetId, enemy.id);
  assert.equal(impact.targetKind, "hound");
  assert.equal(impact.sourceId, "signature");
  assert.equal(impact.critical, true);
  assert.ok(impact.damage > 0);
  assert.equal(impact.angle, 0);
});

test("player contacts include absorbed damage, direction, and priority metadata", () => {
  const sim = create(), player = sim.players[0], enemy = sim.spawnEnemy("brute");
  player.invuln = 0; player.hitGrace = 0; player.shield = 2;
  enemy.x = player.x - 20; enemy.y = player.y;
  sim.takeDamage(player, 4, enemy);
  const [impact] = sim.snapshot({ presentation: true }).impactEvents;
  assert.equal(impact.kind, "player-hit");
  assert.equal(impact.targetId, player.id);
  assert.equal(impact.sourceId, enemy.id);
  assert.equal(impact.damage, 4);
  assert.ok(Math.abs(impact.angle) < 1e-9);
});

test("impact ledger is capped and excluded from deterministic and recovery contracts", () => {
  const sim = create();
  for (let index = 0; index < 80; index++) sim.pushImpactEvent({ targetId: `target-${index}`, damage: 1 });
  assert.equal(sim.impactEvents.length, 64);
  assert.equal(sim.snapshot({ presentation: true }).impactEvents.length, 32);
  assert.equal("impactEvents" in sim.snapshot(), false);
  assert.equal("impact" in sim.deterministicState().sequences, false);
  assert.equal(JSON.stringify(sim.exportRecoveryState()).includes("impactEvents"), false);
});
