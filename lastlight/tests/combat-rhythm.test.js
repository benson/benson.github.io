import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  apexPhaseMotionPlan, combatRhythmAuditRows, combatRhythmTransition,
  enemyArrivalMotionPlan, enemyDepartureMotionPlan,
} from "../combat-rhythm.js";
import { runCombatRhythmAudit } from "../combat-rhythm-audit.js";

test("combat rhythm UI transitions remain responsive and asymmetric", () => {
  for (const row of combatRhythmAuditRows()) {
    assert.ok(row.durationMs <= 300, row.kind);
    assert.ok(row.exitMs < row.durationMs, row.kind);
    assert.equal(combatRhythmTransition(row.kind, { reducedMotion: true }).scaleFrom, 1, row.kind);
  }
});

test("enemy materialization never grows from nothing", () => {
  const field = enemyArrivalMotionPlan({ spawnLife: .24 });
  const apex = enemyArrivalMotionPlan({ boss: true, spawnLife: .5 });
  assert.ok(field.bodyScale >= .9 && field.bodyAlpha > 0);
  assert.ok(apex.bodyScale >= .8 && apex.ringAlpha > field.ringAlpha);
  assert.deepEqual({ scale: enemyArrivalMotionPlan({ spawnLife: .24 }, { reducedMotion: true }).bodyScale, offset: enemyArrivalMotionPlan({ spawnLife: .24 }, { reducedMotion: true }).bodyOffsetY }, { scale: 1, offset: 0 });
});

test("enemy departure and apex phase motion stay bounded", () => {
  const departure = enemyDepartureMotionPlan(.8);
  assert.ok(departure.bodyScale >= .9 && departure.bodyAlpha > 0);
  const phase = apexPhaseMotionPlan({ boss: true, apexActionState: "transition", apexPhaseStartedTick: 10, apexActionUntilTick: 70 }, 40);
  assert.ok(phase.active && phase.bodyScale >= .9 && phase.bodyScale <= 1.1 && phase.ringAlpha > 0);
});

test("deterministic combat rhythm audit passes every contract", () => {
  const report = runCombatRhythmAudit();
  assert.equal(report.passed, report.total);
});

test("renderer and HUD wire every rhythm cue with accessible fallbacks", () => {
  const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(render, /enemyArrivalMotionPlan\(e/);
  assert.match(render, /enemyDepartureMotionPlan\(deathProgress/);
  assert.match(render, /apexPhaseMotionPlan\(e, simulationTick/);
  for (const cue of ["cooldownReady", "waveShift", "combatResume"]) assert.match(game, new RegExp(`"${cue}"`));
  assert.match(game, /LEVEL COMPLETE/);
  assert.match(game, /LEVEL FAILED/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ability-slot::after[\s\S]*transition-property: opacity, color/);
  assert.match(styles, /\.ability-slot\.cooldown-ready::after[^{]*\{[^}]*transition-duration: 140ms, 220ms/);
  assert.match(styles, /#wave-label\.rhythm-wave-shift[^{]*\{[^}]*transition-duration: 160ms, 240ms, 180ms/);
});
