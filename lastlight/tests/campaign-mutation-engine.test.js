import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { gameplayFeatureContract } from "../feature-config.js";

const SEED = "0123456789abcdef0123456789abcdef";

function simulation(difficulty, campaignMutations = true, map = "warehouse") {
  const features = { ...gameplayFeatureContract(), campaignMutations };
  return new Simulation({
    map, difficulty, duration: 600, players: [{ id: "slot-0", specialist: "zuri", replaySlot: 0 }], features,
  }, { seed: SEED, features });
}

test("Hard retaliation spawns one tagged authored formation and rewards only its full clear", () => {
  const sim = simulation("hard");
  sim.tick = 120;
  sim.completeCampaignObjective("uplink");
  assert.equal(sim.mutationState.pending?.dueTick, 300);
  assert.equal(sim.mutationState.pressureAdvanceTicks, 180);

  sim.tick = 300;
  sim.updateCampaignMutations();
  assert.equal(sim.mutationState.active?.id, "mutation-1");
  const formation = sim.enemies.filter((enemy) => enemy.campaignMutationId === "mutation-1");
  assert.deepEqual(formation.map((enemy) => enemy.type), ["brute", "spitter", "mite"]);
  assert.equal(formation.filter((enemy) => enemy.elite).length, 1);

  const gold = sim.gold;
  formation[0].dead = true;
  sim.updateCampaignMutations();
  assert.equal(sim.gold, gold, "partial clears never pay the mutation reward");
  for (const enemy of formation) enemy.dead = true;
  sim.updateCampaignMutations();
  assert.equal(sim.gold, gold + 18);
  assert.equal(sim.mutationState.active, null);
  assert.equal(sim.mutationState.resolvedEncounters, 1);
  sim.updateCampaignMutations();
  assert.equal(sim.gold, gold + 18, "resolved rewards are exactly once");
});

test("Extreme wave thresholds schedule one non-stacking surge and apex transition cancels it", () => {
  const sim = simulation("extreme", true, "lab");
  sim.wave = 1;
  sim.tick = 600;
  sim.updateCampaignMutations();
  assert.equal(sim.mutationState.pending?.kind, "surge");
  assert.deepEqual(sim.mutationState.triggeredSurgeWaves, [2]);
  sim.wave = 3;
  sim.updateCampaignMutations();
  assert.deepEqual(sim.mutationState.triggeredSurgeWaves, [2], "a pending surge blocks later thresholds");
  sim.spawnBoss();
  assert.equal(sim.mutationState.pending, null);
  assert.equal(sim.mutationState.active, null);
  assert.equal(sim.enemies.some((enemy) => enemy.campaignMutationId), false);
});

test("mutation identity and active encounters recover exactly while feature-off stays inert", () => {
  const sim = simulation("hard");
  sim.tick = 60;
  sim.completeCampaignObjective("relay");
  sim.tick = sim.mutationState.pending.dueTick;
  sim.updateCampaignMutations();
  const restored = Simulation.fromRecoveryState(JSON.parse(JSON.stringify(sim.exportRecoveryState())));
  assert.deepEqual(restored.mutationState, sim.mutationState);
  assert.deepEqual(restored.enemies.map((enemy) => enemy.campaignMutationId), sim.enemies.map((enemy) => enemy.campaignMutationId));

  const off = simulation("extreme", false);
  const before = off.mutationState;
  off.tick = 60;
  off.completeCampaignObjective("trial");
  off.wave = 1;
  off.updateCampaignMutations();
  assert.equal(off.mutationState, before);
  assert.equal(off.enemies.length, 0);
});
