import test from "node:test";
import assert from "node:assert/strict";
import { SIMULATION_TICK_RATE, Simulation } from "../engine.js";

const PROJECTILE_SIGNATURES = Object.freeze(["zuri", "echo", "sola", "gale", "nova", "vesper"]);
const TARGET_RADII = Object.freeze([19, 36]);
const TARGET_DISTANCES = Object.freeze([100, 300, 600, 900]);
const STEP = 1 / SIMULATION_TICK_RATE;

function signatureProbe({ specialist, level, evolved, projectileRank, targetRadius, targetDistance }) {
  const sim = new Simulation({
    map: "warehouse", difficulty: "story", duration: 3_600,
    players: [{ id: "candidate", name: "Candidate", specialist }],
  }, { seed: "83500000000000000000000000000835" });
  sim.pods = [];
  sim.enemies = [];
  sim.chance = () => false;

  const player = sim.players[0];
  player.x = 0; player.y = 0; player.flow = 100;
  player.input = { x: 0, y: 0, aim: 0, autoAim: true };
  player.passives.projectiles = projectileRank;
  player.weapons.signature = { level, evolved };

  const target = sim.spawnEnemy("mite");
  Object.assign(target, {
    x: targetDistance, y: 0, radius: targetRadius,
    hp: 1_000_000, maxHp: 1_000_000, speed: 0, damage: 0,
    xp: 0, spawnLife: 0, attackCd: 1_000_000, shotCd: 1_000_000,
  });

  let hits = 0;
  const damageEnemy = sim.damageEnemy.bind(sim);
  sim.damageEnemy = (enemy, amount, owner, critical, source) => {
    if (enemy.id === target.id && owner === player.id && source === "signature") hits++;
    return damageEnemy(enemy, amount, owner, critical, source);
  };

  assert.equal(sim.fireSignature(player), true);
  const emitted = sim.projectiles.filter((projectile) => projectile.owner === player.id && projectile.sourceId === "signature");
  assert.ok(emitted.some((projectile) => Math.abs(Math.atan2(projectile.vy, projectile.vx)) < 1e-12),
    `${specialist} L${level} E${Number(evolved)} P${projectileRank} has no center lane`);

  for (let tick = 0; tick < 240; tick++) sim.updateProjectiles(STEP);
  return { emitted: emitted.length, hits };
}

test("signature fan lanes are deterministic, center-first, and prefix-stable", () => {
  const sim = new Simulation({ players: [{ id: "candidate", specialist: "zuri" }] });
  const aim = .37, spread = .12;
  let previous = [];
  for (let count = 1; count <= 12; count++) {
    const angles = sim.signatureFanAngles(aim, count, spread);
    assert.equal(angles.length, count);
    assert.equal(angles[0], aim);
    assert.deepEqual(angles.slice(0, previous.length), previous);
    assert.deepEqual(angles, sim.signatureFanAngles(aim, count, spread));
    previous = angles;
  }
});

test("projectile signature fans retain on-axis coverage as Multishot increases", () => {
  let cases = 0;
  for (const specialist of PROJECTILE_SIGNATURES) {
    for (let level = 1; level <= 5; level++) {
      for (const evolved of [false, true]) {
        for (const targetRadius of TARGET_RADII) {
          for (const targetDistance of TARGET_DISTANCES) {
            let previous = null;
            for (let projectileRank = 0; projectileRank <= 5; projectileRank++) {
              const current = signatureProbe({ specialist, level, evolved, projectileRank, targetRadius, targetDistance });
              cases++;
              if (previous) {
                assert.ok(current.emitted >= previous.emitted,
                  `${specialist} L${level} E${Number(evolved)} R${targetRadius} D${targetDistance}: emitted ${previous.emitted}->${current.emitted}`);
                assert.ok(current.hits >= previous.hits,
                  `${specialist} L${level} E${Number(evolved)} R${targetRadius} D${targetDistance}: hits ${previous.hits}->${current.hits}`);
              }
              previous = current;
            }
          }
        }
      }
    }
  }
  assert.equal(cases, PROJECTILE_SIGNATURES.length * 5 * 2 * TARGET_RADII.length * TARGET_DISTANCES.length * 6);
});
