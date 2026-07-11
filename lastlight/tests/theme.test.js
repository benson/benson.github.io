import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  LASTLIGHT_THEME,
  MOTION_BOSS_IDS,
  THEME_ASSET_KEYS,
  getMissingMotionAssets,
  getThemeAnimation,
  getThemeAsset,
  getThemeEnemyAnimation,
  validateTheme,
} from "../themes/lastlight.js";
import { ENEMY_MOTION_STATES, SPECIALIST_MOTION_STATES } from "../motion.js";

test("default theme satisfies the complete asset contract", () => {
  const result = validateTheme(LASTLIGHT_THEME);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(result.assetCount, 92);
  assert.equal(Object.isFrozen(LASTLIGHT_THEME), true);
  assert.equal(Object.isFrozen(LASTLIGHT_THEME.assets.archive.augments), true);
});

test("runtime enemy contract has unique deployable cutouts and render anchors", async () => {
  assert.equal(THEME_ASSET_KEYS.enemies.length, 6);
  const paths = Object.values(LASTLIGHT_THEME.assets.enemies);
  assert.equal(paths.length, 6);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((path) => path.startsWith("assets/enemies/") && path.endsWith(".webp")));
  const root = fileURLToPath(new URL("../", import.meta.url));
  await Promise.all(paths.map((path) => access(`${root}${path}`)));
  for (const enemyType of THEME_ASSET_KEYS.enemies) {
    const animation = getThemeEnemyAnimation(enemyType);
    assert.equal(animation.anchor.length, 2);
    assert.equal(animation.drawSize.length, 2);
    assert.ok(animation.drawSize.every((value) => value > 0));
    assert.equal(animation.shadow.length, 2);
    assert.equal(animation.grid.columns, 4);
    assert.equal(animation.grid.rows, 6);
    assert.equal(animation.status, "missing");
    assert.ok(ENEMY_MOTION_STATES.every((state) => animation.states[state].frames.length));
  }
  for (const mapId of MOTION_BOSS_IDS) assert.ok(ENEMY_MOTION_STATES.every((state) => getThemeEnemyAnimation("boss", undefined, mapId).states[state].frames.length));
});

test("guide contract gives every passive, enemy, and field category unique art", () => {
  assert.equal(THEME_ASSET_KEYS.guidePassives.length, 12);
  assert.equal(THEME_ASSET_KEYS.guideEnemies.length, 6);
  assert.equal(THEME_ASSET_KEYS.guideField.length, 6);
  const paths = [
    ...Object.values(LASTLIGHT_THEME.assets.guide.passives),
    ...Object.values(LASTLIGHT_THEME.assets.guide.enemies),
    ...Object.values(LASTLIGHT_THEME.assets.guide.field),
  ];
  assert.equal(paths.length, 24);
  assert.equal(new Set(paths).size, 24);
  assert.ok(paths.every((path) => path.startsWith("assets/guide/") && path.endsWith(".webp")));
});

test("archive contract covers every planned rare-find image", () => {
  assert.equal(THEME_ASSET_KEYS.archiveEvents.length, 3);
  assert.equal(THEME_ASSET_KEYS.archiveBoons.length, 6);
  assert.equal(THEME_ASSET_KEYS.archiveAugments.length, 15);

  const archivePaths = [
    ...Object.values(LASTLIGHT_THEME.assets.archive.events),
    ...Object.values(LASTLIGHT_THEME.assets.archive.boons),
    ...Object.values(LASTLIGHT_THEME.assets.archive.augments),
  ];
  assert.equal(archivePaths.length, 24);
  assert.equal(new Set(archivePaths).size, archivePaths.length);
  assert.ok(archivePaths.every((path) => path.startsWith("assets/archive/") && path.endsWith(".webp")));
});

test("logical asset lookup is predictable and rejects typos", () => {
  assert.equal(getThemeAsset("specialists.zuri"), "assets/sprites/zuri.png");
  assert.equal(getThemeAsset("weapons.signatures.gale"), "assets/weapons/signature-gale.webp");
  assert.equal(getThemeAsset("effects.xpShard"), "assets/effects/xp-shard.webp");
  assert.equal(getThemeAsset("enemies.hound"), "assets/enemies/rusher.webp");
  assert.equal(getThemeAsset("guide.passives.projectiles"), "assets/guide/passives/multishot.webp");
  assert.equal(getThemeAsset("archive.augments.glassCannon"), "assets/archive/glass-cannon.webp");
  assert.throws(() => getThemeAsset("archive.augments.glassCanon"), /Unknown theme asset/);
});

test("specialist motion metadata is complete, strict, and theme-swappable", async () => {
  const animation = getThemeAnimation("zuri");
  assert.equal(animation.atlas.src, "assets/sprites/zuri-motion-atlas.png");
  assert.equal(animation.atlas.available, true);
  assert.equal(animation.status, "prototype");
  assert.deepEqual(animation.directions, ["south", "west", "north", "east"]);
  assert.deepEqual(animation.grid, { columns: 4, rows: 5 });
  assert.ok(SPECIALIST_MOTION_STATES.every((state) => animation.states[state]?.frames?.length));
  assert.deepEqual(animation.bindings, { dash: "mobility", castE: "cast", castR: "cast" });
  assert.deepEqual(animation.collisionOffset, [0, 0]);
  assert.deepEqual(animation.sockets.muzzle, { distance: 58, vertical: -8 });
  for (const specialist of THEME_ASSET_KEYS.specialists) {
    const rig = getThemeAnimation(specialist);
    assert.ok(SPECIALIST_MOTION_STATES.every((state) => rig.states[state]?.frames?.length));
    if (specialist !== "zuri") assert.deepEqual(rig.grid, { columns: 4, rows: 6 });
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  await access(`${root}${animation.atlas.src}`);
});

test("motion asset gaps are explicit and do not pretend missing atlases exist", () => {
  const gaps = getMissingMotionAssets();
  assert.equal(gaps.length, 19);
  assert.deepEqual(gaps.map(({ kind }) => kind).reduce((counts, kind) => ({ ...counts, [kind]: (counts[kind] || 0) + 1 }), {}), { specialist: 9, enemy: 6, boss: 4 });
  assert.equal(gaps.find(({ kind, id }) => kind === "specialist" && id === "zuri").status, "prototype");
  assert.ok(gaps.filter(({ status }) => status === "missing").every(({ src, expectedSize }) => src.startsWith("assets/motion/") && expectedSize.join("x") === "1024x1536"));
});

test("every default-theme asset is present in the deployable game tree", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const collect = (value) => typeof value === "string"
    ? [value]
    : Object.values(value).flatMap(collect);
  await Promise.all(collect(LASTLIGHT_THEME.assets).map((assetPath) => access(`${root}${assetPath}`)));
});
