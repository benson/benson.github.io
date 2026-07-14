import { createHash } from "node:crypto";
import { LASTLIGHT_THEME, getThemeAnimation } from "./themes/lastlight.js";
import {
  MOTION_DIRECTIONS, motionClipDuration, motionFrame, specialistFacingTarget,
  specialistMotionState, stableDirectionColumn, validateMotionRig,
} from "./motion.js";
import { specialistAtlasRenderPlan } from "./render.js";

export const MOTION_AUDIT_SCHEMA = "lastlight.motion-audit.v1";
export const MOTION_AUDIT_SPECIALISTS = Object.freeze(Object.keys(LASTLIGHT_THEME.animations.specialists));
export const MOTION_AUDIT_MODES = Object.freeze(["normal", "reduced-motion"]);
export const MOTION_AUDIT_REQUESTS = Object.freeze([
  Object.freeze({ id: "idle", runtimeState: "idle", moving: false }),
  Object.freeze({ id: "run", runtimeState: "run", moving: true }),
  Object.freeze({ id: "mobility-dash", runtimeState: "dash", moving: true }),
  Object.freeze({ id: "cast-e", runtimeState: "castE", moving: false }),
  Object.freeze({ id: "cast-r", runtimeState: "castR", moving: false }),
  Object.freeze({ id: "hurt", runtimeState: "hurt", moving: false, hurt: .72 }),
  Object.freeze({ id: "down", runtimeState: "down", moving: false, downed: true }),
  Object.freeze({ id: "revive", runtimeState: "revive", moving: false }),
  Object.freeze({ id: "victory", runtimeState: "victory", moving: false }),
]);

export const MOTION_AUDIT_SETTINGS = Object.freeze({
  viewport: Object.freeze([1440, 2520]),
  previewViewport: Object.freeze([960, 360]),
  dpr: 1,
  quality: "high",
  effectsDensity: 1,
  frameStepMs: 100,
  previewDurationMs: 6000,
  fixedNowMs: 1200,
});

const DIRECTION_ANGLES = Object.freeze({ south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2, east: 0 });
const round = (value) => Number.isFinite(value) ? Number(value.toFixed(6)) : value;
const rounded = (values) => values.map(round);
function entityForRequest(request, angle, overrides = {}) {
  const entity = {
    animState: request.runtimeState === "idle" || request.runtimeState === "run" ? "idle" : request.runtimeState,
    animTime: request.runtimeState === "idle" || request.runtimeState === "run" ? 0 : .3,
    facing: angle,
    aimFacing: angle,
    movementFacing: angle,
    dashFacing: angle,
    moving: request.moving,
    downed: request.downed || false,
    dead: false,
    autoAim: false,
    input: { autoAim: false },
    ...overrides,
  };
  return entity;
}

export function resolveMotionAuditFrame({
  specialist, requestId, direction = "south", mode = "normal", clipTime = null,
  previousColumn = null, entityOverrides = {}, facingPolicy = "direct",
} = {}) {
  const rig = getThemeAnimation(specialist);
  const request = MOTION_AUDIT_REQUESTS.find((entry) => entry.id === requestId);
  if (!rig || !request || !MOTION_DIRECTIONS.includes(direction) || !MOTION_AUDIT_MODES.includes(mode)) return null;
  const angle = DIRECTION_ANGLES[direction];
  const entity = entityForRequest(request, angle, entityOverrides);
  const hurt = request.hurt || 0;
  const requestedState = specialistMotionState(entity, request.moving, hurt);
  const locomotionFacing = specialistFacingTarget(entity, request.moving, angle);
  const aimFacing = Number.isFinite(entity.aimFacing) ? entity.aimFacing : locomotionFacing;
  const usesAimFacing = ["castE", "castR", "cast"].includes(requestedState);
  const drawFacing = usesAimFacing || !request.moving ? aimFacing : locomotionFacing;
  const column = stableDirectionColumn(drawFacing, previousColumn);
  const duration = motionClipDuration(rig, requestedState);
  const selectedTime = clipTime === null ? Math.max(0, duration * .5) : Math.max(0, Number(clipTime) || 0);
  const reducedMotion = mode === "reduced-motion";
  const frame = motionFrame(rig, requestedState, selectedTime, { reducedMotion });
  const atlas = { complete: true, naturalWidth: rig.atlas.expectedSize[0], naturalHeight: rig.atlas.expectedSize[1] };
  const plan = specialistAtlasRenderPlan({
    rig, atlas, frame, direction: column, reducedMotion, hurt,
    now: MOTION_AUDIT_SETTINGS.fixedNowMs, hurtAngle: Math.PI / 5,
    movementForm: { lean: 0, groundOffset: 0 }, dead: entity.dead, downed: entity.downed,
  });
  return Object.freeze({
    specialist,
    requestId: request.id,
    requestedState,
    resolvedState: frame?.state || null,
    requestedDirection: direction,
    resolvedDirection: Number.isInteger(column) ? rig.directions[column] : null,
    resolvedColumn: column,
    resolvedRow: frame?.row ?? null,
    clipTime: round(selectedTime),
    clipDuration: round(duration),
    frameDurationMs: frame?.ms ?? null,
    authoredStatus: frame?.authored ? "authored" : "synthetic",
    mode,
    facingPolicy,
    assetPath: rig.atlas.src,
    assetHash: null,
    anchor: rounded(rig.anchor),
    drawSize: rounded(rig.drawSize),
    socket: { muzzle: { distance: round(rig.sockets.muzzle.distance), vertical: round(rig.sockets.muzzle.vertical) } },
    fallback: Boolean(plan.fallback),
    fallbackReason: plan.fallbackReason,
    renderPlan: plan.fallback ? null : {
      sourceRect: rounded(plan.sourceRect),
      destinationRect: rounded(plan.destinationRect),
      translate: rounded(plan.translate),
      rotation: round(plan.rotation),
      scale: rounded(plan.scale),
      filter: plan.filter,
      alpha: round(plan.alpha),
    },
  });
}

function previewRequestAt(timeMs) {
  if (timeMs < 500) return { requestId: "idle", direction: "south", clipTime: timeMs / 1000, scenario: "idle" };
  if (timeMs < 1000) return { requestId: "run", direction: "east", clipTime: (timeMs - 500) / 1000, scenario: "idle-to-run" };
  if (timeMs < 1400) return {
    requestId: "idle", direction: "east", clipTime: (timeMs - 1000) / 1000, scenario: "manual-cursor-aim",
    entityOverrides: { facing: 0, aimFacing: 0, movementFacing: Math.PI / 2, autoAim: false, input: { autoAim: false } },
  };
  if (timeMs < 1800) return {
    requestId: "run", direction: "east", clipTime: (timeMs - 1400) / 1000, scenario: "movement-opposing-aim-backpedal",
    entityOverrides: { facing: 0, aimFacing: 0, movementFacing: Math.PI, autoAim: false, input: { autoAim: false } },
  };
  if (timeMs < 2200) return {
    requestId: "idle", direction: "north", clipTime: (timeMs - 1800) / 1000, scenario: "nearest-threat-signature-aim",
    entityOverrides: { facing: -Math.PI / 2, aimFacing: -Math.PI / 2, movementFacing: Math.PI / 2, autoAim: true, input: { autoAim: true } },
  };
  if (timeMs < 2500) return { requestId: "mobility-dash", direction: "west", clipTime: (timeMs - 2200) / 1000, scenario: "mobility-dash" };
  if (timeMs < 2900) return { requestId: "cast-e", direction: "north", clipTime: (timeMs - 2500) / 1000, scenario: "run-to-cast-e" };
  if (timeMs < 3300) return { requestId: "run", direction: "west", clipTime: (timeMs - 2900) / 1000, scenario: "cast-to-run" };
  if (timeMs < 3700) return { requestId: "cast-r", direction: "south", clipTime: (timeMs - 3300) / 1000, scenario: "run-to-cast-r" };
  if (timeMs < 4000) return { requestId: "hurt", direction: "east", clipTime: (timeMs - 3700) / 1000, scenario: "hurt" };
  if (timeMs < 4350) return { requestId: "down", direction: "east", clipTime: (timeMs - 4000) / 1000, scenario: "down" };
  if (timeMs < 4750) return { requestId: "revive", direction: "east", clipTime: (timeMs - 4350) / 1000, scenario: "revive" };
  if (timeMs < 5200) return { requestId: "victory", direction: "south", clipTime: (timeMs - 4750) / 1000, scenario: "victory" };
  if (timeMs < 5500) return { requestId: "run", direction: "east", clipTime: (timeMs - 5200) / 1000, scenario: "rapid-west-east-turns" };
  return { requestId: "run", direction: "east", clipTime: (timeMs - 5500) / 1000, scenario: "direction-hysteresis" };
}

function buildPreview(specialist, mode) {
  const frames = [];
  let previousColumn = 3;
  const boundaryJitter = [-.03, .02, -.01, .04, -.04];
  for (let timeMs = 0; timeMs < MOTION_AUDIT_SETTINGS.previewDurationMs; timeMs += MOTION_AUDIT_SETTINGS.frameStepMs) {
    const selected = previewRequestAt(timeMs);
    const overrides = { ...(selected.entityOverrides || {}) };
    let direction = selected.direction;
    if (selected.scenario === "rapid-west-east-turns") {
      direction = Math.floor((timeMs - 5200) / MOTION_AUDIT_SETTINGS.frameStepMs) % 2 ? "east" : "west";
      const angle = DIRECTION_ANGLES[direction];
      overrides.facing = angle; overrides.aimFacing = angle; overrides.movementFacing = angle;
      previousColumn = null;
    }
    if (selected.scenario === "direction-hysteresis") {
      const index = Math.min(boundaryJitter.length - 1, Math.floor((timeMs - 5500) / MOTION_AUDIT_SETTINGS.frameStepMs));
      const angle = Math.PI / 4 + boundaryJitter[index];
      overrides.facing = angle; overrides.aimFacing = angle; overrides.movementFacing = angle;
      direction = "east";
    }
    const frame = resolveMotionAuditFrame({
      specialist, mode, requestId: selected.requestId, direction, clipTime: selected.clipTime,
      previousColumn, entityOverrides: overrides, facingPolicy: selected.scenario,
    });
    previousColumn = frame.resolvedColumn;
    frames.push({ timeMs, scenario: selected.scenario, ...frame });
  }
  return Object.freeze({
    specialist,
    mode,
    frameStepMs: MOTION_AUDIT_SETTINGS.frameStepMs,
    durationMs: MOTION_AUDIT_SETTINGS.previewDurationMs,
    transitions: Object.freeze(["idle-to-run", "run-to-cast-e", "cast-to-run", "run-to-cast-r"]),
    requiredScenarios: Object.freeze(["manual-cursor-aim", "nearest-threat-signature-aim", "movement-opposing-aim-backpedal", "rapid-west-east-turns", "direction-hysteresis"]),
    frames: Object.freeze(frames),
  });
}

export function buildMotionAuditMetadata() {
  const rigErrors = [];
  for (const specialist of MOTION_AUDIT_SPECIALISTS) {
    for (const error of validateMotionRig(getThemeAnimation(specialist), "specialist")) rigErrors.push(`${specialist}: ${error}`);
  }
  const contacts = [], previews = [];
  for (const specialist of MOTION_AUDIT_SPECIALISTS) for (const mode of MOTION_AUDIT_MODES) {
    for (const request of MOTION_AUDIT_REQUESTS) for (const direction of MOTION_DIRECTIONS) {
      contacts.push(resolveMotionAuditFrame({ specialist, mode, requestId: request.id, direction }));
    }
    previews.push(buildPreview(specialist, mode));
  }
  const coverage = Object.freeze({
    specialists: MOTION_AUDIT_SPECIALISTS.length,
    modes: MOTION_AUDIT_MODES.length,
    states: MOTION_AUDIT_REQUESTS.length,
    directions: MOTION_DIRECTIONS.length,
    contactFrames: contacts.length,
    previews: previews.length,
    previewFrames: previews.reduce((sum, preview) => sum + preview.frames.length, 0),
  });
  const digestInput = { schema: MOTION_AUDIT_SCHEMA, settings: MOTION_AUDIT_SETTINGS, coverage, rigErrors, contacts, previews };
  const metadataSha256 = createHash("sha256").update(JSON.stringify(digestInput)).digest("hex");
  return Object.freeze({ ...digestInput, metadataSha256 });
}

export function assertMotionAuditMetadata(report) {
  const errors = [];
  const expectedContacts = MOTION_AUDIT_SPECIALISTS.length * MOTION_AUDIT_MODES.length * MOTION_AUDIT_REQUESTS.length * MOTION_DIRECTIONS.length;
  const expectedPreviews = MOTION_AUDIT_SPECIALISTS.length * MOTION_AUDIT_MODES.length;
  if (report?.schema !== MOTION_AUDIT_SCHEMA) errors.push(`schema must be ${MOTION_AUDIT_SCHEMA}`);
  if (report?.contacts?.length !== expectedContacts) errors.push(`contact matrix must contain ${expectedContacts} frames`);
  if (report?.previews?.length !== expectedPreviews) errors.push(`preview matrix must contain ${expectedPreviews} previews`);
  if (report?.rigErrors?.length) errors.push(...report.rigErrors);
  const contactKeys = new Set((report?.contacts || []).map((entry) => [entry.specialist, entry.mode, entry.requestId, entry.requestedDirection].join(":")));
  if (contactKeys.size !== expectedContacts) errors.push("contact matrix contains missing or duplicate coverage");
  for (const entry of report?.contacts || []) {
    if (entry.fallback) errors.push(`${entry.specialist}/${entry.mode}/${entry.requestId}/${entry.requestedDirection} used ${entry.fallbackReason}`);
    if (!entry.renderPlan || entry.resolvedRow === null || !Number.isInteger(entry.resolvedColumn)) errors.push(`${entry.specialist}/${entry.requestId} has no resolved render plan`);
  }
  for (const preview of report?.previews || []) {
    const scenarios = new Set(preview.frames.map((frame) => frame.scenario));
    for (const scenario of [...preview.transitions, ...preview.requiredScenarios]) if (!scenarios.has(scenario)) errors.push(`${preview.specialist}/${preview.mode} is missing ${scenario}`);
    if (preview.frames.some((frame) => frame.fallback)) errors.push(`${preview.specialist}/${preview.mode} preview used fallback art`);
  }
  return errors;
}
