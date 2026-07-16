export const COMBAT_CHOREOGRAPHY_SCHEMA = "lastlight.combat-choreography.v1";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const freeze = (value) => Object.freeze(value);

const ability = (family, anticipationTicks, recoveryTicks, camera, form = {}) => freeze({
  family, anticipationTicks, recoveryTicks, camera,
  lean: form.lean || 0, compression: form.compression || .035,
  lift: form.lift || 0, ring: form.ring || "pulse", accent: form.accent || "line",
});

// Every active and ultimate owns a small, explicit motion signature. Windups
// stay below 117ms so input remains crisp; ultimates earn slightly more space.
export const SPECIALIST_ABILITY_CHOREOGRAPHY = freeze({
  zuri: freeze({
    e: ability("fan", 2, 15, "light", { lean: -.045, compression: .045, accent: "fan" }),
    r: ability("projectile", 5, 24, "ultimate", { lean: -.065, compression: .06, accent: "rocket" }),
  }),
  echo: freeze({
    e: ability("support", 3, 18, "support", { lift: -2, ring: "outward", accent: "wave" }),
    r: ability("support", 6, 27, "ultimate", { lift: -4, ring: "outward", accent: "chorus" }),
  }),
  sola: freeze({
    e: ability("guard", 3, 20, "support", { compression: .065, ring: "brace", accent: "shield" }),
    r: ability("field", 6, 28, "ultimate", { lean: -.04, lift: -3, ring: "target", accent: "solar" }),
  }),
  bront: freeze({
    e: ability("mobility", 2, 17, "dash", { lean: .075, compression: .075, accent: "crash" }),
    r: ability("mobility", 4, 25, "ultimate", { lean: .09, compression: .09, accent: "shockwave" }),
  }),
  fang: freeze({
    e: ability("mobility", 2, 15, "dash", { lean: .08, compression: .055, accent: "frenzy" }),
    r: ability("mobility", 3, 23, "ultimate", { lean: .11, compression: .07, accent: "redline" }),
  }),
  gale: freeze({
    e: ability("mobility", 2, 16, "dash", { lean: .07, lift: -3, accent: "slash" }),
    r: ability("field", 5, 25, "ultimate", { lean: -.055, lift: -5, accent: "windwall" }),
  }),
  rift: freeze({
    e: ability("mobility", 2, 18, "dash", { lean: .07, compression: .055, accent: "impact" }),
    r: ability("buff", 4, 22, "support", { lift: -3, ring: "inward", accent: "overclock" }),
  }),
  nova: freeze({
    e: ability("mobility", 2, 17, "dash", { lean: .065, lift: -2, accent: "veil" }),
    r: ability("mobility", 4, 25, "ultimate", { lean: .075, lift: -5, accent: "spirit" }),
  }),
  vesper: freeze({
    e: ability("recall", 3, 18, "support", { lean: -.04, ring: "inward", accent: "recall" }),
    r: ability("radial", 5, 26, "ultimate", { lift: -4, ring: "outward", accent: "daggers" }),
  }),
});

export function abilityChoreography(specialist, slot) {
  return SPECIALIST_ABILITY_CHOREOGRAPHY[specialist]?.[String(slot || "").toLowerCase()] || null;
}

export function castMotionPlan(player = {}, tick = 0, { reducedMotion = false } = {}) {
  const slot = String(player.castSlot || "").toLowerCase(), choreography = abilityChoreography(player.specialist, slot);
  if (!choreography) return freeze({ active: false, phase: "idle", translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1, ringAlpha: 0, ringScale: 1 });
  const start = Number(player.castStartedTick) || 0, contact = Number(player.castContactTick) || start;
  const end = Number(player.castRecoveryUntilTick) || contact + choreography.recoveryTicks;
  if (tick < start || tick > end) return freeze({ active: false, phase: "idle", translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1, ringAlpha: 0, ringScale: 1 });
  const anticipating = tick < contact;
  const progress = anticipating
    ? clamp((tick - start) / Math.max(1, contact - start), 0, 1)
    : clamp((tick - contact) / Math.max(1, end - contact), 0, 1);
  const anticipation = anticipating ? progress * progress : 0;
  const release = anticipating ? 0 : Math.exp(-progress * 7.5);
  const recovery = anticipating ? 0 : 1 - Math.pow(1 - progress, 2.2);
  const motion = reducedMotion ? 0 : 1;
  const compression = choreography.compression * motion;
  return freeze({
    schema: COMBAT_CHOREOGRAPHY_SCHEMA, active: true, slot, family: choreography.family,
    phase: anticipating ? "anticipation" : progress < .18 ? "contact" : "recovery",
    translateX: (anticipation * -4 + release * 5) * motion,
    translateY: (choreography.lift * (anticipation + release * .7) + recovery * .5) * motion,
    rotation: reducedMotion ? 0 : choreography.lean * (anticipation - release * .72),
    scaleX: 1 - compression * anticipation + compression * release,
    scaleY: 1 + compression * anticipation - compression * release * .72,
    ringAlpha: reducedMotion ? (anticipating ? .2 : .42 * (1 - progress)) : anticipating ? .24 + progress * .28 : .62 * (1 - progress),
    ringScale: anticipating ? .7 + progress * .2 : .9 + progress * .46,
    ring: choreography.ring, accent: choreography.accent, camera: choreography.camera,
  });
}

export function playerLifecycleMotionPlan(player = {}, tick = 0, { reducedMotion = false } = {}) {
  const downAge = Math.max(0, tick - (Number(player.downedTick) || tick));
  const reviveAge = Math.max(0, tick - (Number(player.revivedTick) || tick));
  const downProgress = player.downed ? clamp(downAge / 18, 0, 1) : 0;
  const reviveProgress = player.animState === "revive" ? clamp(reviveAge / 24, 0, 1) : 0;
  const motion = reducedMotion ? 0 : 1;
  return freeze({
    downProgress, reviveProgress,
    translateY: downProgress * 7 * motion - Math.sin(reviveProgress * Math.PI) * 7 * motion,
    rotation: downProgress * .07 * motion * (Number(player.replaySlot) % 2 ? 1 : -1),
    scaleX: 1 + downProgress * .06 * motion + Math.sin(reviveProgress * Math.PI) * .04 * motion,
    scaleY: 1 - downProgress * .1 * motion + Math.sin(reviveProgress * Math.PI) * .06 * motion,
    reviveRingAlpha: player.animState === "revive" ? (1 - reviveProgress) * .75 : 0,
  });
}

export function rewardMotionPlan(entity = {}, nowMs = 0, { reducedMotion = false, important = false } = {}) {
  const seed = (Math.abs(Number(entity.x) || 0) * .013 + Math.abs(Number(entity.y) || 0) * .007) % (Math.PI * 2);
  const pulse = reducedMotion ? 0 : Math.sin(nowMs * (important ? .007 : .005) + seed);
  return freeze({ bob: reducedMotion ? 0 : pulse * (important ? 2.8 : 1.6), scale: 1 + pulse * (important ? .055 : .035), haloAlpha: important ? .34 + pulse * .08 : .14 + pulse * .035, haloScale: 1.08 + (pulse + 1) * .08 });
}

export function combatDensityPlan(state = {}, qualityDensity = 1) {
  const enemies = state.enemies?.length || 0, projectiles = (state.projectiles?.length || 0) + (state.hostile?.length || 0), effects = state.effects?.length || 0;
  const pressure = enemies / 34 + projectiles / 260 + effects / 120;
  const crowded = pressure >= 1.45, saturated = pressure >= 2.25;
  const cosmeticDensity = clamp(Number(qualityDensity) * (saturated ? .46 : crowded ? .68 : 1), .25, 1);
  return freeze({ enemies, projectiles, effects, pressure, crowded, saturated, cosmeticDensity, ambientStride: saturated ? 4 : crowded ? 2 : 1, cameraScale: saturated ? .72 : crowded ? .86 : 1 });
}

export function cameraCompositionPlan(player = {}, tick = 0, density = {}, { reducedMotion = false } = {}) {
  const cast = castMotionPlan(player, tick, { reducedMotion });
  if (!cast.active || reducedMotion) return freeze({ x: 0, y: 0, strength: 0 });
  const choreography = abilityChoreography(player.specialist, cast.slot), angle = Number(player.aimFacing ?? player.facing) || 0;
  const base = choreography?.camera === "ultimate" ? 26 : choreography?.camera === "dash" ? 16 : choreography?.camera === "support" ? 10 : 13;
  const strength = base * (Number(density.cameraScale) || 1) * (cast.phase === "anticipation" ? .65 : cast.phase === "contact" ? 1 : .55);
  return freeze({ x: Math.cos(angle) * strength, y: Math.sin(angle) * strength, strength });
}

export function choreographyAuditRows() {
  return Object.entries(SPECIALIST_ABILITY_CHOREOGRAPHY).flatMap(([specialist, slots]) => Object.entries(slots).map(([slot, value]) => freeze({ specialist, slot, ...value })));
}
