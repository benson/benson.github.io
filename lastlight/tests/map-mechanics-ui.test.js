import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("battlefield map mechanics expose shape, pattern, countdown, and inspection cues", () => {
  assert.match(render, /mechanicFrameForState\(state\)/);
  assert.match(render, /pointInMapMechanic\(mapMechanic, worldX, worldY\)/);
  assert.match(render, /ctx\.setLineDash\(active \? \[\] : \[18, 12\]\)/);
  assert.match(render, /WARNING \$\{frame\.remainingSeconds\}/);
  assert.match(render, /description: `\$\{definition\.description\} \$\{definition\.counterplay\}`/);
});

test("Field Manual documents all operation identities with readable image-backed cards", () => {
  assert.match(game, /id="guide-map-mechanics"/);
  assert.match(game, /mapMechanicDefinition\(mapId\)/);
  assert.match(game, /"Favored enemies": favored/);
  assert.match(game, /Determinism: "Authoritative simulation tick"/);
  assert.match(styles, /\.guide-card small \{[^}]*font-size: 10px/s);
  assert.match(styles, /\.guide-card p \{[^}]*font-size: 11px/s);
  assert.match(styles, /\.guide-details dt \{[^}]*font-size: 10px/s);
  assert.match(styles, /\.guide-details dd \{[^}]*font: 800 11px/s);
});
