import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const overlay = html.match(/<div id="upgrade-overlay"[\s\S]+?<div id="pause-overlay"/)?.[0] || "";

test("upgrade build context is one compact always-visible card", () => {
  assert.match(overlay, /class="upgrade-build-card"[^>]+aria-label="Equipped loadout and specialist statistics"[\s\S]+id="upgrade-current-loadout"[\s\S]+id="upgrade-current-stats"/);
  assert.doesNotMatch(overlay, /Current build|Build statistics|live values|Focus or point at/);
  assert.doesNotMatch(overlay, /upgrade-build-disclosure/);
  assert.match(css, /\.upgrade-build-card \{[^}]+display: grid;[^}]+background: var\(--line\);/s);
  assert.match(css, /\.upgrade-current-stats \{[^}]+grid-template-columns: repeat\(9, minmax\(60px,1fr\)\);/s);
  const mobile = css.match(/@media \(max-width: 650px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(mobile, /\.upgrade-current-stats \{ grid-template-columns: repeat\(3, minmax\(0,1fr\)\); \}/);
});

test("draft controls follow the choices while all mapped shortcuts remain wired", () => {
  assert.ok(overlay.indexOf('id="upgrade-cards"') < overlay.indexOf('id="draft-controls"'));
  assert.ok(overlay.indexOf('id="draft-controls"') < overlay.indexOf('id="replacement-tray"'));
  for (const action of ["reroll", "banish", "skip"]) assert.match(overlay, new RegExp(`data-control-action="${action}"`));
  assert.match(game, /const buttons = \{ reroll: "draft-reroll", banish: "draft-banish", skip: "draft-skip" \}/);
  assert.match(game, /const upgradeChoice = \["choice1", "choice2", "choice3"\]\.includes\(action\) && upgradeOpen/);
  assert.match(game, /<kbd class="choice-key">\$\{index \+ 1\}<\/kbd>/);
});

test("draft copy names the ordinary reward and avoids keyboard instruction prose", () => {
  assert.match(game, /`Pick bonus \+\$\{forecast\.economy\.delta\} gold`/);
  assert.doesNotMatch(game, /`Squad gold \+\$\{forecast\.economy\.delta\}`/);
  assert.match(game, /"Choose one upgrade\. Time resumes when the squad has chosen\."/);
  assert.doesNotMatch(game, /Press 1, 2, or 3 to pick|Use 4 to reroll|Press Escape to cancel/);
});
