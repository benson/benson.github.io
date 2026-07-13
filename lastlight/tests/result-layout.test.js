import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]+)\\}`))?.[1] || "";

test("post-game hierarchy uses one compact semantic header before unchanged stats", () => {
  const result = html.slice(html.indexOf('<section id="result-screen"'), html.indexOf('<dialog id="replay-dialog"'));
  assert.match(result, /<header class="result-header" aria-labelledby="result-title">/);
  assert.match(result, /<div class="result-heading">[\s\S]+id="result-eyebrow"[\s\S]+id="result-title"/);
  assert.match(result, /<div class="result-debrief">[\s\S]+id="result-copy"[\s\S]+id="result-unlock"/);
  assert.ok(result.indexOf('class="result-header"') < result.indexOf('class="result-stats"'));
  for (const id of ["result-time", "result-kills", "result-level", "result-gold", "result-scoreboard-body", "result-contribution", "result-contribution-body", "result-damage-breakdown", "watch-replay", "result-run-history", "result-home"]) assert.match(result, new RegExp(`id="${id}"`));
  assert.ok(result.indexOf('class="scoreboard-wrap"') < result.indexOf('id="result-contribution"'));
  assert.match(result, /<caption>Shared credit is non-zero-sum/);
  for (const id of ["support", "prevented", "assists", "revive", "objective", "priority", "synergy"]) assert.match(result, new RegExp(`aria-describedby="contribution-${id}-help"`));
});

test("desktop result shell spends vertical space on statistics instead of ceremony", () => {
  assert.match(rule(".result-screen"), /place-items: start center/);
  assert.match(rule(".result-screen"), /padding: 24px 30px/);
  assert.match(rule(".result-card"), /padding: clamp\(22px, 2\.5vw, 34px\)/);
  assert.match(rule(".result-header"), /grid-template-columns: minmax\(0, 1\.15fr\) minmax\(300px, \.85fr\)/);
  assert.match(rule(".result-header"), /padding-bottom: 18px/);
  assert.match(rule(".result-card h2"), /font-size: clamp\(44px, 5\.2vw, 68px\)/);
  assert.match(rule(".result-stats"), /margin: 14px 0 18px/);
  assert.match(rule(".result-stats div"), /padding: 13px 7px/);
});

test("phone results collapse the header without weakening containment or controls", () => {
  const mobile = css.match(/@media \(max-width: 650px\) \{([\s\S]+?)\n\}/)?.[1] || "";
  assert.match(mobile, /\.result-header \{ grid-template-columns: minmax\(0, 1fr\); gap: 10px; padding-bottom: 16px; text-align: center; \}/);
  assert.match(mobile, /\.result-debrief \{ padding-left: 0; border-left: 0; \}/);
  assert.match(mobile, /\.result-damage-breakdown \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.scoreboard-wrap \{[^}]+max-width: 100%;[^}]+overflow-x: auto;/s);
  assert.match(css, /\.contribution-wrap \{[^}]+max-width: 100%;[^}]+overflow-x: auto;/s);
  for (const id of ["replay-play", "replay-back", "replay-forward", "replay-timeline", "replay-speed", "replay-copy", "build-history-button"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="build-history-button" class="build-badge"/);
});
