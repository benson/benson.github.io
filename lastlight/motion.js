export const MOTION_SCHEMA = "lastlight.motion.v1";
export const MOTION_DIRECTIONS = Object.freeze(["south", "west", "north", "east"]);
export const SPECIALIST_MOTION_STATES = Object.freeze(["idle", "run", "mobility", "cast", "hurt", "down", "revive", "victory"]);
export const ENEMY_MOTION_STATES = Object.freeze(["idle", "locomotion", "attackWindup", "attackContact", "attackRecovery", "hurt", "death"]);

const STATUS = new Set(["ready", "prototype", "missing"]);
const PATH = /^assets\/(?:motion|motion-normalized)\/[a-z0-9/_-]+\.webp$|^assets\/sprites\/[a-z0-9/_-]+\.png$/;
const finiteTuple = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));

export function validateMotionRig(rig, kind) {
  const errors = [], required = kind === "specialist" ? SPECIALIST_MOTION_STATES : ENEMY_MOTION_STATES;
  const label = `${kind} motion rig`;
  if (!rig || typeof rig !== "object" || Array.isArray(rig)) return [`${label} must be an object.`];
  if (!exact(rig, ["schema", "kind", "status", "atlas", "grid", "directions", "anchor", "drawSize", "collisionOffset", "groundY", "shadow", "sockets", "bindings", "states"])) errors.push(`${label} contains missing or unsupported fields.`);
  if (rig.schema !== MOTION_SCHEMA) errors.push(`${label}.schema must be ${MOTION_SCHEMA}.`);
  if (rig.kind !== kind) errors.push(`${label}.kind must be ${kind}.`);
  if (!STATUS.has(rig.status)) errors.push(`${label}.status must be ready, prototype, or missing.`);
  if (!rig.atlas || typeof rig.atlas !== "object" || !PATH.test(rig.atlas.src || "")) errors.push(`${label}.atlas.src must be a deployable motion asset path.`);
  if (!exact(rig.atlas, ["src", "available", "expectedSize"])) errors.push(`${label}.atlas contains missing or unsupported fields.`);
  if (typeof rig.atlas?.available !== "boolean") errors.push(`${label}.atlas.available must be boolean.`);
  if (!finiteTuple(rig.atlas?.expectedSize, 2) || rig.atlas.expectedSize.some((value) => value <= 0 || !Number.isInteger(value))) errors.push(`${label}.atlas.expectedSize must be positive integer pixels.`);
  if (rig.status === "ready" && !rig.atlas?.available) errors.push(`${label} cannot be ready without an available atlas.`);
  if (rig.status === "missing" && rig.atlas?.available) errors.push(`${label} cannot be missing with an available atlas.`);
  if (!exact(rig.grid, ["columns", "rows"])) errors.push(`${label}.grid contains missing or unsupported fields.`);
  if (!Number.isInteger(rig.grid?.columns) || rig.grid.columns !== 4 || !Number.isInteger(rig.grid?.rows) || rig.grid.rows < 1) errors.push(`${label}.grid must define four columns and positive rows.`);
  if (JSON.stringify(rig.directions) !== JSON.stringify(MOTION_DIRECTIONS)) errors.push(`${label}.directions must be south, west, north, east.`);
  for (const [key, value] of [["anchor", rig.anchor], ["collisionOffset", rig.collisionOffset], ["shadow", rig.shadow], ["drawSize", rig.drawSize]]) {
    if (!finiteTuple(value, 2)) errors.push(`${label}.${key} must be a finite pair.`);
  }
  if (finiteTuple(rig.drawSize, 2) && rig.drawSize.some((value) => value <= 0)) errors.push(`${label}.drawSize values must be positive.`);
  if (finiteTuple(rig.shadow, 2) && rig.shadow.some((value) => value <= 0)) errors.push(`${label}.shadow values must be positive.`);
  if (!Number.isFinite(rig.groundY)) errors.push(`${label}.groundY must be finite.`);
  if (kind === "specialist" && (!exact(rig.sockets, ["muzzle"]) || !exact(rig.sockets?.muzzle, ["distance", "vertical"]) || !Number.isFinite(rig.sockets?.muzzle?.distance) || !Number.isFinite(rig.sockets?.muzzle?.vertical))) errors.push(`${label}.sockets.muzzle must be an exact finite contract.`);
  if (kind === "enemy" && (!exact(rig.sockets, ["contact"]) || !exact(rig.sockets?.contact, ["distance", "vertical"]) || !Number.isFinite(rig.sockets?.contact?.distance) || !Number.isFinite(rig.sockets?.contact?.vertical))) errors.push(`${label}.sockets.contact must be an exact finite contract.`);
  if (!exact(rig.states, required)) errors.push(`${label}.states must exactly cover required clips.`);
  if (kind === "specialist" && !exact(rig.bindings, ["dash", "castE", "castR"])) errors.push(`${label}.bindings must exactly map dash, castE, and castR.`);
  if (kind === "enemy" && !exact(rig.bindings, [])) errors.push(`${label}.bindings must be empty.`);
  for (const state of required) {
    const clip = rig.states?.[state];
    if (!clip || !Array.isArray(clip.frames) || !clip.frames.length) { errors.push(`${label}.states.${state} must contain frames.`); continue; }
    if (!exact(clip, ["loop", "authored", "frames"])) errors.push(`${label}.states.${state} contains missing or unsupported fields.`);
    if (typeof clip.loop !== "boolean" || typeof clip.authored !== "boolean") errors.push(`${label}.states.${state} must declare loop and authored.`);
    if (!rig.atlas?.available && clip.authored) errors.push(`${label}.states.${state} cannot be authored without an available atlas.`);
    for (const [index, frame] of clip.frames.entries()) {
      if (!frame || typeof frame !== "object" || Object.keys(frame).some((key) => !["row", "ms", "offsetX", "offsetY", "rotation", "scaleX", "scaleY"].includes(key))) errors.push(`${label}.states.${state}.frames.${index} contains unsupported fields.`);
      if (!Number.isInteger(frame?.row) || frame.row < 0 || frame.row >= (rig.grid?.rows || 0)) errors.push(`${label}.states.${state}.frames.${index}.row is outside the atlas grid.`);
      if (!Number.isInteger(frame?.ms) || frame.ms < 16 || frame.ms > 2_000) errors.push(`${label}.states.${state}.frames.${index}.ms must be 16–2000.`);
      for (const property of ["offsetX", "offsetY", "rotation", "scaleX", "scaleY"]) if (frame[property] !== undefined && !Number.isFinite(frame[property])) errors.push(`${label}.states.${state}.frames.${index}.${property} must be finite.`);
    }
  }
  for (const [source, target] of Object.entries(rig.bindings || {})) if (!required.includes(target) || !source) errors.push(`${label}.bindings.${source} targets an unknown state.`);
  return errors;
}

export function resolveMotionState(rig, requested, fallback = "idle") {
  const resolved = rig?.bindings?.[requested] || requested;
  if (rig?.states?.[resolved]?.frames?.length) return resolved;
  return rig?.states?.[fallback]?.frames?.length ? fallback : null;
}

export function motionClipDuration(rig, requested) {
  const state = resolveMotionState(rig, requested);
  return state ? rig.states[state].frames.reduce((sum, frame) => sum + frame.ms, 0) / 1000 : 0;
}

export function motionFrame(rig, requested, elapsedSeconds, { reducedMotion = false } = {}) {
  const state = resolveMotionState(rig, requested);
  const clip = state && rig.states[state];
  if (!clip) return null;
  const total = clip.frames.reduce((sum, frame) => sum + frame.ms, 0);
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0) * 1000;
  let cursor = clip.loop ? elapsed % total : Math.min(elapsed, Math.max(0, total - 1));
  let selected = clip.frames.at(-1);
  for (const frame of clip.frames) { if (cursor < frame.ms) { selected = frame; break; } cursor -= frame.ms; }
  if (!reducedMotion) return { ...selected, state, authored: clip.authored };
  // Preserve authored poses/timing for anticipation and contact, but remove
  // decorative spatial displacement, squash, and rotation.
  return { row: selected.row, ms: selected.ms, state, authored: clip.authored, offsetX: 0, offsetY: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

export function directionColumn(angle) {
  const x = Math.cos(Number(angle) || 0), y = Math.sin(Number(angle) || 0);
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 1 : 3;
  return y < 0 ? 2 : 0;
}

// The simulation already resolves each specialist's authored facing policy
// (aim, movement/contact, or hybrid) into entity.facing. Rendering from raw
// movementFacing here made aim-facing specialists look away from their target
// whenever they strafed or backpedalled.
export function specialistFacingTarget(entity, moving, inferredMovement = 0) {
  if (entity?.animState === "dash" && Number.isFinite(entity?.dashFacing)) return entity.dashFacing;
  if ((entity?.input?.autoAim ?? entity?.autoAim) && moving && Number.isFinite(entity?.movementFacing)) return entity.movementFacing;
  if (Number.isFinite(entity?.facing)) return entity.facing;
  if (moving && Number.isFinite(entity?.movementFacing)) return entity.movementFacing;
  if (Number.isFinite(entity?.aimFacing)) return entity.aimFacing;
  return Number(inferredMovement) || 0;
}

const DIRECTION_ANGLES = Object.freeze([Math.PI / 2, Math.PI, -Math.PI / 2, 0]);
const angularDistance = (first, second) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));

export function stableDirectionColumn(angle, previousColumn = null, hysteresis = .14) {
  const candidate = directionColumn(angle);
  if (!Number.isInteger(previousColumn) || previousColumn < 0 || previousColumn >= DIRECTION_ANGLES.length || candidate === previousColumn) return candidate;
  const value = Number(angle) || 0;
  const candidateDistance = angularDistance(value, DIRECTION_ANGLES[candidate]);
  const previousDistance = angularDistance(value, DIRECTION_ANGLES[previousColumn]);
  return candidateDistance + Math.max(0, Number(hysteresis) || 0) < previousDistance ? candidate : previousColumn;
}

export function motionAtlasReady(image, rig) {
  if (!rig?.atlas?.available || !image?.complete || !image.naturalWidth || !image.naturalHeight) return false;
  return image.naturalWidth === rig.atlas.expectedSize[0] && image.naturalHeight === rig.atlas.expectedSize[1];
}

export function specialistMotionState(entity, moving, hurtAmount = 0) {
  if (entity?.animState === "victory") return "victory";
  if (entity?.dead || entity?.downed) return "down";
  if (hurtAmount > .03 || entity?.animState === "hurt") return "hurt";
  if ((entity?.animTime || 0) > 0) return entity.animState || "idle";
  return moving ? "run" : "idle";
}

export function enemyMotionState(enemy, moving, nearTarget = false) {
  if (enemy?.dead) return "death";
  if ((enemy?.hitFlash || 0) > .015) return "hurt";
  const behavior = typeof enemy?.behaviorState === "string" ? enemy.behaviorState : enemy?.behaviorState?.id;
  if (behavior === "windup") return "attackWindup";
  if (behavior === "charge") return "attackContact";
  if (behavior === "recovery") return "attackRecovery";
  const flash = Number(enemy?.attackFlash || 0);
  if (flash > .13) return "attackContact";
  if (flash > 0) return "attackRecovery";
  const cooldown = enemy?.boss || enemy?.type === "spitter" ? enemy?.shotCd : enemy?.attackCd;
  if (nearTarget && Number.isFinite(cooldown) && cooldown > 0 && cooldown <= .18) return "attackWindup";
  return moving ? "locomotion" : "idle";
}
