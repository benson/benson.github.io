import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";

test("four Vespers repeatedly casting for ten minutes keep daggers and feathers bounded", () => {
  const players = Array.from({ length: 4 }, (_, index) => ({
    id: `vesper-${index}`, name: `Vesper ${index + 1}`, specialist: "vesper", replaySlot: index,
  }));
  const sim = new Simulation({ players }, { seed: "0e5e7f00d0e5e7f00d0e5e7f00d0e5e7" });
  sim.enemies = []; sim.pods = [];
  let maxProjectiles = 0, maxFeathers = 0;
  const ticks = 10 * 60 * 60;
  for (let tick = 0; tick < ticks; tick++) {
    // This deliberately exceeds normal ultimate availability: every Vesper
    // casts once every two seconds for the entire ten-minute field test.
    if (tick % 120 === 0) for (const player of sim.players) sim.castR(player);
    sim.updateProjectiles(1 / 60);
    sim.updateEffects(1 / 60);
    sim.projectiles = sim.projectiles.filter((entry) => !entry.dead && entry.life > 0);
    sim.feathers = sim.feathers.filter((entry) => !entry.dead && entry.life > 0);
    maxProjectiles = Math.max(maxProjectiles, sim.projectiles.length);
    maxFeathers = Math.max(maxFeathers, sim.feathers.length);
  }
  assert.ok(maxProjectiles <= 48, `active Vesper projectiles exceeded the deterministic budget: ${maxProjectiles}`);
  assert.ok(maxFeathers <= 400, `Vesper feathers exceeded the deterministic budget: ${maxFeathers}`);
  assert.ok(sim.feathers.length <= maxFeathers);
});
