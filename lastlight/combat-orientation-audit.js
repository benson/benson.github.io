import { createHash } from "node:crypto";
import { Simulation } from "./engine.js";
import { angleDelta, commitCombatFacing, specialistMuzzlePoint } from "./combat-orientation.js";

export const COMBAT_ORIENTATION_AUDIT_SCHEMA = "lastlight.combat-orientation-audit.v1";
export const COMBAT_ORIENTATION_SPECIALISTS = Object.freeze(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);

function specialistCase(specialist) {
  const sim = new Simulation({ players: [{ id: "audit", name: "Audit", specialist }] }, { seed: "0123456789abcdef0123456789abcdef" });
  const player = sim.players[0], target = sim.spawnEnemy("mite"), challenger = sim.spawnEnemy("hound");
  Object.assign(player, { x: 0, y: 0 }); Object.assign(target, { x: 250, y: 120 }); Object.assign(challenger, { x: 270, y: 120 });
  sim.setInput(player.id, { x: 0, y: 1, aim: -2.4, autoAim: true }); sim.refreshAutoAim(player);
  challenger.x = 240; sim.refreshAutoAim(player);
  const stickyTargetId = player.autoAimTargetId, expectedStickyTargetId = target.id;
  challenger.x = 195; challenger.y = 80; sim.refreshAutoAim(player);
  const switchedTargetId = player.autoAimTargetId, expectedSwitchedTargetId = challenger.id;
  if (specialist === "gale") player.flow = 100;
  const fired = sim.fireSignature(player), expectedFacing = Math.atan2(challenger.y, challenger.x);
  const muzzle = specialistMuzzlePoint(player, player.combatFacing, specialist);
  const projectileOrigins = sim.projectiles.some(({ owner }) => owner === player.id) ? [`${muzzle.x.toFixed(3)},${muzzle.y.toFixed(3)}`] : [];
  const committed = player.combatFacing;
  commitCombatFacing(player, committed, sim.tick, { sourceId: "signature" }); sim.shoot(player, committed + 1, 500, 10, { sourceId: "uwu" }); sim.updatePlayers(1 / 60);
  return Object.freeze({ specialist, fired, pointerFacing: -2.4, autoFacing: expectedFacing, committedFacing: committed, facingError: Math.abs(angleDelta(committed, expectedFacing)), bodyFacing: player.facing, bodyFacingError: Math.abs(angleDelta(player.facing, Math.PI / 2)), stickyTargetId, expectedStickyTargetId, switchedTargetId, expectedSwitchedTargetId, movementMode: player.movementMode, bodyNeutralPreserved: player.combatFacing === committed, muzzle, projectileOrigins, combatSourceId: player.combatSourceId });
}

export function buildCombatOrientationAudit() {
  const cases = COMBAT_ORIENTATION_SPECIALISTS.map(specialistCase), coverage = Object.freeze({ specialists: cases.length, checksPerSpecialist: 8, checks: cases.length * 8 });
  const digestInput = { schema: COMBAT_ORIENTATION_AUDIT_SCHEMA, coverage, cases };
  return Object.freeze({ ...digestInput, metadataSha256: createHash("sha256").update(JSON.stringify(digestInput)).digest("hex") });
}

export function assertCombatOrientationAudit(report) {
  const errors = [];
  if (report?.schema !== COMBAT_ORIENTATION_AUDIT_SCHEMA) errors.push(`schema must be ${COMBAT_ORIENTATION_AUDIT_SCHEMA}`);
  if (report?.cases?.length !== COMBAT_ORIENTATION_SPECIALISTS.length) errors.push("all nine specialists must be present");
  for (const entry of report?.cases || []) {
    if (!entry.fired) errors.push(`${entry.specialist}: signature did not fire`);
    if (entry.facingError > 1e-8) errors.push(`${entry.specialist}: signature missed authoritative auto-aim`);
    if (entry.bodyFacingError > 1e-8) errors.push(`${entry.specialist}: body did not follow auto-aim movement`);
    if (entry.stickyTargetId !== entry.expectedStickyTargetId) errors.push(`${entry.specialist}: target switched without hysteresis`);
    if (entry.switchedTargetId !== entry.expectedSwitchedTargetId) errors.push(`${entry.specialist}: target did not switch for a meaningful challenger`);
    if (!String(entry.movementMode).startsWith("strafe")) errors.push(`${entry.specialist}: established target-relative movement tuning changed`);
    if (!entry.bodyNeutralPreserved) errors.push(`${entry.specialist}: autonomous fire stole body ownership`);
    if (entry.combatSourceId !== "signature") errors.push(`${entry.specialist}: signature source ownership missing`);
    if (entry.projectileOrigins.length > 1) errors.push(`${entry.specialist}: fan projectiles did not share the authored muzzle`);
  }
  return errors;
}
