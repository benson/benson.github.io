import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { Simulation } from "../engine.js";
import { getWeaponImpactGrammar } from "../impact-grammar.js";
import { getWeaponEvolution } from "../weapon-evolution.js";

const SEED = "abcdef0123456789abcdef0123456789";

function scenario() {
  const sim = new Simulation({
    map: "warehouse", difficulty: "story", duration: 600,
    players: [{ id: "p0", name: "Probe", specialist: "zuri", replaySlot: 0 }],
  }, { seed: SEED });
  sim.spawnClock = -1_000_000;
  sim.nextElite = Infinity;
  sim.nextMiniBoss = Infinity;
  sim.nextTreasure = Infinity;
  sim.nextRelayBall = Infinity;
  sim.pods = [];
  sim.chance = () => false;
  sim.random = () => 0;
  const player = sim.players[0];
  Object.assign(player, { x: 0, y: 0, invuln: 0, input: { x: 0, y: 0, aim: 0, autoAim: false } });
  return { sim, player };
}

function target(sim, id, x, y, hp = 100_000) {
  const enemy = sim.spawnEnemy("brute");
  Object.assign(enemy, { id, x, y, hp, maxHp: hp, speed: 0, damage: 0, dead: false, knockVx: 0, knockVy: 0 });
  return enemy;
}

function procEvents(sim, mechanicId) {
  return sim.events.filter((event) => event.type === "weapon-evolution-proc" && event.mechanicId === mechanicId);
}

test("Twin Needle retargets the same projectile once at 70% with stable distance/id ties", () => {
  const { sim, player } = scenario();
  player.weapons.uwu = { level: 1, evolved: true };
  const first = target(sim, "first", 90, 0);
  const tieZ = target(sim, "z-target", 90, 100);
  const tieA = target(sim, "a-target", 90, -100);

  sim.fireCommonWeapon(player, "uwu", player.weapons.uwu);
  assert.equal(sim.projectiles.length, 1);
  const projectile = sim.projectiles[0], projectileId = projectile.id, initialDamage = projectile.damage;
  Object.assign(projectile, { x: first.x, y: first.y });
  sim.updateProjectiles(0);

  assert.equal(sim.projectiles.length, 1, "retargeting must not allocate another projectile");
  assert.equal(sim.projectiles[0], projectile);
  assert.equal(projectile.id, projectileId);
  assert.equal(projectile.needleRetargeted, true);
  assert.equal(projectile.needleRetargetTargetId, tieA.id, "equal-distance targets resolve by stable id");
  assert.equal(projectile.damage, initialDamage * BALANCE_CONFIG.weapons.universal.uwu.evolvedRetargetDamageMultiplier);
  assert.ok(projectile.vy < 0);
  assert.equal(first.hp, first.maxHp - initialDamage);

  Object.assign(projectile, { x: tieA.x, y: tieA.y });
  sim.updateProjectiles(0);
  assert.equal(tieA.hp, tieA.maxHp - initialDamage * 0.7);
  assert.equal(tieZ.hp, tieZ.maxHp);
  assert.equal(projectile.dead, true);
  assert.deepEqual(procEvents(sim, "needle-retarget").map((event) => ({
    firstTargetId: event.firstTargetId, targetId: event.targetId, damageMultiplier: event.damageMultiplier,
    sourceId: event.sourceId, variantId: event.variantId, projectileId: event.projectileId,
  })), [{
    firstTargetId: "first", targetId: "a-target", damageMultiplier: 0.7,
    sourceId: "uwu", variantId: "universal:uwu:evolved", projectileId,
  }]);
});

test("Twin Needle redirected lanes remain cover-blocked", () => {
  const { sim, player } = scenario();
  Object.assign(player, { x: -760, y: 240 });
  player.weapons.uwu = { level: 1, evolved: true };
  const first = target(sim, "first", -700, 240);
  const behindCover = target(sim, "behind-cover", -500, 340);

  sim.fireCommonWeapon(player, "uwu", player.weapons.uwu);
  const projectile = sim.projectiles[0];
  Object.assign(projectile, { x: first.x, y: first.y });
  sim.updateProjectiles(0);
  assert.equal(projectile.needleRetargetTargetId, behindCover.id);

  sim.updateProjectiles(0.3);
  assert.equal(projectile.dead, true);
  assert.equal(typeof projectile.coverImpact, "number");
  assert.equal(behindCover.hp, behindCover.maxHp, "cover intercepts before the redirected hit");
});

test("Quad-o-rang has separate bounded phases and movement-charged owner-following return damage", () => {
  const { sim, player } = scenario();
  player.weapons.boomerang = { level: 1, evolved: true };
  const enemy = target(sim, "same-target", 100, 0);
  sim.fireCommonWeapon(player, "boomerang", player.weapons.boomerang);
  assert.equal(sim.projectiles.length, 1);
  const projectile = sim.projectiles[0], projectileId = projectile.id, initialDamage = projectile.damage;

  Object.assign(projectile, { x: enemy.x, y: enemy.y });
  sim.updateProjectiles(0);
  assert.equal(enemy.hp, enemy.maxHp - initialDamage);
  assert.deepEqual([...projectile.boomerangOutboundHit], [enemy.id]);
  assert.deepEqual([...projectile.boomerangInboundHit], []);

  sim.movePlayer(player, 360, 0);
  projectile.age = BALANCE_CONFIG.weapons.universal.boomerang.returnAfter + 0.01;
  sim.updateProjectiles(0);
  assert.equal(projectile.boomerangPhase, "inbound");
  assert.equal(projectile.boomerangOwnerTravel, 360);
  assert.equal(projectile.boomerangReturnDamageMultiplier, 1.3);
  assert.equal(enemy.hp, enemy.maxHp - initialDamage * 2.3);
  assert.deepEqual([...projectile.boomerangInboundHit], [enemy.id]);

  const afterReturnHit = enemy.hp;
  sim.updateProjectiles(0);
  assert.equal(enemy.hp, afterReturnHit, "an inbound phase cannot hit the same target twice");
  sim.movePlayer(player, 0, 120);
  Object.assign(projectile, { x: 100, y: 0 });
  sim.updateProjectiles(0);
  assert.ok(projectile.vx > 0 && projectile.vy > 0, "the inbound lane follows the owner's current position");

  assert.deepEqual(procEvents(sim, "boomerang-return").map((event) => ({
    targetId: event.targetId, phase: event.phase, ownerTravel: event.ownerTravel,
    damageMultiplier: event.damageMultiplier, sourceId: event.sourceId, variantId: event.variantId, projectileId: event.projectileId,
  })), [{
    targetId: enemy.id, phase: "inbound", ownerTravel: 360, damageMultiplier: 1.3,
    sourceId: "boomerang", variantId: "universal:boomerang:evolved", projectileId,
  }]);

  const snapshot = sim.snapshot().projectiles[0];
  assert.deepEqual(snapshot.boomerangOutboundHitIds, [enemy.id]);
  assert.deepEqual(snapshot.boomerangInboundHitIds, [enemy.id]);
  assert.equal(snapshot.boomerangReturnDamageMultiplier, 1.3);
});

test("Quad-o-rang phase state survives anonymous mid-flight recovery exactly", () => {
  const { sim, player } = scenario();
  player.weapons.boomerang = { level: 1, evolved: true };
  const outbound = target(sim, "outbound-target", 100, 0);
  target(sim, "return-target", 160, 0);
  sim.fireCommonWeapon(player, "boomerang", player.weapons.boomerang);
  const projectile = sim.projectiles[0];
  Object.assign(projectile, { x: outbound.x, y: outbound.y });
  sim.updateProjectiles(0);
  sim.movePlayer(player, 180, 0);
  Object.assign(projectile, { x: 140, y: 60, age: BALANCE_CONFIG.weapons.universal.boomerang.returnAfter + 0.01 });
  sim.updateProjectiles(0);

  const recovery = JSON.parse(JSON.stringify(sim.exportRecoveryState()));
  const restored = Simulation.fromRecoveryState(recovery);
  const restoredProjectile = restored.projectiles[0];
  assert.equal(restoredProjectile.boomerangPhase, "inbound");
  assert.equal(restoredProjectile.boomerangOwnerTravel, projectile.boomerangOwnerTravel);
  assert.deepEqual([...restoredProjectile.boomerangOutboundHit], [...projectile.boomerangOutboundHit]);
  assert.deepEqual([...restoredProjectile.boomerangInboundHit], [...projectile.boomerangInboundHit]);
  assert.equal(restoredProjectile.sourceId, "boomerang");
  assert.equal(restoredProjectile.variantId, "universal:boomerang:evolved");
  assert.throws(() => { restoredProjectile.sourceId = "uwu"; }, TypeError);
  assert.throws(() => { restoredProjectile.variantId = "universal:boomerang:base"; }, TypeError);

  const originalReturn = sim.enemies.find((enemy) => enemy.id === "return-target");
  const restoredReturn = restored.enemies.find((enemy) => enemy.id === "return-target");
  Object.assign(projectile, { x: originalReturn.x, y: originalReturn.y });
  Object.assign(restoredProjectile, { x: restoredReturn.x, y: restoredReturn.y });
  sim.updateProjectiles(0);
  restored.updateProjectiles(0);
  assert.equal(restoredReturn.hp, originalReturn.hp);
  assert.deepEqual([...restoredProjectile.boomerangInboundHit], [...projectile.boomerangInboundHit]);
  assert.equal(restoredProjectile.boomerangReturnDamageMultiplier, projectile.boomerangReturnDamageMultiplier);
});

test("evolved projectile mechanics are bounded while base envelopes do not drift", () => {
  const base = BALANCE_CONFIG.weapons.universal;
  assert.deepEqual({
    uwuCooldown: base.uwu.cooldownBase, uwuDamage: base.uwu.damageBase, uwuSpeed: base.uwu.speed,
    boomerangCooldown: base.boomerang.cooldownBase, boomerangDamage: base.boomerang.damageBase,
    boomerangPierce: base.boomerang.pierce, boomerangLife: base.boomerang.life, boomerangReturnAfter: base.boomerang.returnAfter,
  }, {
    uwuCooldown: 0.75, uwuDamage: 28, uwuSpeed: 820,
    boomerangCooldown: 3.8, boomerangDamage: 65, boomerangPierce: 8, boomerangLife: 1.45, boomerangReturnAfter: 0.72,
  });

  const baseNeedle = scenario();
  baseNeedle.player.weapons.uwu = { level: 1, evolved: false };
  const needleFirst = target(baseNeedle.sim, "needle-first", 80, 0);
  const needleSecond = target(baseNeedle.sim, "needle-second", 80, 0);
  baseNeedle.sim.fireCommonWeapon(baseNeedle.player, "uwu", baseNeedle.player.weapons.uwu);
  const ordinaryNeedle = baseNeedle.sim.projectiles[0];
  Object.assign(ordinaryNeedle, { x: 80, y: 0 });
  baseNeedle.sim.updateProjectiles(0);
  assert.equal(needleFirst.hp, needleFirst.maxHp - ordinaryNeedle.damage);
  assert.equal(needleSecond.hp, needleSecond.maxHp);
  assert.equal(ordinaryNeedle.needleRetarget, undefined);

  const baseBoomerang = scenario();
  baseBoomerang.player.weapons.boomerang = { level: 1, evolved: false };
  const baseTarget = target(baseBoomerang.sim, "base-target", 100, 0);
  baseBoomerang.sim.fireCommonWeapon(baseBoomerang.player, "boomerang", baseBoomerang.player.weapons.boomerang);
  const ordinaryBoomerang = baseBoomerang.sim.projectiles[0];
  Object.assign(ordinaryBoomerang, { x: baseTarget.x, y: baseTarget.y });
  baseBoomerang.sim.updateProjectiles(0);
  const afterOutbound = baseTarget.hp;
  ordinaryBoomerang.age = base.boomerang.returnAfter + 0.01;
  baseBoomerang.sim.updateProjectiles(0);
  assert.equal(baseTarget.hp, afterOutbound, "the base boomerang retains one global hit ledger");
  assert.equal(ordinaryBoomerang.evolvedBoomerang, undefined);

  const budget = scenario();
  budget.player.weapons.boomerang = { level: 1, evolved: true };
  for (let index = 0; index < 12; index++) target(budget.sim, `crowd-${String(index).padStart(2, "0")}`, 100, 0);
  budget.sim.fireCommonWeapon(budget.player, "boomerang", budget.player.weapons.boomerang);
  const bounded = budget.sim.projectiles[0];
  Object.assign(bounded, { x: 100, y: 0 });
  budget.sim.updateProjectiles(0);
  assert.equal(bounded.boomerangOutboundHit.size, base.boomerang.evolvedHitsPerPhase);
  assert.equal(bounded.dead, false, "the outbound cap preserves the return phase");
  bounded.age = base.boomerang.returnAfter + 0.01;
  budget.sim.updateProjectiles(0);
  assert.equal(bounded.boomerangInboundHit.size, base.boomerang.evolvedHitsPerPhase);
  assert.equal(bounded.dead, true);
  assert.equal(budget.sim.projectiles.length, 1, "phase mechanics reuse the original entity");
  assert.equal(procEvents(budget.sim, "boomerang-return").length, 1);
});

test("authoritative evolution contract and impact copy describe the shipped mechanics", () => {
  const needle = getWeaponEvolution("uwu"), boomerang = getWeaponEvolution("boomerang");
  assert.equal(needle.status, "gameplay");
  assert.deepEqual(needle.capabilities.map(({ id }) => id), ["cadence", "retarget"]);
  assert.match(needle.capabilities[1].note, /same needle.*nearest unhit.*240 units.*70% damage.*cover/i);
  assert.equal(boomerang.status, "gameplay");
  assert.deepEqual(boomerang.capabilities.map(({ id }) => id), ["phase-hits", "movement-return-damage"]);
  assert.match(boomerang.capabilities[1].note, /up to 30%.*360 units.*current position/i);
  assert.match(getWeaponImpactGrammar("uwu", { evolved: true }).evolvedDifference, /same projectile.*240 units.*70% damage.*cover/i);
  assert.match(getWeaponImpactGrammar("boomerang", { evolved: true }).evolvedDifference, /once outbound.*once inbound.*30% damage.*360 units/i);
});
