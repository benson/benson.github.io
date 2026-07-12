import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG, valueAtLevel } from "../balance-config.js";
import { MAP_OBSTACLES } from "../data.js";
import { Simulation, collidesWithCover } from "../engine.js";

const SEED = "83800000000000000000000000000838";

function scenario(specialist, evolved = true) {
  const sim = new Simulation({
    map: "warehouse", difficulty: "story", duration: 240,
    players: [{ id: "candidate", name: "Candidate", specialist, replaySlot: 0 }],
  }, { seed: SEED });
  sim.pods = []; sim.enemies = []; sim.events = [];
  sim.chance = () => false;
  const player = sim.players[0];
  player.x = 0; player.y = 0; player.invuln = 0;
  player.input = { x: 0, y: 0, aim: 0, autoAim: true };
  player.weapons.signature = { level: 5, evolved };
  return { sim, player };
}

function enemy(sim, { id, x = 100, y = 0, radius = 24, boss = false } = {}) {
  const target = sim.spawnEnemy("brute");
  Object.assign(target, {
    id: id || target.id, x, y, radius, boss,
    hp: 1_000_000, maxHp: 1_000_000, speed: 0, damage: 0, xp: 0,
    spawnLife: 0, attackCd: 1_000_000, shotCd: 1_000_000,
    knockVx: 0, knockVy: 0,
  });
  return target;
}

function advanceProjectiles(sim, ticks = 180) {
  for (let tick = 0; tick < ticks; tick++) sim.updateProjectiles(1 / 60);
}

function procEvents(sim, mechanicId) {
  return sim.events.filter((event) => event.type === "signature-evolution-proc" && event.mechanicId === mechanicId);
}

test("Sola Guard Return grants one armor-scaled shield per evolved volley without changing damage", () => {
  const evolved = scenario("sola", true), base = scenario("sola", false);
  evolved.player.armor = base.player.armor = 40;
  const evolvedTarget = enemy(evolved.sim), baseTarget = enemy(base.sim);

  assert.equal(evolved.sim.fireSignature(evolved.player), true);
  assert.equal(base.sim.fireSignature(base.player), true);
  assert.equal(evolved.sim.projectiles.length, 4);
  assert.equal(base.sim.projectiles.length, 4);
  advanceProjectiles(evolved.sim); advanceProjectiles(base.sim);

  const tuning = BALANCE_CONFIG.identityTuning.sola;
  const expectedShield = Math.min(tuning.guardReturnMax, tuning.guardReturnBase + evolved.player.armor * tuning.guardReturnArmorRatio);
  assert.equal(evolved.player.shield, expectedShield);
  assert.equal(base.player.shield, 0);
  assert.equal(1_000_000 - evolvedTarget.hp, 1_000_000 - baseTarget.hp);
  assert.deepEqual(Object.keys(evolved.player.damageBySource), ["signature"]);

  const first = procEvents(evolved.sim, "guard-return");
  assert.equal(first.length, 1);
  assert.equal(first[0].activationId, "s0-a1");
  assert.equal(first[0].shieldGranted, expectedShield);

  assert.equal(evolved.sim.fireSignature(evolved.player), true);
  advanceProjectiles(evolved.sim);
  assert.equal(procEvents(evolved.sim, "guard-return").length, 2);
  assert.equal(evolved.player.shield, expectedShield * 2);
});

test("Fang Predator Hook pulls non-bosses every third evolved swipe, respects cover, and adds no damage", () => {
  const evolved = scenario("fang", true), base = scenario("fang", false);
  evolved.player.maxHp = evolved.player.hp = base.player.maxHp = base.player.hp = 13.5;
  const hooked = enemy(evolved.sim, { id: "hooked", x: 100, y: 0 });
  const boss = enemy(evolved.sim, { id: "boss", x: 105, y: 32, radius: 40, boss: true });
  const baseTarget = enemy(base.sim, { id: "base", x: 100, y: 0 });

  evolved.sim.fireSignature(evolved.player); evolved.sim.fireSignature(evolved.player);
  base.sim.fireSignature(base.player); base.sim.fireSignature(base.player);
  assert.equal(procEvents(evolved.sim, "predator-hook").length, 0);
  const beforeHook = Math.hypot(hooked.x - evolved.player.x, hooked.y - evolved.player.y);
  const bossBefore = { x: boss.x, y: boss.y };

  evolved.sim.fireSignature(evolved.player); base.sim.fireSignature(base.player);
  const hookEvent = procEvents(evolved.sim, "predator-hook");
  assert.equal(hookEvent.length, 1);
  assert.equal(hookEvent[0].activationId, "s0-a3");
  assert.equal(hookEvent[0].affected, 1);
  assert.equal(hookEvent[0].pullDistance, 72);
  assert.equal(Math.round((beforeHook - Math.hypot(hooked.x, hooked.y)) * 10) / 10, 72);
  assert.deepEqual({ x: boss.x, y: boss.y }, bossBefore);
  assert.equal(hooked.knockVx, 0); assert.equal(hooked.knockVy, 0);
  assert.ok(boss.knockVx !== 0 || boss.knockVy !== 0, "boss keeps ordinary signature knockback but is never hooked");
  assert.equal(1_000_000 - hooked.hp, 1_000_000 - baseTarget.hp);
  assert.deepEqual(Object.keys(evolved.player.damageBySource), ["signature"]);
  assert.deepEqual(Object.keys(base.player.damageBySource), ["signature"]);

  // Pulling packed targets inward can intentionally retain more targets for a
  // later swipe; this assertion protects damage per activation from changing.
  const covered = scenario("fang", true);
  const [left, top, width, height] = MAP_OBSTACLES[0];
  covered.player.x = left + width / 2;
  covered.player.y = top - 40;
  const coveredTarget = enemy(covered.sim, {
    id: "covered", x: covered.player.x, y: top + height + 50,
  });
  const coveredBefore = { x: coveredTarget.x, y: coveredTarget.y };
  covered.sim.fireSignature(covered.player);
  covered.sim.fireSignature(covered.player);
  covered.sim.fireSignature(covered.player);
  const resolvedPull = Math.hypot(coveredTarget.x - coveredBefore.x, coveredTarget.y - coveredBefore.y);
  assert.ok(resolvedPull > 0 && resolvedPull < 72, "the actual third-swipe hook stops at cover before its authored pull distance");
  assert.equal(collidesWithCover(coveredTarget.x, coveredTarget.y, coveredTarget.radius), false,
    "the hooked target never overlaps the obstacle");
  assert.equal(procEvents(covered.sim, "predator-hook")[0].affected, 1,
    "the cover-bounded target is processed by the Fang hook itself");
});

test("Rift Kinetic Reserve maps resolved movement to knockback without changing damage", () => {
  const results = [];
  for (const reserveDistance of [0, 60, 120]) {
    const { sim, player } = scenario("rift", true);
    const target = enemy(sim);
    player.kineticReserve = reserveDistance;
    sim.fireSignature(player);
    const knockback = Math.hypot(target.knockVx, target.knockVy);
    const event = procEvents(sim, "kinetic-reserve")[0];
    results.push({ reserveDistance, damage: 1_000_000 - target.hp, knockback, event });
    assert.equal(player.kineticReserve, 0);
    assert.equal(event.activationId, "s0-a1");
    assert.equal(event.reserveDistance, reserveDistance);
    assert.deepEqual(Object.keys(player.damageBySource), ["signature"]);
  }

  assert.equal(results[0].event.knockbackScale, .12);
  assert.equal(results[1].event.knockbackScale, .22);
  assert.equal(results[2].event.knockbackScale, .32);
  assert.ok(results[0].knockback < results[1].knockback && results[1].knockback < results[2].knockback);
  assert.equal(new Set(results.map(({ damage }) => damage)).size, 1);

  const base = scenario("rift", false), baseTarget = enemy(base.sim);
  base.player.kineticReserve = 120;
  base.sim.fireSignature(base.player);
  assert.equal(base.player.kineticReserve, 0);
  assert.equal(Math.round(Math.hypot(baseTarget.knockVx, baseTarget.knockVy) * 1e6) / 1e6,
    Math.round(results[1].knockback * 1e6) / 1e6, "the evolved midpoint preserves shipped 0.22 knockback");
});

test("base and evolved signature cadence stays on the shipped direct-combat envelope", () => {
  const expected = {
    sola: { base: 1.75, evolved: 1.5 },
    fang: { base: 1.6, evolved: 1.248 },
    rift: { base: 0.9, evolved: 0.675 },
  };
  for (const [specialist, cadence] of Object.entries(expected)) {
    const tuning = BALANCE_CONFIG.weapons.signatures[specialist];
    const base = valueAtLevel(tuning.cycle, tuning.cyclePerLevel, 5);
    const evolved = tuning.evolvedCycleSeconds || base * tuning.evolvedCycle;
    assert.ok(Math.abs(base - cadence.base) < 1e-12, `${specialist} base cadence`);
    assert.ok(Math.abs(evolved - cadence.evolved) < 1e-12, `${specialist} evolved cadence`);
  }
});

test("evolution counters and reserve survive snapshots and anonymous recovery", () => {
  const { sim, player } = scenario("rift", true);
  player.signatureActivation = 7;
  player.guardReturnActivation = 6;
  player.predatorHookCounter = 2;
  player.kineticReserve = 60;

  const snapshot = sim.snapshot().players[0];
  assert.deepEqual({
    signatureActivation: snapshot.signatureActivation,
    guardReturnActivation: snapshot.guardReturnActivation,
    predatorHookCounter: snapshot.predatorHookCounter,
    kineticReserve: snapshot.kineticReserve,
  }, { signatureActivation: 7, guardReturnActivation: 6, predatorHookCounter: 2, kineticReserve: 60 });

  const restored = Simulation.fromRecoveryState(JSON.parse(JSON.stringify(sim.exportRecoveryState())));
  assert.deepEqual({
    signatureActivation: restored.players[0].signatureActivation,
    guardReturnActivation: restored.players[0].guardReturnActivation,
    predatorHookCounter: restored.players[0].predatorHookCounter,
    kineticReserve: restored.players[0].kineticReserve,
  }, { signatureActivation: 7, guardReturnActivation: 6, predatorHookCounter: 2, kineticReserve: 60 });
});

test("semantic evolution proc events are bounded and cannot override reserved event identity", () => {
  const { sim, player } = scenario("rift", true);
  const target = enemy(sim);
  for (let activation = 0; activation < 25; activation++) {
    target.x = 100; target.y = 0; target.dead = false; target.hp = 1_000_000;
    sim.fireSignature(player);
  }
  assert.equal(sim.events.length, 20);
  assert.ok(sim.events.every((event) => event.type === "signature-evolution-proc"));

  sim.pushEvent("test", "Reserved", "Safe", { seq: -1, type: "bad", title: "Bad", copy: "Bad", at: -1, mechanicId: "probe" });
  const event = sim.events.at(-1);
  assert.equal(event.type, "test"); assert.equal(event.title, "Reserved"); assert.equal(event.copy, "Safe");
  assert.equal(event.at, sim.tick); assert.ok(event.seq > 0); assert.equal(event.mechanicId, "probe");
});
