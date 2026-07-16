import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("launch and lobby keep primary actions visible while reference tools sit one level deeper", () => {
  assert.match(html, /id="practice-button"[\s\S]+<details class="command-menu">[\s\S]+id="run-history-button"[\s\S]+id="quality-button"/);
  assert.match(html, /class="reference-disclosure home-controls-disclosure"[\s\S]+<summary><span>Controls<\/span>/);
  assert.match(html, /<details id="seeded-operations" class="seeded-operations"/);
  assert.match(html, /class="setup-disclosure hidden"[\s\S]+id="deployment-mutations"/);
  assert.match(html, /class="lobby-brief"[\s\S]+class="control-ribbon lobby-controls"[\s\S]+id="lobby-mutations"/);
  assert.match(css, /\.command-menu-panel \{[^}]+position: absolute;[^}]+transform-origin: top right;/s);
});

test("combat defaults to signal-level HUD and Shift temporarily reveals tactical intelligence", () => {
  assert.match(html, /class="damage-ledger no-data collapsed"/);
  assert.match(html, /<details class="game-controls-hint">[\s\S]+<summary>Controls<\/summary>/);
  assert.match(game, /DAMAGE_LEDGER_DEFAULT = Object\.freeze\(\{[^}]+collapsed: true/);
  assert.match(game, /Number\(saved\.y\) === 112 \? DAMAGE_LEDGER_DEFAULT\.y/);
  assert.match(game, /layout\.y = clamp\([^\n]+DAMAGE_LEDGER_DEFAULT\.y/);
  assert.match(game, /function setTacticalIntel\(active\)/);
  assert.match(game, /action === "inspect"[\s\S]+setTacticalIntel\(true\)/);
  assert.match(game, /action === "inspect"[\s\S]+setTacticalIntel\(false\)/);
  assert.match(css, /\.game-screen\.tactical-intel \.damage-ledger\.collapsed \.damage-ledger-content \{ display: block;/);
  assert.match(css, /\.mutation-hud:not\(\.is-active\):not\(\.is-enabled\)/);
});

test("upgrade, pause, and results expose complete detail through semantic disclosures", () => {
  assert.match(html, /class="upgrade-build-disclosure"[\s\S]+id="upgrade-current-stats"/);
  assert.match(html, /id="upgrade-current-loadout"/);
  assert.doesNotMatch(html, /upgrade-reference-disclosure|upgrade-guide-button/);
  assert.match(html, /<details class="pause-reference">[\s\S]+id="pause-guide-button"/);
  assert.match(html, /class="result-disclosure result-scoreboard-disclosure"[\s\S]+id="result-scoreboard-body"/);
  assert.match(html, /id="result-contribution" class="result-disclosure result-contribution hidden"/);
  assert.match(html, /class="result-disclosure result-damage-disclosure"[\s\S]+id="result-damage-breakdown"/);
  assert.match(html, /class="result-primary-actions"[\s\S]+id="again-button"[\s\S]+id="result-home"/);
  assert.match(html, /class="result-more-actions"[\s\S]+id="watch-replay"[\s\S]+id="result-run-history"/);
  assert.match(game, /querySelectorAll\("#result-screen details"\)[^\n]+details\.open = false/);
});
