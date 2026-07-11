import test from "node:test";
import assert from "node:assert/strict";
import { animationFrame, directionColumn, FixedStepClock, MovementPredictor, springCamera } from "../feel.js";

test("fixed-step clock produces the same simulation work across render rates", () => {
  const run = (frames, frameSeconds) => {
    const clock = new FixedStepClock();
    let updates = 0, simulated = 0;
    for (let index = 0; index < frames; index++) clock.advance(frameSeconds, (dt) => { updates++; simulated += dt; });
    return { updates, simulated };
  };
  const sixty = run(60, 1 / 60), oneFortyFour = run(144, 1 / 144);
  assert.equal(sixty.updates, 60);
  assert.ok(Math.abs(sixty.simulated - 1) < 1e-9);
  assert.ok(Math.abs(oneFortyFour.updates - 60) <= 1);
  assert.ok(Math.abs(oneFortyFour.simulated - 1) <= 1 / 60);
});

test("fixed-step clock bounds catch-up work after a stalled frame", () => {
  const clock = new FixedStepClock(1 / 60, 5);
  let updates = 0;
  const result = clock.advance(.5, () => updates++);
  assert.equal(updates, 5);
  assert.ok(result.droppedSeconds > 0);
  assert.ok(result.alpha >= 0 && result.alpha < 1);
});

test("guest prediction moves immediately and reconciles small errors without teleporting", () => {
  const predictor = new MovementPredictor();
  predictor.sync({ id: "p1", x: 0, y: 0, facing: 0 });
  predictor.advance({ x: 1, y: 0 }, 1 / 60, 240, (player, dx, dy) => { player.x += dx; player.y += dy; });
  assert.equal(predictor.player.x, 4);
  predictor.sync({ id: "p1", x: 1, y: 0, facing: 0 });
  assert.ok(predictor.player.x < 4 && predictor.player.x > 1);
  assert.equal(predictor.player.predicted, true);
  assert.equal(predictor.lastCorrectionDistance, 3);
});

test("prediction normalizes diagonal movement like the authoritative simulation", () => {
  const predictor = new MovementPredictor();
  predictor.sync({ id: "p1", x: 0, y: 0 });
  predictor.advance({ x: 1, y: 1 }, 1, 100, (player, dx, dy) => { player.x += dx; player.y += dy; });
  assert.ok(Math.abs(Math.hypot(predictor.player.x, predictor.player.y) - 5) < 1e-9);
});

test("large prediction divergence snaps to authoritative position", () => {
  const predictor = new MovementPredictor();
  predictor.sync({ id: "p1", x: 0, y: 0 });
  predictor.player.x = 400;
  predictor.sync({ id: "p1", x: 0, y: 0 });
  assert.equal(predictor.player.x, 0);
  assert.equal(predictor.maxCorrectionDistance, 400);
});

test("camera spring converges consistently at common frame rates", () => {
  const run = (fps) => {
    const camera = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let index = 0; index < fps; index++) springCamera(camera, { x: 300, y: -120 }, 1 / fps);
    return camera;
  };
  const sixty = run(60), oneTwenty = run(120);
  assert.ok(Math.abs(sixty.x - oneTwenty.x) < 2);
  assert.ok(Math.abs(sixty.y - oneTwenty.y) < 1);
  assert.ok(sixty.x > 295 && oneTwenty.x > 295);
});

test("direction columns match the authored south-west-north-east atlas", () => {
  assert.equal(directionColumn(Math.PI / 2), 0);
  assert.equal(directionColumn(Math.PI), 1);
  assert.equal(directionColumn(-Math.PI / 2), 2);
  assert.equal(directionColumn(0), 3);
});

test("animation frame selection respects authored timings and fallback", () => {
  const animation = { states: { idle: { frames: [{ row: 0, ms: 100 }] }, run: { frames: [{ row: 1, ms: 50 }, { row: 2, ms: 50 }] }, hurt: { loop: false, frames: [{ row: 3, ms: 40 }, { row: 4, ms: 60 }] } } };
  assert.equal(animationFrame(animation, "run", .02).row, 1);
  assert.equal(animationFrame(animation, "run", .075).row, 2);
  assert.equal(animationFrame(animation, "run", .12).row, 1);
  assert.equal(animationFrame(animation, "unknown", .5).row, 0);
  assert.equal(animationFrame(animation, "hurt", .2).row, 4);
});
