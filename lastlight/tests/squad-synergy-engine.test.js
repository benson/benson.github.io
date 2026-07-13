import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const SEED = "85085085085085085085085085085085";

function squad() {
  return new Simulation({
    map: "warehouse", difficulty: "story", duration: 240,
    players: [
      { id: "player-echo", name: "Echo", specialist: "echo", replaySlot: 0 },
      { id: "player-zuri", name: "Zuri", specialist: "zuri", replaySlot: 1 },
    ],
  }, { seed: SEED });
}

function stats(sim, slot) {
  return sim.synergyState.stats.find((entry) => entry.slot === slot);
}

test("Breach Window converts Echo control and Zuri signature damage into attributed bonus damage", () => {
  const sim = squad(), [echo, zuri] = sim.players;
  sim.level = 6;
  const enemy = sim.spawnEnemy("brute", { elite: true, spawnContext: "test" });
  enemy.affixIds = [];
  enemy.affixState = {};
  const hpBefore = enemy.hp;

  assert.equal(sim.recordBreachControl(enemy, echo.id, 0.5), true);
  assert.equal(sim.damageEnemy(enemy, 100, zuri.id, false, "signature"), 100);

  const bonus = 4 + 0.75 * sim.level;
  assert.equal(hpBefore - enemy.hp, 100 + bonus);
  assert.deepEqual(stats(sim, 0), { slot: 0, triggers: 0, assists: 1, damage: 0, shielding: 0, mitigated: 0, formationTicks: 0, ultimateChains: 0 });
  assert.deepEqual(stats(sim, 1), { slot: 1, triggers: 1, assists: 0, damage: bonus, shielding: 0, mitigated: 0, formationTicks: 0, ultimateChains: 0 });
  assert.equal(zuri.damageBySource.signature, 100);
  assert.equal(zuri.damageBySource["synergy:breach-window"], bonus);
  assert.ok(sim.events.some(({ type, title, synergyId }) => type === "synergy" && title === "Breach Window" && synergyId === "breach-window"));
  assert.deepEqual(sim.synergyTelemetry(), {
    ids: ["breach-window"],
    totals: { triggers: 1, damage: bonus, shielding: 0, mitigated: 0, formationSeconds: 0, ultimateChains: 0 },
  });
});

test("Ultimate Resonance chains two successful nearby R casts and shields the living squad once", () => {
  const sim = squad(), [echo, zuri] = sim.players;
  sim.level = 6;
  echo.x = 0; echo.y = 0; zuri.x = 200; zuri.y = 0;
  echo.invuln = 0; zuri.invuln = 0;

  assert.equal(sim.cast(echo.id, "r"), true);
  assert.equal(echo.shield, 0);
  assert.equal(sim.cast(zuri.id, "r"), true);
  assert.equal(echo.shield, echo.maxHp * 0.15);
  assert.equal(zuri.shield, zuri.maxHp * 0.15);
  assert.equal(stats(sim, 0).ultimateChains, 1);
  assert.equal(stats(sim, 1).ultimateChains, 1);
  assert.equal(stats(sim, 0).shielding, (echo.maxHp + zuri.maxHp) * 0.15 / 2);
  assert.equal(stats(sim, 1).shielding, (echo.maxHp + zuri.maxHp) * 0.15 / 2);
  assert.ok(sim.events.some(({ type, title, synergyId }) => type === "synergy" && title === "Ultimate Resonance" && synergyId === "ultimate-resonance"));

  echo.rCd = 0;
  assert.equal(sim.cast(echo.id, "r"), true, "the specialist R succeeds even while the team synergy is cooling down");
  assert.equal(stats(sim, 0).ultimateChains, 1);
  assert.equal(stats(sim, 1).ultimateChains, 1);
});

test("Moving Screen mitigates direct enemy impact, ignores environmental damage, and recovers exactly", () => {
  const sim = squad(), [echo, zuri] = sim.players;
  Object.assign(echo, { x: 0, y: 0, moveVx: 1, moveVy: 0, moveSpeedRatio: 1, invuln: 0, hitGrace: 0, shield: 0 });
  Object.assign(zuri, { x: 200, y: 0, moveVx: 1, moveVy: 0, moveSpeedRatio: 1, invuln: 0, hitGrace: 0, shield: 0 });
  for (let tick = 6; tick <= 48; tick += 6) { sim.tick = tick; sim.updateSquadSynergies(); }
  assert.equal(sim.synergyState.formationLinks[0].active, true);

  const attacker = sim.spawnEnemy("hound");
  attacker.x = echo.x - 30; attacker.y = echo.y;
  const hpBefore = echo.hp;
  sim.takeDamage(echo, 2, attacker);
  assert.ok(Math.abs(hpBefore - echo.hp - 1.7) < 1e-12);
  assert.ok(Math.abs(stats(sim, 0).mitigated - 0.3) < 1e-12);

  echo.hitGrace = 0;
  const hpAfterImpact = echo.hp;
  sim.takeDamage(echo, 2, attacker, { environmental: true });
  assert.ok(Math.abs(hpAfterImpact - echo.hp - 2) < 1e-12);
  assert.ok(Math.abs(stats(sim, 0).mitigated - 0.3) < 1e-12);

  const recovery = JSON.parse(JSON.stringify(sim.exportRecoveryState()));
  const restored = Simulation.fromRecoveryState(recovery);
  assert.deepEqual(restored.synergyState, sim.synergyState);
  assert.equal(hashSimulationState(restored), hashSimulationState(sim));
  assert.deepEqual(restored.synergyTelemetry().ids, ["moving-screen"]);
});
