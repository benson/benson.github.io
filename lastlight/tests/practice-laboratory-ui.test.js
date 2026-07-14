import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, game, styles, feature, laboratory] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("game.js", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("feature-config.js", root), "utf8"),
  readFile(new URL("practice-laboratory.js", root), "utf8"),
]);

test("practice range is an accessible local-only surface from home and lobby", () => {
  assert.match(html, /id="practice-button"[^>]+aria-controls="practice-dialog"/);
  assert.match(html, /id="lobby-practice"[^>]+aria-controls="practice-dialog"/);
  assert.match(html, /<dialog id="practice-dialog"[^>]+aria-labelledby="practice-title"/);
  for (const id of ["practice-specialist", "practice-mastery-start", "practice-map", "practice-difficulty", "practice-target", "practice-affix", "practice-behavior", "practice-window", "practice-invulnerable", "practice-weapons", "practice-passives", "practice-measure", "practice-status", "practice-results"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /No campaign progress, rewards, records, replay, sharing, multiplayer, or telemetry/);
  assert.match(html, /role="status" aria-live="polite"/);
});

test("practice UI canonicalizes prerequisites, measures the authoritative module, and obeys rollback", () => {
  assert.match(game, /flags\?\.practiceLaboratory/);
  assert.match(game, /syncPracticeLaboratoryAvailability/);
  assert.match(game, /normalizePracticeLaboratoryConfig\(state\.practiceLaboratory\)/);
  assert.match(game, /measurePracticeLaboratory\(config\)/);
  assert.match(game, /masteryStartDefinition\(specialist, "field-kit"\)\.unlockLevel/);
  assert.match(game, /addPracticePassive\(practiceWeaponPassive\(weapon\.id\)\)/);
  assert.match(game, /if \(!enabled && \$\("practice-dialog"\)\?\.open\) \$\("practice-dialog"\)\.close\(\)/);
  assert.doesNotMatch(laboratory, /localStorage|sessionStorage|fetch\(|WebSocket|submitRunTelemetry|ReplayRecorder/);
  assert.match(feature, /"practiceLaboratory"/);
  assert.doesNotMatch(feature.match(/export function gameplayFeatureContract[\s\S]+?\n}/)?.[0] || "", /practiceLaboratory/);
});

test("practice controls retain touch, focus, responsive, and reduced-motion support", () => {
  assert.match(styles, /\.practice-controls select:focus-visible/);
  assert.match(styles, /\.practice-loadout-row button:focus-visible/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]+\.practice-dialog/);
  assert.match(styles, /\.practice-controls select[^}]+min-height: 42px/);
  assert.match(styles, /\.practice-controls select[^}]+min-height: 44px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
