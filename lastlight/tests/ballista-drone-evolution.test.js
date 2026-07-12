import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { Simulation } from "../engine.js";
import { getWeaponEvolution } from "../weapon-evolution.js";

const SEED = "83860000000000000000000000008386";

function scenario(players = [{ id: "owner", name: "Owner", specialist: "zuri", replaySlot: 0 }]) {
  const sim = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players }, { seed: SEED });
  sim.pods = []; sim.enemies = []; sim.events = []; sim.orbs = []; sim.drops = [];
  sim.chance = () => false;
  for (const player of sim.players) {
    player.x = 0; player.y = 0; player.invuln = 0;
    player.input = { x: 0, y: 0, aim: 0, autoAim: false };
  }
  return { sim, player: sim.players[0] };
}

function enemy(sim, { id, x, y, radius = 18 } = {}) {
  const target = sim.spawnEnemy("brute");
  Object.assign(target, {
    id, x, y, radius, hp: 10_000, maxHp: 10_000, speed: 0, damage: 0, xp: 0,
    spawnLife: 0, attackCd: 1_000_000, shotCd: 1_000_000, knockVx: 0, knockVy: 0,
  });
  return target;
}

function advanceProjectiles(sim, ticks = 180) {
  for (let tick = 0; tick < ticks; tick++) sim.updateProjectiles(1 / 60);
}

function procEvents(sim, mechanicId) {
  return sim.events.filter((event) => event.type === "weapon-evolution-proc" && event.mechanicId === mechanicId);
}

function collectMote(sim, drone, id) {
  sim.orbs.push({ id, x: drone.x, y: drone.y, radius: 5, value: 1, color: "#63f2df", dead: false });
  sim.updatePickups(1 / 60);
  sim.cleanup();
}

test("Prime Ballista chooses the stable highest-value corridor within the twelve-candidate budget", () => {
  const { sim, player } = scenario();
  player.weapons.crossbow = { level: 5, evolved: true };
  enemy(sim, { id: "lane-b", x: 120, y: 0 });
  enemy(sim, { id: "lane-a", x: 0, y: 120 });
  for (let index = 0; index < 18; index++) enemy(sim, {
    id: `far-${String(index).padStart(2, "0")}`,
    x: 1600 + index * 20, y: 1600 + (index % 3) * 100,
  });

  const cooldown = sim.fireCommonWeapon(player, "crossbow", player.weapons.crossbow);
  const tuning = BALANCE_CONFIG.weapons.universal.crossbow;
  const event = procEvents(sim, "ballista-corridor")[0];
  assert.equal(event.targetId, "lane-a", "equal score and distance resolve by stable id");
  assert.equal(event.candidateLimit, 12);
  assert.ok(event.score <= 12);
  assert.equal(event.activationId, "s0-crossbow-a1");
  assert.equal(sim.projectiles.length, tuning.countBase + 5 * tuning.countPerLevel);
  assert.ok(Math.abs(Math.atan2(sim.projectiles[0].vy, sim.projectiles[0].vx) - Math.PI / 2) < 1e-12,
    "the center heavy bolt follows the selected corridor");
  assert.equal(sim.projectiles.filter((projectile) => projectile.ballistaHeavy).length, 1);
  assert.equal(cooldown, tuning.cooldownBase + 5 * tuning.cooldownPerLevel);
});

test("the center Ballista bolt guarantees crits only after three distinct penetrations", () => {
  const { sim, player } = scenario();
  player.weapons.crossbow = { level: 5, evolved: true };
  const targets = [100, 200, 300, 400].map((x, index) => enemy(sim, { id: `target-${index + 1}`, x, y: 0 }));
  sim.fireCommonWeapon(player, "crossbow", player.weapons.crossbow);
  const heavy = sim.projectiles.find((projectile) => projectile.ballistaHeavy);
  for (const projectile of sim.projectiles) if (projectile !== heavy) projectile.dead = true;
  advanceProjectiles(sim);

  const damage = targets.map((target) => 10_000 - target.hp);
  assert.deepEqual(damage.slice(0, 3), [133, 133, 133]);
  assert.equal(damage[3], 232.75, "the fourth distinct target is the first guaranteed critical impact");
  assert.equal(heavy.enemyHitIds.size, 4);
  assert.equal(procEvents(sim, "ballista-deep-crit").length, 1);
  assert.equal(procEvents(sim, "ballista-deep-crit")[0].projectileId, heavy.id);
  assert.deepEqual(Object.keys(player.damageBySource), ["crossbow"]);
});

test("Yuum.AI Final repairs the lowest-ratio stable ally after five drone collections", () => {
  const { sim, player } = scenario([
    { id: "owner", name: "Owner", specialist: "zuri", replaySlot: 0 },
    { id: "ally-b", name: "B", specialist: "echo", replaySlot: 1 },
    { id: "ally-a", name: "A", specialist: "nova", replaySlot: 2 },
  ]);
  player.weapons.drone = { level: 5, evolved: true };
  const drone = sim.ensureDrone(player);
  player.x = -10_000; drone.x = 0; drone.y = 0;
  for (const ally of sim.players.slice(1)) { ally.maxHp = 10; ally.hp = 5; ally.x = 10_000; }
  for (let mote = 1; mote <= 5; mote++) collectMote(sim, drone, `repair-mote-${mote}`);

  assert.equal(sim.players.find(({ id }) => id === "ally-a").hp, 7.5);
  assert.equal(sim.players.find(({ id }) => id === "ally-b").hp, 5);
  assert.equal(drone.protocolMotes, 0); assert.equal(drone.protocolCharge, 0);
  const event = procEvents(sim, "drone-protocol-repair")[0];
  assert.equal(event.targetId, "ally-a"); assert.equal(event.repaired, 2.5);
  assert.equal(event.activationId, `${drone.id}-p1`);
});

test("one capped Drone protocol retargets the same bolt through three stable targets", () => {
  const { sim, player } = scenario();
  player.weapons.drone = { level: 5, evolved: true };
  const drone = sim.ensureDrone(player);
  player.x = -10_000; drone.x = 0; drone.y = 0;
  for (let mote = 1; mote <= 5; mote++) collectMote(sim, drone, `chain-mote-${mote}`);
  for (let mote = 6; mote <= 15; mote++) collectMote(sim, drone, `capped-mote-${mote}`);
  assert.equal(drone.protocolCharge, 1); assert.equal(drone.protocolMotes, 0); assert.equal(drone.protocolSequence, 1);

  player.x = 0; player.y = 0; drone.x = 0; drone.y = 0;
  const first = enemy(sim, { id: "chain-first", x: 100, y: 0 });
  const stable = enemy(sim, { id: "chain-a", x: 100, y: -100 });
  const tie = enemy(sim, { id: "chain-b", x: 100, y: 100 });
  const third = enemy(sim, { id: "chain-third", x: 200, y: -100 });
  sim.fireCommonWeapon(player, "drone", player.weapons.drone);
  const initialProjectileCount = sim.projectiles.length;
  const chain = sim.projectiles.find((projectile) => projectile.droneProtocolChainRemaining > 0);
  for (const projectile of sim.projectiles) if (projectile !== chain) projectile.dead = true;
  const chainId = chain.id;
  advanceProjectiles(sim);

  assert.equal(drone.protocolCharge, 0);
  assert.ok(first.hp < first.maxHp && stable.hp < stable.maxHp && third.hp < third.maxHp);
  assert.equal(tie.hp, tie.maxHp, "stable id wins the equal-distance first retarget");
  assert.equal(sim.projectiles.length, initialProjectileCount, "chain targeting never creates projectile entities");
  const retargets = procEvents(sim, "drone-chain-retarget");
  assert.deepEqual(retargets.map(({ targetId }) => targetId), ["chain-a", "chain-third"]);
  assert.ok(retargets.every(({ projectileId }) => projectileId === chainId));
  assert.equal(procEvents(sim, "drone-chain-launched").length, 1);
});

test("Ballista activation and Drone protocol state survive snapshot recovery", () => {
  const { sim, player } = scenario();
  player.weapons.crossbow = { level: 5, evolved: true };
  player.weapons.drone = { level: 5, evolved: true };
  enemy(sim, { id: "corridor", x: 120, y: 0 });
  sim.fireCommonWeapon(player, "crossbow", player.weapons.crossbow);
  const drone = sim.ensureDrone(player);
  drone.protocolMotes = 4; drone.protocolCharge = 1; drone.protocolSequence = 3; drone.protocolActivationId = `${drone.id}-p3`;

  const snapshot = sim.snapshot();
  assert.equal(snapshot.players[0].weaponActivations.crossbow, 1);
  assert.equal(snapshot.projectiles.filter(({ ballistaHeavy }) => ballistaHeavy).length, 1);
  assert.equal(snapshot.projectiles.find(({ ballistaHeavy }) => ballistaHeavy).deepCritAfterTargets, 3);
  assert.deepEqual({
    protocolMotes: snapshot.drones[0].protocolMotes,
    protocolCharge: snapshot.drones[0].protocolCharge,
    protocolSequence: snapshot.drones[0].protocolSequence,
    protocolActivationId: snapshot.drones[0].protocolActivationId,
  }, { protocolMotes: 4, protocolCharge: 1, protocolSequence: 3, protocolActivationId: `${drone.id}-p3` });

  const restored = Simulation.fromRecoveryState(JSON.parse(JSON.stringify(sim.exportRecoveryState())));
  assert.equal(restored.players[0].weaponActivations.crossbow, 1);
  const restoredHeavy = restored.projectiles.find(({ ballistaHeavy }) => ballistaHeavy);
  assert.equal(restoredHeavy.deepCritAfterTargets, 3);
  assert.ok(restoredHeavy.enemyHitIds instanceof Set);
  assert.deepEqual({
    protocolMotes: restored.drones[0].protocolMotes,
    protocolCharge: restored.drones[0].protocolCharge,
    protocolSequence: restored.drones[0].protocolSequence,
    protocolActivationId: restored.drones[0].protocolActivationId,
  }, { protocolMotes: 4, protocolCharge: 1, protocolSequence: 3, protocolActivationId: `${drone.id}-p3` });
});

test("contract and impact copy expose the two evolved mechanics authoritatively", () => {
  const ballista = getWeaponEvolution("crossbow"), drone = getWeaponEvolution("drone");
  assert.deepEqual(ballista.capabilities.slice(-2).map(({ id }) => id), ["corridor-targeting", "deep-crit"]);
  assert.deepEqual(drone.capabilities.slice(-2).map(({ id }) => id), ["data-protocol", "chain-retarget"]);
});
