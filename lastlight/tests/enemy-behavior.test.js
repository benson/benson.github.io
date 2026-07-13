import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { SIMULATION_TICK_RATE, Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const SEED = "0123456789abcdef0123456789abcdef";

function create() {
  return new Simulation({ difficulty: "story", duration: 240, players: [{ id: "p1", name: "One", specialist: "zuri", replaySlot: 0 }] }, { seed: SEED });
}

function place(sim, type, distance = 100, options = {}) {
  const enemy = sim.spawnEnemy(type, options), player = sim.players[0];
  player.x = 0; player.y = 0; player.invuln = 0; player.hitGrace = 0; enemy.x = distance; enemy.y = 0;
  enemy.attackCd = 0; enemy.abilityReadyTick = sim.tick; enemy.stun = 0;
  return { enemy, player };
}

test("all six archetypes execute distinct authoritative windup contracts", () => {
  const houndSim = create(), { enemy: hound, player: houndTarget } = place(houndSim, "hound", 250);
  const houndHp = houndTarget.hp;
  houndSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(hound.behaviorState, "windup");
  assert.equal(houndTarget.hp, houndHp, "charge windup cannot deal contact damage");
  houndSim.tick = hound.behaviorUntilTick;
  houndSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(hound.behaviorState, "charge");
  const lockedEndpoint = [hound.behaviorEndX, hound.behaviorEndY];
  houndSim.tick += 1; houndSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.deepEqual([hound.behaviorEndX, hound.behaviorEndY], lockedEndpoint, "charge endpoint stays fixed while the enemy advances");

  const spitterSim = create(), { enemy: spitter } = place(spitterSim, "spitter", 330);
  spitterSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(spitter.behaviorState, "windup");
  assert.equal(spitterSim.hostile.length, 0);
  spitterSim.tick = spitter.behaviorUntilTick;
  spitterSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(spitterSim.hostile.length, 1, "one windup emits exactly one hostile bolt");
  assert.equal(spitter.behaviorState, "contact");
  assert.ok(spitter.attackFlash > 0, "the projectile launch has an authored contact beat");

  const bruteSim = create(), { enemy: brute, player: bruteTarget } = place(bruteSim, "brute", 100);
  const bruteHp = bruteTarget.hp;
  bruteSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(brute.behaviorState, "windup");
  assert.equal(bruteTarget.hp, bruteHp);
  bruteSim.tick = brute.behaviorUntilTick;
  bruteSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.ok(bruteTarget.hp < bruteHp);
  assert.equal(brute.behaviorState, "recovery");

  const bomberSim = create(), { enemy: bomber, player: bomberTarget } = place(bomberSim, "bomber", 20);
  const bomberHp = bomberTarget.hp;
  bomberSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(bomber.behaviorState, "windup");
  assert.equal(bomberTarget.hp, bomberHp, "arming cannot also contact-hit");
  bomberSim.tick = bomber.behaviorUntilTick;
  bomberSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(bomber.dead, true);
  assert.ok(bomberTarget.hp < bomberHp);

  const miteSim = create(), { enemy: mite } = place(miteSim, "mite", 300);
  miteSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(mite.behaviorState, "approach");
  assert.ok(mite.x < 300);

  const sharkSim = create(), { enemy: shark } = place(sharkSim, "shark", 400);
  sharkSim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(shark.behaviorState, "windup");
  assert.equal(shark.miniboss, true);
});

test("stunning an armed bomber enforces recovery and cooldown before it can arm again", () => {
  const sim = create(), { enemy } = place(sim, "bomber", 20);
  sim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.behaviorState, "windup");
  enemy.stun = .2; sim.tick += 1; sim.updateEnemies(.05);
  const readyTick = enemy.abilityReadyTick;
  assert.equal(enemy.behaviorState, "recovery");
  while (enemy.stun > 0) { sim.tick += 3; sim.updateEnemies(.05); }
  sim.tick = readyTick - 1; sim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.behaviorState, "recovery");
  sim.tick = readyTick; sim.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.behaviorState, "windup");
});

test("scheduled elites receive one stable compatible affix while events and minibosses receive none", () => {
  const left = create(), right = create();
  const first = left.spawnEnemy("hound", { elite: true, spawnContext: "scheduled-elite" });
  const again = right.spawnEnemy("hound", { elite: true, spawnContext: "scheduled-elite" });
  assert.deepEqual(first.affixIds, again.affixIds);
  assert.equal(first.affixIds.length, 1);
  assert.equal(left.spawnEnemy("hound", { elite: true, spawnContext: "treasure-event", eventType: "treasure" }).affixIds.length, 0);
  assert.equal(left.spawnEnemy("shark", { elite: true, spawnContext: "scheduled-elite" }).affixIds.length, 0);
  const bomber = left.spawnEnemy("bomber", { elite: true, spawnContext: "scheduled-elite" });
  assert.ok(!bomber.affixIds.includes("volatile"));
});

test("shielded and volatile affixes have exact bounded combat effects", () => {
  const shieldSim = create(), { enemy: shielded } = place(shieldSim, "hound", 300);
  shielded.affixIds = ["shielded"]; shielded.affixState = { shield: 20 };
  const hp = shielded.hp;
  shieldSim.damageEnemy(shielded, 12, shieldSim.players[0].id);
  assert.equal(shielded.hp, hp);
  assert.equal(shielded.affixState.shield, 8);
  shieldSim.damageEnemy(shielded, 10, shieldSim.players[0].id);
  assert.equal(shielded.affixState.shield, 0);
  assert.equal(shielded.hp, hp - 2);

  const volatileSim = create(), { enemy: volatile, player } = place(volatileSim, "hound", 10);
  volatile.affixIds = ["volatile"]; volatile.affixState = {};
  const before = player.hp;
  volatileSim.damageEnemy(volatile, volatile.hp + 1, player.id);
  const task = volatileSim.tasks.find(({ kind }) => kind === "elite-volatile");
  assert.ok(task);
  assert.ok(volatileSim.effects.some(({ kind, radius }) => kind === "danger" && radius === BALANCE_CONFIG.enemyIdentity.elite.affixes.volatile.radius));
  volatileSim.tick = task.dueTick;
  volatileSim.updateTasks();
  assert.ok(player.hp < before);
  assert.equal(volatileSim.tasks.length, 0);
});

test("mid-intent recovery is exact and rejects unknown or incompatible affixes", () => {
  const original = create(), { enemy } = place(original, "hound", 250, { elite: true, spawnContext: "scheduled-elite" });
  original.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.behaviorState, "windup");
  const exported = original.exportRecoveryState();
  const restored = Simulation.fromRecoveryState(structuredClone(exported));
  assert.equal(hashSimulationState(restored), hashSimulationState(original));

  const unknown = structuredClone(exported);
  unknown.lists.enemies[0].affixIds = ["unknown"];
  assert.throws(() => Simulation.fromRecoveryState(unknown), /invalid affixes/);
  const incompatible = structuredClone(exported);
  incompatible.lists.enemies[0].eventType = "treasure";
  assert.throws(() => Simulation.fromRecoveryState(incompatible), /incompatible affixes/);

  const badHits = structuredClone(exported);
  badHits.lists.enemies[0].behaviorHitIds = { bad: true };
  assert.throws(() => Simulation.fromRecoveryState(badHits), /behaviorHitIds/);
  const badAngle = structuredClone(exported);
  badAngle.lists.enemies[0].attackAngle = "east";
  assert.throws(() => Simulation.fromRecoveryState(badAngle), /attackAngle/);
  const inventedShield = structuredClone(exported);
  inventedShield.lists.enemies[0].affixIds = ["hasted"];
  inventedShield.lists.enemies[0].affixState = { shield: 1 };
  assert.throws(() => Simulation.fromRecoveryState(inventedShield), /unexpected affix state/);
  const missingShield = structuredClone(exported);
  missingShield.lists.enemies[0].affixIds = ["shielded"];
  missingShield.lists.enemies[0].affixState = {};
  assert.throws(() => Simulation.fromRecoveryState(missingShield), /invalid affix shield/);
  const badTask = structuredClone(exported);
  badTask.lists.tasks.push({ id: "task-bad", kind: "elite-volatile", dueTick: original.tick + 10, payload: { enemyId: "m1", x: "zero", y: 0, radius: -1, damage: 2 } });
  assert.throws(() => Simulation.fromRecoveryState(badTask), /invalid elite-volatile payload/);
});
