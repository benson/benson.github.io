export const COMBAT_ORIENTATION_SCHEMA = 1;
export const AUTO_AIM_SWITCH_RATIO = .82;
export const COMBAT_FACING_HOLD_TICKS = Object.freeze({ signature: 24, ability: 32 });

const BODY_DRIVING_SOURCES = new Set(["signature", "ability:e", "ability:r"]);

export function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function isBodyDrivingSource(sourceId) {
  return BODY_DRIVING_SOURCES.has(String(sourceId || ""));
}

export function selectStickyAutoAimTarget(origin, enemies, currentId = "", { limit = Infinity, switchRatio = AUTO_AIM_SWITCH_RATIO } = {}) {
  const maxDistanceSquared = Number.isFinite(limit) ? Math.max(0, limit) ** 2 : Infinity;
  const candidates = (enemies || []).filter((enemy) => {
    if (!enemy || enemy.dead) return false;
    const distanceSquared = (Number(enemy.x) - Number(origin.x)) ** 2 + (Number(enemy.y) - Number(origin.y)) ** 2;
    return Number.isFinite(distanceSquared) && distanceSquared <= maxDistanceSquared;
  }).map((enemy) => ({ enemy, distanceSquared: (enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2 }))
    .sort((left, right) => left.distanceSquared - right.distanceSquared || String(left.enemy.id).localeCompare(String(right.enemy.id)));
  if (!candidates.length) return null;
  const current = candidates.find(({ enemy }) => enemy.id === currentId), challenger = candidates[0];
  if (!current || challenger.enemy.id === current.enemy.id) return challenger.enemy;
  return challenger.distanceSquared < current.distanceSquared * switchRatio ** 2 ? challenger.enemy : current.enemy;
}

export function commitCombatFacing(player, angle, tick, { sourceId = "signature", targetId = "", holdTicks } = {}) {
  if (!player || !Number.isFinite(Number(angle)) || !isBodyDrivingSource(sourceId)) return false;
  const duration = Number.isFinite(Number(holdTicks)) ? Math.max(1, Math.round(Number(holdTicks)))
    : sourceId === "signature" ? COMBAT_FACING_HOLD_TICKS.signature : COMBAT_FACING_HOLD_TICKS.ability;
  player.combatFacing = Number(angle);
  player.combatFacingTick = Math.max(0, Math.floor(Number(tick) || 0));
  player.combatFacingUntilTick = player.combatFacingTick + duration;
  player.combatSourceId = sourceId;
  player.combatTargetId = String(targetId || player.autoAimTargetId || "");
  return true;
}

export function resolvedCombatFacing(player, tick = Infinity) {
  if (!player) return 0;
  if (player.animState === "dash" && Number(player.animTime) > 0 && Number.isFinite(player.dashFacing)) return player.dashFacing;
  if (Number.isFinite(player.combatFacing) && Number(player.combatFacingUntilTick) >= Number(tick)) return player.combatFacing;
  if (player.autoAim && (player.autoAimTargetId || player.autoAimTracking) && Number.isFinite(player.autoAimFacing)) return player.autoAimFacing;
  if (player.autoAim) return player.moving && Number.isFinite(player.movementFacing) ? player.movementFacing : Number(player.facing) || 0;
  if (Number.isFinite(player.input?.aim)) return player.input.aim;
  if (Number.isFinite(player.aimFacing)) return player.aimFacing;
  return Number(player.facing) || 0;
}

export function combatTurnPlan({ from = 0, to = 0, recoil = 0, reducedMotion = false } = {}) {
  const delta = angleDelta(Number(from) || 0, Number(to) || 0);
  if (reducedMotion) return Object.freeze({ delta, rotation: 0, shear: 0, anticipation: 0 });
  const anticipation = Math.min(1, Math.abs(delta) / (Math.PI * .72));
  return Object.freeze({ delta, rotation: Math.max(-.055, Math.min(.055, delta * .075)) - Math.max(0, Number(recoil) || 0) * .018, shear: Math.max(-.045, Math.min(.045, -delta * .055)), anticipation });
}

export function specialistMuzzleSocket(specialist) {
  return Object.freeze({ distance: specialist === "sola" || specialist === "bront" ? 53 : 58, vertical: -8 });
}

export function specialistMuzzlePoint(entity, angle, specialist = entity?.specialist) {
  const socket = specialistMuzzleSocket(specialist), forwardX = Math.cos(angle), forwardY = Math.sin(angle);
  return Object.freeze({ x: Number(entity?.x || 0) + forwardX * socket.distance + -forwardY * socket.vertical, y: Number(entity?.y || 0) + forwardY * socket.distance + forwardX * socket.vertical });
}
