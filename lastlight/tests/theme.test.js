import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  LASTLIGHT_THEME,
  THEME_ASSET_KEYS,
  getThemeAnimation,
  getThemeAsset,
  getThemeEnemyAnimation,
  validateTheme,
} from "../themes/lastlight.js";

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
  }
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

test("authored specialist animation metadata is theme-swappable", async () => {
  const animation = getThemeAnimation("zuri");
  assert.equal(animation.atlas, "assets/sprites/zuri-motion-atlas.png");
  assert.deepEqual(animation.directions, ["south", "west", "north", "east"]);
  assert.deepEqual(animation.grid, { columns: 4, rows: 5 });
  assert.ok(["idle", "run", "dash", "castE", "castR", "hurt", "down", "revive", "victory"].every((state) => animation.states[state]?.frames?.length));
  assert.deepEqual(animation.spriteBounds, [0, 0, 138, 110]);
  assert.deepEqual(animation.collisionOffset, [0, 0]);
  assert.deepEqual(animation.sockets.muzzle, { distance: 58, vertical: -8 });
  const root = fileURLToPath(new URL("../", import.meta.url));
  await access(`${root}${animation.atlas}`);
});

test("every default-theme asset is present in the deployable game tree", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const collect = (value) => typeof value === "string"
    ? [value]
    : Object.values(value).flatMap(collect);
  await Promise.all(collect(LASTLIGHT_THEME.assets).map((assetPath) => access(`${root}${assetPath}`)));
});
