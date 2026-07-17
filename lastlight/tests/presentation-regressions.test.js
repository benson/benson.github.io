import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../engine.js";
import { angleDelta } from "../combat-orientation.js";

globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
};
globalThis.Image = class {
  complete = false;
  naturalWidth = 0;
  set src(value) { this.currentSrc = value; }
};

const { Renderer } = await import("../render.js?presentation-regressions");

function createRecordingRenderer() {
  const calls = [];
  const context = new Proxy({
    setTransform: (...args) => calls.push(["setTransform", ...args]),
    measureText: (value) => ({ width: String(value).length * 6 }),
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  return { renderer: new Renderer(canvas), calls };
}

test("Nova snapshots preserve westward manual cursor facing independently of firing", () => {
  const sim = new Simulation({ players: [{ id: "nova", name: "Nova", specialist: "nova" }] }, { seed: "0123456789abcdef0123456789abcdef" });
  const player = sim.players[0];
  sim.tick = 10;

  for (const aim of [-Math.PI * .75, Math.PI, Math.PI * .75]) {
    player.facing = 0;
    player.aimFacing = 0;
    player.combatFacingUntilTick = -1;
    sim.setInput(player.id, { x: 0, y: 0, aim, autoAim: false });
    sim.updatePlayers(1 / 60);
    assert.equal(sim.fireSignature(player), true);
    const presentation = sim.snapshot().players[0];
    assert.ok(Math.abs(angleDelta(presentation.facing, aim)) < .051, `facing ${presentation.facing} should match ${aim}`);
    assert.ok(Math.abs(angleDelta(presentation.aimFacing, aim)) < .051, `aim facing ${presentation.aimFacing} should match ${aim}`);
  }
});

test("inspection rings expire instead of persisting as clipped edge artifacts", () => {
  const { renderer, calls } = createRecordingRenderer();
  renderer.hoveredEntity = { id: "enemy-1", type: "enemy" };
  renderer.lastInspection = { at: performance.now() - 1_000, state: {}, result: {} };
  renderer.drawHovered({ enemies: [{ id: "enemy-1", x: 0, y: 0, radius: 20 }] }, { accent: "#63f2df" });

  assert.equal(renderer.hoveredEntity, null);
  assert.equal(calls.some(([name]) => name === "arc"), false);
});
