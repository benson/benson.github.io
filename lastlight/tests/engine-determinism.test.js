import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { SIMULATION_TICK_RATE, Simulation } from "../engine.js";

const SEED = "0123456789abcdeffedcba9876543210";
const player = (specialist = "zuri", extra = {}) => ({ id: "p1", name: "One", specialist, ...extra });
const create = (specialist = "zuri", extra = {}) => new Simulation(
  { players: [player(specialist)] },
  { seed: SEED, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, ...extra },
);

test("same seed and inputs produce byte-equivalent snapshots", () => {
  const left = create();
  const right = create();
  for (let tick = 0; tick < 180; tick++) {
    const input = { x: tick % 30 < 15 ? 1 : -1, y: tick % 40 < 20 ? 0.5 : -0.5, aim: tick / 17, autoAim: false };
    left.setInput("p1", input);
    right.setInput("p1", input);
    left.update(1 / SIMULATION_TICK_RATE);
    right.update(1 / SIMULATION_TICK_RATE);
  }
  assert.equal(JSON.stringify(left.snapshot()), JSON.stringify(right.snapshot()));
  assert.deepEqual(left.deterministicState(), right.deterministicState());
  assert.equal(left.tick, 180);
});

test("different seeds diverge and constructor validates replay identity", () => {
  const left = create();
  const right = new Simulation({ players: [player()] }, { seed: "11111111222222223333333344444444" });
  assert.notDeepEqual(left.pods.map(({ x, y }) => [x, y]), right.pods.map(({ x, y }) => [x, y]));
  assert.throws(() => create("zuri", { balanceVersion: "old" }), /Unsupported balance version/);
  assert.throws(() => create("zuri", { balanceHash: "fnv1a32:00000000" }), /Unsupported balance hash/);
  assert.throws(() => create("zuri", { seed: "bad" }), /32 lowercase hexadecimal/);
});

test("constructor remains compatible and accepts replay options in config or options", () => {
  const embedded = new Simulation({ players: [player()], seed: SEED, balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH });
  const separate = create();
  assert.equal(embedded.seed, SEED);
  assert.deepEqual(embedded.deterministicState(), separate.deterministicState());
});

test("cosmetic work cannot perturb gameplay RNG or gameplay IDs", () => {
  const decorated = create();
  const plain = create();
  decorated.cosmeticChance(0.5);
  decorated.blast(0, 0, 10, 0, "p1", "#fff", true);
  assert.equal(decorated.effects[0].id, "fxc1");
  const decoratedEnemy = decorated.spawnEnemy("mite");
  const plainEnemy = plain.spawnEnemy("mite");
  assert.equal(decoratedEnemy.id, plainEnemy.id);
  assert.deepEqual(decorated.gameplayRng.snapshot(), plain.gameplayRng.snapshot());
  assert.notDeepEqual(decorated.cosmeticRng.snapshot(), plain.cosmeticRng.snapshot());
});

test("input rejects nonfinite aim without corrupting the previous command", () => {
  const sim = create();
  assert.equal(sim.setInput("p1", { x: 1, y: 0, aim: 1.25, autoAim: false }), true);
  const previous = { ...sim.players[0].input };
  for (const aim of [Number.NaN, Infinity, -Infinity, undefined]) {
    assert.equal(sim.setInput("p1", { x: 0, y: 1, aim, autoAim: true }), false);
    assert.deepEqual(sim.players[0].input, previous);
  }
});

test("player replay slots are optional, validated, and preserved through reconnect", () => {
  const resumeToken = "a".repeat(24);
  const sim = new Simulation({ players: [player("echo", { replaySlot: 2, resumeToken })] }, { seed: SEED });
  assert.equal(sim.players[0].replaySlot, 2);
  assert.equal(sim.snapshot().players[0].replaySlot, 2);
  sim.removePlayer("p1");
  const restored = sim.addPlayer({ id: "p2", name: "Two", specialist: "zuri", replaySlot: 3, resumeToken });
  assert.equal(restored.replaySlot, 2);
  const invalid = sim.addPlayer({ id: "p3", name: "Three", specialist: "zuri", replaySlot: 9 });
  assert.equal(invalid.replaySlot, undefined);
});

test("events and delayed tasks use tick-stamped serializable state", () => {
  const sola = create("sola");
  sola.level = 3;
  sola.cast("p1", "e");
  assert.deepEqual(sola.tasks.map((task) => task.kind), ["sola-detonate", "sola-aftershock"]);
  assert.deepEqual(sola.tasks.map((task) => task.dueTick), [180, 300]);
  assert.doesNotThrow(() => JSON.stringify(sola.tasks));
  assert.equal(Object.values(sola.tasks[0]).some((value) => typeof value === "function"), false);
  sola.tick = 179;
  sola.update(1 / SIMULATION_TICK_RATE);
  assert.equal(sola.players[0].armor, 25);
  assert.deepEqual(sola.tasks.map((task) => task.kind), ["sola-aftershock"]);
  sola.pushEvent("test", "Tick event");
  assert.equal(sola.events.at(-1).at, 180);
});

test("versioned gameplay flags can safely suppress optional objective systems", () => {
  const disabled = new Simulation({ players: [player()], features: {
    gameplayVersion: "events-off-v1", objectiveEvents: false,
    squadSynergies: false, registryVersion: "lastlight.squad-synergy.v1",
  } }, { seed: SEED });
  disabled.time = disabled.duration;
  disabled.nextTreasure = 0; disabled.nextRelayBall = 0; disabled.objectiveIndex = 0;
  disabled.nextElite = Infinity; disabled.nextMiniBoss = Infinity;
  disabled.updateScheduledEvents();
  assert.equal(disabled.enemies.some((enemy) => enemy.eventType === "treasure"), false);
  assert.equal(disabled.relayBalls.length, 0);
  assert.equal(disabled.objectives.length, 0);
  assert.deepEqual(disabled.snapshot().features, {
    gameplayVersion: "events-off-v1", objectiveEvents: false,
    squadSynergies: false, registryVersion: "lastlight.squad-synergy.v1",
  });

  const enabled = new Simulation({ players: [player()], features: {
    gameplayVersion: "events-v1", objectiveEvents: true,
    squadSynergies: false, registryVersion: "lastlight.squad-synergy.v1",
  } }, { seed: SEED });
  enabled.time = enabled.duration;
  enabled.nextTreasure = 0; enabled.nextRelayBall = 0; enabled.objectiveIndex = 0;
  enabled.nextElite = Infinity; enabled.nextMiniBoss = Infinity;
  enabled.updateScheduledEvents();
  assert.equal(enabled.enemies.some((enemy) => enemy.eventType === "treasure"), true);
  assert.equal(enabled.relayBalls.length, 1);
  assert.equal(enabled.objectives.length, 1);
  assert.throws(() => new Simulation({ players: [player()], features: {
    gameplayVersion: "events-v1", objectiveEvents: true,
    squadSynergies: false, registryVersion: "lastlight.squad-synergy.v1", unknown: true,
  } }, { seed: SEED }), /unsupported/);
});

test("all authored delayed task kinds are descriptors with stable execution", () => {
  const echo = create("echo");
  echo.chance = () => true;
  echo.fireSignature(echo.players[0]);
  assert.equal(echo.tasks[0].kind, "echo-projectile-repeat");
  const firstVolley = echo.projectiles.length;
  echo.tick = echo.tasks[0].dueTick;
  echo.updateTasks();
  assert.equal(echo.projectiles.length, firstVolley * 2);

  const bront = create("bront");
  bront.players[0].weapons.signature.evolved = true;
  const target = bront.spawnEnemy("mite");
  target.x = 40; target.y = 50;
  bront.fireSignature(bront.players[0]);
  const repeat = bront.tasks.find((task) => task.kind === "bront-repeat-blast");
  assert.ok(repeat);
  target.dead = true;
  bront.tick = repeat.dueTick;
  bront.updateTasks();
  assert.ok(bront.effects.some((effect) => effect.x === 40 && effect.y === 50));

  const bomber = create();
  const enemy = bomber.spawnEnemy("bomber");
  const specialist = bomber.players[0];
  enemy.x = specialist.x + 10; enemy.y = specialist.y; enemy.stun = 0;
  bomber.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.behaviorState, "windup");
  assert.equal(bomber.tasks.filter((task) => task.kind === "bomber-detonate").length, 0);
  bomber.tick = enemy.behaviorUntilTick;
  bomber.updateEnemies(1 / SIMULATION_TICK_RATE);
  assert.equal(enemy.dead, true);

  assert.equal(echo.tasks.length, 0);
  assert.equal(bront.tasks.length, 0);
  assert.equal(bomber.tasks.length, 0);
});

test("engine source cannot bypass deterministic RNG, IDs, ticks, or task descriptors", () => {
  const source = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /performance\.now\s*\(/);
  assert.doesNotMatch(source, /\blet\s+entityId\b/);
  assert.doesNotMatch(source, /tasks\.push\s*\(\s*\{[^}]*\brun\s*:/s);
  assert.doesNotMatch(source, /tasks\.push\s*\(\s*\{[^}]*\btime\s*:/s);
});
