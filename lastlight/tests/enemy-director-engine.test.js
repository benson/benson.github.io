import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, WORLD, collidesWithCover } from "../engine.js";
import { gameplayFeatureContract, DEFAULT_RUNTIME_CONFIG } from "../feature-config.js";

const SEED = "89abcdef0123456776543210fedcba98";
const baseFeatures = gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG);
const players = (count) => Array.from({ length: count }, (_, replaySlot) => ({ id: `p${replaySlot}`, name: `P${replaySlot}`, specialist: ["zuri", "echo", "sola", "bront"][replaySlot], replaySlot }));
const simulation = (count, director = true) => new Simulation({
  map: "warehouse", difficulty: "story", duration: 240, players: players(count),
  features: { ...baseFeatures, squadEnemyDirector: director },
}, { seed: SEED, features: { ...baseFeatures, squadEnemyDirector: director } });

test("solo director-on uses the exact legacy spawn stream", () => {
  const enabled = simulation(1, true), disabled = simulation(1, false);
  enabled.time = disabled.time = 150; enabled.spawnClock = disabled.spawnClock = 8;
  enabled.updateSpawns(0); disabled.updateSpawns(0);
  assert.deepEqual(enabled.enemies, disabled.enemies);
  assert.deepEqual(enabled.gameplayRng.snapshot(), disabled.gameplayRng.snapshot());
  assert.equal(enabled.directorState.sequence, 0);
});

test("multiplayer spawns bounded authored formations outside solid cover", () => {
  const sim = simulation(4);
  sim.time = 180; sim.spawnClock = .9; sim.updateSpawns(0);
  assert.ok(sim.enemies.length > 0 && sim.enemies.length <= 4);
  assert.ok(sim.enemies.every((enemy) => enemy.directorApproach && enemy.directorFormation));
  assert.ok(sim.enemies.every((enemy) => Math.abs(enemy.x) <= WORLD.width / 2 && Math.abs(enemy.y) <= WORLD.height / 2));
  assert.ok(sim.enemies.every((enemy) => !collidesWithCover(enemy.x, enemy.y, enemy.radius)));
  assert.ok(sim.directorState.sequence > 0);
});

test("an active directive receives approach pressure without changing objective rules", () => {
  const sim = simulation(3);
  sim.time = 170; sim.spawnClock = .9; sim.directorState = { ...sim.directorState, sequence: 2 };
  sim.objectives.push({ id: "objective", x: 500, y: -200, radius: 85, progress: .4, life: 20, kind: "uplink", beganTick: sim.tick });
  sim.updateSpawns(0);
  assert.ok(sim.enemies.some((enemy) => enemy.directorApproach === "objective"));
  assert.equal(sim.objectives[0].progress, .4); assert.equal(sim.objectives[0].life, 20);
  assert.equal(sim.directorState.metrics.objectivePressure, 1);
});

test("larger squads add ordinary elite escorts without duplicate key rewards", () => {
  const sim = simulation(4);
  sim.time = 150; sim.nextElite = 0; sim.nextMiniBoss = 999; sim.nextTreasure = 999; sim.nextRelayBall = 999;
  sim.updateScheduledEvents();
  const elite = sim.enemies.find((enemy) => enemy.elite && !enemy.eventType);
  const escorts = sim.enemies.filter((enemy) => enemy.directorApproach === "elite-escort");
  assert.ok(elite); assert.equal(escorts.length, 3); assert.ok(escorts.every((enemy) => !enemy.elite));
  for (const escort of escorts) sim.killEnemy(escort, sim.players[0].id);
  assert.equal(sim.drops.filter((drop) => drop.type === "card").length, 0);
  sim.killEnemy(elite, sim.players[0].id);
  assert.equal(sim.drops.filter((drop) => drop.type === "card").length, 1);
});

test("director state survives recovery exactly and rejects malformed metrics", () => {
  const sim = simulation(3); sim.time = 180; sim.spawnClock = 8; sim.updateSpawns(0);
  const exported = sim.exportRecoveryState(), restored = Simulation.fromRecoveryState(exported);
  assert.deepEqual(restored.directorState, sim.directorState);
  const bad = structuredClone(exported); bad.directorState.metrics["approach:pincer"] = -1;
  assert.throws(() => Simulation.fromRecoveryState(bad), /director metric/);
});
