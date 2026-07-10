import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";

test("a run transitions from survival to an apex fight", () => {
  const sim = new Simulation({ duration: .1, players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  for (let i = 0; i < 5; i++) sim.update(.05);
  assert.equal(sim.stage, "boss");
  assert.ok(sim.enemies.some((enemy) => enemy.boss));
});

test("level-up choices pause and resume the whole simulation", () => {
  const sim = new Simulation({ duration: 240, players: [{ id: "p1", name: "One", specialist: "echo" }] });
  sim.teamXP = sim.xpNeed;
  sim.updatePickups(.016);
  assert.equal(sim.paused, true);
  assert.equal(sim.pendingChoices.p1.length, 3);
  sim.choose("p1", sim.pendingChoices.p1[0].id);
  assert.equal(sim.paused, false);
  assert.equal(sim.level, 2);
});

test("upgrade rounds expose each locked choice until the squad finishes", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri" },
    { id: "p2", name: "Two", specialist: "echo" },
  ] });
  sim.beginUpgradeChoice();
  const oneChoice = sim.pendingChoices.p1[0].id;
  sim.choose("p1", oneChoice);
  assert.equal(sim.selectedChoices.p1, oneChoice);
  assert.equal(sim.choiceReady.p1, true);
  assert.ok(sim.pendingChoices.p1);
  assert.equal(sim.paused, true);
  sim.choose("p2", sim.pendingChoices.p2[0].id);
  assert.equal(sim.pendingChoices, null);
  assert.equal(sim.paused, false);
});

test("access cards evolve a level-five weapon with its passive", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "gale" }] });
  const player = sim.players[0];
  player.weapons.signature.level = 5;
  player.passives.crit = 1;
  sim.useAccessCard();
  assert.equal(player.weapons.signature.evolved, true);
});

test("co-op teammates can revive a downed specialist", () => {
  const sim = new Simulation({ players: [
    { id: "p1", name: "One", specialist: "zuri" },
    { id: "p2", name: "Two", specialist: "sola" },
  ] });
  const [one, two] = sim.players;
  one.invuln = 0;
  sim.takeDamage(one, 100_000);
  assert.equal(one.downed, true);
  two.x = one.x; two.y = one.y;
  for (let i = 0; i < 70; i++) sim.updatePlayers(.05);
  assert.equal(one.downed, false);
  assert.ok(one.hp > 0);
  assert.ok(one.invuln > 0);
  assert.equal(two.revives, 1);
});

test("per-player combat, pickup, and damage stats are credited", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "echo" }] });
  const player = sim.players[0];
  const enemy = sim.spawnEnemy("hound");
  enemy.hp = 25;
  enemy.maxHp = 25;
  sim.damageEnemy(enemy, 40, player.id);
  assert.equal(player.damage, 25);
  assert.equal(player.kills, 1);

  sim.orbs.push({ id: "test-orb", x: player.x, y: player.y, radius: 5, value: 7, color: "#fff", dead: false });
  sim.updatePickups(.016);
  assert.equal(player.xpCollected, 7);

  player.invuln = 0;
  player.hitGrace = 0;
  const attacker = sim.spawnEnemy("hound");
  attacker.x = player.x - 30;
  attacker.y = player.y;
  sim.takeDamage(player, 20, attacker);
  assert.ok(player.damageTaken > 0);
  assert.ok(player.damageTaken <= 20);
  assert.ok(player.hurtFlash > 0);
  assert.ok(player.knockVx > 0);
  assert.ok(attacker.attackFlash > 0);
});

test("treasure runners pay out bonus cards, gold, and data when caught", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  const goldBefore = sim.gold;
  sim.spawnTreasureRunner();
  const runner = sim.enemies.find((enemy) => enemy.eventType === "treasure");
  assert.ok(runner);
  sim.damageEnemy(runner, runner.hp + 1, player.id);
  assert.equal(runner.dead, true);
  assert.ok(sim.gold > goldBefore);
  assert.ok(sim.teamXP >= sim.xpNeed);
  assert.ok(sim.drops.filter((drop) => drop.type === "card").length >= 2);
});

test("relay balls reward the squad when pushed into the destination ring", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "sola" }] });
  const goldBefore = sim.gold;
  sim.spawnRelayBall();
  const ball = sim.relayBalls[0];
  ball.x = ball.targetX;
  ball.y = ball.targetY;
  sim.updateRelayBalls(.016);
  assert.equal(ball.done, true);
  assert.ok(sim.gold > goldBefore);
  assert.ok(sim.teamXP > 0);
  assert.ok(sim.drops.some((drop) => drop.type === "card"));
});

test("difficulty tiers materially increase pressure and enemy lethality", () => {
  const config = { players: [{ id: "p1", name: "One", specialist: "echo" }] };
  const story = new Simulation({ ...config, difficulty: "story" });
  const hard = new Simulation({ ...config, difficulty: "hard" });
  const extreme = new Simulation({ ...config, difficulty: "extreme" });
  const storyEnemy = story.spawnEnemy("mite");
  const hardEnemy = hard.spawnEnemy("mite");
  const extremeEnemy = extreme.spawnEnemy("mite");
  assert.ok(storyEnemy.hp > 42, "Story should no longer use the base training health");
  assert.ok(hardEnemy.hp > storyEnemy.hp * 2);
  assert.ok(extremeEnemy.hp > hardEnemy.hp * 2);
  assert.ok(hardEnemy.damage > storyEnemy.damage);
  assert.ok(extremeEnemy.damage > hardEnemy.damage);
  assert.ok(storyEnemy.damage > 11 * 1.25, "Story enemies should punish contact more heavily");
  assert.ok(story.difficulty.spawn < 1, "Story should trade a slightly smaller opening horde for more dangerous hits");
  assert.ok(hard.difficulty.spawn > story.difficulty.spawn);
  assert.ok(extreme.difficulty.spawn > hard.difficulty.spawn);
});
