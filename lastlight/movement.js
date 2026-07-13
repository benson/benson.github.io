import { BALANCE_CONFIG } from "./balance-config.js?v=20260712.11";

const EPSILON = 1e-6;
const DEFAULT_MOVEMENT_POLICIES = Object.freeze(Object.fromEntries(
  Object.entries(BALANCE_CONFIG.movement.specialists).map(([id, policy]) => [id, Object.freeze({ ...policy, ...BALANCE_CONFIG.movement.profiles[policy.profile] })]),
));

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function movementPolicy(specialist, balance = BALANCE_CONFIG) {
  if (balance === BALANCE_CONFIG) return DEFAULT_MOVEMENT_POLICIES[specialist] || DEFAULT_MOVEMENT_POLICIES.zuri;
  const policy = balance.movement.specialists[specialist] || balance.movement.specialists.zuri;
  return { ...policy, ...balance.movement.profiles[policy.profile] };
}

export function normalizeMovementInput(input) {
  let x = Number(input?.x) || 0, y = Number(input?.y) || 0;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  if (length < .001) return { x: 0, y: 0, active: false };
  return { x, y, active: true };
}

export function classifyMovement(inputX, inputY, aimFacing) {
  const length = Math.hypot(inputX, inputY);
  if (length < .001) return "idle";
  inputX /= length; inputY /= length;
  const aimX = Math.cos(aimFacing), aimY = Math.sin(aimFacing);
  const dot = inputX * aimX + inputY * aimY;
  if (dot < -.35) return "backpedal";
  if (dot < .55) return inputX * aimY - inputY * aimX > 0 ? "strafe-left" : "strafe-right";
  return "forward";
}

export function facingForPolicy(policy, movementMode, movementFacing, aimFacing, moving) {
  if (policy === "aim") return aimFacing;
  if (policy === "contact") return moving ? movementFacing : aimFacing;
  return movementMode === "forward" && moving ? movementFacing : aimFacing;
}

function directionalSpeed(profile, movementMode) {
  if (movementMode === "backpedal") return profile.backpedalSpeed;
  if (movementMode.startsWith("strafe")) return profile.strafeSpeed;
  return 1;
}

function integrateAxis(current, target, rate, dt) {
  if (rate <= EPSILON) return { velocity: target, distance: target * dt };
  const decay = Math.exp(-rate * dt);
  return {
    velocity: target + (current - target) * decay,
    distance: target * dt + (current - target) * (1 - decay) / rate,
  };
}

export function ensureMovementState(player) {
  if (!Number.isFinite(player.moveVx)) player.moveVx = 0;
  if (!Number.isFinite(player.moveVy)) player.moveVy = 0;
  if (!Number.isFinite(player.moveInputX)) player.moveInputX = 0;
  if (!Number.isFinite(player.moveInputY)) player.moveInputY = 0;
  if (!Number.isFinite(player.movementFacing)) player.movementFacing = Number(player.facing) || 0;
  if (!Number.isFinite(player.dashRecovery)) player.dashRecovery = 0;
  if (!player.movementMode) player.movementMode = "idle";
  if (!Number.isFinite(player.moveSpeedRatio)) player.moveSpeedRatio = 0;
  return player;
}

export function resetPlayerMovement(player) {
  ensureMovementState(player);
  player.moveVx = 0; player.moveVy = 0;
  player.moveInputX = 0; player.moveInputY = 0;
  player.moveSpeedRatio = 0; player.movementMode = "idle";
  player.dashRecovery = 0; player.moving = false;
  return player;
}

// Shared by the authoritative simulation, host remainder preview, and guest
// prediction. The closed-form response keeps constant-input movement stable at
// 60/120/144 Hz while retaining a visible start, turn, brake, and settle shape.
export function advancePlayerMovement(player, input, frameSeconds, speed, move, balance = BALANCE_CONFIG) {
  ensureMovementState(player);
  const dt = clamp(Number(frameSeconds) || 0, 0, .05);
  const profile = movementPolicy(player.specialist, balance);
  const normalized = normalizeMovementInput(input);
  const aimFacing = Number.isFinite(input?.aim) ? input.aim : Number(player.aimFacing) || 0;
  const mode = classifyMovement(normalized.x, normalized.y, aimFacing);
  const multiplier = directionalSpeed(profile, mode);
  const targetX = normalized.x * speed * multiplier, targetY = normalized.y * speed * multiplier;
  const previousLength = Math.hypot(player.moveInputX, player.moveInputY);
  const currentLength = Math.hypot(normalized.x, normalized.y);
  const previousActive = previousLength > .001;
  const inputDot = currentLength > .001 && previousActive
    ? (normalized.x * player.moveInputX + normalized.y * player.moveInputY) / (currentLength * previousLength)
    : 1;
  const changedDirection = normalized.active && previousActive && inputDot < .88;
  const recoveryRatio = profile.dashRecovery > 0 ? clamp(player.dashRecovery / profile.dashRecovery, 0, 1) : 0;
  const control = 1 - recoveryRatio * (1 - profile.dashControl);
  const impulse = !previousActive && normalized.active ? profile.startImpulse : changedDirection ? profile.turnImpulse : 0;
  if (impulse > 0) {
    const amount = impulse * control;
    player.moveVx += (targetX - player.moveVx) * amount;
    player.moveVy += (targetY - player.moveVy) * amount;
  }
  const rate = (normalized.active ? profile.acceleration : profile.braking) * control;
  const x = integrateAxis(player.moveVx, targetX, rate, dt);
  const y = integrateAxis(player.moveVy, targetY, rate, dt);
  const beforeX = Number(player.x) || 0, beforeY = Number(player.y) || 0;
  move(player, x.distance, y.distance);
  const actualX = player.x - beforeX, actualY = player.y - beforeY;
  if (Math.abs(actualX - x.distance) > .01) x.velocity = 0;
  if (Math.abs(actualY - y.distance) > .01) y.velocity = 0;
  player.moveVx = Math.abs(x.velocity) < profile.settleSpeed && !normalized.active ? 0 : x.velocity;
  player.moveVy = Math.abs(y.velocity) < profile.settleSpeed && !normalized.active ? 0 : y.velocity;
  player.moveInputX = normalized.x; player.moveInputY = normalized.y;
  player.aimFacing = aimFacing;
  const actualSpeed = Math.hypot(actualX, actualY) / Math.max(dt, EPSILON);
  player.moving = actualSpeed > profile.settleSpeed * .35;
  if (player.moving) player.movementFacing = Math.atan2(actualY, actualX);
  player.movementMode = player.moving ? mode : "idle";
  player.moveSpeedRatio = clamp(actualSpeed / Math.max(1, speed), 0, 1.3);
  player.facing = facingForPolicy(profile.facing, player.movementMode, player.movementFacing, aimFacing, player.moving);
  player.dashRecovery = Math.max(0, player.dashRecovery - dt);
  return { dx: actualX, dy: actualY, distance: Math.hypot(actualX, actualY), profile };
}

export function beginDashRecovery(player, balance = BALANCE_CONFIG) {
  const profile = movementPolicy(player.specialist, balance);
  player.dashRecovery = profile.dashRecovery;
  return player.dashRecovery;
}

export function movementVisualState(player, reducedMotion = false, balance = BALANCE_CONFIG) {
  const profile = movementPolicy(player.specialist, balance);
  if (reducedMotion) return { lean: 0, groundOffset: 0, shadowX: 1, shadowY: 1, recovery: 0 };
  const facing = Number(player.facing) || 0;
  const lateral = (-Math.sin(facing) * (Number(player.moveVx) || 0) + Math.cos(facing) * (Number(player.moveVy) || 0)) / Math.max(1, Number(player.baseSpeed) || 1);
  const recovery = clamp((Number(player.dashRecovery) || 0) / profile.dashRecovery, 0, 1);
  const speed = clamp(Number(player.moveSpeedRatio) || 0, 0, 1);
  return {
    lean: clamp(lateral, -1, 1) * profile.leanDegrees * Math.PI / 180,
    groundOffset: recovery * 2,
    shadowX: 1 + speed * .07 + recovery * .08,
    shadowY: 1 - speed * .08 - recovery * .08,
    recovery,
  };
}
