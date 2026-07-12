import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { Simulation, playerMovementSpeed } from "../engine.js";
import { MovementPredictor } from "../feel.js";
import { advancePlayerMovement, beginDashRecovery, classifyMovement, movementPolicy, movementVisualState, resetPlayerMovement } from "../movement.js";

const move = (player, dx, dy) => { player.x += dx; player.y += dy; };
const player = (specialist = "zuri") => ({ specialist, baseSpeed: 280, x: 0, y: 0, facing: 0, aimFacing: 0 });

function runAtRate(specialist, fps, seconds, input) {
  const subject = player(specialist);
  for (let frame = 0; frame < Math.round(fps * seconds); frame++) advancePlayerMovement(subject, input, 1 / fps, subject.baseSpeed, move);
  return subject;
}

test("movement profiles and facing policies exhaustively cover the specialist roster", () => {
  assert.deepEqual(Object.keys(BALANCE_CONFIG.movement.specialists).sort(), Object.keys(BALANCE_CONFIG.specialists).sort());
  for (const id of Object.keys(BALANCE_CONFIG.specialists)) {
    const policy = movementPolicy(id);
    assert.ok(policy.acceleration > 0 && policy.braking > policy.acceleration);
    assert.ok(["aim", "hybrid", "contact"].includes(policy.facing));
    const subject = player(id);
    advancePlayerMovement(subject, { x: 0, y: 1, aim: 0, autoAim: true }, 1 / 60, subject.baseSpeed, move);
    const expectedFacing = policy.facing === "contact" ? Math.PI / 2 : 0;
    assert.ok(Math.abs(subject.facing - expectedFacing) < 1e-9, `${id} applies its authored ${policy.facing} policy`);
  }
});

test("constant input has equivalent closed-form travel at 60, 120, and 144 Hz", () => {
  for (const id of Object.keys(BALANCE_CONFIG.specialists)) {
    const results = [60, 120, 144].map((fps) => runAtRate(id, fps, 1, { x: 1, y: 0, aim: 0, autoAim: false }));
    assert.ok(Math.max(...results.map((entry) => entry.x)) - Math.min(...results.map((entry) => entry.x)) < 1e-8, id);
    assert.ok(results.every((entry) => Math.abs(entry.y) < 1e-12));
  }
  const analog = [60, 120, 144].map((fps) => runAtRate("echo", fps, 1, { x: .35, y: -.2, aim: 0, autoAim: false }));
  assert.ok(Math.max(...analog.map((entry) => entry.x)) - Math.min(...analog.map((entry) => entry.x)) < 1e-8);
  assert.ok(Math.max(...analog.map((entry) => entry.y)) - Math.min(...analog.map((entry) => entry.y)) < 1e-8);
});

test("starts, turns, braking, and settle retain immediate control with role-specific weight", () => {
  const nimble = player("zuri"), heavy = player("bront");
  advancePlayerMovement(nimble, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
  advancePlayerMovement(heavy, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
  assert.ok(nimble.x > heavy.x && heavy.x > 0, "both roles answer on the first frame; the skirmisher launches harder");
  for (let frame = 1; frame < 20; frame++) {
    advancePlayerMovement(nimble, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
    advancePlayerMovement(heavy, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
  }
  const beforeTurn = nimble.y;
  advancePlayerMovement(nimble, { x: 0, y: 1, aim: 0 }, 1 / 60, 280, move);
  assert.ok(nimble.y > beforeTurn, "a ninety-degree turn responds in the same frame");
  for (let frame = 0; frame < 40; frame++) advancePlayerMovement(nimble, { x: 0, y: 0, aim: 0 }, 1 / 60, 280, move);
  assert.equal(nimble.moveVx, 0); assert.equal(nimble.moveVy, 0); assert.equal(nimble.moving, false);
});

test("ranged specialists strafe and backpedal while contact specialists lead with locomotion", () => {
  const ranged = player("echo"), contact = player("fang"), hybrid = player("vesper");
  for (const subject of [ranged, contact, hybrid]) advancePlayerMovement(subject, { x: 0, y: 1, aim: 0, autoAim: false }, 1 / 60, 280, move);
  assert.equal(ranged.movementMode, "strafe-right");
  assert.equal(ranged.facing, 0);
  assert.ok(Math.abs(contact.facing - Math.PI / 2) < 1e-9);
  assert.equal(hybrid.facing, 0);
  assert.equal(classifyMovement(-1, 0, 0), "backpedal");
  assert.equal(classifyMovement(.2, 0, 0), "forward", "analog strength does not alter directional intent");
  const backward = runAtRate("echo", 60, 1, { x: -1, y: 0, aim: 0, autoAim: false });
  const forward = runAtRate("echo", 60, 1, { x: 1, y: 0, aim: 0, autoAim: false });
  assert.ok(Math.abs(backward.x) < forward.x);
});

test("revive and reconnect reset helpers clear retained momentum without changing facing", () => {
  const subject = runAtRate("rift", 60, .5, { x: 1, y: 0, aim: 0, autoAim: true });
  const facing = subject.facing;
  beginDashRecovery(subject);
  resetPlayerMovement(subject);
  assert.equal(subject.moveVx, 0); assert.equal(subject.moveVy, 0); assert.equal(subject.dashRecovery, 0);
  assert.equal(subject.moving, false); assert.equal(subject.facing, facing);
});

test("mouse, auto-aim, keyboard, and touch-equivalent inputs share one deterministic policy", () => {
  const variants = [
    { x: .75, y: -.25, aim: 1.2, autoAim: false },
    { x: .75, y: -.25, aim: 1.2, autoAim: true },
  ].map((input) => runAtRate("nova", 120, .5, input));
  for (const key of ["x", "y", "moveVx", "moveVy", "facing", "movementFacing"]) assert.equal(variants[0][key], variants[1][key], key);
});

test("dash recovery preserves steering but temporarily restores role weight", () => {
  const normal = player("bront"), recovering = player("bront");
  beginDashRecovery(recovering);
  advancePlayerMovement(normal, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
  advancePlayerMovement(recovering, { x: 1, y: 0, aim: 0 }, 1 / 60, 280, move);
  assert.ok(recovering.x > 0 && recovering.x < normal.x);
  assert.ok(recovering.dashRecovery > 0);
});

test("authoritative simulation and guest prediction execute exact shared movement math", () => {
  const sim = new Simulation({ seed: "0123456789abcdef0123456789abcdef", players: [{ id: "p1", specialist: "gale" }] });
  const authoritative = sim.players[0];
  const predictor = new MovementPredictor();
  predictor.sync(structuredClone(authoritative));
  const input = { x: -.4, y: .9, aim: -1.4, autoAim: true };
  sim.setInput("p1", input);
  sim.update(1 / 60);
  predictor.advance(input, 1 / 60, playerMovementSpeed(predictor.player), move);
  for (const key of ["x", "y", "moveVx", "moveVy", "facing", "movementFacing", "moveSpeedRatio"]) assert.equal(predictor.player[key], authoritative[key], key);
});

test("prediction corrections stay bounded through delayed authoritative snapshots", () => {
  const input = { x: .8, y: -.35, aim: .7, autoAim: false };
  const authority = player("echo"), predictor = new MovementPredictor();
  predictor.sync(structuredClone(authority));
  const delayed = [];
  for (let tick = 0; tick < 180; tick++) {
    advancePlayerMovement(authority, input, 1 / 60, authority.baseSpeed, move);
    predictor.advance(input, 1 / 120, predictor.player.baseSpeed, move);
    predictor.advance(input, 1 / 120, predictor.player.baseSpeed, move);
    if (tick % 6 === 0) delayed.push(structuredClone(authority));
    if (delayed.length > 1) predictor.sync(delayed.shift());
  }
  assert.ok(predictor.maxCorrectionDistance < 45, `correction ${predictor.maxCorrectionDistance} should remain below one body length`);
  assert.ok(Math.hypot(predictor.player.x - authority.x, predictor.player.y - authority.y) < 35);
});

test("reduced motion removes lean and recovery displacement without changing simulation timing", () => {
  const subject = runAtRate("zuri", 60, .25, { x: 0, y: 1, aim: 0, autoAim: false });
  beginDashRecovery(subject);
  const full = movementVisualState(subject, false), reduced = movementVisualState(subject, true);
  assert.notEqual(full.lean, 0); assert.ok(full.groundOffset > 0);
  assert.deepEqual(reduced, { lean: 0, groundOffset: 0, shadowX: 1, shadowY: 1, recovery: 0 });
  assert.ok(subject.dashRecovery > 0, "accessibility changes presentation, never authoritative recovery timing");
});
