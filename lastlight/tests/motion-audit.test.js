import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOTION_DIRECTIONS } from "../motion.js";
import {
  MOTION_AUDIT_MODES, MOTION_AUDIT_REQUESTS, MOTION_AUDIT_SPECIALISTS,
  assertMotionAuditMetadata, buildMotionAuditMetadata, resolveMotionAuditFrame,
} from "../motion-audit.js";

const renderSource = readFileSync(new URL("../render.js", import.meta.url), "utf8");

test("runtime motion audit covers every specialist, state, direction, and presentation mode", () => {
  const report = buildMotionAuditMetadata();
  assert.deepEqual(assertMotionAuditMetadata(report), []);
  assert.deepEqual(report.coverage, {
    specialists: 9, modes: 2, states: 9, directions: 4,
    contactFrames: 648, previews: 18, previewFrames: 1080,
  });
  const keys = new Set(report.contacts.map((entry) => [entry.specialist, entry.mode, entry.requestId, entry.requestedDirection].join(":")));
  for (const specialist of MOTION_AUDIT_SPECIALISTS) for (const mode of MOTION_AUDIT_MODES) {
    for (const request of MOTION_AUDIT_REQUESTS) for (const direction of MOTION_DIRECTIONS) {
      assert.ok(keys.has(`${specialist}:${mode}:${request.id}:${direction}`));
    }
  }
});

test("audit labels carry the complete runtime selection and fallback contract", () => {
  const report = buildMotionAuditMetadata();
  for (const entry of report.contacts) {
    assert.ok(entry.specialist && entry.requestedState && entry.resolvedState);
    assert.ok(entry.requestedDirection && entry.resolvedDirection);
    assert.ok(Number.isInteger(entry.resolvedColumn) && Number.isInteger(entry.resolvedRow));
    assert.ok(Number.isFinite(entry.clipTime) && Number.isFinite(entry.clipDuration));
    assert.match(entry.authoredStatus, /^(authored|synthetic)$/);
    assert.match(entry.assetPath, /^assets\//);
    assert.deepEqual(entry.anchor.length, 2);
    assert.deepEqual(entry.drawSize.length, 2);
    assert.ok(Number.isFinite(entry.socket.muzzle.distance));
    assert.equal(entry.fallback, false);
    assert.ok(entry.renderPlan.sourceRect.every(Number.isFinite));
  }
});

test("preview evidence includes aiming, backpedal, hysteresis, and authored transitions", () => {
  const report = buildMotionAuditMetadata();
  for (const preview of report.previews) {
    const scenarios = new Set(preview.frames.map((frame) => frame.scenario));
    for (const required of [
      "manual-cursor-aim", "nearest-threat-signature-aim", "movement-opposing-aim-backpedal",
      "rapid-west-east-turns", "direction-hysteresis", "idle-to-run", "run-to-cast-e", "cast-to-run", "run-to-cast-r",
    ]) assert.ok(scenarios.has(required), `${preview.specialist}/${preview.mode} includes ${required}`);
    const rapidTurns = preview.frames.filter((frame) => frame.scenario === "rapid-west-east-turns");
    assert.deepEqual(rapidTurns.map((frame) => frame.resolvedDirection), ["west", "east", "west"]);
    const signatureAim = preview.frames.filter((frame) => frame.scenario === "nearest-threat-signature-aim");
    assert.ok(signatureAim.length >= 4);
    assert.ok(signatureAim.every((frame) => frame.requestedState === "run" && frame.resolvedDirection === "north"), "moving auto-aim keeps the authoritative target-facing column");
    const hysteresis = preview.frames.filter((frame) => frame.scenario === "direction-hysteresis");
    assert.ok(hysteresis.length >= 4);
    assert.equal(new Set(hysteresis.map((frame) => frame.resolvedColumn)).size, 1, "boundary jitter does not flicker atlas columns");
  }
});

test("reduced-motion audit preserves selected cells and removes runtime decorative transforms", () => {
  const normal = resolveMotionAuditFrame({ specialist: "vesper", requestId: "mobility-dash", direction: "west", mode: "normal", clipTime: 0 });
  const reduced = resolveMotionAuditFrame({ specialist: "vesper", requestId: "mobility-dash", direction: "west", mode: "reduced-motion", clipTime: 0 });
  assert.deepEqual([reduced.resolvedColumn, reduced.resolvedRow], [normal.resolvedColumn, normal.resolvedRow]);
  assert.deepEqual(reduced.renderPlan.scale, [1, 1]);
  assert.equal(reduced.renderPlan.rotation, 0);
  assert.deepEqual(reduced.renderPlan.translate, [0, 0]);
});

test("the audit and shipped drawPlayers path consume the same render-plan function", () => {
  assert.match(renderSource, /const spritePlan = specialistAtlasRenderPlan\(\{/);
  assert.match(renderSource, /ctx\.drawImage\(atlas, \.\.\.spritePlan\.sourceRect, \.\.\.spritePlan\.destinationRect\)/);
  assert.doesNotMatch(renderSource, /ctx\.drawImage\(atlas, column \* cellWidth/);
});

test("audit generation is presentation-only and consumes no gameplay randomness", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("motion audit must not consume gameplay RNG"); };
  try {
    assert.deepEqual(assertMotionAuditMetadata(buildMotionAuditMetadata()), []);
  } finally {
    Math.random = originalRandom;
  }
});
