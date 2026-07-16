import {
  COMBAT_RHYTHM_SCHEMA, apexPhaseMotionPlan, combatRhythmAuditRows, combatRhythmTransition,
  enemyArrivalMotionPlan, enemyDepartureMotionPlan,
} from "./combat-rhythm.js";

export function runCombatRhythmAudit() {
  const rows = combatRhythmAuditRows(), checks = [];
  for (const row of rows) checks.push({
    id: `transition:${row.kind}`,
    pass: row.durationMs <= 300 && row.exitMs < row.durationMs && combatRhythmTransition(row.kind, { reducedMotion: true }).scaleFrom === 1,
    detail: `${row.durationMs}ms enter · ${row.exitMs}ms exit · reduced motion removes displacement`,
  });
  const fieldStart = enemyArrivalMotionPlan({ spawnLife: .24 });
  const fieldEnd = enemyArrivalMotionPlan({ spawnLife: 0 });
  const apexStart = enemyArrivalMotionPlan({ boss: true, spawnLife: .5 });
  checks.push({ id: "enemy-arrival", pass: fieldStart.bodyScale === .9 && fieldStart.bodyAlpha > 0 && fieldEnd.bodyScale === 1 && fieldEnd.bodyAlpha === 1, detail: "field enemies settle from 90% scale with a grounded silhouette" });
  checks.push({ id: "apex-arrival", pass: apexStart.bodyScale >= .8 && apexStart.ringAlpha > fieldStart.ringAlpha, detail: "apex receives the strongest, still-bounded entrance" });
  const departure = enemyDepartureMotionPlan(.75), reducedDeparture = enemyDepartureMotionPlan(.75, { reducedMotion: true });
  checks.push({ id: "enemy-departure", pass: departure.bodyAlpha > 0 && departure.bodyScale >= .9 && reducedDeparture.bodyScale === 1 && reducedDeparture.bodyOffsetY === 0, detail: "death cleanup stays grounded and informative under reduced motion" });
  const phase = apexPhaseMotionPlan({ boss: true, apexActionState: "transition", apexPhaseStartedTick: 100, apexActionUntilTick: 160 }, 130);
  const reducedPhase = apexPhaseMotionPlan({ boss: true, apexActionState: "transition", apexPhaseStartedTick: 100, apexActionUntilTick: 160 }, 130, { reducedMotion: true });
  checks.push({ id: "apex-phase", pass: phase.active && phase.ringAlpha > 0 && phase.bodyScale >= .9 && phase.bodyScale <= 1.1 && reducedPhase.bodyScale === 1, detail: "phase two reserves a readable, bounded arena beat" });
  return Object.freeze({ schema: COMBAT_RHYTHM_SCHEMA, generatedAt: new Date().toISOString(), rows, checks, passed: checks.filter(({ pass }) => pass).length, total: checks.length });
}

export function combatRhythmAuditHtml(report = runCombatRhythmAudit()) {
  const checks = report.checks.map((check) => `<li class="${check.pass ? "pass" : "fail"}"><b>${check.pass ? "PASS" : "FAIL"}</b><strong>${check.id}</strong><span>${check.detail}</span></li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lastlight Combat Rhythm Audit</title><style>body{margin:0;padding:32px;background:#06101a;color:#dbeaf0;font:14px Inter,system-ui}h1{margin:0;font-size:34px}p,li span{color:#8ca8b5}.summary{color:#65f1d7;font-weight:800}ul{display:grid;gap:8px;padding:0;margin-top:24px}li{display:grid;grid-template-columns:52px 180px 1fr;gap:12px;padding:12px;border-left:4px solid #60dabf;background:#0b1925;list-style:none}li.fail{border-color:#ff6270}</style></head><body><h1>Combat rhythm audit</h1><p>Enemy lifecycle, wave/cooldown feedback, combat re-entry, apex phase, outcome, and reduced-motion evidence.</p><div class="summary">${report.passed}/${report.total} deterministic checks passed</div><ul>${checks}</ul></body></html>`;
}
