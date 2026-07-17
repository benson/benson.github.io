import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("battlefield map mechanics expose shape, pattern, countdown, and inspection cues", () => {
  assert.match(render, /mechanicFrameForState\(state\)/);
  assert.match(render, /state\?\.mapMechanics/);
  assert.match(render, /pointInMapMechanic\(mapMechanic, worldX, worldY\)/);
  assert.match(render, /definition\.lanes\.map/);
  assert.match(render, /frame\.phase === "idle" && map\.id !== "warehouse"/);
  assert.doesNotMatch(render, /ctx\.setLineDash\(active \? \[\] : \[18, 12\]\)/);
  assert.match(render, /frame\.name\.toUpperCase\(\).*frame\.remainingSeconds/);
  assert.match(render, /description: `\$\{definition\.description\} \$\{definition\.counterplay\}`/);
  assert.match(render, /drawForcedMovementCue\(mapMechanic, state, localPlayerId, map, "ground"\)/);
  assert.match(render, /drawForcedMovementCue\(mapMechanic, state, localPlayerId, map, "overlay"\)/);
  assert.match(render, /drawImpactMovementCue\(state, localPlayerId, map, "ground"\)/);
  assert.match(render, /drawImpactMovementCue\(state, localPlayerId, map, "overlay"\)/);
  assert.match(render, /ENEMY IMPACT/);
  assert.match(render, /Math\.hypot\(velocityX, velocityY\)/);
  assert.match(render, /MOVING \$\{directionName\}/);
  assert.match(render, /MOVES \$\{directionName\} IN \$\{frame\.remainingSeconds\}/);
  assert.match(render, /this\.reducedMotion \? \.5/);
  assert.match(render, /state\.tick \+ pressureAdvanceTicks/);
});

test("problem reports capture whether a map mechanic is moving the local player", () => {
  assert.match(game, /mapMechanic: mechanic \? \{/);
  assert.match(game, /affectsLocalPlayer: mechanicAffectsPlayer/);
  assert.match(game, /forcedMovementActive: mechanic\.active && mechanicAffectsPlayer && mechanic\.effect\.pushPerSecond > 0/);
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
