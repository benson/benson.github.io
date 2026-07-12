import test from "node:test";
import assert from "node:assert/strict";
import {
  ENEMY_MOTION_STATES, MOTION_DIRECTIONS, SPECIALIST_MOTION_STATES, directionColumn,
  enemyMotionState, motionAtlasReady, motionClipDuration, motionFrame, resolveMotionState, specialistMotionState, stableDirectionColumn, validateMotionRig,
} from "../motion.js";

const rig = (kind = "specialist") => ({
  schema: "lastlight.motion.v1", kind, status: "missing",
  atlas: { src: `assets/motion/${kind}s/test.webp`, available: false, expectedSize: [1024, 1024] },
  grid: { columns: 4, rows: 32 }, directions: [...MOTION_DIRECTIONS], anchor: [.5, .875], drawSize: [100, 100],
  collisionOffset: [0, 0], groundY: 20, shadow: [30, 10],
  sockets: kind === "specialist" ? { muzzle: { distance: 40, vertical: -5 } } : { contact: { distance: 30, vertical: 0 } },
  bindings: kind === "specialist" ? { dash: "mobility", castE: "cast", castR: "cast" } : {},
  states: Object.fromEntries((kind === "specialist" ? SPECIALIST_MOTION_STATES : ENEMY_MOTION_STATES).map((state, index) => [state, {
    loop: ["idle", "run", "locomotion", "victory"].includes(state), authored: false,
    frames: [{ row: index, ms: 100, offsetY: 3, rotation: .1, scaleX: .9, scaleY: 1.1 }],
  }])),
});

test("direction hysteresis prevents diagonal frame-to-frame atlas flicker", () => {
  const boundary = Math.PI / 4;
  let column = 3;
  for (const jitter of [-.03, .02, -.01, .04, -.04, .03]) column = stableDirectionColumn(boundary + jitter, column);
  assert.equal(column, 3, "small diagonal aim jitter stays east");
  column = stableDirectionColumn(boundary + .18, column);
  assert.equal(column, 0, "a decisive turn switches south");
  column = stableDirectionColumn(boundary - .18, column);
  assert.equal(column, 3, "a decisive return switches east");
});

test("strict motion rigs cover every required clip and four authored directions", () => {
  assert.deepEqual(validateMotionRig(rig("specialist"), "specialist"), []);
  assert.deepEqual(validateMotionRig(rig("enemy"), "enemy"), []);
  const broken = rig("specialist"); delete broken.states.revive;
  assert.match(validateMotionRig(broken, "specialist").join("\n"), /states\.revive/);
  broken.states.revive = { loop: false, authored: false, frames: [{ row: 99, ms: 1 }] };
  assert.match(validateMotionRig(broken, "specialist").join("\n"), /outside|16–2000/);
  broken.surprise = true;
  assert.match(validateMotionRig(broken, "specialist").join("\n"), /unsupported fields/);
});

test("bindings resolve engine names and clip timing clamps non-looping states", () => {
  const specialist = rig("specialist");
  assert.equal(resolveMotionState(specialist, "castE"), "cast");
  assert.equal(motionClipDuration(specialist, "dash"), .1);
  assert.equal(motionFrame(specialist, "castR", 99).state, "cast");
});

test("reduced motion preserves authored pose rows but removes decorative displacement", () => {
  const specialist = rig("specialist");
  const full = motionFrame(specialist, "hurt", 0);
  const reduced = motionFrame(specialist, "hurt", 0, { reducedMotion: true });
  assert.equal(reduced.row, full.row);
  assert.deepEqual({ x: reduced.offsetX, y: reduced.offsetY, r: reduced.rotation, sx: reduced.scaleX, sy: reduced.scaleY }, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
});

test("atlas consumption is opt-in and rejects unexpected image dimensions", () => {
  const specialist = rig("specialist");
  const image = { complete: true, naturalWidth: 1024, naturalHeight: 1024 };
  assert.equal(motionAtlasReady(image, specialist), false);
  specialist.atlas.available = true; specialist.status = "ready";
  assert.equal(motionAtlasReady(image, specialist), true);
  assert.equal(motionAtlasReady({ ...image, naturalHeight: 1000 }, specialist), false);
});

test("authoritative fields select specialist and enemy motion without changing simulation", () => {
  assert.equal(specialistMotionState({ animState: "castE", animTime: .2 }, false), "castE");
  assert.equal(specialistMotionState({ animState: "victory", animTime: 10 }, false), "victory");
  assert.equal(specialistMotionState({ downed: true }, true), "down");
  assert.equal(enemyMotionState({ attackFlash: .18 }, false, true), "attackContact");
  assert.equal(enemyMotionState({ attackFlash: .08 }, false, true), "attackRecovery");
  assert.equal(enemyMotionState({ attackCd: .1 }, false, true), "attackWindup");
  assert.equal(enemyMotionState({ dead: true }, true), "death");
  assert.deepEqual([0, Math.PI, -Math.PI / 2, 0].map(directionColumn), [3, 1, 2, 3]);
});
