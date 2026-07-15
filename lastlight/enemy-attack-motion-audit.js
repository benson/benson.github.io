import { createHash } from "node:crypto";
import { enemyAttackMotionPlan } from "./enemy-attack-motion.js";

export const ENEMY_ATTACK_AUDIT_SCHEMA = "lastlight.enemy-attack-motion-audit.v1";
export const ENEMY_ATTACK_AUDIT_MODES = Object.freeze([
  Object.freeze({ id: "normal" }),
  Object.freeze({ id: "reduced-motion", reducedMotion: true }),
  Object.freeze({ id: "reduced-flash", reducedFlash: true }),
  Object.freeze({ id: "crowded", crowded: true }),
]);
export const ENEMY_ATTACK_AUDIT_CASES = Object.freeze([
  Object.freeze({ id: "hound-charge", family: "charge", geometry: Object.freeze({ x: 0, y: 0, angle: 0, radius: 54, range: 210, start: 18, halfWidth: 28, endpointX: 210, endpointY: 0 }) }),
  Object.freeze({ id: "brute-slam", family: "slam", geometry: Object.freeze({ x: 0, y: 0, angle: 0, radius: 115, range: 115, start: 0, halfWidth: 0, endpointX: 0, endpointY: 0 }) }),
  Object.freeze({ id: "bomber-volatile-detonation", family: "detonation", geometry: Object.freeze({ x: 0, y: 0, angle: 0, radius: 170, range: 0, start: 0, halfWidth: 0, endpointX: 0, endpointY: 0 }) }),
]);
export const ENEMY_ATTACK_AUDIT_FRAMES = Object.freeze([
  Object.freeze({ id: "windup-10", stage: "windup", progress: .1 }),
  Object.freeze({ id: "windup-50", stage: "windup", progress: .5 }),
  Object.freeze({ id: "windup-90", stage: "windup", progress: .9 }),
  Object.freeze({ id: "contact", stage: "contact", progress: .25 }),
  Object.freeze({ id: "recovery", stage: "recovery", progress: .65 }),
]);

export function buildEnemyAttackMotionAuditMetadata() {
  const frames = [];
  for (const attack of ENEMY_ATTACK_AUDIT_CASES) for (const mode of ENEMY_ATTACK_AUDIT_MODES) for (const frame of ENEMY_ATTACK_AUDIT_FRAMES) {
    frames.push(Object.freeze({
      attackId: attack.id, mode: mode.id, frameId: frame.id,
      plan: enemyAttackMotionPlan({ family: attack.family, stage: frame.stage, progress: frame.progress, geometry: attack.geometry, ...mode }),
    }));
  }
  const coverage = Object.freeze({
    attacks: ENEMY_ATTACK_AUDIT_CASES.length, modes: ENEMY_ATTACK_AUDIT_MODES.length,
    stages: ENEMY_ATTACK_AUDIT_FRAMES.length, frames: frames.length,
  });
  const digestInput = { schema: ENEMY_ATTACK_AUDIT_SCHEMA, coverage, frames };
  const metadataSha256 = createHash("sha256").update(JSON.stringify(digestInput)).digest("hex");
  return Object.freeze({ ...digestInput, metadataSha256 });
}

export function assertEnemyAttackMotionAuditMetadata(report) {
  const errors = [], expected = ENEMY_ATTACK_AUDIT_CASES.length * ENEMY_ATTACK_AUDIT_MODES.length * ENEMY_ATTACK_AUDIT_FRAMES.length;
  if (report?.schema !== ENEMY_ATTACK_AUDIT_SCHEMA) errors.push(`schema must be ${ENEMY_ATTACK_AUDIT_SCHEMA}`);
  if (report?.frames?.length !== expected) errors.push(`frame matrix must contain ${expected} entries`);
  const keys = new Set((report?.frames || []).map((entry) => `${entry.attackId}:${entry.mode}:${entry.frameId}`));
  if (keys.size !== expected) errors.push("frame matrix contains missing or duplicate coverage");
  for (const entry of report?.frames || []) {
    const source = ENEMY_ATTACK_AUDIT_CASES.find(({ id }) => id === entry.attackId);
    if (!source) { errors.push(`${entry.attackId}: unknown attack`); continue; }
    if (JSON.stringify(entry.plan.authoritativeGeometry) !== JSON.stringify(source.geometry)) errors.push(`${entry.attackId}/${entry.mode}/${entry.frameId}: authoritative geometry drifted`);
    if (entry.plan.markCount > 20) errors.push(`${entry.attackId}/${entry.mode}/${entry.frameId}: decorative mark budget exceeded`);
    if (entry.mode === "reduced-motion") {
      if (entry.plan.family === "charge" && entry.plan.accents.travel !== 0) errors.push(`${entry.attackId}/${entry.frameId}: reduced motion retained chevron travel`);
      if (entry.plan.contact.travel !== 0) errors.push(`${entry.attackId}/${entry.frameId}: reduced motion retained contact travel`);
    }
    if (entry.mode === "reduced-flash" && entry.plan.contact.brightCore) errors.push(`${entry.attackId}/${entry.frameId}: reduced flash retained bright contact core`);
  }
  return errors;
}
