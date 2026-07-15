import { createHash } from "node:crypto";
import { enemyBodyMotionPlan } from "./enemy-body-motion.js";
import { motionFrame } from "./motion.js";
import { getThemeEnemyAnimation } from "./themes/lastlight.js";

export const ENEMY_BODY_AUDIT_SCHEMA = "lastlight.enemy-body-motion-audit.v1";
export const ENEMY_BODY_AUDIT_MODES = Object.freeze([
  Object.freeze({ id: "normal", reducedMotion: false }),
  Object.freeze({ id: "reduced-motion", reducedMotion: true }),
]);
export const ENEMY_BODY_AUDIT_CASES = Object.freeze([
  Object.freeze({ type: "hound", name: "Hound", windupTicks: 30, activeTicks: 18, recoveryTicks: 42, contactPhase: "charge", geometry: Object.freeze({ family: "charge", radius: 70, range: 132, halfWidth: 28 }) }),
  Object.freeze({ type: "spitter", name: "Spitter", windupTicks: 33, activeTicks: 6, recoveryTicks: 15, contactPhase: "contact", geometry: Object.freeze({ family: "line", radius: 70, range: 390, halfWidth: 7 }) }),
  Object.freeze({ type: "brute", name: "Brute", windupTicks: 48, activeTicks: 0, recoveryTicks: 84, contactPhase: "recovery", geometry: Object.freeze({ family: "slam", radius: 115, range: 115, halfWidth: 0 }) }),
  Object.freeze({ type: "bomber", name: "Bomber", windupTicks: 30, activeTicks: 0, recoveryTicks: 0, contactPhase: "removed", geometry: Object.freeze({ family: "detonation", radius: 170, range: 0, halfWidth: 0 }) }),
  Object.freeze({ type: "shark", name: "Siegebreaker", windupTicks: 54, activeTicks: 36, recoveryTicks: 72, contactPhase: "charge", geometry: Object.freeze({ family: "charge", radius: 150, range: 216, halfWidth: 62 }) }),
]);
export const ENEMY_BODY_AUDIT_CHECKPOINTS = Object.freeze([
  Object.freeze({ id: "windup-0", phase: "windup", progress: 0 }),
  Object.freeze({ id: "windup-50", phase: "windup", progress: .5 }),
  Object.freeze({ id: "windup-90", phase: "windup", progress: .9 }),
  Object.freeze({ id: "contact", phase: "contact", progress: 0 }),
  Object.freeze({ id: "recovery", phase: "recovery", progress: .45 }),
]);

function auditEnemy(attack, checkpoint) {
  const startedTick = 120, contactTick = startedTick + attack.windupTicks;
  if (checkpoint.phase === "windup") return {
    id: `${attack.type}-audit`, type: attack.type, behaviorState: "windup", behaviorStartedTick: startedTick,
    behaviorUntilTick: contactTick, attackAngle: 0, tick: startedTick + Math.floor(attack.windupTicks * checkpoint.progress),
  };
  if (checkpoint.phase === "contact") {
    if (attack.type === "bomber") return {
      id: `${attack.type}-audit`, type: attack.type, behaviorState: "windup", behaviorStartedTick: startedTick,
      behaviorUntilTick: contactTick, attackAngle: 0, tick: contactTick - 1, contactTick,
    };
    const until = contactTick + Math.max(1, attack.activeTicks || attack.recoveryTicks);
    return {
      id: `${attack.type}-audit`, type: attack.type, behaviorState: attack.contactPhase,
      behaviorStartedTick: contactTick, behaviorUntilTick: until, attackAngle: 0, tick: contactTick, contactTick,
    };
  }
  if (attack.type === "bomber") return {
    id: `${attack.type}-audit`, type: attack.type, dead: true, _deathElapsed: .12, behaviorState: "windup",
    behaviorStartedTick: startedTick, behaviorUntilTick: contactTick, attackAngle: 0, tick: contactTick + 7, contactTick,
  };
  const recoveryStartedTick = contactTick + attack.activeTicks;
  return {
    id: `${attack.type}-audit`, type: attack.type, behaviorState: "recovery", behaviorStartedTick: recoveryStartedTick,
    behaviorUntilTick: recoveryStartedTick + attack.recoveryTicks, attackAngle: 0,
    tick: recoveryStartedTick + Math.max(7, Math.floor(attack.recoveryTicks * checkpoint.progress)), contactTick,
  };
}

export function enemyBodyAuditTimeline(attack, relativeTick, { reducedMotion = false } = {}) {
  const rig = getThemeEnemyAnimation(attack.type), tick = Math.max(0, Math.floor(relativeTick)), contactTick = attack.windupTicks;
  let enemy;
  if (tick < contactTick) enemy = { id: `${attack.type}-timeline`, type: attack.type, behaviorState: "windup", behaviorStartedTick: 0, behaviorUntilTick: contactTick, attackAngle: 0 };
  else if (attack.type === "bomber") enemy = { id: `${attack.type}-timeline`, type: attack.type, dead: true, _deathElapsed: (tick - contactTick) / 60, behaviorState: "windup", behaviorStartedTick: 0, behaviorUntilTick: contactTick, attackAngle: 0 };
  else if (attack.type === "brute") enemy = { id: `${attack.type}-timeline`, type: attack.type, behaviorState: "recovery", behaviorStartedTick: contactTick, behaviorUntilTick: contactTick + attack.recoveryTicks, attackAngle: 0 };
  else if (tick < contactTick + attack.activeTicks) enemy = { id: `${attack.type}-timeline`, type: attack.type, behaviorState: attack.contactPhase, behaviorStartedTick: contactTick, behaviorUntilTick: contactTick + attack.activeTicks, attackAngle: 0 };
  else enemy = { id: `${attack.type}-timeline`, type: attack.type, behaviorState: "recovery", behaviorStartedTick: contactTick + attack.activeTicks, behaviorUntilTick: contactTick + attack.activeTicks + attack.recoveryTicks, attackAngle: 0 };
  const plan = enemyBodyMotionPlan({ enemy, tick, rig, fallbackState: enemy.dead ? "death" : "idle", fallbackElapsed: enemy._deathElapsed || 0 });
  return Object.freeze({
    tick, contactTick, bodyVisible: !(attack.type === "bomber" && tick >= contactTick),
    contactProgress: tick < contactTick ? 0 : Math.min(1, (tick - contactTick) / 18),
    plan, frame: motionFrame(rig, plan.state, plan.elapsed, { reducedMotion }),
  });
}

export function buildEnemyBodyMotionAuditMetadata() {
  const frames = [];
  for (const attack of ENEMY_BODY_AUDIT_CASES) {
    const rig = getThemeEnemyAnimation(attack.type);
    for (const mode of ENEMY_BODY_AUDIT_MODES) for (const checkpoint of ENEMY_BODY_AUDIT_CHECKPOINTS) {
      const enemy = auditEnemy(attack, checkpoint);
      const plan = enemyBodyMotionPlan({ enemy, tick: enemy.tick, rig, fallbackState: "idle", fallbackElapsed: 0 });
      const frame = motionFrame(rig, plan.state, plan.elapsed, { reducedMotion: mode.reducedMotion });
      frames.push(Object.freeze({
        type: attack.type, mode: mode.id, checkpoint: checkpoint.id,
        tick: enemy.tick, authoritativeContactTick: enemy.contactTick ?? enemy.behaviorUntilTick,
        terminalPreContact: attack.type === "bomber" && checkpoint.id === "contact",
        bodyVisibleAtContact: !(attack.type === "bomber" && checkpoint.id === "contact"),
        authoritativeGeometry: attack.geometry, plan, frame,
      }));
    }
  }
  const coverage = Object.freeze({ enemies: ENEMY_BODY_AUDIT_CASES.length, modes: ENEMY_BODY_AUDIT_MODES.length, checkpoints: ENEMY_BODY_AUDIT_CHECKPOINTS.length, frames: frames.length });
  const digestInput = { schema: ENEMY_BODY_AUDIT_SCHEMA, coverage, frames };
  return Object.freeze({ ...digestInput, metadataSha256: createHash("sha256").update(JSON.stringify(digestInput)).digest("hex") });
}

export function assertEnemyBodyMotionAuditMetadata(report) {
  const errors = [], expected = ENEMY_BODY_AUDIT_CASES.length * ENEMY_BODY_AUDIT_MODES.length * ENEMY_BODY_AUDIT_CHECKPOINTS.length;
  if (report?.schema !== ENEMY_BODY_AUDIT_SCHEMA) errors.push(`schema must be ${ENEMY_BODY_AUDIT_SCHEMA}`);
  if (report?.frames?.length !== expected) errors.push(`frame matrix must contain ${expected} entries`);
  const keys = new Set((report?.frames || []).map((entry) => `${entry.type}:${entry.mode}:${entry.checkpoint}`));
  if (keys.size !== expected) errors.push("frame matrix contains missing or duplicate coverage");
  for (const entry of report?.frames || []) {
    const attack = ENEMY_BODY_AUDIT_CASES.find(({ type }) => type === entry.type);
    if (!attack) { errors.push(`${entry.type}: unknown enemy`); continue; }
    if (JSON.stringify(entry.authoritativeGeometry) !== JSON.stringify(attack.geometry)) errors.push(`${entry.type}/${entry.mode}/${entry.checkpoint}: authoritative geometry drifted`);
    if (!entry.frame || !Number.isInteger(entry.frame.row)) errors.push(`${entry.type}/${entry.mode}/${entry.checkpoint}: missing actual rig frame`);
    if (entry.mode === "reduced-motion" && [entry.frame.offsetX, entry.frame.offsetY, entry.frame.rotation].some((value) => value !== 0)) errors.push(`${entry.type}/${entry.checkpoint}: reduced motion retained translation or rotation`);
    if (entry.mode === "reduced-motion" && (entry.frame.scaleX !== 1 || entry.frame.scaleY !== 1)) errors.push(`${entry.type}/${entry.checkpoint}: reduced motion retained squash/stretch`);
    if (entry.checkpoint === "contact") {
      if (entry.type === "bomber") {
        if (!entry.terminalPreContact || entry.bodyVisibleAtContact || entry.plan.state !== "attackWindup") errors.push("bomber/contact: must expose terminal live pose without a post-removal body ghost");
      } else if (entry.plan.state !== "attackContact" || entry.tick !== entry.authoritativeContactTick) errors.push(`${entry.type}/contact: authored contact pose missed the authoritative tick`);
    }
  }
  return errors;
}
