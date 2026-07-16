import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const archive = readFileSync(new URL("../run-archive.js", import.meta.url), "utf8");
const replay = readFileSync(new URL("../replay.js", import.meta.url), "utf8");
const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");

test("deployment exposes explicit daily, weekly, and standard-level states without account jargon", () => {
  for (const id of ["seeded-operations", "seeded-operations-title", "seeded-operation-cards", "seeded-operation-status"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /No account · local records only/);
  assert.match(game, /seededOperationFor\("daily", now\)/);
  assert.match(game, /seededOperationFor\("weekly", now\)/);
  assert.match(game, /selected\?\.challengeIds\.map\(\(id\) => challengeAchievementDefinition\(id\)\?\.name \|\| id\)/);
  assert.match(game, /Select again for a standard level/);
  assert.match(html, /Progress and unlocks stay in this browser/);
  assert.match(game, /state\.config\.seededOperation\?\.seed \|\| createRandomSeed\(\)/);
});

test("seeded records are accessible across result and archive surfaces", () => {
  for (const id of ["result-seeded-operation", "result-seeded-operation-title", "result-seeded-operation-copy", "result-seeded-operation-list"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(game, /renderResultSeededOperation\(awardLocalSeededOperation\(report\)\)/);
  assert.match(game, /seeded operation<\/strong> ·/);
  assert.match(game, /recordSeededOperationResult\(state\.seededOperationRecords, report\)/);
  assert.match(game, /saveImportedRun[\s\S]*awardLocalSeededOperation\(report\)/);
  assert.match(game, /cosmetic only/);
});

test("rollback and responsive presentation preserve the standard path", () => {
  assert.match(game, /flags\.seededOperations/);
  assert.match(game, /section\.classList\.toggle\("hidden", !enabled \|\| state\.partyMode === "join"\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.seeded-operation-cards \{ grid-template-columns: minmax\(0,1fr\); \}/);
  assert.match(styles, /\.seeded-operation-card\[aria-pressed="true"\]/);
  assert.match(game, /if \(!seeded && state\.partyMode !== "join"/);
  assert.match(game, /if \(clearedSeededOperation\) \{ updateProgressionUI\(\); renderDeploymentMutations\(\); \}/);
});

test("signed reports, recovery snapshots, and replay contracts carry seeded evidence", () => {
  assert.match(archive, /lastlight\.squad-run-report\.v5/);
  assert.match(archive, /game\?\.seededOperation \? seededOperationDescriptor\(game\.seededOperation\) : null/);
  assert.match(archive, /validateSeededOperationDescriptor\(value\.seededOperation, value\)/);
  assert.match(engine, /seededOperation: structuredClone\(this\.seededOperation\)/);
  assert.match(replay, /Replay seeded operation configuration is inconsistent/);
  assert.match(game, /seededOperation: state\.config\.seededOperation/);
  assert.match(game, /joinEligibility\.eligible && !game\.seededOperation/);
});
