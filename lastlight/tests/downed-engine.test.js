import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const SEED = "85285285285285285285285285285285";
function squad() {
  return new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [
    { id: "downed", name: "Downed", specialist: "zuri", replaySlot: 0 },
    { id: "ally", name: "Ally", specialist: "echo", replaySlot: 1 },
  ] }, { seed: SEED });
}

test("multiplayer down begins anonymous activity, crawls from move input, and suppresses combat", () => {
  const sim = squad(), [player, ally] = sim.players; ally.x = 800; ally.y = 0;
  player.x = 0; player.y = 0; sim.downPlayer(player);
  assert.equal(sim.downedState.entries.length, 1); assert.equal(sim.downedState.entries[0].slot, 0);
  assert.equal(player.downedSupportReady, true); assert.equal(player.downedSupportCooldownMax, 3); assert.equal(player.reviveRequired, 3);
  sim.setInput(player.id, { x: 1, y: 0, aim: 0, autoAim: false });
  const before = player.x; sim.update(1 / 60);
  assert.ok(player.x > before); assert.equal(player.downedCrawling, true); assert.equal(player.movementMode, "crawl");
  assert.equal(sim.cast(player.id, "r"), false); assert.equal(sim.cast(player.id, "weapon"), false);
  assert.equal(sim.projectiles.some(({ owner }) => owner === player.id), false);
});

test("downed E emits a bounded support shield and participation credit with authoritative cooldown", () => {
  const sim = squad(), [player, ally] = sim.players;
  player.x = ally.x = 0; player.y = ally.y = 0; player.shield = ally.shield = 0; sim.downPlayer(player);
  assert.equal(sim.cast(player.id, "e"), true);
  assert.equal(ally.shield, 0.25); assert.equal(player.shield, 0, "the pulse cannot target its downed source");
  assert.equal(sim.participationState.slots.find(({ slot }) => slot === 0).effectiveShielding, 0.25);
  assert.equal(player.downedSupportReady, false); assert.equal(player.downedSupportCooldown, 3); assert.equal(player.downedSupportLabel, "Support pulse");
  assert.equal(sim.cast(player.id, "e"), false, "cooldown is authoritative");
  assert.ok(sim.events.some(({ type, title, slots }) => type === "participation" && title === "Support pulse" && slots.join(",") === "0,1"));
});

test("contract bleedout expires exactly while a completed revive removes activity and preserves credit", () => {
  const bleedout = squad(), [downed, living] = bleedout.players; living.x = 900; living.y = 0; bleedout.downPlayer(downed);
  for (let index = 0; index < 599; index++) { bleedout.tick++; bleedout.updatePlayers(1 / 60); }
  assert.equal(downed.downed, true); assert.equal(bleedout.downedState.entries[0].bleedoutTicksRemaining, 1);
  bleedout.tick++; bleedout.updatePlayers(1 / 60);
  assert.equal(downed.dead, true); assert.equal(downed.downed, false); assert.equal(bleedout.downedState.entries.length, 0);

  const rescued = squad(), [target, rescuer] = rescued.players; target.x = rescuer.x = 0; target.y = rescuer.y = 0; rescued.downPlayer(target);
  for (let index = 0; index < 181 && target.downed; index++) { rescued.tick++; rescued.updatePlayers(1 / 60); }
  assert.equal(target.downed, false); assert.equal(target.dead, false); assert.equal(rescuer.revives, 1); assert.equal(rescued.downedState.entries.length, 0);
  assert.equal(target.downedSupportReady, false); assert.equal(target.downedCrawling, false); assert.equal(target.reviveRequired, 0);
});

test("feature-off preserves legacy immobility/support suppression and solo remains immediate defeat", () => {
  const legacy = new Simulation({ map: "warehouse", duration: 240, players: [
    { id: "a", name: "A", specialist: "zuri", replaySlot: 0 }, { id: "b", name: "B", specialist: "echo", replaySlot: 1 },
  ], features: {
    gameplayVersion: "downed-v1", objectiveEvents: true, squadSynergies: true, sharedParticipationCredit: true,
    downedActivity: false, registryVersion: "lastlight.squad-synergy.v1",
  } }, { seed: SEED });
  const [player, ally] = legacy.players; ally.x = 800; legacy.downPlayer(player); legacy.setInput(player.id, { x: 1, y: 0, aim: 0 });
  const beforeX = player.x, beforeTimer = player.downTimer; legacy.updatePlayers(1 / 60);
  assert.equal(player.x, beforeX); assert.ok(player.downTimer < beforeTimer); assert.equal(legacy.cast(player.id, "e"), false); assert.equal(legacy.downedState.enabled, false);

  const solo = new Simulation({ map: "warehouse", duration: 240, players: [{ id: "solo", name: "Solo", specialist: "zuri", replaySlot: 0 }] }, { seed: SEED });
  solo.downPlayer(solo.players[0]); assert.equal(solo.stage, "lost"); assert.equal(solo.players[0].dead, true); assert.equal(solo.downedState.entries.length, 0);
});

test("downed state and presentation survive exact recovery and malformed state is rejected", () => {
  const sim = squad(), [player, ally] = sim.players; ally.x = 800; sim.downPlayer(player); sim.setInput(player.id, { x: 1, y: 0, aim: 0 });
  for (let index = 0; index < 12; index++) sim.update(1 / 60);
  const recovery = JSON.parse(JSON.stringify(sim.exportRecoveryState())), restored = Simulation.fromRecoveryState(recovery);
  assert.deepEqual(restored.downedState, sim.downedState); assert.equal(restored.players[0].x, sim.players[0].x);
  assert.equal(restored.players[0].downedSupportCooldown, sim.players[0].downedSupportCooldown);
  assert.equal(hashSimulationState(restored), hashSimulationState(sim));
  recovery.downedState.entries[0].bleedoutTicksRemaining = 601;
  assert.throws(() => Simulation.fromRecoveryState(recovery), /bleedoutTicksRemaining is invalid/);
});
