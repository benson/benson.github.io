import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function openingTag(id) {
  return html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || "";
}

test("host migration is announced as one labelled atomic alert", () => {
  const overlay = openingTag("network-state-overlay");
  assert.match(overlay, /\brole="alert"/);
  assert.match(overlay, /\baria-live="assertive"/);
  assert.match(overlay, /\baria-atomic="true"/);
  assert.match(overlay, /\baria-labelledby="network-state-title"/);
  assert.match(overlay, /\baria-describedby="network-state-copy"/);
  assert.match(html, /id="network-state-mark"|class="network-state-mark"[^>]+aria-hidden="true"/);
  assert.match(html, /class="network-state-steps"[^>]+aria-hidden="true"/);
});

test("the game surface exposes a complete aria-busy migration hook", () => {
  assert.match(openingTag("game-screen"), /\baria-busy="false"/);
  assert.match(game, /screens\.game\?\.setAttribute\("aria-busy", visible \? "true" : "false"\)/);
});

test("the blocking migration surface remains usable inside mobile safe areas", () => {
  assert.match(css, /\.network-state-overlay \{[^}]+overflow-y: auto;[^}]+overscroll-behavior: contain;[^}]+safe-area-inset-top[^}]+safe-area-inset-right[^}]+safe-area-inset-bottom[^}]+safe-area-inset-left/s);
  assert.match(css, /\.network-state-card \{[^}]+max-height: 100%;[^}]+overflow-y: auto;/s);
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+?\.network-state-overlay \{[^}]+safe-area-inset-top[^}]+safe-area-inset-right[^}]+safe-area-inset-bottom[^}]+safe-area-inset-left/s);
  assert.match(css, /@media \(max-width: 650px\) \{[\s\S]+?\.network-state-card \{[^}]+clamp\(16px, 5vw, 24px\)/s);
});

test("reduced motion renders migration feedback as a static state", () => {
  assert.match(css, /html\[data-reduced-motion="true"\] \.network-state-overlay[^\n]+animation: none !important;[^\n]+transition: none !important;[^\n]+transform: none !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.network-state-overlay, \.network-state-card, \.network-state-mark, \.network-state-steps i \{[^}]+animation: none !important;[^}]+transition: none !important;[^}]+transform: none !important;/s);
});
