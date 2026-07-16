import {
  COMBAT_CHOREOGRAPHY_SCHEMA, cameraCompositionPlan, castMotionPlan, choreographyAuditRows,
  combatDensityPlan, playerLifecycleMotionPlan, rewardMotionPlan,
} from "./combat-choreography.js";

export function runCombatChoreographyAudit() {
  const rows = choreographyAuditRows(), checks = [];
  checks.push({ id: "roster", pass: rows.length === 18, detail: `${rows.length}/18 E/R contracts` });
  for (const row of rows) {
    const player = { specialist: row.specialist, castSlot: row.slot, castStartedTick: 100, castContactTick: 100 + row.anticipationTicks, castRecoveryUntilTick: 100 + row.anticipationTicks + row.recoveryTicks, aimFacing: .4 };
    const lead = castMotionPlan(player, 100 + Math.max(1, row.anticipationTicks - 1));
    const contact = castMotionPlan(player, player.castContactTick);
    const reduced = castMotionPlan(player, player.castContactTick, { reducedMotion: true });
    const camera = cameraCompositionPlan(player, player.castContactTick, { cameraScale: 1 });
    checks.push({
      id: `${row.specialist}:${row.slot}`, pass: lead.phase === "anticipation" && contact.phase === "contact"
        && row.anticipationTicks >= 2 && row.anticipationTicks <= 6 && row.recoveryTicks >= 15 && row.recoveryTicks <= 28
        && Math.abs(contact.rotation) <= .09 && contact.scaleX >= .9 && contact.scaleX <= 1.1
        && reduced.rotation === 0 && reduced.translateX === 0 && camera.strength <= 26,
      detail: `${row.family} · ${row.anticipationTicks}t anticipation · ${row.recoveryTicks}t recovery · ${row.camera}`,
    });
  }
  const calm = combatDensityPlan({ enemies: [], projectiles: [], hostile: [], effects: [] }, 1);
  const saturated = combatDensityPlan({ enemies: Array(80), projectiles: Array(500), hostile: Array(200), effects: Array(260) }, 1);
  checks.push({ id: "density", pass: calm.cosmeticDensity === 1 && saturated.saturated && saturated.cosmeticDensity < .5, detail: `calm ${calm.cosmeticDensity} → saturated ${saturated.cosmeticDensity}` });
  const down = playerLifecycleMotionPlan({ downed: true, downedTick: 10, replaySlot: 1 }, 28);
  const revive = playerLifecycleMotionPlan({ animState: "revive", revivedTick: 10 }, 22);
  checks.push({ id: "lifecycle", pass: down.downProgress === 1 && down.translateY > 0 && revive.reviveRingAlpha > 0, detail: "grounded down pose + readable revive lift" });
  const reward = rewardMotionPlan({ x: 8, y: 9 }, 120, { important: true });
  const reducedReward = rewardMotionPlan({ x: 8, y: 9 }, 120, { important: true, reducedMotion: true });
  checks.push({ id: "rewards", pass: reward.scale > .9 && reward.scale < 1.1 && reducedReward.bob === 0 && reducedReward.scale === 1, detail: "bounded pulse; static reduced-motion silhouette" });
  return Object.freeze({ schema: COMBAT_CHOREOGRAPHY_SCHEMA, generatedAt: new Date().toISOString(), rows, checks, passed: checks.filter(({ pass }) => pass).length, total: checks.length });
}

export function combatChoreographyAuditHtml(report = runCombatChoreographyAudit()) {
  const cards = report.rows.map((row) => `<article><header><b>${row.specialist.toUpperCase()} · ${row.slot.toUpperCase()}</b><span>${row.family}</span></header><div class="timeline"><i style="width:${row.anticipationTicks * 8}px"></i><strong></strong><em style="width:${row.recoveryTicks * 5}px"></em></div><p>${row.anticipationTicks}t anticipation · contact · ${row.recoveryTicks}t recovery</p><small>${row.accent} / ${row.camera} camera / ${row.ring} ground cue</small></article>`).join("");
  const checks = report.checks.map((check) => `<li class="${check.pass ? "pass" : "fail"}"><b>${check.pass ? "PASS" : "FAIL"}</b> ${check.id}<span>${check.detail}</span></li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lastlight Combat Choreography Audit</title><style>body{margin:0;background:#06101a;color:#dbeaf0;font:14px Inter,system-ui;padding:32px}h1{font-size:34px;margin:0}p{color:#8ca8b5}.summary{color:#65f1d7;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:26px 0}article{background:#0b1925;border:1px solid #244050;padding:16px}header{display:flex;justify-content:space-between;color:#fff}header span,small{color:#79cfc9}.timeline{display:flex;align-items:center;height:22px;margin:15px 0}.timeline i{height:8px;background:#6ad5cf}.timeline strong{width:8px;height:20px;background:#fff0a8}.timeline em{height:8px;background:#ff6a72}ul{padding:0;display:grid;gap:6px}li{list-style:none;padding:10px;border-left:4px solid #60dabf;background:#0b1925;display:flex;gap:10px}li.fail{border-color:#ff6270}li span{margin-left:auto;color:#8ca8b5}</style></head><body><h1>Combat choreography audit</h1><p>Full-roster E/R timing, lifecycle, reward, camera, density, and reduced-motion evidence.</p><div class="summary">${report.passed}/${report.total} deterministic checks passed</div><div class="grid">${cards}</div><ul>${checks}</ul></body></html>`;
}
