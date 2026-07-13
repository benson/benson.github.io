import test from "node:test";
import assert from "node:assert/strict";

import { Simulation, collidesWithCover } from "../engine.js";
import { catchUpRankCount } from "../join-in-progress.js";

function simulation(players = [
  { id: "host", name: "Host", specialist: "zuri", replaySlot: 0, reconnectSlot: "migration-slot-0" },
  { id: "ally", name: "Ally", specialist: "echo", replaySlot: 1, reconnectSlot: "migration-slot-1" },
]) {
  return new Simulation({ players }, { seed: "0123456789abcdef0123456789abcdef" });
}

test("fresh reinforcement receives an exact deterministic package without shared progress or RNG mutation", () => {
  const sim = simulation();
  sim.level = 10; sim.gold = 41; sim.teamXP = 17;
  const gameplayRng = sim.gameplayRng.snapshot(), cosmeticRng = sim.cosmeticRng.snapshot();
  const deployment = sim.deployLateJoin({ id: "fresh", name: "Fresh", specialist: "fang", replaySlot: 2 }, { packageId: "assault" });
  const player = deployment.player;
  assert.equal(deployment.catchUpRanks, catchUpRankCount(10));
  assert.equal(player.joinKind, "fresh");
  assert.equal(player.joinPackageId, "assault");
  assert.equal(player.catchUpRanks, 8);
  assert.equal(player.draft.round, 9);
  assert.equal(player.hp, player.maxHp);
  assert.equal(player.invuln, 5);
  assert.equal(player.damage, 0); assert.equal(player.kills, 0); assert.equal(player.xpCollected, 0);
  assert.equal(sim.gold, 41); assert.equal(sim.teamXP, 17);
  assert.deepEqual(sim.gameplayRng.snapshot(), gameplayRng);
  assert.deepEqual(sim.cosmeticRng.snapshot(), cosmeticRng);
  assert.equal(collidesWithCover(player.x, player.y, player.radius + 8), false);
  assert.deepEqual([...sim.runSlotsUsed], [0, 1, 2]);
});

test("fresh admission cannot steal a disconnected or previously used anonymous seat", () => {
  const sim = simulation();
  sim.players[1].weapons.signature.level = 4;
  sim.removePlayer("ally");
  assert.throws(() => sim.deployLateJoin({ id: "intruder", name: "Ally", specialist: "fang", replaySlot: 1 }), /never-used replay slot/);
  const fresh = sim.deployLateJoin({ id: "fresh", name: "Fresh", specialist: "fang", replaySlot: 2 });
  assert.equal(fresh.player.specialist, "fang");
  assert.equal(fresh.player.weapons.signature.level, 1);
  const restored = sim.addPlayer({ id: "ally-returned", name: "Ally", specialist: "zuri", replaySlot: 1, reconnectSlot: "migration-slot-1" });
  assert.equal(restored.specialist, "echo");
  assert.equal(restored.weapons.signature.level, 4);
  assert.equal(restored.reconnected, true);
});

test("fresh deployment waits for squad decisions and is locked during apex or terminal stages", () => {
  const paused = simulation(); paused.paused = true; paused.pauseReason = "upgrade";
  assert.throws(() => paused.deployLateJoin({ id: "fresh", specialist: "gale", replaySlot: 2 }), /waits/);
  for (const stage of ["boss", "won", "lost"]) {
    const sim = simulation(); sim.stage = stage;
    assert.throws(() => sim.deployLateJoin({ id: `fresh-${stage}`, specialist: "gale", replaySlot: 2 }), /locked/);
  }
});

test("deployment timing and used seats survive exact recovery", () => {
  const sim = simulation(); sim.level = 10;
  const deployment = sim.deployLateJoin({ id: "fresh", name: "Fresh", specialist: "nova", replaySlot: 2 }, { packageId: "survival" });
  sim.update(1 / 30);
  const recovered = Simulation.fromRecoveryState(sim.exportRecoveryState(), { playerIdsBySlot: { 0: "host-r", 1: "ally-r", 2: "fresh-r" } });
  const player = recovered.players.find(({ replaySlot }) => replaySlot === 2);
  assert.equal(player.joinPackageId, deployment.packageId);
  assert.equal(player.catchUpRanks, deployment.catchUpRanks);
  assert.equal(player.deployedTicks, 2);
  assert.equal(player.preApexDeployedTicks, 2);
  assert.deepEqual([...recovered.runSlotsUsed], [0, 1, 2]);
  recovered.removePlayer("fresh-r"); recovered.tick += 20_000; recovered.pruneDisconnectedPlayers();
  assert.throws(() => recovered.deployLateJoin({ id: "replacement", specialist: "rift", replaySlot: 2 }), /never-used replay slot/);
});
