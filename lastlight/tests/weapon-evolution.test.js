import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG, BALANCE_HASH, BALANCE_IDS } from "../balance-config.js";
import { SPECIALIST_ORDER, SPECIALISTS, WEAPONS } from "../data.js";
import { Simulation } from "../engine.js";
import { resolveEntityImpact } from "../impact-grammar.js";
import {
  WEAPON_EVOLUTION_CAPABILITIES,
  WEAPON_EVOLUTION_CONTRACT,
  WEAPON_EVOLUTION_HASH,
  canonicalEvolutionContract,
  evolutionContractFingerprint,
  getWeaponEvolution,
  parseWeaponVariantId,
  resolveWeaponVariant,
  stampWeaponVariant,
  validateWeaponEvolutionContract,
} from "../weapon-evolution.js";

const SEED = "1234567890abcdef1234567890abcdef";

function simulation(specialist = "zuri") {
  const sim = new Simulation({ map: "warehouse", difficulty: "story", duration: 600, players: [{ id: "p0", name: "Probe", specialist }] }, { seed: SEED });
  sim.obstacles = [];
  sim.pods = [];
  sim.spawnClock = -1_000_000;
  sim.nextElite = Infinity;
  sim.nextMiniBoss = Infinity;
  sim.nextTreasure = Infinity;
  sim.nextRelayBall = Infinity;
  const player = sim.players[0];
  player.invuln = 0;
  player.input = { x: 0, y: 0, aim: 0, autoAim: false };
  return { sim, player };
}

test("the hash-covered evolution contract strictly covers all 21 authored weapons", () => {
  assert.equal(WEAPON_EVOLUTION_HASH, "fnv1a32:aaee50a3");
  assert.equal(evolutionContractFingerprint(), WEAPON_EVOLUTION_HASH);
  assert.equal(canonicalEvolutionContract(), canonicalEvolutionContract(structuredClone(WEAPON_EVOLUTION_CONTRACT)));
  assert.deepEqual(validateWeaponEvolutionContract(WEAPON_EVOLUTION_CONTRACT, BALANCE_CONFIG), []);
  assert.deepEqual(Object.keys(WEAPON_EVOLUTION_CONTRACT.signatures), SPECIALIST_ORDER);
  assert.deepEqual(Object.keys(WEAPON_EVOLUTION_CONTRACT.universal), Object.keys(WEAPONS));
  assert.equal(Object.keys(WEAPON_EVOLUTION_CONTRACT.signatures).length + Object.keys(WEAPON_EVOLUTION_CONTRACT.universal).length, 21);
  assert.deepEqual(BALANCE_CONFIG.evolutions, WEAPON_EVOLUTION_CONTRACT);

  for (const specialistId of SPECIALIST_ORDER) {
    const entry = getWeaponEvolution("signature", specialistId);
    assert.equal(entry.baseName, SPECIALISTS[specialistId].signature.name);
    assert.equal(entry.evolvedName, SPECIALISTS[specialistId].signature.evolve);
    assert.equal(entry.pairedPassive, SPECIALISTS[specialistId].signature.passive);
  }
  for (const weaponId of Object.keys(WEAPONS)) {
    const entry = getWeaponEvolution(weaponId);
    assert.equal(entry.baseName, WEAPONS[weaponId].name);
    assert.equal(entry.evolvedName, WEAPONS[weaponId].evolve);
    assert.equal(entry.pairedPassive, WEAPONS[weaponId].passive);
  }
  for (const entry of [...Object.values(WEAPON_EVOLUTION_CONTRACT.signatures), ...Object.values(WEAPON_EVOLUTION_CONTRACT.universal)]) {
    assert.ok(entry.capabilities.every((capability) => WEAPON_EVOLUTION_CAPABILITIES.includes(capability.id)));
  }
});

test("strict validation rejects coverage, capability, tuning, and presentation-status drift", () => {
  const missing = structuredClone(WEAPON_EVOLUTION_CONTRACT);
  delete missing.universal.rail;
  assert.match(validateWeaponEvolutionContract(missing, BALANCE_CONFIG).join("\n"), /universal: exact coverage mismatch/);

  const unknown = structuredClone(WEAPON_EVOLUTION_CONTRACT);
  unknown.signatures.zuri.capabilities[0].id = "laser-math";
  assert.match(validateWeaponEvolutionContract(unknown, BALANCE_CONFIG).join("\n"), /capabilities\.0\.id: unsupported/);

  const staleTuning = structuredClone(WEAPON_EVOLUTION_CONTRACT);
  staleTuning.signatures.sola.capabilities[0].tuningKeys = ["weapons.signatures.sola.notReal"];
  assert.match(validateWeaponEvolutionContract(staleTuning, BALANCE_CONFIG).join("\n"), /notReal is not finite balance tuning/);

  const falseGameplay = structuredClone(WEAPON_EVOLUTION_CONTRACT);
  falseGameplay.universal.rail.status = "gameplay";
  assert.match(validateWeaponEvolutionContract(falseGameplay, BALANCE_CONFIG).join("\n"), /status: must match capability scope/);
});

test("variant resolution and stamping are exact, parseable, enumerable, and immutable", () => {
  const { player } = simulation("nova");
  player.weapons.signature = { level: 5, evolved: true };
  const variant = resolveWeaponVariant(player, "signature");
  assert.equal(variant.variantId, "signature:nova:evolved");
  assert.deepEqual(parseWeaponVariantId(variant.variantId), variant);

  const projectile = stampWeaponVariant({ id: "b1" }, variant);
  assert.deepEqual(Object.keys(projectile), ["id", "sourceId", "variantId"]);
  assert.throws(() => { projectile.sourceId = "uwu"; }, TypeError);
  assert.throws(() => { projectile.variantId = "signature:nova:base"; }, TypeError);
  assert.throws(() => stampWeaponVariant(projectile, resolveWeaponVariant(player, "signature", false)), /conflicts/);
});

test("projectiles, effects, scheduled repeats, and drones retain their firing variant", () => {
  const projectileRun = simulation("zuri");
  projectileRun.player.weapons.signature = { level: 5, evolved: true };
  projectileRun.sim.spawnEnemy("brute").x = 120;
  projectileRun.sim.fireSignature(projectileRun.player);
  assert.ok(projectileRun.sim.projectiles.length);
  assert.ok(projectileRun.sim.projectiles.every((projectile) => projectile.sourceId === "signature" && projectile.variantId === "signature:zuri:evolved"));
  assert.equal(projectileRun.sim.snapshot().projectiles[0].variantId, "signature:zuri:evolved");

  const effectRun = simulation("zuri");
  effectRun.player.weapons.mines = { level: 5, evolved: true };
  effectRun.sim.fireCommonWeapon(effectRun.player, "mines", effectRun.player.weapons.mines);
  assert.ok(effectRun.sim.effects.every((effect) => effect.sourceId === "mines" && effect.variantId === "universal:mines:evolved"));

  const echoRun = simulation("echo");
  echoRun.player.weapons.signature = { level: 5, evolved: false };
  echoRun.sim.chance = () => true;
  echoRun.sim.shoot(echoRun.player, 0, 100, 10, { sourceId: "signature" });
  const repeat = echoRun.sim.tasks.find((task) => task.kind === "echo-projectile-repeat");
  assert.equal(repeat.sourceId, "signature");
  assert.equal(repeat.variantId, "signature:echo:base");
  echoRun.player.weapons.signature.evolved = true;
  echoRun.sim.tick = repeat.dueTick;
  echoRun.sim.updateTasks();
  assert.equal(echoRun.sim.projectiles.at(-1).variantId, "signature:echo:base", "queued repeat must not inherit a later evolution");

  const droneRun = simulation("zuri");
  droneRun.player.weapons.drone = { level: 5, evolved: false };
  const baseDrone = droneRun.sim.ensureDrone(droneRun.player);
  assert.equal(baseDrone.variantId, "universal:drone:base");
  assert.deepEqual(
    [BALANCE_CONFIG.weapons.universal.drone.pickupRangeBase, BALANCE_CONFIG.weapons.universal.drone.pickupRangePerLevel, BALANCE_CONFIG.weapons.universal.drone.evolvedPickupBonus],
    [115, 38, 95],
  );
  droneRun.player.x = -10_000; droneRun.player.y = 0; baseDrone.x = 0; baseDrone.y = 0;
  const baseRangeProbe = { id: "orb-base", x: 306, y: 0, radius: 6, value: 1, color: "#fff", dead: false };
  droneRun.sim.orbs = [baseRangeProbe];
  droneRun.sim.updatePickups(1 / 60);
  assert.equal(baseRangeProbe.x, 306, "rank-five base drone must stop collecting beyond 305 units");
  droneRun.player.weapons.drone.evolved = true;
  const evolvedDrone = droneRun.sim.ensureDrone(droneRun.player);
  assert.notEqual(evolvedDrone, baseDrone);
  assert.equal(evolvedDrone.variantId, "universal:drone:evolved");
  const evolvedRangeProbe = { id: "orb-evolved", x: 399, y: 0, radius: 6, value: 1, color: "#fff", dead: false };
  droneRun.sim.orbs = [evolvedRangeProbe]; evolvedDrone.x = 0; evolvedDrone.y = 0;
  droneRun.sim.updatePickups(1 / 60);
  assert.ok(evolvedRangeProbe.x < 399, "evolved drone must expose its authored +95 collection reach");
  assert.throws(() => { evolvedDrone.variantId = "universal:drone:base"; }, TypeError);
});

test("stamped signature effects survive owner removal and later loadout changes", () => {
  const { sim, player } = simulation("fang");
  player.weapons.signature = { level: 5, evolved: false };
  sim.fireSignature(player);
  const baseEffect = sim.effects.at(-1);
  assert.equal(baseEffect.variantId, "signature:fang:base");
  const baseRead = resolveEntityImpact(baseEffect, sim.snapshot());

  player.weapons.signature.evolved = true;
  assert.equal(resolveEntityImpact(baseEffect, sim.snapshot()).silhouette, baseRead.silhouette, "loadout mutation must not relabel an in-flight effect");
  sim.players = [];
  assert.doesNotThrow(() => resolveEntityImpact(baseEffect, sim.snapshot()));
  assert.equal(resolveEntityImpact(baseEffect, sim.snapshot()).evolved, false);

  const brontRun = simulation("bront");
  brontRun.player.weapons.signature = { level: 5, evolved: true };
  const target = brontRun.sim.spawnEnemy("brute");
  target.x = 120;
  brontRun.sim.fireSignature(brontRun.player);
  const task = brontRun.sim.tasks.find((entry) => entry.kind === "bront-repeat-blast");
  assert.equal(task.variantId, "signature:bront:evolved");
  brontRun.sim.players = [];
  brontRun.sim.tick = task.dueTick;
  assert.doesNotThrow(() => brontRun.sim.updateTasks());
  assert.equal(brontRun.sim.effects.at(-1).variantId, "signature:bront:evolved");
});

test("the balance fingerprint transitively pins the exact evolution contract", () => {
  assert.equal(BALANCE_HASH, "fnv1a32:b9076ec9");
  assert.equal(BALANCE_CONFIG.evolutions.schema, "lastlight.weapon-evolution.v1");
  assert.deepEqual(Object.keys(BALANCE_CONFIG.evolutions.signatures), [...BALANCE_IDS.specialists]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.evolutions.universal), [...BALANCE_IDS.universalWeapons]);
});
