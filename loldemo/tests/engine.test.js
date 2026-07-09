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
});
