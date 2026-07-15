import test from "node:test";
import assert from "node:assert/strict";
import { assertCombatOrientationAudit, buildCombatOrientationAudit, COMBAT_ORIENTATION_SPECIALISTS } from "../combat-orientation-audit.js";

test("combat orientation audit covers every specialist and ownership check", () => {
  const report = buildCombatOrientationAudit();
  assert.deepEqual(assertCombatOrientationAudit(report), []);
  assert.deepEqual(report.cases.map(({ specialist }) => specialist), COMBAT_ORIENTATION_SPECIALISTS);
  assert.equal(report.coverage.checks, 72);
  assert.match(report.metadataSha256, /^[a-f0-9]{64}$/);
});
