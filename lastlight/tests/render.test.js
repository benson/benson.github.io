import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsForPreset } from "../quality-settings.js";
import { createImpactStressFixture } from "../fixtures/impact-stress.js";

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
const renderSource = readFileSync(new URL("../render.js", import.meta.url), "utf8");

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

test("renderer loads only available validated motion atlases and leaves missing rigs on safe fallbacks", () => {
  const renderer = createRenderer();
  assert.deepEqual(Object.keys(renderer.animationAtlases), ["zuri"]);
  assert.equal(renderer.animationAtlases.zuri.currentSrc, "assets/sprites/zuri-motion-atlas.png");
  assert.deepEqual(Object.keys(renderer.enemyAnimationAtlases), []);
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

test("renderer applies quality profiles without mutating simulation lists", () => {
  const renderer = createRenderer();
  renderer.setQualitySettings(settingsForPreset("minimal"));
  assert.equal(renderer.getQualityStatus().tier, "minimal");
  assert.equal(renderer.reducedMotion, true);
  assert.equal(renderer.enemyHealthBarMode, "important");
  const enemies = Array.from({ length: 200 }, (_, index) => ({ id: `e${index}`, elite: index === 199 }));
  const rendered = renderer.budget(enemies, 10, (enemy) => enemy.elite);
  assert.equal(rendered.length, 10);
  assert.ok(rendered.some((enemy) => enemy.elite), "priority targets survive visual entity budgets");
  assert.equal(enemies.length, 200, "renderer budgets never truncate simulation-owned arrays");
});

test("cosmetic density selection is stable for the same entity", () => {
  const renderer = createRenderer();
  const effect = { id: "impact-42" };
  const first = renderer.densityAllows(effect, .5);
  for (let index = 0; index < 20; index++) assert.equal(renderer.densityAllows(effect, .5), first);
});

test("renderer accepts the complete base/evolved impact stress grid at full and reduced quality", () => {
  const drawContext = new Proxy({ setTransform: () => {}, measureText: () => ({ width: 0 }) }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { clientWidth: 800, clientHeight: 600, width: 0, height: 0, getContext: () => drawContext, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const renderer = new Renderer(canvas);
  for (const preset of ["high", "minimal"]) {
    renderer.setQualitySettings(settingsForPreset(preset));
    const cases = createImpactStressFixture({ reducedMotion: preset === "minimal", density: renderer.qualityProfile.effectsDensity });
    const state = { players: cases.map((entry) => entry.player) };
    const projectiles = cases.map((entry) => ({ ...entry.entity, x: 0, y: 0, radius: 8, vx: 600, vy: 0, color: "#fff" }));
    assert.doesNotThrow(() => renderer.drawProjectiles(projectiles, false, state));
    assert.equal(projectiles.length, 42);
  }
});

test("motion playback keeps anchors stable, separates aim from locomotion, and caps retained deaths", () => {
  assert.match(renderSource, /const locomotionTarget =/);
  assert.match(renderSource, /const aimTarget =/);
  assert.match(renderSource, /const drawFacing = usesAimFacing \? visual\.aimFacing : visual\.facing/);
  assert.match(renderSource, /fixedSpriteTop/);
  assert.match(renderSource, /deathBudget = Math\.min\(24/);
  assert.match(renderSource, /type: "enemy-death"/);
  assert.match(renderSource, /motionFrame\(animationConfig, animation, visual\.animationTime, \{ reducedMotion: this\.reducedMotion \}\)/);
  assert.doesNotMatch(renderSource, /animationTime \+= frameTime \* \(this\.reducedMotion/);
});
