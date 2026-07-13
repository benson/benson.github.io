import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function openingTag(id) {
  return html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || "";
}

test("host migration separates assertive transitions from polite progress", () => {
  const overlay = openingTag("network-state-overlay");
  assert.match(overlay, /\brole="dialog"/);
  assert.match(overlay, /\baria-modal="true"/);
  assert.match(overlay, /\baria-labelledby="network-state-title"/);
  assert.match(overlay, /\baria-describedby="network-state-copy network-state-progress"/);
  assert.match(openingTag("network-state-announcement"), /\brole="alert"[^>]+aria-live="assertive"[^>]+aria-atomic="true"/);
  assert.match(openingTag("squad-connection-status"), /\brole="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
  assert.match(html, /id="network-state-mark"|class="network-state-mark"[^>]+aria-hidden="true"/);
  assert.match(html, /class="network-state-steps"[^>]+aria-hidden="true"/);
});

test("terminal and recoverable network actions are explicit and touch sized", () => {
  for (const id of ["network-state-retry", "network-state-report", "network-state-return"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(css, /\.network-state-actions button \{[^}]+min-height: 44px;/s);
  assert.match(game, /requestAnimationFrame\(\(\) => \$\("network-state-return"\)\.focus\(\)\)/);
});

test("the modal freezes background navigation and returns focus after authority is restored", () => {
  assert.match(openingTag("network-state-overlay"), /\baria-modal="true"/);
  assert.match(openingTag("network-state-overlay"), /\brole="dialog"/);
  assert.match(html, /class="network-state-card" tabindex="-1"/);
  assert.match(game, /if \(visible && !state\.authorityPreviousFocus\) state\.authorityPreviousFocus = document\.activeElement/);
  assert.match(game, /for \(const \[name, screen\] of Object\.entries\(screens\)\) \{[\s\S]+?screen\.inert = blocked;/);
  assert.match(game, /for \(const id of \["report-button", "build-history-button"\]\) \$\(id\)\.inert = visible/);
  assert.match(game, /function trapAuthorityFocus\(event\) \{[\s\S]+?document\.activeElement === last[\s\S]+?first\.focus\(\)/);
  assert.match(game, /\$\("network-state-overlay"\)\.addEventListener\("keydown", trapAuthorityFocus\)/);
  assert.match(game, /visible && next !== previous[\s\S]+?\.network-state-card"\)\.focus\(\)/);
  assert.match(game, /canRestoreAuthorityFocus\(focus\) \? focus : \$\("game-canvas"\)/);
});

test("authority recovery is global to gameplay and results and cannot wait forever", () => {
  const gameClose = html.indexOf('</section>', html.indexOf('id="game-screen"'));
  assert.ok(html.indexOf('id="network-state-overlay"') > gameClose);
  assert.match(css, /\.network-state-overlay \{[^}]+position: fixed;[^}]+inset: 0;[^}]+z-index: 70;/s);
  assert.match(game, /AUTHORITY_WATCHDOG_MS = Object\.freeze\(\{ synchronizing: 10_000, migrating: 25_000 \}\)/);
  assert.match(game, /if \(state\.authorityState === next\) setAuthorityState\("unavailable", \{ reason: "timeout" \}\)/);
});

test("squad reconnect status remains textual, slot keyed, and visible on mobile", () => {
  assert.match(openingTag("squad-hud"), /role="list"[^>]+aria-label=/);
  for (const state of ["reconnecting", "restored", "departed"]) assert.match(css, new RegExp(`data-connection-state="${state}"`));
  assert.match(game, /data-replay-slot="\$\{p\.replaySlot\}" data-connection-state="\$\{p\.status\}"/);
  assert.match(game, /RECONNECTING ·/);
  assert.match(game, /RESTORED/);
  assert.match(game, /DEPARTED/);
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]+?\.squad-hud \{[^}]+display: flex;/s);
});

test("the game surface exposes a complete aria-busy migration hook", () => {
  assert.match(openingTag("game-screen"), /\baria-busy="false"/);
  assert.match(game, /if \(name === "game" \|\| name === "result"\) screen\.setAttribute\("aria-busy", blocked \? "true" : "false"\)/);
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
