import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

test("damage source telemetry updates a persistent interactive panel shell", () => {
  assert.match(html, /id="damage-ledger-handle"[^>]+tabindex="0"/);
  assert.match(html, /id="damage-ledger-collapse"[^>]+aria-expanded="true"/);
  assert.match(html, /id="damage-ledger-content"[^>]+aria-live="polite"/);
  assert.match(game, /lastlight:damage-ledger-layout:v1/);
  assert.match(game, /new ResizeObserver/);
  assert.match(game, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(game, /matchMedia\("\(max-width: 650px\)"\)/);
  assert.doesNotMatch(game, /\$\("damage-ledger"\)\.innerHTML/);
  assert.match(css, /\.damage-ledger \{[^}]+resize: both;/s);
  assert.match(css, /\.damage-ledger\.collapsed \{[^}]+resize: none;/s);
});

test("objective notices use longer dwell times and a short interruptible fade", () => {
  assert.match(game, /type === "danger" \? 4500 : 3800/);
  assert.match(game, /clearTimeout\(state\.bannerTimer\); clearTimeout\(state\.bannerExitTimer\)/);
  assert.match(css, /\.objective-banner \{[^}]+transition: opacity 220ms[^;]+, transform 220ms/s);
  assert.match(css, /\.objective-banner\.is-exiting \{[^}]+transition-duration: 180ms;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("desktop-only type overrides lift critical compact controls to nine pixels", () => {
  const desktop = css.match(/@media \(min-width: 981px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(desktop, /\.control-ribbon \{ font-size: 10px; \}/);
  for (const selector of [".control-ribbon kbd", ".damage-ledger-actions button", ".copy-scorecard", ".guide-tabs a", ".report-button", ".build-badge"]) {
    assert.match(desktop, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+\.damage-ledger \{[^}]+resize: none;/);
});

test("squad and boss HUD bars share the segmented health contract", () => {
  assert.match(game, /import \{ bossHealthSegments, playerHealthSegments \} from "\.\/health-bars\.js/);
  assert.match(game, /healthDividerMarkup\(bossHealthSegments\(boss\.maxHp\)\)/);
  assert.match(game, /healthDividerMarkup\(playerHealthSegments\(p\.maxHp\)\)/);
  assert.match(html, /id="boss-health-segments" class="health-dividers"/);
  assert.match(css, /\.health-divider\.major/);
  assert.match(css, /\.mini-shield-fill/);
});
