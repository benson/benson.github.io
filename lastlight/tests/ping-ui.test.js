import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
const replay = readFileSync(new URL("../replay.js", import.meta.url), "utf8");

test("the ping wheel exposes six named non-color options and a polite one-shot status", () => {
  assert.match(html, /id="ping-wheel"[^>]+role="radiogroup"[^>]+aria-label="Contextual ping wheel"/);
  for (const intent of ["danger", "objective", "pickup", "help", "regroup", "recommendation"]) {
    assert.match(html, new RegExp(`data-ping-intent="${intent}"[^>]+role="radio"|role="radio"[^>]+data-ping-intent="${intent}"`));
  }
  assert.match(html, /id="ping-live-region"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/);
  assert.match(css, /\.ping-option i \{[^}]+border:[^}]+font:/s);
});

test("keyboard, middle-pointer, touch, cancellation, and shortcut isolation are wired", () => {
  assert.match(game, /event\.button !== 1[^\n]+openPingWheel/);
  assert.match(game, /event\.pointerId === state\.pingPointerId\)\) updatePingWheel/);
  assert.match(game, /touchButton\.setPointerCapture/);
  assert.match(game, /if \(key === 'escape'\) \{ event\.preventDefault\(\); closePingWheel\(\); return; \}/);
  assert.match(game, /if \(action === "ping" && state\.pingWheel\?\.source === "keyboard"\)[^\n]+closePingWheel\(\{ commit: true \}\)/);
  assert.match(game, /if \(!\["moveUp", "moveDown", "moveLeft", "moveRight"\]\.includes\(action\)\) \{ event\.preventDefault\(\); return; \}/);
  assert.doesNotMatch(game, /openPingWheel[\s\S]{0,900}clearGameplayControls\(\)/);
});

test("dead-zone releases cancel, duplicate presentations dedupe, and pings stay ephemeral", () => {
  assert.match(game, /intent: null/);
  assert.match(game, /if \(commit && wheelState\?\.intent\) commitPing/);
  assert.match(game, /if \(state\.pings\.has\(key\)\) return false/);
  assert.match(game, /tick - ping\.tick >= PING_LIFETIME_TICKS/);
  assert.doesNotMatch(engine, /\bpings\b|ping_broadcast|ping intent/i);
  assert.doesNotMatch(replay, /\bpings\b|ping_broadcast|ping intent/i);
  assert.doesNotMatch(game, /replayRecorder\?\.recordPing|submitRunTelemetry\([^)]*ping/s);
});

test("runtime rollback and reduced-motion hooks cover the complete interaction", () => {
  assert.match(game, /flags\.contextualPings/);
  assert.match(game, /syncPingAvailability\(\)/);
  assert.match(css, /html\[data-reduced-motion="true"\] \.ping-wheel \{ animation: none !important; \}/);
  assert.match(css, /\.touch-ping \{[^}]+width: 52px;[^}]+height: 52px;/s);
  assert.match(css, /\.touch-ping\[hidden\], \[data-control-ping\]\[hidden\] \{ display: none !important; \}/);
});
