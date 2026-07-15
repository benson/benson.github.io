import test from "node:test";
import assert from "node:assert/strict";
import {
  angleDelta, combatTurnPlan, commitCombatFacing, resolvedCombatFacing,
  selectStickyAutoAimTarget, specialistMuzzlePoint,
} from "../combat-orientation.js";
import { Simulation } from "../engine.js";

const specialists = ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"];

test("sticky auto-aim preserves a target until a challenger is meaningfully closer", () => {
  const origin = { x: 0, y: 0 }, current = { id: "b", x: 100, y: 0 }, slight = { id: "a", x: 90, y: 0 };
  assert.equal(selectStickyAutoAimTarget(origin, [slight, current], "b").id, "b");
  slight.x = 80;
  assert.equal(selectStickyAutoAimTarget(origin, [slight, current], "b").id, "a");
  assert.equal(selectStickyAutoAimTarget(origin, [{ id: "z", x: 50, y: 0 }, { id: "a", x: 50, y: 0 }])?.id, "a");
  assert.equal(selectStickyAutoAimTarget(origin, [{ ...current, dead: true }], "b"), null);
});

test("facing priority is dash, committed attack, auto target, then pointer", () => {
  const player = { input: { aim: -2 }, autoAim: true, autoAimTargetId: "enemy", autoAimFacing: 1, combatFacing: .5, combatFacingUntilTick: 40, animState: "idle", animTime: 0 };
  assert.equal(resolvedCombatFacing(player, 30), .5);
  assert.equal(resolvedCombatFacing(player, 41), 1);
  Object.assign(player, { animState: "dash", animTime: .1, dashFacing: 2.5 });
  assert.equal(resolvedCombatFacing(player, 30), 2.5);
  player.animTime = 0; player.autoAim = false;
  assert.equal(resolvedCombatFacing(player, 50), -2);
});

test("body ownership rejects autonomous sources and produces bounded turn motion", () => {
  const player = {};
  assert.equal(commitCombatFacing(player, 1, 10, { sourceId: "drone" }), false);
  assert.equal(commitCombatFacing(player, 1, 10, { sourceId: "signature" }), true);
  assert.equal(player.combatFacingUntilTick, 34);
  const turn = combatTurnPlan({ from: 0, to: Math.PI, recoil: 1 });
  assert.ok(Math.abs(turn.rotation) <= .073 && Math.abs(turn.shear) <= .045);
  assert.equal(angleDelta(Math.PI - .1, -Math.PI + .1).toFixed(3), "0.200");
  assert.deepEqual(combatTurnPlan({ from: 0, to: 2, reducedMotion: true }), { delta: 2, rotation: 0, shear: 0, anticipation: 0 });
});

test("muzzle socket rotates its authored vertical offset with the body", () => {
  assert.deepEqual(specialistMuzzlePoint({ x: 10, y: 20, specialist: "zuri" }, 0), { x: 68, y: 12 });
  const down = specialistMuzzlePoint({ x: 10, y: 20, specialist: "sola" }, Math.PI / 2);
  assert.ok(Math.abs(down.x - 18) < 1e-9);
  assert.ok(Math.abs(down.y - 73) < 1e-9);
});

test("all nine signatures commit their center aim while sharing one exact muzzle origin", () => {
  for (const specialist of specialists) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] }, { seed: "0123456789abcdef0123456789abcdef" });
    const player = sim.players[0], enemy = sim.spawnEnemy("mite");
    Object.assign(enemy, { x: 260, y: 120 });
    sim.setInput("p", { x: 0, y: 0, aim: -2.4, autoAim: true });
    if (specialist === "gale") player.flow = 100;
    assert.equal(sim.fireSignature(player), true, specialist);
    const expected = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    assert.ok(Math.abs(angleDelta(player.combatFacing, expected)) < 1e-9, specialist);
    assert.equal(player.combatSourceId, "signature", specialist);
    const bullets = sim.projectiles.filter(({ owner }) => owner === player.id);
    if (bullets.length > 1) {
      assert.equal(bullets.every(() => Number.isFinite(player.recoilAngle)), true, `${specialist} fan must expose one body-owned muzzle angle`);
    }
  }
});

test("auto-aim drives strafe classification while autonomous fire cannot steal body facing", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] }, { seed: "fedcba9876543210fedcba9876543210" });
  const player = sim.players[0], enemy = sim.spawnEnemy("mite");
  Object.assign(enemy, { x: player.x + 300, y: player.y });
  sim.setInput("p", { x: 0, y: 1, aim: Math.PI, autoAim: true });
  sim.updatePlayers(1 / 60);
  assert.match(player.movementMode, /^strafe-/);
  commitCombatFacing(player, .25, sim.tick, { sourceId: "signature" });
  player.recoilAngle = .25;
  sim.shoot(player, 2, 500, 10, { sourceId: "uwu" });
  assert.equal(player.combatFacing, .25);
  assert.equal(player.recoilAngle, .25);
  assert.equal(player.weaponFlash, 0);
});

test("radial ultimates and delayed repeats remain explicitly body-neutral", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "vesper" }] }, { seed: "abcdef0123456789abcdef0123456789" });
  const player = sim.players[0];
  commitCombatFacing(player, .75, sim.tick, { sourceId: "signature" });
  player.weaponFlash = 0; player.recoilAngle = .75;
  sim.castR(player);
  assert.ok(sim.projectiles.length >= 12);
  assert.ok(sim.projectiles.every(({ bodyNeutral }) => bodyNeutral));
  assert.equal(player.combatFacing, .75);
  assert.equal(player.recoilAngle, .75);
  assert.equal(player.weaponFlash, 0);
  const repeat = sim.shoot(player, 2, 500, 10, { sourceId: "signature", bodyDriving: false, echoRepeat: true });
  assert.equal(repeat.bodyNeutral, true);
  assert.equal(player.recoilAngle, .75);
});
