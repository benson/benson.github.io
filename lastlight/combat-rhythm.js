export const COMBAT_RHYTHM_SCHEMA = "lastlight.combat-rhythm.v1";

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const freeze = (value) => Object.freeze(value);
const easeOut = (progress) => 1 - Math.pow(1 - clamp(progress), 3);
const easeInOut = (progress) => {
  const value = clamp(progress);
  return value < .5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
};

export const COMBAT_RHYTHM_TRANSITIONS = freeze({
  cooldownReady: freeze({ durationMs: 220, exitMs: 100, scaleFrom: .94 }),
  waveShift: freeze({ durationMs: 240, exitMs: 120, offsetY: 4 }),
  combatResume: freeze({ durationMs: 240, exitMs: 120, scaleFrom: .985 }),
  resultArrival: freeze({ durationMs: 280, exitMs: 160, scaleFrom: .97, offsetY: 8 }),
});

/**
 * Presentation-only materialization for field enemies. Common spawns settle
 * from 90% scale; the rare apex entrance gets more room without ever growing
 * from nothing. Reduced motion keeps the opacity/ring state cue only.
 */
export function enemyArrivalMotionPlan(enemy = {}, { reducedMotion = false } = {}) {
  const boss = Boolean(enemy.boss), elite = Boolean(enemy.elite || enemy.miniboss);
  const duration = boss ? .5 : .24;
  const remaining = clamp(enemy.spawnLife, 0, duration);
  const progress = 1 - remaining / duration, eased = easeOut(progress);
  const active = remaining > 0;
  const startScale = boss ? .84 : .9;
  const intensity = boss ? 1 : elite ? .68 : .42;
  return freeze({
    schema: COMBAT_RHYTHM_SCHEMA, active, progress, intensity,
    bodyAlpha: active ? .38 + eased * .62 : 1,
    bodyScale: reducedMotion || !active ? 1 : startScale + (1 - startScale) * eased,
    bodyOffsetY: reducedMotion || !active ? 0 : (1 - eased) * (boss ? 14 : 6),
    shadowAlpha: active ? .18 + eased * .82 : 1,
    ringAlpha: active ? (1 - progress) * intensity : 0,
    ringScale: reducedMotion ? 1 : .68 + eased * (boss ? .78 : .48),
  });
}

/** Keeps a defeated body grounded while its authored death clip clears. */
export function enemyDepartureMotionPlan(progress = 0, { boss = false, reducedMotion = false } = {}) {
  const value = clamp(progress), eased = easeInOut(value);
  return freeze({
    schema: COMBAT_RHYTHM_SCHEMA, progress: value,
    bodyAlpha: 1 - Math.pow(value, boss ? 2.2 : 1.7),
    bodyScale: reducedMotion ? 1 : 1 - eased * (boss ? .035 : .06),
    bodyOffsetY: reducedMotion ? 0 : eased * (boss ? 4 : 7),
    shadowAlpha: 1 - eased * .82,
    residueAlpha: value > .35 ? (1 - value) * (boss ? .42 : .2) : 0,
    residueScale: .76 + eased * .48,
  });
}

/** A phase transition is the apex's one mid-fight permission for larger motion. */
export function apexPhaseMotionPlan(enemy = {}, tick = 0, { reducedMotion = false } = {}) {
  if (!enemy.boss || enemy.apexActionState !== "transition") return freeze({ active: false, progress: 0, bodyScale: 1, ringAlpha: 0, ringScale: 1 });
  const start = Number(enemy.apexPhaseStartedTick) || Number(tick) || 0;
  const end = Math.max(start + 1, Number(enemy.apexActionUntilTick) || start + 1);
  const progress = clamp((Number(tick) - start) / (end - start)), eased = easeInOut(progress);
  return freeze({
    schema: COMBAT_RHYTHM_SCHEMA, active: true, progress,
    bodyScale: reducedMotion ? 1 : .94 + Math.sin(eased * Math.PI) * .04 + eased * .06,
    ringAlpha: .72 * (1 - Math.abs(progress * 2 - 1)),
    ringScale: reducedMotion ? 1 : .82 + eased * .72,
  });
}

export function combatRhythmTransition(kind, { reducedMotion = false } = {}) {
  const contract = COMBAT_RHYTHM_TRANSITIONS[kind];
  if (!contract) return null;
  return freeze({
    schema: COMBAT_RHYTHM_SCHEMA, kind, ...contract,
    scaleFrom: reducedMotion ? 1 : contract.scaleFrom ?? 1,
    offsetY: reducedMotion ? 0 : contract.offsetY ?? 0,
  });
}

export function combatRhythmAuditRows() {
  return Object.entries(COMBAT_RHYTHM_TRANSITIONS).map(([kind, contract]) => freeze({ kind, ...contract }));
}
