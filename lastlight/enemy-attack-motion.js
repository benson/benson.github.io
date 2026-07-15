export const ENEMY_ATTACK_MOTION_SCHEMA = "lastlight.enemy-attack-motion.v1";
export const ENEMY_ATTACK_FAMILIES = Object.freeze(["charge", "slam", "detonation"]);
export const ENEMY_ATTACK_STAGES = Object.freeze(["windup", "contact", "recovery"]);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function geometryRecord(geometry = {}) {
  const radius = Math.max(0, finite(geometry.radius));
  const range = Math.max(0, finite(geometry.range));
  const start = Math.max(0, finite(geometry.start));
  return Object.freeze({
    x: finite(geometry.x), y: finite(geometry.y), angle: finite(geometry.angle),
    radius, range, start,
    halfWidth: Math.max(0, finite(geometry.halfWidth)),
    endpointX: finite(geometry.endpointX, finite(geometry.x) + Math.cos(finite(geometry.angle)) * range),
    endpointY: finite(geometry.endpointY, finite(geometry.y) + Math.sin(finite(geometry.angle)) * range),
  });
}

/**
 * Presentation-only plan for enemy attack accents. `geometry` is copied without
 * deriving a new threat boundary; runtime collision/range remains authoritative.
 * Counts are deliberately capped so crowded waves have fixed Canvas work.
 */
export function enemyAttackMotionPlan({
  family, stage = "windup", progress = 0, geometry = {}, reducedMotion = false,
  reducedFlash = false, crowded = false,
} = {}) {
  if (!ENEMY_ATTACK_FAMILIES.includes(family)) throw new RangeError(`Unsupported enemy attack family: ${family}`);
  if (!ENEMY_ATTACK_STAGES.includes(stage)) throw new RangeError(`Unsupported enemy attack stage: ${stage}`);
  const authoritativeGeometry = geometryRecord(geometry), phase = clamp01(progress);
  const motionPhase = reducedMotion ? 0 : phase;
  const density = crowded ? .68 : 1;
  const contactAlpha = reducedFlash ? .3 : .78;
  const contactPhase = reducedMotion ? .45 : phase;
  const shared = {
    schema: ENEMY_ATTACK_MOTION_SCHEMA, family, stage, progress: phase,
    reducedMotion: Boolean(reducedMotion), reducedFlash: Boolean(reducedFlash), crowded: Boolean(crowded),
    authoritativeGeometry,
    contact: Object.freeze({
      progress: stage === "contact" || stage === "recovery" ? contactPhase : 0,
      alpha: stage === "windup" ? 0 : contactAlpha * (1 - phase),
      brightCore: stage !== "windup" && !reducedFlash,
      travel: stage !== "windup" && !reducedMotion ? phase : 0,
    }),
  };
  if (family === "charge") return Object.freeze({
    ...shared,
    accents: Object.freeze({
      chevrons: Math.max(3, Math.round(5 * density)),
      travel: motionPhase,
      railInset: Math.max(4, authoritativeGeometry.halfWidth * .32),
      endpointTeeth: Math.max(3, Math.round(5 * density)),
      launchArcs: reducedMotion ? 0 : Math.max(2, Math.round(3 * density)),
    }),
    markCount: Math.max(3, Math.round(5 * density)) + 2 + Math.max(3, Math.round(5 * density)) + (reducedMotion ? 0 : Math.max(2, Math.round(3 * density))),
  });
  if (family === "slam") return Object.freeze({
    ...shared,
    accents: Object.freeze({
      brokenRings: Math.max(2, Math.round(3 * density)),
      fractures: Math.max(5, Math.round(8 * density)),
      compression: reducedMotion ? .16 : .08 + motionPhase * .24,
      rotation: reducedMotion ? 0 : motionPhase * .22,
    }),
    markCount: Math.max(2, Math.round(3 * density)) * 4 + Math.max(5, Math.round(8 * density)),
  });
  return Object.freeze({
    ...shared,
    accents: Object.freeze({
      fuseSegments: Math.max(8, Math.round(12 * density)),
      litSegments: Math.max(1, Math.round(Math.max(8, Math.round(12 * density)) * phase)),
      coreScale: reducedMotion ? .22 : .18 + motionPhase * .18,
      unstableRotation: reducedMotion ? 0 : motionPhase * .28,
      spokes: Math.max(4, Math.round(6 * density)),
    }),
    markCount: Math.max(8, Math.round(12 * density)) + 1 + Math.max(4, Math.round(6 * density)),
  });
}

export function enemyAttackFamily({ type, telegraphKind, attackFamily } = {}) {
  if (ENEMY_ATTACK_FAMILIES.includes(attackFamily)) return attackFamily;
  if (type === "hound" || type === "shark" || telegraphKind === "lane" || telegraphKind === "wedge") return "charge";
  if (type === "brute" || telegraphKind === "ring") return "slam";
  if (type === "bomber" || telegraphKind === "burst") return "detonation";
  return null;
}

export function enemyAttackEffectPresentation(effect, enemies = []) {
  if (!effect || effect.kind !== "danger" || effect.owner !== "enemy") return null;
  const radius = finite(effect.radius), lifetime = finite(effect.maxLife, finite(effect.life));
  const nearby = enemies.find((enemy) => enemy && Math.hypot(finite(enemy.x) - finite(effect.x), finite(enemy.y) - finite(effect.y)) < 8);
  const rawPhase = nearby?.behaviorState;
  const phase = String(rawPhase && typeof rawPhase === "object" ? rawPhase.phase || rawPhase.state || "" : rawPhase || "").toLowerCase();
  if (nearby?.type === "brute" && phase === "recovery") return Object.freeze({ family: "slam", stage: "contact", angle: finite(nearby.attackAngle) });
  if (nearby?.type === "shark" && phase === "recovery") return Object.freeze({ family: "charge", stage: "contact", angle: finite(nearby.attackAngle) });
  if (nearby?.type === "bomber" && phase === "windup") return Object.freeze({ family: "detonation", stage: "windup", angle: finite(nearby.attackAngle) });
  if (Math.abs(radius - 115) < 2 && lifetime <= .35) return Object.freeze({ family: "slam", stage: "contact", angle: 0 });
  if (radius >= 145 && radius <= 175 && lifetime > .35) return Object.freeze({ family: "detonation", stage: "windup", angle: 0 });
  if (radius >= 145 && radius <= 155 && lifetime <= .305) return Object.freeze({ family: "detonation", stage: "contact", angle: 0 });
  if (radius >= 145 && radius <= 155 && lifetime <= .33) return Object.freeze({ family: "charge", stage: "contact", angle: finite(nearby?.attackAngle) });
  return null;
}
