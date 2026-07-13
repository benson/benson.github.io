import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RELEASE = "20260713.18";
const importers = [
  "index.html", "game.js", "engine.js", "render.js", "replay-timeline.js",
  "replay-game-adapters.js", "specialist-identity.js", "host-migration.js",
  "data.js", "movement.js", "join-in-progress.js", "upgrade-preview.js",
  "combat-metadata.js", "impact-grammar.js", "synergy-tags.js",
  "run-archive.js", "map-mechanics.js", "environment-chunks.js", "themes/lastlight.js",
  "campaign-mutations.js", "rare-discoveries.js", "challenge-achievements.js",
  "seeded-operations.js",
];
const changedTargets = new Set([
  "styles.css", "game.js", "engine.js", "render.js",
  "replay.js", "feature-config.js", "recovery.js", "replay-timeline.js",
  "replay-game-adapters.js", "host-migration.js",
  "join-in-progress.js", "enemy-director.js", "balance-config.js",
  "telemetry.js", "data.js", "movement.js", "specialist-identity.js", "upgrade-preview.js",
  "combat-metadata.js", "impact-grammar.js", "synergy-tags.js",
  "run-archive.js", "map-mechanics.js", "environment-chunks.js", "themes/lastlight.js", "rare-discoveries.js", "challenge-achievements.js", "seeded-operations.js",
]);

test("the active build cache-busts every changed module through the transitive browser graph", () => {
  const seen = new Set();
  for (const importer of importers) {
    const source = readFileSync(new URL(`../${importer}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/["'](?:\.\/)?([^"'?]+)\?v=([^"']+)["']/g)) {
      const [, target, version] = match;
      if (!changedTargets.has(target)) continue;
      seen.add(target);
      assert.equal(version, RELEASE, `${importer} uses a stale cache key for ${target}`);
    }
  }
  assert.deepEqual([...seen].sort(), [...changedTargets].sort());
});

test("the visible and runtime build identities match the cache release", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  assert.match(html, /Lastlight build 2026\.07\.13\.18/);
  assert.match(html, /<strong>2026\.07\.13\.18<\/strong>/);
  assert.match(game, /const BUILD = "2026\.07\.13\.18"/);
});
