import test from "node:test";
import assert from "node:assert/strict";

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

const { Renderer } = await import("../render.js?renderer-tests");

function createRenderer() {
  const context = { setTransform: () => {} };
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }),
  };
  return new Renderer(canvas);
}

test("enemy health bar preferences expose off, important, and all modes", () => {
  const renderer = createRenderer();
  assert.equal(renderer.enemyHealthBarMode, "important");
  renderer.setEnemyHealthBarsVisible(true);
  assert.equal(renderer.enemyHealthBarMode, "all");
  renderer.setEnemyHealthBarsVisible(false);
  assert.equal(renderer.enemyHealthBarMode, "off");
  renderer.setEnemyHealthBarMode("important");
  assert.equal(renderer.enemyHealthBarMode, "important");
  renderer.setEnemyHealthBarMode("unexpected");
  assert.equal(renderer.enemyHealthBarMode, "important");
});

test("renderer preloads theme-owned runtime art for every field-guide enemy", () => {
  const renderer = createRenderer();
  assert.deepEqual(Object.keys(renderer.enemySprites).sort(), ["bomber", "brute", "hound", "mite", "shark", "spitter"]);
  assert.equal(renderer.enemySprites.mite.currentSrc, "assets/enemies/skitter.webp");
  assert.equal(renderer.enemySprites.hound.currentSrc, "assets/enemies/rusher.webp");
  assert.equal(renderer.enemySprites.shark.currentSrc, "assets/enemies/siegebreaker.webp");
});

test("inspection returns structured combat details and controls hover state", () => {
  const renderer = createRenderer();
  renderer.camera.x = 0;
  renderer.camera.y = 0;
  const state = {
    map: "warehouse",
    machine: { charge: 0, cooldown: 0 },
    enemies: [{ id: "enemy-1", type: "hound", x: 0, y: 0, radius: 24, hp: 50, maxHp: 100, damage: 18, speed: 132 }],
    drops: [], orbs: [], pods: [], objectives: [], relayBalls: [], drones: [], projectiles: [], hostile: [], effects: [],
  };

  const result = renderer.inspectAt(500, 350, state);
  assert.equal(result.id, "enemy-1");
  assert.equal(result.type, "enemy");
  assert.equal(result.name, "Rusher");
  assert.deepEqual(result.stats, { Health: "50 / 100", Damage: 18, Speed: 132 });
  assert.deepEqual(renderer.hoveredEntity, { id: "enemy-1", type: "enemy" });

  renderer.clearInspection();
  assert.equal(renderer.hoveredEntity, null);
});

test("inspection identifies breakable caches without implying collision", () => {
  const renderer = createRenderer();
  const state = {
    map: "warehouse",
    machine: { charge: 0, cooldown: 0 },
    enemies: [], drops: [], orbs: [], objectives: [], relayBalls: [], drones: [], projectiles: [], hostile: [], effects: [],
    pods: [{ id: "cache-1", x: 120, y: -40, radius: 25, hp: 65 }],
  };
  const result = renderer.inspectAt(620, 310, state);
  assert.equal(result.type, "cache");
  assert.equal(result.name, "Breakable Supply Cache");
  assert.match(result.description, /does not block movement/i);
  assert.equal(result.stats.Integrity, "65 / 100");
});
