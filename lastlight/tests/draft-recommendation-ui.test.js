import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const featureConfig = readFileSync(new URL("../feature-config.js", import.meta.url), "utf8");

test("draft recommendations remain an explicit teammate-only action", () => {
  assert.match(game, /class=\"draft-recommend-button\"/);
  assert.match(game, /aria-pressed=\"\$\{pressed\}\"/);
  assert.match(game, /requestDraftRecommendation\(Number\(button\.dataset\.recommendTarget\)/);
  assert.match(game, /target\.replaySlot === localReplaySlot\(game\)\) return \"\"/);
  assert.match(game, /state\.partyMode !== \"solo\"/);
});

test("local and teammate choices expose non-color aggregate recommendation markers", () => {
  assert.match(game, /draftRecommendationMarkersMarkup\(game, localPlayer, index\)/);
  assert.match(game, /draftRecommendationMarkersMarkup\(game, player, optionIndex\)/);
  assert.match(game, /Recommended by \$\{names\.join\(\", \"\)\}/);
  assert.match(game, /★ Squad recommends/);
  assert.match(game, /recommendationMarkerModel/);
});

test("recommendation updates patch marker subnodes without rebuilding the upgrade overlay", () => {
  const patchBody = game.match(/function renderDraftRecommendationMarkers[\s\S]*?\r?\n}\r?\n\r?\nfunction updateUpgrade/)?.[0] || "";
  assert.match(patchBody, /querySelectorAll\(\"\[data-recommendation-markers\]\"\)/);
  assert.match(patchBody, /querySelectorAll\(\"\.draft-recommend-button\"\)/);
  assert.doesNotMatch(patchBody, /upgrade-cards\"\)\.innerHTML|teammate-upgrades\"\)\.innerHTML/);
});

test("existing upgrade shortcuts stay local and recommendation buttons are keyboard-native", () => {
  assert.match(game, /const upgradeChoice = \[\"1\", \"2\", \"3\"\]\.includes\(key\) && upgradeOpen/);
  assert.doesNotMatch(game, /key === ["'](?:6|7|8|9)["'][^\n]+recommend/i);
  assert.match(css, /\.draft-recommend-button \{[^}]*min-height: 44px/);
  assert.match(css, /\.draft-recommend-button:focus-visible/);
  assert.match(css, /data-reduced-motion="true"\] \.draft-recommend-button[^}]*transition: none/);
});

test("guest draft selections retain the required protocol action while recommendations are active", () => {
  assert.match(game, /createDraftActionMessage\(\{ \.\.\.message, action: message\.type \}, state\.authorityEpoch\)/);
});

test("recommendations have an independent runtime rollback boundary", () => {
  assert.match(featureConfig, /"upgradeRecommendations"/);
  assert.match(featureConfig, /upgradeRecommendations: true/);
  assert.match(game, /flags\.upgradeRecommendations/);
  assert.match(css, /data-upgrade-recommendations="false"/);
});

test("recommendation state stays outside simulation, replay, recovery, and telemetry", () => {
  assert.match(game, /draftRecommendations: new DraftRecommendationStore/);
  assert.doesNotMatch(readFileSync(new URL("../engine.js", import.meta.url), "utf8"), /draftRecommendation/i);
  assert.doesNotMatch(readFileSync(new URL("../replay.js", import.meta.url), "utf8"), /draftRecommendation/i);
  assert.doesNotMatch(readFileSync(new URL("../recovery.js", import.meta.url), "utf8"), /draftRecommendation/i);
  assert.doesNotMatch(readFileSync(new URL("../telemetry.js", import.meta.url), "utf8"), /draftRecommendation/i);
});
