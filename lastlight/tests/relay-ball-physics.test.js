import test from "node:test";
import assert from "node:assert/strict";
import { rectCollider } from "../collision-geometry.js";
import { SIMULATION_TICK_RATE, Simulation } from "../engine.js";

const SEED = "0123456789abcdeffedcba9876543210";
const TICK = 1 / SIMULATION_TICK_RATE;

function createSimulation() {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] }, { seed: SEED });
  sim.objectiveEvents = false;
  sim.coverObstacles = [];
  sim.players[0].x = 0;
  sim.players[0].y = 0;
  sim.players[0].facing = 0;
  return sim;
}

function relayBall(extra = {}) {
  return {
    id: "ball-test",
    x: 20,
    y: 0,
    targetX: 1000,
    targetY: 0,
    radius: 42,
    vx: 0,
    vy: 0,
    life: 60,
    done: false,
    beganTick: 0,
    routeDistance: 980,
    ...extra,
  };
}

test("relay ball resolves player overlap at the character surface and receives an immediate push", () => {
  const sim = createSimulation();
  const ball = relayBall();
  sim.relayBalls = [ball];

  sim.updateRelayBalls(TICK);

  assert.ok(Math.hypot(ball.x - sim.players[0].x, ball.y - sim.players[0].y) >= ball.radius + sim.players[0].radius);
  assert.ok(ball.vx > 200, `expected an immediate outward velocity, received ${ball.vx}`);
  assert.equal(ball.vy, 0);
});

test("relay ball momentum carries forward and decays after contact ends", () => {
  const sim = createSimulation();
  sim.players[0].dead = true;
  const ball = relayBall({ x: 0, vx: 200 });
  sim.relayBalls = [ball];

  sim.updateRelayBalls(TICK);
  const firstVelocity = ball.vx;
  const firstX = ball.x;
  sim.updateRelayBalls(TICK);

  assert.ok(firstVelocity > 0 && firstVelocity < 200);
  assert.ok(ball.vx > 0 && ball.vx < firstVelocity);
  assert.ok(ball.x > firstX);
});

test("relay balls sweep against authored cover instead of passing through it", () => {
  const sim = createSimulation();
  sim.players[0].dead = true;
  sim.coverObstacles = [rectCollider([40, -100, 20, 200], "test-cover")];
  const ball = relayBall({ x: 0, radius: 10, vx: 290 });
  sim.relayBalls = [ball];

  sim.updateRelayBalls(.2);

  assert.ok(ball.x < 30, `expected the ball to stop before cover, received x=${ball.x}`);
  assert.ok(ball.vx < 0, `expected cover to reflect momentum, received vx=${ball.vx}`);
});

test("relay ball contact remains deterministic and snapshot-safe", () => {
  const left = createSimulation();
  const right = createSimulation();
  left.relayBalls = [relayBall()];
  right.relayBalls = [relayBall()];

  for (let tick = 0; tick < 3; tick++) {
    left.updateRelayBalls(TICK);
    right.updateRelayBalls(TICK);
  }
  const restored = Simulation.fromRecoveryState(left.exportRecoveryState());
  restored.coverObstacles = [];

  for (let tick = 3; tick < 20; tick++) {
    left.updateRelayBalls(TICK);
    right.updateRelayBalls(TICK);
    restored.updateRelayBalls(TICK);
  }

  assert.deepEqual(left.snapshot().relayBalls, right.snapshot().relayBalls);
  assert.deepEqual(left.snapshot().relayBalls, restored.snapshot().relayBalls);
  assert.ok(Number.isFinite(left.snapshot().relayBalls[0].vx));
  assert.ok(Number.isFinite(left.snapshot().relayBalls[0].vy));
});
