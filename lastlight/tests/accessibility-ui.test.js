import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const featureConfig = readFileSync(new URL("../feature-config.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");

test("accessibility controls are semantic, announced, and expose every presentation profile", () => {
  for (const id of [
    "accessibility-text-scale", "accessibility-hud-scale", "accessibility-touch-scale", "accessibility-color-vision",
    "accessibility-directional-audio", "accessibility-reduced-flash", "accessibility-controller", "accessibility-deadzone",
    "accessibility-bindings", "accessibility-controller-status", "accessibility-status",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Deuteranopia support/);
  assert.match(html, /Protanopia support/);
  assert.match(html, /Tritanopia support/);
  assert.match(html, /High contrast/);
  assert.match(html, /Mono/);
});

test("scaling reflows at 200 percent and touch controls retain minimum target size", () => {
  assert.match(styles, /data-interface-scale="2"[^}]+grid-template-columns: minmax\(0,1fr\)/s);
  assert.match(styles, /min-height: max\(44px/);
  assert.match(styles, /--hud-scale/);
  assert.match(styles, /--touch-scale/);
  assert.match(styles, /data-reduced-flash="true"/);
  assert.match(styles, /topbar-actions \.command-menu-panel \.text-button \{ display: flex/);
});

test("the accessibility rollback flag is presentation-only and defaults restore authored output", () => {
  assert.match(featureConfig, /"accessibilityPass"/);
  const gameplayContract = featureConfig.slice(featureConfig.indexOf("export function gameplayFeatureContract"), featureConfig.indexOf("export function validateGameplayFeatureContract"));
  assert.doesNotMatch(gameplayContract, /accessibilityPass/);
  assert.doesNotMatch(engine, /accessibility-settings|accessibilityPass/);
  assert.match(game, /effectiveAccessibilitySettings\(\).*defaultAccessibilitySettings/s);
  assert.match(game, /effectiveQualitySettings\(\)/);
  assert.match(game, /accessibleAudioPan/);
});

test("keyboard and standard-gamepad input share mapped actions without entering network payloads", () => {
  assert.match(game, /keyboardActionForEvent/);
  assert.match(game, /readStandardGamepad/);
  assert.match(game, /performMappedAction/);
  assert.match(game, /querySelectorAll\("\[data-control-action\]"\)/);
  assert.doesNotMatch(game, /send\([^\n]+accessibilitySettings/);
});
