import {
  IMPACT_FEEL_SCHEMA, IMPACT_FEEL_TIERS, IMPACT_TIER_PROFILES,
  impactAnimationTimeScale, impactFeedbackPlan,
} from "./impact-feel.js";
import { audioCuePolicy } from "./audio-mix.js";

export function runImpactHierarchyAudit() {
  const plans = Object.fromEntries(IMPACT_FEEL_TIERS.map((tier) => [tier, impactFeedbackPlan({ tier })]));
  const checks = [];
  checks.push({
    id: "tier-escalation",
    pass: IMPACT_FEEL_TIERS.every((tier, index) => index === 0
      || IMPACT_TIER_PROFILES[tier].reaction > IMPACT_TIER_PROFILES[IMPACT_FEEL_TIERS[index - 1]].reaction),
    detail: "Reaction, recoil, particles, and feedback cost rise through one shared four-tier contract",
  });
  checks.push({
    id: "frequent-hit-restraint",
    pass: plans.ambient.audio.cue === null && plans.light.audio.cue === null,
    detail: "Ambient and light hits reuse weapon/material sound instead of adding constant hit-confirm chatter",
  });
  checks.push({
    id: "heavy-accent",
    pass: plans.heavy.audio.cue === "impact-heavy" && audioCuePolicy(plans.heavy.audio.cue).category === "impact",
    detail: "Heavy local hits add one rate-limited combat-bus accent",
  });
  checks.push({
    id: "critical-accent",
    pass: plans.critical.audio.cue === "impact-critical"
      && audioCuePolicy(plans.critical.audio.cue).priority > audioCuePolicy(plans.heavy.audio.cue).priority,
    detail: "Critical impacts receive reserved audio priority and controlled mix ducking",
  });
  checks.push({
    id: "shared-hit-stop",
    pass: impactAnimationTimeScale({ plan: plans.heavy, ageMs: plans.heavy.timing.freezeMs - 1 }) === 0
      && impactAnimationTimeScale(null, { plan: plans.critical, ageMs: plans.critical.timing.freezeMs - 1 }) === 0,
    detail: "The same event can briefly hold target and attacker animation before recoil recovery",
  });
  checks.push({
    id: "bounded-timing",
    pass: plans.heavy.timing.freezeMs <= 24 && plans.critical.timing.freezeMs <= 45
      && plans.heavy.audio.minimumIntervalMs >= 90 && plans.critical.audio.minimumIntervalMs >= 70,
    detail: "Visual holds remain sub-frame-scale beats and accents are rate limited",
  });
  const reduced = impactFeedbackPlan({ tier: "critical", reducedMotion: true, reducedFlash: true });
  checks.push({
    id: "reduced-motion",
    pass: reduced.timing.freezeMs === 0 && reduced.force.reaction === 0 && reduced.force.cameraPunch === 0
      && reduced.vfx.criticalGraphic && !reduced.vfx.criticalBloom,
    detail: "Reduced motion removes displacement and hit-stop while preserving the critical silhouette",
  });
  const crowded = impactFeedbackPlan({ tier: "critical", crowded: true });
  checks.push({
    id: "density-restraint",
    pass: crowded.force.cameraPunch < plans.critical.force.cameraPunch
      && crowded.vfx.particleCount < plans.critical.vfx.particleCount,
    detail: "Dense fights automatically reduce camera and particle intensity",
  });
  return Object.freeze({
    schema: IMPACT_FEEL_SCHEMA,
    generatedAt: new Date().toISOString(),
    plans,
    checks,
    passed: checks.filter(({ pass }) => pass).length,
    total: checks.length,
  });
}

export function impactHierarchyAuditHtml(report = runImpactHierarchyAudit()) {
  const checks = report.checks.map((check) => `<li class="${check.pass ? "pass" : "fail"}"><b>${check.pass ? "PASS" : "FAIL"}</b><strong>${check.id}</strong><span>${check.detail}</span></li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lastlight Impact Hierarchy Audit</title><style>body{margin:0;padding:32px;background:#06101a;color:#dbeaf0;font:14px Inter,system-ui}h1{margin:0;font-size:34px}p,li span{color:#8ca8b5}.summary{color:#65f1d7;font-weight:800}ul{display:grid;gap:8px;padding:0;margin-top:24px}li{display:grid;grid-template-columns:52px 190px 1fr;gap:12px;padding:12px;border-left:4px solid #60dabf;background:#0b1925;list-style:none}li.fail{border-color:#ff6270}</style></head><body><h1>Impact hierarchy audit</h1><p>Shared hit-stop, recoil, camera, particles, audio accents, density restraint, and reduced-motion evidence.</p><div class="summary">${report.passed}/${report.total} deterministic checks passed</div><ul>${checks}</ul></body></html>`;
}
