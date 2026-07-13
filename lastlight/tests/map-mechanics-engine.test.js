import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract } from "../feature-config.js";
import { hashSimulationState } from "../replay.js";

const SEED = "e5b43c91a20876df319a40bc72de658f";
const currentFeatures = gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG);
const createSimulation = (map, enabled = true) => new Simulation({
  map, difficulty: "story", duration: 240,
  players: [{ id: "player", name: "Player", specialist: "zuri", replaySlot: 0 }],
  features: { ...currentFeatures, mapMechanics: enabled },
}, { seed: SEED, features: { ...currentFeatures, mapMechanics: enabled } });

test("feature-off keeps movement, damage, control, and snapshot shape on the legacy path", () => {
  const simulation = createSimulation("beachhead", false), player = simulation.players[0];
  simulation.tick = 1_350; player.x = 0; player.y = 0;
  const health = player.hp, x = player.x;
  simulation.updateMapMechanic(1 / 60);
  assert.equal(player.hp, health);
  assert.equal(player.x, x);
  assert.equal(player.mapMoveMultiplier, 1);
  assert.equal(simulation.snapshot().mapMechanic, undefined);
});

test("Freight Grid carries specialists and ordinary enemies without damaging either", () => {
  const simulation = createSimulation("warehouse"), player = simulation.players[0];
  simulation.tick = 1_020; player.x = 0; player.y = -540;
  const enemy = simulation.spawnEnemy("brute", { x: 200, y: -540 });
  const playerHealth = player.hp, enemyHealth = enemy.hp;
  simulation.updateMapMechanic(1);
  assert.ok(player.x > 80);
  assert.ok(enemy.x > 280);
  assert.equal(player.hp, playerHealth);
  assert.equal(enemy.hp, enemyHealth);
});

test("Ion Front damages both sides once per cycle and leaves apex enemies untouched", () => {
  const simulation = createSimulation("outskirts"), player = simulation.players[0];
  simulation.tick = 1_428; player.x = -720; player.y = 0; player.invuln = 0;
  const enemy = simulation.spawnEnemy("brute", { x: -720, y: 0 });
  const apex = { ...simulation.spawnEnemy("shark", { x: -720, y: 0 }), boss: true };
  simulation.enemies[simulation.enemies.length - 1] = apex;
  const playerHealth = player.hp, enemyHealth = enemy.hp, apexHealth = apex.hp;
  simulation.updateMapMechanic(1 / 60);
  const firstPlayerHealth = player.hp, firstEnemyHealth = enemy.hp;
  assert.ok(firstPlayerHealth < playerHealth);
  assert.ok(firstEnemyHealth < enemyHealth);
  assert.equal(apex.hp, apexHealth);
  simulation.updateMapMechanic(1 / 60);
  assert.equal(player.hp, firstPlayerHealth);
  assert.equal(enemy.hp, firstEnemyHealth);
});

test("Cryo Grid slows specialists and applies bounded hostile control", () => {
  const simulation = createSimulation("lab"), player = simulation.players[0];
  simulation.tick = 900; player.x = -500; player.y = 0;
  const enemy = simulation.spawnEnemy("hound", { x: -500, y: 0 });
  simulation.updateMapMechanic(1 / 60);
  assert.equal(player.mapMoveMultiplier, .7);
  assert.ok(enemy.stun >= .17 && enemy.stun <= .18);
});

test("Undertow combines a once-per-cycle bruise, slow, and directional displacement", () => {
  const simulation = createSimulation("beachhead"), player = simulation.players[0];
  simulation.tick = 1_350; player.x = 0; player.y = 0; player.invuln = 0;
  const enemy = simulation.spawnEnemy("mite", { x: 20, y: 0 });
  const playerHealth = player.hp;
  simulation.updateMapMechanic(1);
  assert.ok(player.hp < playerHealth);
  assert.equal(player.mapMoveMultiplier, .82);
  assert.ok(player.x > 100);
  assert.ok(enemy.x > 120);
});

test("map composition changes the authored spawn stream while rollback stays map-neutral", () => {
  const sequence = (map, enabled) => {
    const simulation = createSimulation(map, enabled);
    simulation.time = 180; simulation.remaining = 60; simulation.spawnClock = 20;
    simulation.updateSpawns(0);
    return simulation.enemies.map(({ type }) => type);
  };
  assert.deepEqual(sequence("warehouse", false), sequence("beachhead", false));
  const active = ["warehouse", "outskirts", "lab", "beachhead"].map((map) => sequence(map, true).join(","));
  assert.ok(new Set(active).size >= 3);
});

test("tick-derived map state survives exact recovery and deterministic continuation", () => {
  const original = createSimulation("lab");
  original.tick = 910; original.players[0].x = -500;
  original.spawnEnemy("spitter", { x: -500, y: 100 });
  original.updateMapMechanic(1 / 60);
  const restored = Simulation.fromRecoveryState(structuredClone(original.exportRecoveryState()));
  assert.equal(hashSimulationState(restored), hashSimulationState(original));
  for (let tick = 0; tick < 180; tick++) { original.update(1 / 60); restored.update(1 / 60); }
  assert.equal(hashSimulationState(restored), hashSimulationState(original));
});
