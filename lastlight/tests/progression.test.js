import test from "node:test";
import assert from "node:assert/strict";
import { completeRun, emptyProgress, isDifficultyUnlocked, isMapUnlocked } from "../progression.js";

test("campaign maps unlock from escalating clears", () => {
  let progress = emptyProgress();
  assert.equal(isMapUnlocked(progress, "warehouse"), true);
  assert.equal(isMapUnlocked(progress, "outskirts"), false);

  ({ progress } = completeRun(progress, "warehouse", "story"));
  assert.equal(isMapUnlocked(progress, "outskirts"), true);
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "hard"), true);

  ({ progress } = completeRun(progress, "outskirts", "story"));
  ({ progress } = completeRun(progress, "outskirts", "hard"));
  assert.equal(isMapUnlocked(progress, "lab"), true);

  ({ progress } = completeRun(progress, "lab", "story"));
  ({ progress } = completeRun(progress, "lab", "hard"));
  ({ progress } = completeRun(progress, "lab", "extreme"));
  assert.equal(isMapUnlocked(progress, "beachhead"), true);
});

test("difficulty tiers unlock in order on each map", () => {
  let progress = emptyProgress();
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "story"), true);
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "hard"), false);
  ({ progress } = completeRun(progress, "warehouse", "story"));
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "hard"), true);
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "extreme"), false);
  ({ progress } = completeRun(progress, "warehouse", "hard"));
  assert.equal(isDifficultyUnlocked(progress, "warehouse", "extreme"), true);
});
