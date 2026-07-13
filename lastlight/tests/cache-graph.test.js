import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const RELEASE = "20260713.5";
const importers = ["index.html", "game.js"];
const changedTargets = new Set([
  "styles.css", "game.js", "feature-config.js", "draft-recommendation-contract.js", "draft-recommendations.js",
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
  assert.match(html, /Lastlight build 2026\.07\.13\.5/);
  assert.match(html, /<strong>2026\.07\.13\.5<\/strong>/);
  assert.match(game, /const BUILD = "2026\.07\.13\.5"/);
});
