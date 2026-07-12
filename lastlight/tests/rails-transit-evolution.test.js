import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { MAP_OBSTACLES } from "../data.js";
import { Simulation, bestHorizontalCorridor, collidesWithCover } from "../engine.js";
import { getWeaponEvolution } from "../weapon-evolution.js";

const SEED = "83870000000000000000000000008387";

function scenario() {
  const sim = new Simulation({
    map: "warehouse", difficulty: "story", duration: 240,
    players: [{ id: "owner", name: "Owner", specialist: "zuri", replaySlot: 0 }],
  }, { seed: SEED });
  sim.pods = []; sim.enemies = []; sim.events = []; sim.effects = [];
  sim.chance = () => false;
  const player = sim.players[0];
  player.x = 0; player.y = 0; player.invuln = 0;
  player.input = { x: 0, y: 0, aim: 0, autoAim: false };
  return { sim, player };
}

function enemy(sim, { id, x, y, radius = 24, boss = false } = {}) {
  const target = sim.spawnEnemy("brute");
  Object.assign(target, {
    id, x, y, radius, boss, hp: 100_000, maxHp: 100_000, speed: 0, damage: 0, xp: 0,
    spawnLife: 0, attackCd: 1_000_000, shotCd: 1_000_000, knockVx: 0, knockVy: 0, stun: 0,
  });
  return target;
}

function procs(sim, mechanicId) {
  return sim.events.filter((event) => event.type === "weapon-evolution-proc" && event.mechanicId === mechanicId);
}

function pairOrigins(projectiles) {
  const origins = [];
  for (let index = 0; index < projectiles.length; index += 2) origins.push({
    x: (projectiles[index].x + projectiles[index + 1].x) / 2,
    y: (projectiles[index].y + projectiles[index + 1].y) / 2,
  });
  return origins;
}

test("base Rails stay horizontal in legacy offset order while Enveloping Light rotates center-first lanes", () => {
  const base = scenario(), evolved = scenario();
  base.player.weapons.rail = { level: 5, evolved: false };
  evolved.player.weapons.rail = { level: 5, evolved: true };
  base.player.input.aim = evolved.player.input.aim = Math.PI / 3;

  const baseCooldown = base.sim.fireCommonWeapon(base.player, "rail", base.player.weapons.rail);
  const evolvedCooldown = evolved.sim.fireCommonWeapon(evolved.player, "rail", evolved.player.weapons.rail);
  const tuning = BALANCE_CONFIG.weapons.universal.rail;
  const laneCount = tuning.countBase + Math.floor(5 / tuning.countEveryLevels);

  assert.equal(base.sim.projectiles.length, laneCount * 2);
  assert.equal(evolved.sim.projectiles.length, laneCount * 2);
  assert.ok(base.sim.projectiles.every(({ vx, vy }) => Math.abs(Math.abs(vx) - tuning.speed) < 1e-12 && Math.abs(vy) < 1e-12));
  assert.deepEqual(pairOrigins(base.sim.projectiles).map(({ x, y }) => [Math.round(x), Math.round(y)]), [[0, -28], [0, 0], [0, 28]],
    "the base weapon keeps its exact horizontal lane order even when aim is diagonal");

  const expectedDirections = [Math.PI / 3, Math.PI / 3 + Math.PI];
  for (let index = 0; index < evolved.sim.projectiles.length; index++) {
    const projectile = evolved.sim.projectiles[index], expected = expectedDirections[index % 2];
    assert.ok(Math.abs(Math.atan2(projectile.vy, projectile.vx) - (expected > Math.PI ? expected - Math.PI * 2 : expected)) < 1e-12);
  }
  const perpendicular = { x: -Math.sin(Math.PI / 3), y: Math.cos(Math.PI / 3) };
  const evolvedOrigins = pairOrigins(evolved.sim.projectiles);
  const projectedOffsets = evolvedOrigins.map(({ x, y }) => Math.round((x * perpendicular.x + y * perpendicular.y) * 1e9) / 1e9);
  assert.deepEqual(projectedOffsets, [0, -28, 28], "evolved perpendicular offsets are deterministic and center-first");

  for (const key of ["damage", "pierce"]) assert.deepEqual(evolved.sim.projectiles.map((projectile) => projectile[key]), base.sim.projectiles.map((projectile) => projectile[key]));
  assert.ok(evolved.sim.projectiles.every((projectile, index) => Math.abs(Math.hypot(projectile.vx, projectile.vy)
    - Math.hypot(base.sim.projectiles[index].vx, base.sim.projectiles[index].vy)) < 1e-9));
  assert.equal(evolvedCooldown, baseCooldown);
  assert.equal(evolvedCooldown, tuning.cooldownBase + 5 * tuning.cooldownPerLevel);
  const event = procs(evolved.sim, "rails-aim-lanes")[0];
  assert.equal(event.activationId, "s0-rail-a1"); assert.equal(event.aim, Math.PI / 3);
  assert.equal(event.laneCount, laneCount); assert.equal(event.projectileCount, laneCount * 2);
  assert.equal(procs(base.sim, "rails-aim-lanes").length, 0);
});

test("Enveloping Light follows the current finite auto-aim target", () => {
  const { sim, player } = scenario();
  player.weapons.rail = { level: 5, evolved: true };
  player.input = { x: 0, y: 0, aim: -1, autoAim: true };
  enemy(sim, { id: "aim-target", x: 0, y: 200 });
  sim.fireCommonWeapon(player, "rail", player.weapons.rail);
  assert.ok(Math.abs(procs(sim, "rails-aim-lanes")[0].aim - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(Math.atan2(sim.projectiles[0].vy, sim.projectiles[0].vx) - Math.PI / 2) < 1e-12);
});

test("Limited Express selects a stable bounded horizontal corridor while base Transit keeps random Y", () => {
  const evolved = scenario();
  evolved.player.weapons.transit = { level: 5, evolved: true };
  for (const [id, x, y] of [["dense-a", 100, 120], ["dense-b", 180, 130], ["dense-c", 260, 140], ["sparse", 80, -180]]) {
    enemy(evolved.sim, { id, x, y });
  }
  evolved.sim.fireCommonWeapon(evolved.player, "transit", evolved.player.weapons.transit);
  const train = evolved.sim.effects[0], event = procs(evolved.sim, "transit-corridor")[0];
  assert.equal(train.y, 120); assert.equal(event.targetId, "dense-a"); assert.equal(event.score, 3);
  assert.equal(event.candidateCount, 4); assert.equal(event.workUnits, 16);
  assert.ok([120, 130, 140, -180].includes(train.y), "lane Y is authored by a bounded candidate rather than an average");
  assert.equal(evolved.sim.effects.length, 1); assert.equal(event.activationId, "s0-transit-a1");

  const base = scenario(), randomProbe = scenario();
  base.player.weapons.transit = { level: 5, evolved: false };
  const tuning = BALANCE_CONFIG.weapons.universal.transit;
  const expectedY = randomProbe.player.y + randomProbe.sim.random(-tuning.yRange, tuning.yRange);
  const baseDraws = base.sim.gameplayRng.snapshot().drawCount;
  const cooldown = base.sim.fireCommonWeapon(base.player, "transit", base.player.weapons.transit);
  assert.equal(base.sim.effects[0].y, expectedY, "base Transit consumes the unchanged deterministic random-Y draw");
  assert.equal(base.sim.effects[0].damage, train.damage);
  assert.equal(base.sim.effects[0].vx, train.vx); assert.equal(base.sim.effects[0].life, train.life);
  assert.equal(cooldown, tuning.cooldownBase + 5 * tuning.cooldownPerLevel);
  assert.equal(base.sim.gameplayRng.snapshot().drawCount - baseDraws, 1, "base Transit consumes exactly one lane draw");
  const evolvedNoDraw = scenario(); evolvedNoDraw.player.weapons.transit = { level: 5, evolved: true };
  const evolvedDraws = evolvedNoDraw.sim.gameplayRng.snapshot().drawCount;
  evolvedNoDraw.sim.fireCommonWeapon(evolvedNoDraw.player, "transit", evolvedNoDraw.player.weapons.transit);
  assert.equal(evolvedNoDraw.sim.gameplayRng.snapshot().drawCount - evolvedDraws, 0, "evolved targeting consumes no random lane draw");
  assert.equal(procs(base.sim, "transit-corridor").length, 0);
  assert.equal(base.player.weaponActivations.transit, undefined);
});

test("horizontal corridor scoring stays within the twelve-candidate quadratic budget", () => {
  const entities = Array.from({ length: 1_000 }, (_, index) => ({
    id: `enemy-${String(index).padStart(4, "0")}`, x: index + 1, y: index % 7,
  }));
  const result = bestHorizontalCorridor({ x: 0, y: 0 }, entities, { halfHeight: 58, maxCandidates: 12 });
  assert.equal(result.candidateCount, 12); assert.equal(result.workUnits, 144);
  assert.ok(result.score <= 12); assert.equal(entities[0].x, 1, "the bounded scorer never mutates its input");
  const tie = bestHorizontalCorridor({ x: 0, y: 0 }, [
    { id: "lane-b", x: 100, y: 100 }, { id: "lane-a", x: 100, y: -100 },
  ], { halfHeight: 58, maxCandidates: 12 });
  assert.equal(tie.entity.id, "lane-a", "equal horizontal scores and distances resolve by stable id");
});

test("Limited Express pushes every non-boss once, leaves bosses fixed, and emits one bounded push proc", () => {
  const { sim, player } = scenario();
  player.weapons.transit = { level: 5, evolved: true };
  const first = enemy(sim, { id: "first", x: 0, y: 0 });
  const second = enemy(sim, { id: "second", x: 0, y: 20 });
  second.miniboss = true;
  const boss = enemy(sim, { id: "boss", x: 0, y: 40, radius: 38, boss: true });
  sim.fireCommonWeapon(player, "transit", player.weapons.transit);
  const train = sim.effects[0]; train.x = -50;
  const damage = train.damage;
  sim.updateEffects(0);

  assert.ok(Math.abs(first.x - 120) < 1e-9); assert.ok(Math.abs(second.x - 120) < 1e-9);
  assert.equal(first.stun, 1.25); assert.equal(second.stun, 1.25);
  assert.equal(boss.x, 0); assert.equal(boss.stun, 1);
  for (const target of [first, second, boss]) assert.equal(100_000 - target.hp, damage);
  const pushes = procs(sim, "transit-cover-push");
  assert.equal(pushes.length, 1); assert.equal(pushes[0].targetId, "first");
  assert.equal(pushes[0].pushDistance, 120); assert.ok(Math.abs(pushes[0].resolvedDistance - 120) < 1e-9);
  sim.updateEffects(0);
  assert.equal(procs(sim, "transit-cover-push").length, 1, "the train entity reports at most its first push");
});

test("Limited Express uses the exact 58-unit contact band and never pushes a target killed by the hit", () => {
  const { sim, player } = scenario();
  player.weapons.transit = { level: 5, evolved: true };
  const boundary = enemy(sim, { id: "boundary", x: 0, y: 58 });
  const outside = enemy(sim, { id: "outside", x: 0, y: 58.001 });
  const killed = enemy(sim, { id: "killed", x: 0, y: 0 }); killed.hp = 1; killed.maxHp = 1;
  sim.fireCommonWeapon(player, "transit", player.weapons.transit);
  const train = sim.effects[0]; train.x = -50; train.y = 0;
  sim.updateEffects(0);
  assert.ok(boundary.hp < boundary.maxHp); assert.ok(Math.abs(boundary.x - 120) < 1e-9);
  assert.equal(outside.hp, outside.maxHp); assert.equal(outside.x, 0);
  assert.equal(killed.dead, true); assert.equal(killed.x, 0, "damage resolves before push and lethal hits are never displaced");
});

test("Limited Express push resolves against cover without overlap", () => {
  const { sim, player } = scenario();
  player.weapons.transit = { level: 5, evolved: true };
  const [left, top, width, height] = MAP_OBSTACLES[0];
  const target = enemy(sim, { id: "covered", x: left - 50, y: top + height / 2 });
  sim.fireCommonWeapon(player, "transit", player.weapons.transit);
  const train = sim.effects[0]; train.x = target.x - 50; train.y = target.y;
  const before = target.x;
  sim.updateEffects(0);
  const resolved = target.x - before;
  assert.ok(resolved > 0 && resolved < 120);
  assert.equal(collidesWithCover(target.x, target.y, target.radius), false);
  assert.equal(procs(sim, "transit-cover-push")[0].resolvedDistance, resolved);
});

test("Rails activation and active Limited Express state survive snapshots and anonymous recovery", () => {
  const { sim, player } = scenario();
  player.weapons.rail = { level: 5, evolved: true };
  player.weapons.transit = { level: 5, evolved: true };
  player.input.aim = Math.PI / 4;
  const target = enemy(sim, { id: "lane", x: 100, y: 50 });
  sim.fireCommonWeapon(player, "rail", player.weapons.rail);
  sim.fireCommonWeapon(player, "transit", player.weapons.transit);
  const train = sim.effects.find(({ kind }) => kind === "train");
  train.x = 50; train.y = 50;
  sim.updateEffects(0);
  assert.equal(train.hit.has(target.id), true); assert.equal(train.pushProcEmitted, true);
  target.x = 100;

  const snapshot = sim.snapshot();
  assert.deepEqual(snapshot.players[0].weaponActivations, { rail: 1, transit: 1 });
  const snapTrain = snapshot.effects.find(({ kind }) => kind === "train");
  assert.equal(snapTrain.evolutionActivationId, "s0-transit-a1"); assert.equal(snapTrain.pushProcEmitted, true);
  assert.equal(snapTrain.variantId, "universal:transit:evolved");

  const restored = Simulation.fromRecoveryState(JSON.parse(JSON.stringify(sim.exportRecoveryState())));
  assert.deepEqual(restored.players[0].weaponActivations, { rail: 1, transit: 1 });
  const restoredTrain = restored.effects.find(({ kind }) => kind === "train");
  assert.equal(restoredTrain.evolutionActivationId, "s0-transit-a1"); assert.equal(restoredTrain.pushProcEmitted, true);
  assert.ok(restoredTrain.hit instanceof Set);
  assert.equal(restoredTrain.hit.has(target.id), true);
  const restoredTarget = restored.enemies.find(({ id }) => id === target.id), hpBefore = restoredTarget.hp;
  restored.updateEffects(0);
  assert.equal(restoredTarget.hp, hpBefore); assert.equal(procs(restored, "transit-cover-push").length, 0,
    "recovered hit and push-once state prevents duplicate effects");
  assert.throws(() => { restoredTrain.variantId = "universal:transit:base"; }, TypeError);
});

test("strict evolution and archive copy expose aimed Rails and Limited Express impact rules", () => {
  const rails = getWeaponEvolution("rail"), transit = getWeaponEvolution("transit");
  assert.deepEqual(rails.capabilities.map(({ id }) => id), ["aim-lanes"]);
  assert.deepEqual(transit.capabilities.map(({ id }) => id), ["horizontal-corridor", "cover-push"]);
  assert.equal(rails.status, "gameplay"); assert.equal(transit.status, "gameplay");
});

test("weapon proc details cannot overwrite reserved semantic identity", () => {
  const { sim, player } = scenario();
  sim.pushWeaponEvolutionProc(player, "rail", "rails-aim-lanes", "s0-rail-a9", player, 0, {
    sourceId: "bad", mechanicId: "bad", activationId: "bad", ownerId: "bad",
    position: { x: 99, y: 99 }, direction: 99, type: "bad", seq: -1, at: -1,
  });
  const event = sim.events.at(-1);
  assert.equal(event.type, "weapon-evolution-proc"); assert.equal(event.sourceId, "rail");
  assert.equal(event.mechanicId, "rails-aim-lanes"); assert.equal(event.activationId, "s0-rail-a9");
  assert.equal(event.ownerId, player.id); assert.deepEqual(event.position, { x: player.x, y: player.y });
  assert.equal(event.direction, 0); assert.ok(event.seq >= 0); assert.equal(event.at, sim.tick);
});
