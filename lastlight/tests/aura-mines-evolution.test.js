import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { WEAPONS } from "../data.js";
import { Simulation } from "../engine.js";
import { getWeaponImpactGrammar } from "../impact-grammar.js";
import { getWeaponEvolution, validateWeaponEvolutionContract, WEAPON_EVOLUTION_CONTRACT } from "../weapon-evolution.js";

const SEED = "83870000000000000000000000008387";

function scenario() {
  const sim = new Simulation({
    map: "warehouse", difficulty: "story", duration: 600,
    players: [{ id: "owner", name: "Owner", specialist: "zuri", replaySlot: 0 }],
  }, { seed: SEED });
  sim.spawnClock = -1_000_000; sim.nextElite = Infinity; sim.nextMiniBoss = Infinity;
  sim.nextTreasure = Infinity; sim.nextRelayBall = Infinity; sim.pods = []; sim.obstacles = [];
  sim.enemies = []; sim.effects = []; sim.events = []; sim.random = () => 0; sim.chance = () => false;
  const player = sim.players[0];
  Object.assign(player, { x: 0, y: 0, invuln: 0, input: { x: 0, y: 0, aim: 0, autoAim: false } });
  return { sim, player };
}

function enemy(sim, id, x, y, hp = 100_000) {
  const target = sim.spawnEnemy("brute");
  Object.assign(target, { id, x, y, hp, maxHp: hp, speed: 0, damage: 0, dead: false, spawnLife: 0, knockVx: 0, knockVy: 0 });
  return target;
}

function procEvents(sim, mechanicId) {
  return sim.events.filter((event) => event.type === "weapon-evolution-proc" && event.mechanicId === mechanicId);
}

test("Explosive Embrace grants one bounded charge per occupied activation, never per enemy", () => {
  const { sim, player } = scenario();
  player.weapons.aura = { level: 5, evolved: true };
  const crowd = Array.from({ length: 6 }, (_, index) => enemy(sim, `crowd-${index}`, 40 + index * 10, 0));
  const cooldown = sim.fireCommonWeapon(player, "aura", player.weapons.aura);
  const tuning = BALANCE_CONFIG.weapons.universal.aura;
  const authoredDamage = tuning.damageBase + 5 * tuning.damagePerLevel + player.maxHp * tuning.maxHealthDamage;

  assert.equal(cooldown, tuning.cooldown);
  assert.ok(crowd.every((target) => target.hp === target.maxHp - authoredDamage));
  assert.equal(player.auraCharge, 1);
  assert.equal(sim.effects.length, 0, "ordinary occupied pulses allocate no effect entity");
  assert.equal(sim.events.length, 0, "ordinary charges do not consume the bounded semantic event buffer");

  sim.enemies = [];
  sim.fireCommonWeapon(player, "aura", player.weapons.aura);
  assert.equal(player.auraCharge, 1, "empty activations cannot charge the eruption");
  assert.equal(sim.events.length, 0);
});

test("the eighth occupied pulse resets charge and emits one authored short eruption", () => {
  const { sim, player } = scenario();
  player.weapons.aura = { level: 5, evolved: true }; player.auraCharge = 7; player.weaponActivations.aura = 7;
  const inner = enemy(sim, "inner", 100, 0), outer = enemy(sim, "outer", 300, 0);
  const tuning = BALANCE_CONFIG.weapons.universal.aura;
  const radius = tuning.radiusBase + 5 * tuning.radiusPerLevel;
  const damage = tuning.damageBase + 5 * tuning.damagePerLevel + player.maxHp * tuning.maxHealthDamage;

  sim.fireCommonWeapon(player, "aura", player.weapons.aura);
  assert.equal(player.auraCharge, 0);
  assert.equal(inner.hp, inner.maxHp - damage * (1 + tuning.evolvedEruptionDamageMultiplier));
  assert.equal(outer.hp, outer.maxHp - damage * tuning.evolvedEruptionDamageMultiplier, "the outer target is reached only by the larger eruption");
  assert.equal(sim.effects.length, 1);
  assert.deepEqual({ kind: sim.effects[0].kind, radius: sim.effects[0].radius, life: sim.effects[0].life, sourceId: sim.effects[0].sourceId, variantId: sim.effects[0].variantId }, {
    kind: "auraEruption", radius: radius * 1.45, life: 0.28, sourceId: "aura", variantId: "universal:aura:evolved",
  });
  assert.throws(() => { sim.effects[0].variantId = "universal:aura:base"; }, TypeError);
  const event = procEvents(sim, "aura-eruption")[0];
  assert.deepEqual({ activationId: event.activationId, sourceId: event.sourceId, variantId: event.variantId, charge: event.charge, radiusMultiplier: event.radiusMultiplier, damageMultiplier: event.damageMultiplier }, {
    activationId: "s0-aura-a8", sourceId: "aura", variantId: "universal:aura:evolved", charge: 0, radiusMultiplier: 1.45, damageMultiplier: 2.5,
  });
});

test("Aura occupancy uses the existing damage-area pass and preserves charge, activation, and variant through recovery", () => {
  const { sim, player } = scenario();
  player.weapons.aura = { level: 5, evolved: true }; player.auraCharge = 7; player.weaponActivations.aura = 7;
  for (let index = 0; index < 100; index++) enemy(sim, `target-${String(index).padStart(3, "0")}`, index % 10, Math.floor(index / 10));
  let scans = 0;
  const enemies = sim.enemies;
  sim.enemies = new Proxy(enemies, { get(target, property, receiver) {
    if (property === Symbol.iterator) return function* iterator() { scans++; yield* target; };
    return Reflect.get(target, property, receiver);
  } });
  sim.fireCommonWeapon(player, "aura", player.weapons.aura);
  assert.equal(scans, 2, "a threshold activation performs one base pulse scan and one authored eruption scan");
  assert.equal(procEvents(sim, "aura-eruption").length, 1);

  const preEruption = scenario();
  preEruption.player.weapons.aura = { level: 5, evolved: true };
  preEruption.player.auraCharge = 7; preEruption.player.weaponActivations.aura = 7;
  enemy(preEruption.sim, "recovery-target", 20, 0);
  const restored = Simulation.fromRecoveryState(JSON.parse(JSON.stringify(preEruption.sim.exportRecoveryState())));
  assert.equal(restored.players[0].auraCharge, 7); assert.equal(restored.players[0].weaponActivations.aura, 7);
  restored.fireCommonWeapon(restored.players[0], "aura", restored.players[0].weapons.aura);
  const recoveredEvent = procEvents(restored, "aura-eruption")[0];
  assert.equal(restored.players[0].auraCharge, 0); assert.equal(recoveredEvent.activationId, "s0-aura-a8");
  assert.equal(recoveredEvent.sourceId, "aura"); assert.equal(recoveredEvent.variantId, "universal:aura:evolved");

  const occupied = scenario();
  occupied.player.weapons.aura = { level: 5, evolved: true };
  enemy(occupied.sim, "only", 20, 0);
  let occupiedScans = 0; const occupiedEnemies = occupied.sim.enemies;
  occupied.sim.enemies = new Proxy(occupiedEnemies, { get(target, property, receiver) {
    if (property === Symbol.iterator) return function* iterator() { occupiedScans++; yield* target; };
    return Reflect.get(target, property, receiver);
  } });
  occupied.sim.fireCommonWeapon(occupied.player, "aura", occupied.player.weapons.aura);
  assert.equal(occupiedScans, 1, "charge occupancy is returned by damageArea instead of rescanning the crowd");

  const reserved = scenario(); reserved.player.weapons.aura = { level: 5, evolved: true };
  reserved.sim.pushWeaponEvolutionProc(reserved.player, "aura", "reserved-test", "real-activation", reserved.player, 0, {
    ownerId: "spoof", sourceId: "spoof", variantId: "universal:aura:base", mechanicId: "spoof", activationId: "spoof",
    position: { x: Infinity, y: Infinity }, direction: Infinity,
  });
  const reservedEvent = reserved.sim.events[0];
  assert.deepEqual({
    ownerId: reservedEvent.ownerId, sourceId: reservedEvent.sourceId, variantId: reservedEvent.variantId,
    mechanicId: reservedEvent.mechanicId, activationId: reservedEvent.activationId,
    position: reservedEvent.position, direction: reservedEvent.direction,
  }, {
    ownerId: "owner", sourceId: "aura", variantId: "universal:aura:evolved", mechanicId: "reserved-test", activationId: "real-activation", position: { x: 0, y: 0 }, direction: 0,
  });
});

test("Tri-Mine Grid partitions the unchanged count into stable groups of at most three", () => {
  const { sim, player } = scenario();
  player.weapons.mines = { level: 5, evolved: true };
  const tuning = BALANCE_CONFIG.weapons.universal.mines;
  const cooldown = sim.fireCommonWeapon(player, "mines", player.weapons.mines);

  assert.equal(cooldown, tuning.cooldownBase + 5 * tuning.cooldownPerLevel);
  assert.equal(sim.effects.length, tuning.countBase + 5 * tuning.countPerLevel);
  assert.deepEqual(sim.effects.map(({ mineGroupId }) => mineGroupId), [
    "s0-mines-a1-g1", "s0-mines-a1-g1", "s0-mines-a1-g1",
    "s0-mines-a1-g2", "s0-mines-a1-g2", "s0-mines-a1-g2", "s0-mines-a1-g3",
  ]);
  assert.deepEqual(sim.effects.map(({ mineGroupSequence }) => mineGroupSequence), [1, 1, 1, 2, 2, 2, 3]);
  assert.deepEqual(sim.effects.map(({ mineGroupMemberSequence }) => mineGroupMemberSequence), [1, 2, 3, 1, 2, 3, 1]);
  assert.deepEqual(sim.effects.map(({ mineGroupSize }) => mineGroupSize), [3, 3, 3, 3, 3, 3, 1]);
  assert.deepEqual(sim.effects.map(({ mineGroupState }) => mineGroupState), ["armed", "armed", "armed", "armed", "armed", "armed", "singleton"]);
  assert.ok(sim.effects.every(({ sourceId, variantId }) => sourceId === "mines" && variantId === "universal:mines:evolved"));
  assert.throws(() => { sim.effects[0].sourceId = "aura"; }, TypeError);
  assert.throws(() => { sim.effects[0].variantId = "universal:mines:base"; }, TypeError);
});

test("the first group blast chains siblings once with capped staggered fuses and larger radii", () => {
  const { sim, player } = scenario();
  player.weapons.mines = { level: 1, evolved: true };
  sim.fireCommonWeapon(player, "mines", player.weapons.mines);
  const [first, second, third] = sim.effects, originalRadius = first.radius;
  first.life = 0; sim.updateEffects(0);

  assert.equal(first.triggered, true); assert.equal(first.mineGroupState, "triggered"); assert.equal(first.radius, originalRadius);
  assert.deepEqual([second.mineGroupState, third.mineGroupState], ["chained", "chained"]);
  assert.deepEqual([second.life, third.life], [0.12, 0.24]);
  assert.deepEqual([second.mineChainFuseLimit, third.mineChainFuseLimit], [0.12, 0.24]);
  assert.deepEqual([second.radius, third.radius], [originalRadius * 1.25, originalRadius * 1.25]);
  const event = procEvents(sim, "mine-grid-chain")[0];
  assert.deepEqual({ activationId: event.activationId, sourceId: event.sourceId, variantId: event.variantId, groupId: event.groupId, triggerMineId: event.triggerMineId, siblingIds: event.siblingIds, siblingFuses: event.siblingFuses }, {
    activationId: "s0-mines-a1", sourceId: "mines", variantId: "universal:mines:evolved", groupId: "s0-mines-a1-g1",
    triggerMineId: first.id, siblingIds: [second.id, third.id], siblingFuses: [0.12, 0.24],
  });
  sim.updateEffects(0.12); sim.updateEffects(0.12);
  assert.equal(procEvents(sim, "mine-grid-chain").length, 1, "chained siblings cannot retrigger their group");
  assert.equal(second.triggered, true); assert.equal(third.triggered, true);

  const capped = scenario();
  capped.player.weapons.mines = { level: 1, evolved: true };
  capped.sim.fireCommonWeapon(capped.player, "mines", capped.player.weapons.mines);
  capped.sim.effects[0].life = 0; capped.sim.effects[1].life = 0.05;
  capped.sim.updateEffects(0);
  assert.equal(capped.sim.effects[1].life, 0.05, "a chain never lengthens an already-shorter fuse");
});

test("odd mine counts leave a final singleton unchained and chain state survives recovery", () => {
  const { sim, player } = scenario();
  player.weapons.mines = { level: 5, evolved: true };
  sim.fireCommonWeapon(player, "mines", player.weapons.mines);
  const singleton = sim.effects.at(-1);
  singleton.life = 0; sim.updateEffects(0);
  assert.equal(singleton.triggered, true); assert.equal(singleton.mineGroupState, "singleton");
  assert.equal(procEvents(sim, "mine-grid-chain").length, 0, "a one-mine remainder is not a chain");

  const first = sim.effects[0]; first.life = 0; sim.updateEffects(0);
  const recovery = JSON.parse(JSON.stringify(sim.exportRecoveryState()));
  const restored = Simulation.fromRecoveryState(recovery);
  const restoredGroup = restored.effects.filter(({ mineGroupId }) => mineGroupId === first.mineGroupId);
  assert.deepEqual(restoredGroup.map(({ mineGroupState }) => mineGroupState), ["triggered", "chained", "chained"]);
  assert.deepEqual(restoredGroup.slice(1).map(({ mineChainFuseLimit }) => mineChainFuseLimit), [0.12, 0.24]);
  assert.ok(restoredGroup.every(({ sourceId, variantId }) => sourceId === "mines" && variantId === "universal:mines:evolved"));
  assert.throws(() => { restoredGroup[1].variantId = "universal:mines:base"; }, TypeError);
  sim.updateEffects(0.24); restored.updateEffects(0.24);
  const recoveryState = (value) => value.effects.map(({ id, triggered, mineGroupState, mineChainFuse, mineChainFuseLimit, radius, sourceId, variantId }) =>
    ({ id, triggered, mineGroupState, mineChainFuse, mineChainFuseLimit, radius, sourceId, variantId }));
  assert.deepEqual(recoveryState(restored.snapshot()), recoveryState(sim.snapshot()));
});

test("mine chain resolution is stable across effect order and frame partitioning", () => {
  const source = scenario(); source.player.weapons.mines = { level: 1, evolved: true };
  source.sim.fireCommonWeapon(source.player, "mines", source.player.weapons.mines);
  source.sim.effects[0].life = 0; source.sim.updateEffects(0);
  const recovery = JSON.parse(JSON.stringify(source.sim.exportRecoveryState()));
  const oneStep = Simulation.fromRecoveryState(recovery);
  const partitioned = Simulation.fromRecoveryState(recovery);
  const reordered = Simulation.fromRecoveryState(recovery); reordered.effects.reverse();

  oneStep.updateEffects(0.24);
  reordered.updateEffects(0.24);
  for (let frame = 0; frame < 24; frame++) partitioned.updateEffects(0.01);
  const state = (sim) => sim.effects.map((effect) => ({
    id: effect.id, triggered: Boolean(effect.triggered), mineGroupState: effect.mineGroupState,
    radius: effect.radius, life: Math.abs(effect.life) < 1e-9 ? 0 : Math.round(effect.life * 1e9) / 1e9,
  })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  assert.deepEqual(state(reordered), state(oneStep), "array order cannot change chain outcomes");
  assert.deepEqual(state(partitioned), state(oneStep), "one large continuation and 24 small steps resolve identically");
});

test("base Aura and Mines retain their shipped cadence, count, damage, radius, and fuse envelope", () => {
  const auraRun = scenario();
  auraRun.player.weapons.aura = { level: 5, evolved: false };
  const auraTarget = enemy(auraRun.sim, "aura-target", 100, 0), auraTuning = BALANCE_CONFIG.weapons.universal.aura;
  const auraCooldown = auraRun.sim.fireCommonWeapon(auraRun.player, "aura", auraRun.player.weapons.aura);
  assert.equal(auraCooldown, 0.34);
  assert.equal(auraTarget.maxHp - auraTarget.hp, 16 + 5 * 8 + auraRun.player.maxHp * 0.8);
  assert.equal(auraRun.player.auraCharge, 0); assert.equal(auraRun.player.weaponActivations.aura, undefined);
  assert.equal(auraRun.sim.effects.length, 0); assert.equal(auraRun.sim.events.length, 0);
  assert.equal(auraTuning.radiusBase, 105); assert.equal(auraTuning.radiusPerLevel, 26);

  const mineRun = scenario();
  mineRun.player.weapons.mines = { level: 5, evolved: false };
  const mineTuning = BALANCE_CONFIG.weapons.universal.mines;
  const mineCooldown = mineRun.sim.fireCommonWeapon(mineRun.player, "mines", mineRun.player.weapons.mines);
  assert.equal(mineCooldown, 6.8 + 5 * -0.45);
  assert.equal(mineRun.sim.effects.length, 7);
  assert.ok(mineRun.sim.effects.every((mine) => mine.damage === 185 && mine.radius === 90 && mine.kind === "mine"));
  assert.deepEqual(mineRun.sim.effects.map(({ life }) => life), Array.from({ length: 7 }, (_, index) => 0.8 + index * 0.08));
  assert.ok(mineRun.sim.effects.every((mine) => mine.mineGroupId === undefined && mine.mineGroupState === undefined));
  assert.equal(mineRun.player.weaponActivations.mines, undefined);
  assert.deepEqual({ countBase: mineTuning.countBase, countPerLevel: mineTuning.countPerLevel, damageBase: mineTuning.damageBase, damagePerLevel: mineTuning.damagePerLevel }, { countBase: 2, countPerLevel: 1, damageBase: 60, damagePerLevel: 25 });
});

test("contract, field copy, and upgrade archive describe both shipped mechanics truthfully", () => {
  assert.deepEqual(validateWeaponEvolutionContract(WEAPON_EVOLUTION_CONTRACT, BALANCE_CONFIG), []);
  const aura = getWeaponEvolution("aura"), mines = getWeaponEvolution("mines");
  assert.equal(aura.status, "gameplay"); assert.deepEqual(aura.capabilities.map(({ id }) => id), ["occupied-charge-eruption"]);
  assert.match(aura.capabilities[0].note, /one charge per activation.*eighth.*1\.45x.*2\.5x.*resets/i);
  assert.equal(mines.status, "gameplay"); assert.deepEqual(mines.capabilities.map(({ id }) => id), ["mine-grid-chain"]);
  assert.match(mines.capabilities[0].note, /groups of at most three.*caps.*0\.12\/0\.24.*25% larger/i);
  assert.match(WEAPONS.aura.copy, /eight occupied pulses/i); assert.match(WEAPONS.mines.copy, /groups of up to three/i);
  assert.match(getWeaponImpactGrammar("aura", { evolved: true }).evolvedDifference, /charge eight resets.*1\.45x radius.*2\.5x pulse damage/i);
  assert.match(getWeaponImpactGrammar("mines", { evolved: true }).evolvedDifference, /keeps mine count and damage.*caps sibling fuses.*25% larger/i);
});
