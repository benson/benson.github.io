import { circleIntersectsCollider, normalizeCollider } from "./collision-geometry.js?v=20260718.8";

export const DOWNED_ACTIVITY_SCHEMA = "lastlight.downed-activity.v1";
export const DOWNED_ACTIVITY_STATE_SCHEMA = "lastlight.downed-activity-state.v1";

const MAX_SLOT = 3;
const ACTIONS = Object.freeze(["move", "ping", "support", "camera", "weapon", "abilityE", "ultimateR", "dash", "pickup", "objective", "relay", "selfRevive"]);
const IMPACT_KINDS = Object.freeze(["contact", "projectile", "hazard", "displacement"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const DOWNED_ACTIVITY_REGISTRY = deepFreeze({
  schema: DOWNED_ACTIVITY_SCHEMA,
  tickRate: 60,
  caps: { slots: 4, obstacles: 256, supportTargets: 3, stepTicks: 3 },
  crawl: {
    maxSpeed: 58, acceleration: 9, braking: 13, startImpulse: 0.28, turnImpulse: 0.18,
    settleSpeed: 1, collisionStep: 12, radius: 31, boundaryPadding: 40,
  },
  bleedout: { durationTicks: 600, hazardPenaltyTicks: 30, contactPenaltyTicks: 0, projectilePenaltyTicks: 0 },
  support: { cooldownTicks: 180, radius: 240, shieldAmount: 0.25, shieldCap: 0.5, damage: 0, healing: 0 },
  permissions: {
    enabled: { move: true, ping: true, support: true, camera: true, weapon: false, abilityE: false, ultimateR: false, dash: false, pickup: false, objective: false, relay: false, selfRevive: false },
    disabled: { move: false, ping: true, support: false, camera: true, weapon: false, abilityE: false, ultimateR: false, dash: false, pickup: false, objective: false, relay: false, selfRevive: false },
  },
  impacts: { contact: "ignore", projectile: "ignore", hazard: "bleedout-only", displacement: "bounded-position-only" },
  participation: { supportShielding: true, selfRevive: false, reviveWork: false, objective: false, pickup: false, relay: false },
  actions: ACTIONS,
  impactKinds: IMPACT_KINDS,
});

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} has unexpected fields`);
}
function integer(value, min, max, path) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${path} is invalid`); return value; }
function finite(value, min, max, path) { if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`${path} is invalid`); return value; }
function slot(value, path = "slot") { return integer(value, 0, MAX_SLOT, path); }
function clone(value) { return structuredClone(value); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function validateDownedActivityRegistry(value = DOWNED_ACTIVITY_REGISTRY) {
  exactKeys(value, ["schema", "tickRate", "caps", "crawl", "bleedout", "support", "permissions", "impacts", "participation", "actions", "impactKinds"], "registry");
  if (value.schema !== DOWNED_ACTIVITY_SCHEMA || !same(value, DOWNED_ACTIVITY_REGISTRY)) throw new TypeError("Downed activity registry contract mismatch");
  return value;
}

export function createDownedActivityState({ enabled = true } = {}) {
  return validateDownedActivityState({ schema: DOWNED_ACTIVITY_STATE_SCHEMA, registryVersion: DOWNED_ACTIVITY_SCHEMA, enabled: Boolean(enabled), sequence: 0, entries: [] });
}

export function validateDownedActivityState(value) {
  exactKeys(value, ["schema", "registryVersion", "enabled", "sequence", "entries"], "state");
  if (value.schema !== DOWNED_ACTIVITY_STATE_SCHEMA || value.registryVersion !== DOWNED_ACTIVITY_SCHEMA || typeof value.enabled !== "boolean") throw new TypeError("Invalid downed activity state header");
  integer(value.sequence, 0, Number.MAX_SAFE_INTEGER, "state.sequence");
  if (!Array.isArray(value.entries) || value.entries.length > 4) throw new TypeError("state.entries exceeds bounds");
  let previous = -1;
  for (const [index, entry] of value.entries.entries()) {
    const path = `state.entries.${index}`;
    exactKeys(entry, ["slot", "beganTick", "bleedoutTicksRemaining", "x", "y", "vx", "vy", "facing", "supportReadyTick", "supportSequence"], path);
    slot(entry.slot, `${path}.slot`); if (entry.slot <= previous) throw new TypeError("state.entries must be canonical"); previous = entry.slot;
    integer(entry.beganTick, 0, Number.MAX_SAFE_INTEGER, `${path}.beganTick`);
    integer(entry.bleedoutTicksRemaining, 0, DOWNED_ACTIVITY_REGISTRY.bleedout.durationTicks, `${path}.bleedoutTicksRemaining`);
    for (const key of ["x", "y", "vx", "vy", "facing"]) finite(entry[key], -1_000_000, 1_000_000, `${path}.${key}`);
    integer(entry.supportReadyTick, 0, Number.MAX_SAFE_INTEGER, `${path}.supportReadyTick`);
    integer(entry.supportSequence, 0, Number.MAX_SAFE_INTEGER, `${path}.supportSequence`);
  }
  return value;
}

export function downedInputPermissions(enabled = true) {
  return DOWNED_ACTIVITY_REGISTRY.permissions[enabled ? "enabled" : "disabled"];
}

export function permitsDownedInput(action, enabled = true) {
  if (!ACTIONS.includes(action)) throw new TypeError("Unknown downed input action");
  return downedInputPermissions(enabled)[action];
}

export function beginDownedActivity(state, { slot: replaySlot, tick, x, y, livingSquadmates }) {
  validateDownedActivityState(state); slot(replaySlot); integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick"); finite(x, -1_000_000, 1_000_000, "x"); finite(y, -1_000_000, 1_000_000, "y"); integer(livingSquadmates, 0, 3, "livingSquadmates");
  if (!state.enabled) return { state, entered: false, immediateDefeat: livingSquadmates === 0, reason: "disabled" };
  if (livingSquadmates === 0) return { state, entered: false, immediateDefeat: true, reason: "solo-or-last-living" };
  if (state.entries.some((entry) => entry.slot === replaySlot)) return { state, entered: false, immediateDefeat: false, reason: "already-downed" };
  if (state.entries.length >= 4) throw new RangeError("Downed activity slot cap reached");
  const next = clone(state); next.entries.push({
    slot: replaySlot, beganTick: tick, bleedoutTicksRemaining: DOWNED_ACTIVITY_REGISTRY.bleedout.durationTicks,
    x, y, vx: 0, vy: 0, facing: 0, supportReadyTick: tick, supportSequence: 0,
  });
  next.entries.sort((a, b) => a.slot - b.slot); next.sequence++;
  return { state: validateDownedActivityState(next), entered: true, immediateDefeat: false, reason: "entered" };
}

export function removeDownedActivity(state, replaySlot) {
  validateDownedActivityState(state); slot(replaySlot); if (!state.entries.some((entry) => entry.slot === replaySlot)) return state;
  const next = clone(state); next.entries = next.entries.filter((entry) => entry.slot !== replaySlot); next.sequence++; return validateDownedActivityState(next);
}

function normalizedInput(x, y) {
  x = Number(x) || 0; y = Number(y) || 0; const length = Math.hypot(x, y);
  if (length < .001) return { x: 0, y: 0, active: false };
  if (length > 1) { x /= length; y /= length; }
  return { x, y, active: true };
}
function integrate(current, target, rate, seconds) {
  const decay = Math.exp(-rate * seconds);
  return { velocity: target + (current - target) * decay, distance: target * seconds + (current - target) * (1 - decay) / rate };
}
function collides(x, y, radius, obstacles) {
  for (const obstacle of obstacles) if (circleIntersectsCollider(x, y, radius, obstacle)) return true;
  return false;
}
function validateObstacles(obstacles) {
  if (!Array.isArray(obstacles) || obstacles.length > 256) throw new TypeError("obstacles exceed bounds");
  for (const [index, obstacle] of obstacles.entries()) {
    let collider;
    try { collider = normalizeCollider(obstacle, `downed-cover-${index}`); }
    catch { throw new TypeError(`obstacle ${index} is invalid`); }
    collider.bounds.forEach((value, field) => finite(value, -10_000, 10_000, `obstacle ${index}.${field}`));
    if (collider.bounds[2] < 0 || collider.bounds[3] < 0) throw new TypeError(`obstacle ${index} has invalid size`);
    if (collider.mask) {
      finite(collider.mask.width, 1, 10_000, `obstacle ${index}.mask.width`);
      finite(collider.mask.height, 1, 10_000, `obstacle ${index}.mask.height`);
      if (!Array.isArray(collider.mask.rows) || collider.mask.rows.length !== collider.mask.height) {
        throw new TypeError(`obstacle ${index} has invalid alpha-mask rows`);
      }
      continue;
    }
    for (const part of collider.parts) for (const [pointIndex, point] of part.points.entries()) {
      if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`obstacle ${index} point ${pointIndex} is invalid`);
      point.forEach((value, field) => finite(value, -10_000, 10_000, `obstacle ${index}.${pointIndex}.${field}`));
    }
  }
}

export function advanceDownedCrawl(state, { slot: replaySlot, tick, inputX = 0, inputY = 0, stepTicks = 1, obstacles = [], worldHalfWidth = 1800, worldHalfHeight = 1200 }) {
  validateDownedActivityState(state); slot(replaySlot); integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick"); integer(stepTicks, 1, 3, "stepTicks"); validateObstacles(obstacles); finite(worldHalfWidth, 100, 10_000, "worldHalfWidth"); finite(worldHalfHeight, 100, 10_000, "worldHalfHeight");
  const current = state.entries.find((entry) => entry.slot === replaySlot);
  if (!state.enabled || !current) return { state, dx: 0, dy: 0, distance: 0, blockedX: false, blockedY: false };
  if (tick < current.beganTick) throw new TypeError("crawl tick precedes downed state");
  const next = clone(state), entry = next.entries.find((item) => item.slot === replaySlot), tuning = DOWNED_ACTIVITY_REGISTRY.crawl;
  const input = normalizedInput(inputX, inputY), seconds = stepTicks / DOWNED_ACTIVITY_REGISTRY.tickRate;
  const previousSpeed = Math.hypot(entry.vx, entry.vy), previousActive = previousSpeed > tuning.settleSpeed;
  const targetX = input.x * tuning.maxSpeed, targetY = input.y * tuning.maxSpeed;
  const dot = input.active && previousActive ? (input.x * entry.vx + input.y * entry.vy) / Math.max(Number.EPSILON, previousSpeed) : 1;
  const impulse = !previousActive && input.active ? tuning.startImpulse : input.active && dot < .7 ? tuning.turnImpulse : 0;
  if (impulse) { entry.vx += (targetX - entry.vx) * impulse; entry.vy += (targetY - entry.vy) * impulse; }
  const rate = input.active ? tuning.acceleration : tuning.braking, integratedX = integrate(entry.vx, targetX, rate, seconds), integratedY = integrate(entry.vy, targetY, rate, seconds);
  const beforeX = entry.x, beforeY = entry.y, steps = Math.max(1, Math.ceil(Math.hypot(integratedX.distance, integratedY.distance) / tuning.collisionStep)); let blockedX = false, blockedY = false;
  for (let index = 0; index < steps; index++) {
    const x = clamp(entry.x + integratedX.distance / steps, -worldHalfWidth + tuning.boundaryPadding, worldHalfWidth - tuning.boundaryPadding);
    if (collides(x, entry.y, tuning.radius, obstacles)) blockedX = true; else entry.x = x;
    const y = clamp(entry.y + integratedY.distance / steps, -worldHalfHeight + tuning.boundaryPadding, worldHalfHeight - tuning.boundaryPadding);
    if (collides(entry.x, y, tuning.radius, obstacles)) blockedY = true; else entry.y = y;
  }
  entry.vx = blockedX ? 0 : Math.abs(integratedX.velocity) < tuning.settleSpeed && !input.active ? 0 : integratedX.velocity;
  entry.vy = blockedY ? 0 : Math.abs(integratedY.velocity) < tuning.settleSpeed && !input.active ? 0 : integratedY.velocity;
  if (Math.hypot(entry.x - beforeX, entry.y - beforeY) > 1e-9) entry.facing = Math.atan2(entry.y - beforeY, entry.x - beforeX);
  next.sequence++;
  return { state: validateDownedActivityState(next), dx: entry.x - beforeX, dy: entry.y - beforeY, distance: Math.hypot(entry.x - beforeX, entry.y - beforeY), blockedX, blockedY };
}

export function downedImpactPenalty(kind) {
  if (!IMPACT_KINDS.includes(kind)) throw new TypeError("Unknown downed impact kind");
  if (kind === "hazard") return DOWNED_ACTIVITY_REGISTRY.bleedout.hazardPenaltyTicks;
  return 0;
}

export function advanceDownedBleedout(state, { slot: replaySlot, ticks = 1, impactKind = null }) {
  validateDownedActivityState(state); slot(replaySlot); integer(ticks, 0, 600, "ticks"); if (impactKind !== null && !IMPACT_KINDS.includes(impactKind)) throw new TypeError("Unknown downed impact kind");
  const current = state.entries.find((entry) => entry.slot === replaySlot);
  if (!state.enabled || !current) return { state, expired: false, consumedTicks: 0 };
  const penalty = impactKind ? downedImpactPenalty(impactKind) : 0, consumedTicks = Math.min(current.bleedoutTicksRemaining, ticks + penalty), next = clone(state), entry = next.entries.find((item) => item.slot === replaySlot);
  entry.bleedoutTicksRemaining -= consumedTicks; next.sequence++;
  return { state: validateDownedActivityState(next), expired: entry.bleedoutTicksRemaining === 0, consumedTicks };
}

function validateAlly(value, index) {
  exactKeys(value, ["slot", "x", "y", "dead", "downed", "shield", "shieldCap"], `allies.${index}`); slot(value.slot, `allies.${index}.slot`);
  finite(value.x, -1_000_000, 1_000_000, `allies.${index}.x`); finite(value.y, -1_000_000, 1_000_000, `allies.${index}.y`);
  finite(value.shield, 0, Number.MAX_SAFE_INTEGER, `allies.${index}.shield`); finite(value.shieldCap, 0, Number.MAX_SAFE_INTEGER, `allies.${index}.shieldCap`);
  if (typeof value.dead !== "boolean" || typeof value.downed !== "boolean") throw new TypeError(`allies.${index} status is invalid`);
}

export function triggerDownedSupport(state, { slot: replaySlot, tick, allies = [] }) {
  validateDownedActivityState(state); slot(replaySlot); integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
  if (!Array.isArray(allies) || allies.length > 4) throw new TypeError("allies exceed bounds"); allies.forEach(validateAlly);
  if (new Set(allies.map((ally) => ally.slot)).size !== allies.length) throw new TypeError("allies must use unique slots");
  const current = state.entries.find((entry) => entry.slot === replaySlot);
  if (!state.enabled || !current) return { state, accepted: false, reason: "unavailable", applications: [], participationHooks: [] };
  if (tick < current.supportReadyTick) return { state, accepted: false, reason: "cooldown", applications: [], participationHooks: [] };
  const tuning = DOWNED_ACTIVITY_REGISTRY.support;
  const applications = allies.filter((ally) => ally.slot !== replaySlot && !ally.dead && !ally.downed && Math.hypot(ally.x - current.x, ally.y - current.y) <= tuning.radius)
    .sort((a, b) => a.slot - b.slot).slice(0, 3).map((ally) => ({ sourceSlot: replaySlot, targetSlot: ally.slot, shield: Math.min(tuning.shieldAmount, Math.max(0, ally.shieldCap - ally.shield)) })).filter((entry) => entry.shield > 0);
  if (!applications.length) return { state, accepted: false, reason: "no-effective-target", applications: [], participationHooks: [] };
  const next = clone(state), entry = next.entries.find((item) => item.slot === replaySlot); entry.supportReadyTick = tick + tuning.cooldownTicks; entry.supportSequence++; next.sequence++;
  return {
    state: validateDownedActivityState(next), accepted: true, reason: "accepted", applications,
    participationHooks: applications.map(({ sourceSlot, targetSlot, shield }) => ({ kind: "effective-shield", sourceSlot, targetSlot, maximumAmount: shield })),
  };
}
