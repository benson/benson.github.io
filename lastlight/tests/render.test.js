import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsForPreset } from "../quality-settings.js";
import { createImpactStressFixture } from "../fixtures/impact-stress.js";
import { createEnvironmentInteractionStressFixture } from "../fixtures/environment-stress.js";
import { MATERIAL_CLASSES } from "../material-impacts.js";
import { MAP_OBSTACLES } from "../data.js";

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

test("renderer loads every delivered specialist, field-enemy, and map-apex atlas", () => {
  const renderer = createRenderer();
  assert.deepEqual(Object.keys(renderer.animationAtlases), ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
  assert.equal(renderer.animationAtlases.zuri.currentSrc, "assets/sprites/zuri-motion-atlas.png");
  assert.deepEqual(Object.keys(renderer.enemyAnimationAtlases), ["mite", "hound", "spitter", "brute", "bomber", "shark", "boss:warehouse", "boss:outskirts", "boss:lab", "boss:beachhead"]);
  assert.equal(renderer.enemyAnimationAtlases.hound.currentSrc, "assets/motion-normalized/enemies/hound.webp");
  assert.equal(renderer.enemyAnimationAtlases["boss:lab"].currentSrc, "assets/motion-normalized/bosses/lab.webp");
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

test("inspection explains raised-cover projectile interception and authored exceptions", () => {
  const renderer = createRenderer();
  const state = {
    map: "warehouse",
    machine: { charge: 0, cooldown: 0 },
    enemies: [], drops: [], orbs: [], objectives: [], relayBalls: [], drones: [], projectiles: [], hostile: [], effects: [], pods: [],
  };
  const [left, top, width, height] = MAP_OBSTACLES[0];
  renderer.camera.x = left + width / 2;
  renderer.camera.y = top + height / 2;
  const result = renderer.inspectAt(500, 350, state);
  assert.equal(result.type, "obstacle");
  assert.equal(result.stats["Projectile cover"], "Most shots");
  assert.equal(result.stats.Exceptions, "Rail lanes · Apex fire");
});

test("inspection coordinates stay aligned after a modal canvas resize", () => {
  const context = { setTransform: () => {} };
  const rect = { left: 40, top: 20, width: 800, height: 600 };
  const canvas = { clientWidth: 800, clientHeight: 600, width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ ...rect }) };
  const renderer = new Renderer(canvas);
  rect.width = 1200; rect.height = 675; canvas.clientWidth = 1200; canvas.clientHeight = 675;
  renderer.resize(); renderer.camera.x = 0; renderer.camera.y = 0;
  const detail = renderer.inspectAt(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    map: "warehouse", machine: { charge: 0, cooldown: 0 }, enemies: [], drops: [], orbs: [], pods: [], objectives: [], relayBalls: [], drones: [], projectiles: [], hostile: [], effects: [],
  });
  assert.equal(detail.id, "machine");
  assert.equal(detail.type, "objective");
  assert.equal(renderer.width, 1200); assert.equal(renderer.height, 675);
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

test("material endpoints remain bounded and drawable across the full 42 by 6 stress matrix", () => {
  const drawContext = new Proxy({ setTransform: () => {}, measureText: () => ({ width: 0 }) }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { clientWidth: 800, clientHeight: 600, width: 0, height: 0, getContext: () => drawContext, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const renderer = new Renderer(canvas);
  renderer.setQualitySettings(settingsForPreset("high"));
  for (const weapon of createImpactStressFixture()) for (const material of MATERIAL_CLASSES) renderer.emitMaterialImpact({ id: `${weapon.entity.id}:${material}`, x: 0, y: 0 }, { material, targetId: material }, weapon.plan);
  const diagnostics = renderer.materialImpactDiagnostics();
  assert.ok(diagnostics.active <= 96);
  assert.ok(diagnostics.queuedAudio <= 12);
  assert.doesNotThrow(() => renderer.drawMaterialImpacts());
  assert.ok(renderer.drainMaterialAudioCues(99).length <= 4);
});

test("a disappearing projectile emits the material captured at its final endpoint", () => {
  const renderer = createRenderer();
  const [{ entity, player }] = createImpactStressFixture();
  const state = {
    map: "warehouse", players: [player], enemies: [{ id: "target", type: "mite", x: 160, y: 80, radius: 20 }],
    pods: [], objectives: [], relayBalls: [], effects: [], projectiles: [{ ...entity, x: 160, y: 80 }],
  };
  renderer.updateMaterialImpacts(state, null, 1 / 60);
  assert.deepEqual(renderer.materialImpactDiagnostics(), { active: 0, queuedAudio: 0, trackedProjectiles: 1, trackedEffects: 0 });
  renderer.updateMaterialImpacts({ ...state, projectiles: [] }, null, 1 / 60);
  assert.equal(renderer.materialImpacts.length, 1);
  assert.equal(renderer.materialImpacts[0].response.material, "organic");
  assert.equal(renderer.materialImpacts[0].x, 160);
  assert.equal(renderer.materialImpacts[0].y, 80);
  assert.equal(renderer.materialImpacts[0].angle, 0);
});

test("renderer draws bounded theme-owned environmental props and contacts", () => {
  const drawContext = new Proxy({ setTransform: () => {}, measureText: () => ({ width: 0 }) }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { clientWidth: 800, clientHeight: 600, width: 0, height: 0, getContext: () => drawContext, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const renderer = new Renderer(canvas), fixture = createEnvironmentInteractionStressFixture();
  renderer.environmentField.update({
    mapId: "outskirts", bounds: fixture.bounds,
    state: { map: "outskirts", players: fixture.movers.slice(0, 4), enemies: fixture.movers.slice(4) },
    previous: { players: fixture.movers.slice(0, 4).map((mover) => ({ ...mover, x: mover.x - 14 })), enemies: fixture.movers.slice(4).map((mover) => ({ ...mover, x: mover.x - 14 })) },
    materialImpacts: fixture.impacts, frameSeconds: 1 / 60, tier: "high", effectsDensity: 1,
  });
  assert.doesNotThrow(() => renderer.drawEnvironmentalProps());
  assert.doesNotThrow(() => renderer.drawEnvironmentalContacts());
  const diagnostics = renderer.environmentDiagnostics();
  assert.ok(diagnostics.visibleProps <= 96);
  assert.ok(diagnostics.activeProps <= 48);
  assert.ok(diagnostics.contacts <= 36);
  renderer.setQualitySettings(settingsForPreset("minimal"));
  renderer.environmentField.update({ mapId: "outskirts", bounds: fixture.bounds, state: { players: [], enemies: [] }, previous: { players: [], enemies: [] }, frameSeconds: 1 / 60, tier: "minimal", effectsDensity: .3, reducedMotion: true });
  assert.equal(renderer.environmentDiagnostics().activeProps, 0);
});

test("motion playback keeps anchors stable, respects specialist facing policies, and caps retained deaths", () => {
  assert.match(renderSource, /const locomotionTarget =/);
  assert.match(renderSource, /const aimTarget =/);
  assert.match(renderSource, /specialistFacingTarget\(raw, reportedMoving, inferredFacing\)/);
  assert.match(renderSource, /const drawFacing = usesAimFacing \|\| !moving \? visual\.aimFacing : visual\.facing/);
  assert.match(renderSource, /stableDirectionColumn\(drawFacing, visual\.directionColumn\)/);
  assert.doesNotMatch(renderSource, /usesAimFacing[^\n]+weaponFlash/);
  assert.match(renderSource, /fixedSpriteTop/);
  assert.match(renderSource, /deathBudget = Math\.min\(24/);
  assert.match(renderSource, /type: "enemy-death"/);
  assert.match(renderSource, /motionFrame\(animationConfig, animation, visual\.animationTime, \{ reducedMotion: this\.reducedMotion \}\)/);
  assert.doesNotMatch(renderSource, /animationTime \+= frameTime \* \(this\.reducedMotion/);
});
