import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("home starts or joins one lobby flow with plain setup language", () => {
  assert.match(html, /data-party-mode="host"[^>]*>Start a lobby</);
  assert.match(html, /data-party-mode="join"[^>]*>Join code</);
  assert.doesNotMatch(html, /data-party-mode="solo"/);
  for (const label of ["Name", "Level", "Difficulty", "Run length"]) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /Progress and unlocks stay in this browser/);
  assert.doesNotMatch(html, /No account · local records only/);
  assert.match(css, /url\("assets\/og\.png"\)/);
});

test("Normal keeps custom rules out of setup, lobby, pause, and results", () => {
  assert.match(game, /difficultyId !== "story"/);
  assert.match(game, /campaignMutationPackageVisible\(mutation\)/);
  assert.match(game, /result-mutations"\)\.classList\.toggle\("hidden", !showMutationPackage\)/);
  assert.match(game, /pausePackage\.classList\.toggle\("hidden", !showPausePackage\)/);
  assert.match(html, /id="deployment-rules-disclosure" class="setup-disclosure hidden"/);
  assert.match(html, /id="lobby-rules-disclosure" class="reference-disclosure hidden"/);
});

test("mastery, upgrade loadout, aligned cards, and explainable results are first-class", () => {
  assert.match(html, /id="home-specialist-progress"/);
  assert.match(html, /id="home-specialist-grid"/);
  assert.match(game, /function renderHomeMasteryRoster/);
  assert.match(game, /data-home-specialist=/);
  assert.match(html, /id="mastery-dialog"/);
  assert.match(html, /id="upgrade-current-loadout"/);
  assert.doesNotMatch(html, /UPGRADE RULES|upgrade-reference-disclosure/);
  assert.match(game, /data-upgrade-kind=/);
  for (const zone of ["identity", "description", "evolution", "forecast", "affected", "recommendation"]) assert.match(game, new RegExp(`upgrade-zone-${zone}`));
  assert.match(game, /function resultInspectable/);
  assert.match(css, /\.result-item-tooltip/);
});

test("lobby controls stay visible and edge utilities share the right rail", () => {
  assert.match(html, /class="lobby-controls-panel"[\s\S]+class="control-ribbon lobby-controls"/);
  assert.doesNotMatch(html, /<details class="reference-disclosure">[\s\S]+class="control-ribbon lobby-controls"/);
  assert.match(html, /class="edge-utilities"[\s\S]+id="build-history-button"[\s\S]+id="report-button"/);
  assert.match(css, /\.detail-art-wrap \{[^}]*min-height: 190px;[^}]*flex: 0 0 clamp/);
});

test("frame diagnostics are optional, persistent, and keyboard reachable", () => {
  assert.match(html, /id="fps-counter" hidden/);
  assert.match(html, /id="quality-show-fps"/);
  assert.match(game, /isFpsShortcut\(event\)/);
  assert.match(game, /showFps: Boolean\(visible\)/);
});
