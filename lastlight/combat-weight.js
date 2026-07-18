export const COMBAT_WEIGHT_SCHEMA = "lastlight.combat-weight.v1";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const freeze = (value) => Object.freeze(value);

export const SPECIALIST_RECOIL_PROFILES = freeze({
  zuri: freeze({ distance: 3.8, compression: .032, rotation: .014 }),
  echo: freeze({ distance: 2.8, compression: .024, rotation: .009 }),
  sola: freeze({ distance: 3.3, compression: .032, rotation: .01 }),
  bront: freeze({ distance: 5.6, compression: .052, rotation: .018 }),
  fang: freeze({ distance: 4.2, compression: .04, rotation: .02 }),
  gale: freeze({ distance: 3.7, compression: .034, rotation: .016 }),
  rift: freeze({ distance: 5, compression: .047, rotation: .018 }),
  nova: freeze({ distance: 3, compression: .027, rotation: .011 }),
  vesper: freeze({ distance: 3.6, compression: .033, rotation: .016 }),
});

const QUIET_RECOIL = freeze({ distance: 3, compression: .028, rotation: .012 });

export function weaponKickPlan({
  specialist = "zuri", flash = 0, angle = 0, reducedMotion = false,
} = {}) {
  const profile = SPECIALIST_RECOIL_PROFILES[specialist] || QUIET_RECOIL;
  const remaining = clamp(flash, 0, 1);
  const envelope = reducedMotion ? 0 : remaining * remaining;
  const direction = Number.isFinite(Number(angle)) ? Number(angle) : 0;
  const distance = profile.distance * envelope;
  const compression = profile.compression * envelope;
  return freeze({
    schema: COMBAT_WEIGHT_SCHEMA,
    envelope,
    angle: direction,
    x: -Math.cos(direction) * distance,
    y: -Math.sin(direction) * distance,
    rotation: -Math.sin(direction) * profile.rotation * envelope,
    scaleX: 1 - compression,
    scaleY: 1 + compression * .55,
  });
}

export function locomotionPlantPlan({
  startAge = Infinity, skidRatio = 0, speedRatio = 0, turnDelta = 0,
  reducedMotion = false,
} = {}) {
  if (reducedMotion) return freeze({
    schema: COMBAT_WEIGHT_SCHEMA, start: 0, stop: 0, turn: 0,
    offsetY: 0, rotation: 0, scaleX: 1, scaleY: 1, shadowX: 1, shadowY: 1,
  });
  const startProgress = clamp(startAge / .14, 0, 1);
  const start = startAge < .14 ? Math.sin(startProgress * Math.PI) : 0;
  const stop = Math.sin(clamp(skidRatio, 0, 1) * Math.PI);
  const turn = clamp(Math.abs(turnDelta) / (Math.PI * .72), 0, 1) * clamp(speedRatio, 0, 1);
  const plant = Math.max(start * .72, stop);
  return freeze({
    schema: COMBAT_WEIGHT_SCHEMA, start, stop, turn,
    offsetY: plant * 1.15,
    rotation: -Math.sign(turnDelta || 1) * turn * .018,
    scaleX: 1 + plant * .032,
    scaleY: 1 - plant * .048,
    shadowX: 1 + plant * .055,
    shadowY: 1 - plant * .035,
  });
}

export function enemyGroundingPlan({
  authored = true, moving = false, phase = "", stride = 0, stunned = false,
  reducedMotion = false,
} = {}) {
  if (reducedMotion) return freeze({
    schema: COMBAT_WEIGHT_SCHEMA, offsetY: 0, rotation: 0,
    scaleX: 1, scaleY: 1, planted: true,
  });
  const attacking = /windup|charge|contact|recovery/.test(String(phase || "").toLowerCase());
  const stun = stunned ? Math.sin(Number(stride) * 5.2) : 0;
  if (authored) return freeze({
    schema: COMBAT_WEIGHT_SCHEMA,
    offsetY: 0,
    rotation: stun * .012,
    scaleX: 1,
    scaleY: 1,
    planted: true,
  });
  const gait = moving && !attacking ? Math.max(0, Math.sin(Number(stride) || 0)) : 0;
  const footPlant = moving && !attacking ? 1 - Math.abs(Math.sin(Number(stride) || 0)) : 1;
  return freeze({
    schema: COMBAT_WEIGHT_SCHEMA,
    offsetY: gait > 0 ? -gait * .85 : 0,
    rotation: stun * .012,
    scaleX: 1 + footPlant * .01,
    scaleY: 1 - footPlant * .014,
    planted: footPlant >= .82,
  });
}

export function impactCameraImpulsePlan({
  plan = null, distance = Infinity, localImpact = false, reducedMotion = false,
  maximumDistance = 640,
} = {}) {
  const punch = Math.max(0, Number(plan?.force?.cameraPunch) || 0);
  if (reducedMotion || punch <= 0) return freeze({
    schema: COMBAT_WEIGHT_SCHEMA, strength: 0, attenuation: 0, local: Boolean(localImpact),
  });
  const range = Math.max(1, Number(maximumDistance) || 640);
  const normalized = clamp(1 - Math.max(0, Number(distance) || 0) / range, 0, 1);
  const attenuation = localImpact ? 1 : (Number(plan?.priority) || 0) >= 2 ? normalized * normalized * .34 : 0;
  return freeze({
    schema: COMBAT_WEIGHT_SCHEMA,
    strength: punch * attenuation,
    attenuation,
    local: Boolean(localImpact),
  });
}
