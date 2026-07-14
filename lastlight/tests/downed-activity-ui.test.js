import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");

test("downed status exposes persistent, accessible bleedout and rescue progress", () => {
  assert.match(html, /id="downed-activity"[^>]+aria-labelledby="downed-activity-title"/);
  assert.match(html, /id="downed-bleedout"[^>]+role="progressbar"[^>]+aria-label="Bleedout time remaining"/);
  assert.match(html, /id="downed-revive"[^>]+role="progressbar"[^>]+aria-label="Revive progress"/);
  assert.match(html, /id="downed-activity-live"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
  assert.match(game, /announcementKey = `downed:/);
  assert.match(game, /if \(announcementKey !== panel\.dataset\.announcementKey\)/);
});

test("the snapshot presentation contract is exact, null-safe, and feature gated", () => {
  for (const field of ["downedSupportCooldown", "downedSupportCooldownMax", "downedSupportReady", "downedSupportLabel", "downedCrawling", "reviveRequired"]) {
    assert.match(game, new RegExp(`player\\?\\.${field}|player\\.${field}`));
  }
  assert.match(game, /state\.runtimeConfig\.config\.flags\.downedActivity/);
  assert.match(game, /const visible = downedActivityEnabled\(game\) && Boolean\(player\?\.downed\)/);
  assert.match(game, /Number\(player\?\.reviveRequired\) \|\| 3/);
});

test("keyboard and pointer inputs suppress normal combat while retaining support and ping", () => {
  assert.match(game, /if \(player\.downed\) \{[\s\S]{0,220}slot !== "e"/);
  assert.match(game, /localPlayer\?\.downed && \["active", "ultimate"\]\.includes\(action\)/);
  assert.match(game, /if \(action === "active" && !event\.repeat\) cast\("e"\)/);
  assert.match(html, /id="downed-support-action" type="button"/);
  assert.match(game, /\$\("downed-support-action"\)\.addEventListener\("click"/);
  assert.match(game, /action === "ping" && state\.screen === 'game'/);
  assert.match(game, /movementPredictor\.player && !authoritative\?\.downed/);
  assert.match(game, /!player \|\| player\.downed \|\| remainingSeconds <= 0/);
});

test("battlefield feedback remains legible without relying on color or motion", () => {
  assert.match(render, /ctx\.setLineDash\(\[8, 5\]\)/);
  assert.match(render, /for \(let index = 0; index < 8; index\+\+\)/);
  assert.match(render, /raw\.downedCrawling/);
  assert.match(render, /RESCUE \$\{revivePercent\}%/);
  assert.match(render, /BLEED \$\{Math\.max/);
  assert.match(css, /html\[data-reduced-motion="true"\] \.downed-activity/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]+\.downed-activity/);
});

test("mobile containment and the guide explain every downed action", () => {
  assert.match(css, /\.downed-activity \{ right: 12px; bottom: 164px; left: 12px; width: auto; max-height: calc\(100dvh - 240px\); overflow-y: auto/);
  assert.match(html, /href="#guide-downed">Downed activity/);
  assert.match(game, /id="guide-downed"[\s\S]{0,220}Downed activity/);
  for (const copy of ["Crawl to safety", "Guard pulse", "Call for help"]) assert.match(game, new RegExp(copy));
});
