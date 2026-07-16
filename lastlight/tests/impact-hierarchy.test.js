import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runImpactHierarchyAudit } from "../impact-hierarchy-audit.js";

test("deterministic impact hierarchy audit passes every contract", () => {
  const report = runImpactHierarchyAudit();
  assert.equal(report.passed, report.total);
});

test("runtime synchronizes local camera, animation hold, spatial audio, and haptics from one signal", () => {
  const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  assert.match(render, /localImpact && plan\.force\.cameraPunch > 0/);
  assert.match(render, /impactAnimationTimeScale\(targetImpact, attackerImpact\)/);
  assert.match(game, /impactAccent\.audio\.minimumIntervalMs/);
  assert.match(game, /spatialAudioPan\(impactAccent, listener\)/);
  assert.match(game, /playFeedbackHaptics\(impactSignals/);
});

test("cache and baseline pause cleanup remove misleading persistent chrome", () => {
  const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  assert.doesNotMatch(render, /shouldPromoteCache/);
  assert.doesNotMatch(render, /corner\(pod\.x, pod\.y/);
  assert.match(game, /pausePackage\.classList\.toggle\("hidden", !showPausePackage\)/);
  assert.match(game, /campaignMutationPackageVisible\(mutation\)/);
});
