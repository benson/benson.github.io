import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("rare discoveries have concealed, accessible, and terminal-only collection surfaces", () => {
  assert.match(game, /entry\.concealed/);
  assert.match(game, /Encounter this signal in a completed operation/);
  assert.match(game, /awardRareDiscoveries\(state\.rareDiscoveries, report\)/);
  assert.match(game, /function saveImportedRun[\s\S]*awardLocalRareDiscoveries\(report\)/);
  assert.match(game, /rareDiscoveryTelemetry\(state\.rareDiscoveries/);
  assert.match(html, /id="discovery-live-region"[^>]+aria-live="polite"/);
  assert.match(html, /id="result-discoveries"[^>]+aria-labelledby="result-discoveries-title"/);
  assert.match(css, /\.guide-card\.locked/);
  assert.match(css, /\.result-discoveries/);
});

test("rare discovery presentation remains behind its independent rollback flag", () => {
  assert.match(game, /flags\?\.rareDiscoveries/);
  assert.match(game, /discoveryEnabled \? RARE_DISCOVERY_REGISTRY\.entries/);
  assert.match(game, /\}\)\.join\(""\) : legacyRare;/);
});
