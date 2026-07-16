export const IMPACT_FEEL_SCHEMA = "lastlight.impact-feel.v1";
export const IMPACT_FEEL_TIERS = Object.freeze(["ambient", "light", "heavy", "critical"]);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const freeze = (value) => Object.freeze(value);

export const IMPACT_TIER_PROFILES = freeze({
  ambient: freeze({ cost: 1, priority: 0, holdMs: 0, freezeMs: 0, reaction: 1.5, attackerRecoil: .5, cameraPunch: 0, actorPunch: .5, particles: 2, trailScale: .7, aftermath: .35, audio: .32, haptic: freeze({ duration: 0, strong: 0, weak: 0 }) }),
  light: freeze({ cost: 2, priority: 1, holdMs: 16, freezeMs: 0, reaction: 3, attackerRecoil: 1.1, cameraPunch: 0, actorPunch: 1, particles: 3, trailScale: 1, aftermath: .55, audio: .52, haptic: freeze({ duration: 24, strong: .08, weak: .04 }) }),
  heavy: freeze({ cost: 4, priority: 2, holdMs: 33, freezeMs: 24, reaction: 6, attackerRecoil: 2.2, cameraPunch: 3, actorPunch: 2, particles: 6, trailScale: 1.28, aftermath: .9, audio: .78, haptic: freeze({ duration: 46, strong: .28, weak: .12 }) }),
  critical: freeze({ cost: 7, priority: 3, holdMs: 50, freezeMs: 45, reaction: 10, attackerRecoil: 3.6, cameraPunch: 6, actorPunch: 3.5, particles: 9, trailScale: 1.58, aftermath: 1.3, audio: 1, haptic: freeze({ duration: 72, strong: .58, weak: .24 }) }),
});

export const IMPACT_MASS_PROFILES = freeze({
  mite: freeze({ mass: .48, anticipationPower: .72, commitPower: 1.9, recoveryPower: 1.2, secondaryLag: .58 }),
  hound: freeze({ mass: .72, anticipationPower: .82, commitPower: 2.2, recoveryPower: 1.35, secondaryLag: .75 }),
  spitter: freeze({ mass: .82, anticipationPower: 1, commitPower: 1.85, recoveryPower: 1.45, secondaryLag: .85 }),
  brute: freeze({ mass: 1.5, anticipationPower: 1.8, commitPower: 3.1, recoveryPower: 1.85, secondaryLag: 1.35 }),
  bomber: freeze({ mass: 1, anticipationPower: 1.35, commitPower: 2.45, recoveryPower: 1.5, secondaryLag: 1 }),
  shark: freeze({ mass: 1.75, anticipationPower: 2.05, commitPower: 3.4, recoveryPower: 2, secondaryLag: 1.5 }),
  boss: freeze({ mass: 2.25, anticipationPower: 2.35, commitPower: 3.8, recoveryPower: 2.25, secondaryLag: 1.7 }),
  player: freeze({ mass: 1, anticipationPower: 1, commitPower: 2.2, recoveryPower: 1.45, secondaryLag: 1 }),
  default: freeze({ mass: 1, anticipationPower: 1, commitPower: 2, recoveryPower: 1.5, secondaryLag: 1 }),
});

export function impactTierForEvent({ critical = false, boss = false, elite = false, damage = 0, maxHp = 1, priority = "standard", shake = "none", flash = "none" } = {}) {
  const ratio = clamp(damage / Math.max(1, Number(maxHp) || 1), 0, 1);
  if (critical || boss && ratio >= .04 || priority === "critical" && ratio >= .08 || shake === "high" && flash === "high") return "critical";
  if (boss || elite || ratio >= .075 || shake === "high" || flash === "high") return "heavy";
  if (ratio >= .012 || priority === "standard" || shake === "medium" || flash === "medium") return "light";
  return "ambient";
}

export function impactFeedbackPlan({
  tier = "light", angle = 0, reducedMotion = false, reducedFlash = false,
  crowded = false, density = 1, source = "contact", mass = "default",
} = {}) {
  const resolvedTier = IMPACT_FEEL_TIERS.includes(tier) ? tier : "light";
  const base = IMPACT_TIER_PROFILES[resolvedTier], massProfile = IMPACT_MASS_PROFILES[mass] || IMPACT_MASS_PROFILES.default;
  const crowdScale = crowded ? .58 : 1, densityScale = clamp(density, .25, 1);
  const flashScale = reducedFlash ? .22 : 1;
  const motionScale = reducedMotion ? 0 : 1;
  const impactCue = resolvedTier === "critical" ? "impact-critical" : resolvedTier === "heavy" ? "impact-heavy" : null;
  return freeze({
    schema: IMPACT_FEEL_SCHEMA, tier: resolvedTier, source, angle: Number.isFinite(Number(angle)) ? Number(angle) : 0,
    priority: base.priority, cost: base.cost,
    timing: freeze({
      holdMs: reducedMotion ? Math.min(16, base.holdMs) : base.holdMs,
      freezeMs: reducedMotion ? 0 : Math.round(base.freezeMs * crowdScale),
      anticipationPower: massProfile.anticipationPower,
      commitPower: massProfile.commitPower,
      recoveryPower: massProfile.recoveryPower,
    }),
    force: freeze({
      reaction: base.reaction * motionScale / Math.sqrt(massProfile.mass),
      attackerRecoil: base.attackerRecoil * motionScale,
      actorPunch: base.actorPunch * motionScale,
      cameraPunch: base.cameraPunch * motionScale * crowdScale,
      mass: massProfile.mass,
    }),
    vfx: freeze({
      particleCount: Math.max(1, Math.round(base.particles * densityScale * crowdScale)),
      trailScale: reducedMotion ? Math.min(.8, base.trailScale) : base.trailScale,
      flashScale,
      criticalGraphic: resolvedTier === "critical",
      criticalBloom: resolvedTier === "critical" && !reducedFlash,
      smear: !reducedMotion && ["heavy", "critical"].includes(resolvedTier),
      aftermath: base.aftermath * densityScale,
    }),
    audio: freeze({
      cue: impactCue,
      gain: base.audio,
      duck: resolvedTier === "critical" ? .26 : resolvedTier === "heavy" ? .14 : 0,
      pitchVariance: resolvedTier === "critical" ? 0 : .035,
      minimumIntervalMs: resolvedTier === "critical" ? 72 : resolvedTier === "heavy" ? 96 : 0,
    }),
    haptic: reducedMotion ? IMPACT_TIER_PROFILES.ambient.haptic : base.haptic,
    reducedMotion: Boolean(reducedMotion), reducedFlash: Boolean(reducedFlash), crowded: Boolean(crowded),
  });
}

export function impactAnimationTimeScale(targetVisual = null, attackerVisual = null) {
  const frozen = [targetVisual, attackerVisual].some((visual) => {
    const freezeMs = Math.max(0, Number(visual?.plan?.timing?.freezeMs) || 0);
    return freezeMs > 0 && Math.max(0, Number(visual?.ageMs) || 0) < freezeMs;
  });
  return frozen ? 0 : 1;
}

export function impactReactionTransform(plan, progress = 0) {
  const p = clamp(progress, 0, 1), peak = p < .2 ? p / .2 : 1 - (p - .2) / .8;
  const envelope = clamp(peak, 0, 1), distance = plan?.force?.reaction * envelope, angle = Number(plan?.angle) || 0;
  return freeze({
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotation: Math.sin(angle) * distance * .012,
    scaleX: 1 + envelope * Math.min(.08, distance * .009),
    scaleY: 1 - envelope * Math.min(.1, distance * .011),
    envelope,
  });
}

export function attackerRecoilTransform(plan, remaining = 0) {
  const envelope = clamp(remaining, 0, 1), amount = (plan?.force?.attackerRecoil || 0) * envelope, angle = Number(plan?.angle) || 0;
  return freeze({ x: -Math.cos(angle) * amount, y: -Math.sin(angle) * amount, rotation: -Math.sin(angle) * amount * .012, envelope });
}

export function impactPhaseProgress(type = "default", phase = "recovery", progress = 0, reducedMotion = false) {
  const p = clamp(progress, 0, 1);
  if (reducedMotion) return p;
  const profile = IMPACT_MASS_PROFILES[type] || IMPACT_MASS_PROFILES.default;
  if (phase === "windup") return Math.pow(p, profile.anticipationPower);
  if (phase === "contact" || phase === "charge") return 1 - Math.pow(1 - p, profile.commitPower);
  return 1 - Math.pow(1 - p, profile.recoveryPower);
}

export function projectileMotionPlan(projectile = {}, weaponPlan = null, { reducedMotion = false } = {}) {
  const speed = Math.hypot(Number(projectile.vx) || 0, Number(projectile.vy) || 0), baseLength = Math.max(0, Number(weaponPlan?.trail?.length) || 0);
  const speedScale = clamp(speed / 420, .62, 1.85), age = Math.max(0, Number(projectile.age) || 0), life = Math.max(0, Number(projectile.life) || 0);
  return freeze({
    speed, trailLength: reducedMotion ? Math.min(18, baseLength) : baseLength * speedScale,
    trailWidth: Math.max(1, Number(weaponPlan?.trail?.width) || 1),
    smear: !reducedMotion && speed >= 520 && baseLength > 0,
    birth: age <= .085, terminal: life > 0 && life <= .12,
    stretch: reducedMotion ? 1 : clamp(1 + speed / 1800, 1, 1.42),
  });
}

export function cameraLookBias({ aimAngle = 0, moving = false, speedRatio = 0, reducedMotion = false } = {}) {
  if (reducedMotion) return freeze({ x: 0, y: 0, distance: 0 });
  const distance = clamp((moving ? 35 : 21) + clamp(speedRatio, 0, 1.3) * 13, 18, 48);
  return freeze({ x: Math.cos(aimAngle) * distance, y: Math.sin(aimAngle) * distance, distance });
}

export function secondaryMotionPlan({ turnDelta = 0, speedRatio = 0, recoil = 0, mass = "default", reducedMotion = false } = {}) {
  if (reducedMotion) return freeze({ rotation: 0, shear: 0, lag: 0 });
  const profile = IMPACT_MASS_PROFILES[mass] || IMPACT_MASS_PROFILES.default;
  const lag = clamp(Math.abs(turnDelta) * .42 + speedRatio * .08 + recoil * .1, 0, .18) * profile.secondaryLag;
  return freeze({ rotation: -Math.sign(turnDelta || 1) * lag * .32, shear: -Math.sign(turnDelta || 1) * lag, lag });
}

export function aftermathPlan(plan, { radius = 12, material = "energy" } = {}) {
  const scale = Math.max(0, Number(plan?.vfx?.aftermath) || 0), critical = plan?.tier === "critical";
  return freeze({
    visible: scale > .2, lifetimeMs: Math.min(2000, Math.round((critical ? 1500 : plan?.tier === "heavy" ? 1100 : 650) * scale)),
    radius: clamp(radius * (critical ? 1.35 : 1), 8, 96), material,
    smoke: !["energy", "liquid"].includes(material), opacity: critical ? .24 : .14,
  });
}

export class ImpactIntensityDirector {
  constructor(maximum = 14) { this.maximum = Math.max(1, Number(maximum) || 14); this.used = 0; this.admitted = 0; this.rejected = 0; }
  beginFrame({ crowded = false, density = 1 } = {}) {
    this.used = 0; this.admitted = 0; this.rejected = 0;
    this.frameBudget = Math.max(4, Math.round(this.maximum * clamp(density, .35, 1) * (crowded ? .72 : 1)));
    this.priorityReserve = Math.max(2, Math.ceil(this.frameBudget * .42));
    return this.frameBudget;
  }
  admit(plan) {
    const cost = Math.max(1, Number(plan?.cost) || 1), priority = Number(plan?.priority) || 0;
    const ordinaryLimit = Math.max(1, this.frameBudget - this.priorityReserve);
    if (priority < 2 && this.used + cost > ordinaryLimit) { this.rejected += 1; return false; }
    if (priority >= 2 && this.used + cost > this.frameBudget + this.priorityReserve && !(priority >= 3 && this.used <= ordinaryLimit)) { this.rejected += 1; return false; }
    this.used += cost; this.admitted += 1; return true;
  }
  diagnostics() { return freeze({ budget: this.frameBudget || this.maximum, used: this.used, admitted: this.admitted, rejected: this.rejected }); }
}

export function selectImpactFeedback(candidates = [], director = new ImpactIntensityDirector()) {
  return [...candidates]
    .filter((candidate) => candidate?.plan)
    .sort((left, right) => (right.plan.priority - left.plan.priority) || String(left.id).localeCompare(String(right.id)))
    .filter((candidate) => director.admit(candidate.plan));
}
