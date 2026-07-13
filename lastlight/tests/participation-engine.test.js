import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const SEED = "85185185185185185185185185185185";
const playerStats = (sim, slot) => sim.participationState.slots.find((entry) => entry.slot === slot);
const simWith = (players) => new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players }, { seed: SEED });

test("engine records effective heal and attributed shield deltas without over-credit", () => {
  const sim = simWith([
    { id: "support", name: "Support", specialist: "echo", replaySlot: 0 },
    { id: "target", name: "Target", specialist: "zuri", replaySlot: 1 },
  ]), [support, target] = sim.players;
  target.hp = target.maxHp - 1;
  assert.equal(sim.healPlayer(target, 10, support.replaySlot), 1);
  assert.equal(playerStats(sim, 0).effectiveHealing, 1);
  assert.equal(sim.grantShieldAmount(target, 4, 1, support.replaySlot), 4);
  assert.equal(playerStats(sim, 0).effectiveShielding, 4);
  target.invuln = 0; target.hitGrace = 0; target.armor = 0;
  const attacker = sim.spawnEnemy("hound"); attacker.x = target.x - 20; attacker.y = target.y;
  sim.takeDamage(target, 2, attacker);
  assert.equal(playerStats(sim, 0).shieldDamagePrevented, 2);
  assert.equal(target.hp, target.maxHp);
});

test("damage and actual control extension settle anonymous assists and priority participation", () => {
  const sim = simWith([
    { id: "damage", name: "Damage", specialist: "zuri", replaySlot: 0 },
    { id: "control", name: "Control", specialist: "echo", replaySlot: 1 },
    { id: "killer", name: "Killer", specialist: "fang", replaySlot: 2 },
  ]), enemy = sim.spawnEnemy("brute", { elite: true, spawnContext: "test" });
  enemy.affixIds = []; enemy.affixState = {}; enemy.maxHp = 200; enemy.hp = 200;
  sim.damageEnemy(enemy, 10, "damage", false, "signature");
  assert.equal(sim.applyControl(enemy, .5, "control"), 30);
  assert.equal(sim.applyControl(enemy, .25, "control"), 0, "overlapping shorter control is not credited");
  sim.damageEnemy(enemy, 190, "killer", false, "signature");
  assert.equal(playerStats(sim, 0).damageAssists, 1);
  assert.equal(playerStats(sim, 1).controlAssists, 1);
  assert.deepEqual(sim.participationState.slots.map((entry) => entry.eliteParticipations), [1, 1, 1]);
  assert.ok(sim.events.some((entry) => entry.type === "participation" && entry.enemyId === enemy.id));
});

test("real revive and objective completion settle work while feature-off preserves legacy revive credit", () => {
  const sim = simWith([
    { id: "rescuer", name: "Rescuer", specialist: "zuri", replaySlot: 0 },
    { id: "downed", name: "Downed", specialist: "echo", replaySlot: 1 },
  ]), [rescuer, downed] = sim.players;
  rescuer.x = downed.x = 0; rescuer.y = downed.y = 0; sim.downPlayer(downed);
  for (let index = 0; index < 181 && downed.downed; index++) { sim.tick++; sim.updatePlayers(1 / 60); }
  assert.equal(rescuer.revives, 1); assert.equal(playerStats(sim, 0).revives, 1); assert.ok(playerStats(sim, 0).reviveTicks >= 180);
  assert.ok(sim.events.some((entry) => entry.type === "participation" && entry.title === "Shared rescue credited"));

  const objective = { id: "objective-test", x: 0, y: 0, radius: 85, progress: .89, life: 10, kind: "uplink", beganTick: sim.tick };
  sim.objectives.push(objective); rescuer.x = 0; rescuer.y = 0; downed.x = 500;
  for (let index = 0; index < 40 && !objective.done; index++) { sim.tick++; sim.updateObjectives(1 / 60); }
  assert.equal(playerStats(sim, 0).objectiveCompletions, 1); assert.ok(playerStats(sim, 0).objectivePresenceTicks >= 30);
  assert.ok(sim.events.some((entry) => entry.type === "participation" && entry.title === "Objective work credited"));

  const off = new Simulation({ map: "warehouse", duration: 240, players: [
    { id: "a", name: "A", specialist: "zuri", replaySlot: 0 }, { id: "b", name: "B", specialist: "echo", replaySlot: 1 },
  ], features: { gameplayVersion: "participation-v1", objectiveEvents: true, squadSynergies: false, sharedParticipationCredit: false, downedActivity: false, joinInProgressNormalization: false, squadEnemyDirector: false, registryVersion: "lastlight.squad-synergy.v1" } }, { seed: SEED });
  off.players[0].x = off.players[1].x = 0; off.players[0].y = off.players[1].y = 0; off.downPlayer(off.players[1]);
  for (let index = 0; index < 181 && off.players[1].downed; index++) off.updatePlayers(1 / 60);
  assert.equal(off.players[0].revives, 1); assert.equal(off.participationState.enabled, false);
});

test("relay credit counts only positive force-projected movement toward its target", () => {
  const sim = simWith([{ id: "pusher", name: "Pusher", specialist: "zuri", replaySlot: 0 }]), player = sim.players[0];
  const ball = { id: "relay-test", x: 500, y: 0, targetX: 0, targetY: 0, radius: 42, vx: 0, vy: 0, life: 62, done: false, beganTick: 0, routeDistance: 500 };
  sim.relayBalls.push(ball);
  for (let index = 0; index < 600 && !ball.done; index++) {
    player.x = ball.x + 40; player.y = ball.y; sim.tick++; sim.updateRelayBalls(1 / 60);
  }
  assert.equal(ball.done, true);
  assert.ok(playerStats(sim, 0).objectiveMovement >= 25);
  assert.equal(playerStats(sim, 0).objectiveCompletions, 1);
  assert.equal(sim.participationState.objectiveCredits.length, 0);
  assert.ok(sim.events.some((entry) => entry.type === "participation" && entry.title === "Relay work credited"));
});

test("participation state and exact aggregate telemetry survive recovery deterministically", () => {
  const sim = simWith([{ id: "p", name: "P", specialist: "zuri", replaySlot: 0 }]), player = sim.players[0];
  player.hp -= 2; sim.healPlayer(player, 1, player.replaySlot); sim.grantShieldAmount(player, 2, 1, player.replaySlot);
  const telemetry = sim.participationTelemetry();
  assert.deepEqual(Object.keys(telemetry), [
    "effectiveHealing", "effectiveShielding", "shieldDamagePrevented", "mitigationPrevented", "damageAssists", "controlAssists", "revives",
    "reviveSeconds", "objectivePresenceSeconds", "objectiveMovement", "objectiveCompletions", "eliteParticipations", "apexParticipations",
  ]);
  const recovery = JSON.parse(JSON.stringify(sim.exportRecoveryState())), restored = Simulation.fromRecoveryState(recovery);
  assert.deepEqual(restored.participationState, sim.participationState); assert.deepEqual(restored.participationTelemetry(), telemetry);
  assert.equal(hashSimulationState(restored), hashSimulationState(sim));
  recovery.participationState.slots[0].effectiveHealing = -1;
  assert.throws(() => Simulation.fromRecoveryState(recovery), /effectiveHealing is invalid/);
});
