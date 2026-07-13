import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("challenge records are reachable, explicit, no-power, and result accessible", () => {
  assert.match(html, /href="#guide-challenges">Challenges<\/a>/);
  assert.match(game, /Challenges & achievements \/\/ \$\{completedChallenges\.size\}\/\$\{CHALLENGE_ACHIEVEMENT_REGISTRY\.entries\.length\}/);
  assert.match(game, /They never grant gameplay power/);
  assert.match(html, /id="result-achievements"[^>]+aria-labelledby="result-achievements-title"/);
  assert.match(game, /renderResultChallengeAchievements\(challengeAward\)/);
  assert.match(game, /Rewards are local, cosmetic or informational, and grant no gameplay power/);
});

test("live challenge conditions use provisional authoritative report evidence without awarding early", () => {
  assert.match(html, /id="challenge-watch"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(game, /createSquadRunReport\(\{ \.\.\.game, stage: "lost" \}, \{ build: BUILD \}\)/);
  assert.match(game, /complete the operation to archive/);
  assert.doesNotMatch(game, /updateChallengeWatch[\s\S]{0,1200}awardChallengeAchievements/);
  assert.match(css, /\.challenge-watch/);
});

test("terminal and imported report claims are explicit, bounded, and archive-visible", () => {
  assert.match(game, /awardChallengeAchievements\(state\.challengeAchievements, report, localPlayer\?\.replaySlot \?\? null\)/);
  assert.match(game, /const award = awardLocalRareDiscoveries\(report\), challengeAward = awardLocalChallengeAchievements\(report\)/);
  assert.match(game, /Challenge evidence \$\{challengeEvidence\.length\}/);
  assert.match(game, /challengeAchievementTelemetry\(state\.challengeAchievements, challengeAward\?\.completed \|\| \[\]\)/);
});

test("challenge presentation follows runtime rollback and responsive archive primitives", () => {
  assert.match(game, /flags\?\.challengeAchievements|flags\.challengeAchievements/);
  assert.match(game, /challengeEnabled \? `<section id="guide-challenges"/);
  assert.match(html, /id="result-achievement-list"/);
  assert.match(css, /\.guide-grid/);
  assert.match(css, /@media \(max-width:/);
  assert.match(css, /prefers-reduced-motion/);
});
