import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Script } from "node:vm";
import { enemyBodyMotionPlan } from "../enemy-body-motion.js";
import {
  assertEnemyBodyMotionAuditMetadata, buildEnemyBodyMotionAuditMetadata,
} from "../enemy-body-motion-audit.js";
import { motionFrame } from "../motion.js";
import { getThemeEnemyAnimation } from "../themes/lastlight.js";

const timed = (type, behaviorState, startedTick, untilTick, tick, extra = {}) => ({
  id: `${type}-test`, type, behaviorState, behaviorStartedTick: startedTick, behaviorUntilTick: untilTick, attackAngle: .3, ...extra,
});
const plan = (enemy, tick) => enemyBodyMotionPlan({ enemy, tick, rig: getThemeEnemyAnimation(enemy.type), fallbackState: "idle", fallbackElapsed: .37 });

test("authoritative enemy body clocks land contact on each behavior's commit tick", () => {
  const cases = [
    ["hound", "charge", 30, 48],
    ["spitter", "contact", 33, 39],
    ["brute", "recovery", 48, 132],
    ["shark", "charge", 54, 90],
  ];
  for (const [type, phase, contactTick, untilTick] of cases) {
    const result = plan(timed(type, phase, contactTick, untilTick, contactTick), contactTick);
    assert.equal(result.state, "attackContact", `${type} uses the authored contact row at commit`);
    assert.equal(result.contactTick, contactTick, `${type} contact tick is behavior start, not phase end`);
    assert.equal(result.progress, 0);
    assert.equal(result.authoritative, true);
  }
});

test("long windups use snapshot phase instead of finishing their 300ms clip early", () => {
  for (const [type, windupTicks] of [["hound", 30], ["spitter", 33], ["brute", 48], ["bomber", 30], ["shark", 54]]) {
    const rig = getThemeEnemyAnimation(type), enemy = timed(type, "windup", 100, 100 + windupTicks, 100);
    const early = plan(enemy, 100), middle = plan(enemy, 100 + Math.floor(windupTicks / 2)), late = plan(enemy, 100 + Math.floor(windupTicks * .9));
    assert.equal(early.elapsed, 0);
    assert.ok(middle.elapsed > early.elapsed && late.elapsed > middle.elapsed, `${type} pose advances with authoritative windup progress`);
    assert.equal(late.contactTick, 100 + windupTicks);
    assert.ok(late.elapsed <= rig.states.attackWindup.frames.reduce((sum, frame) => sum + frame.ms, 0) / 1000);
  }
});

test("recovery never fabricates a commit tick that its snapshot no longer carries", () => {
  for (const type of ["hound", "spitter", "shark"]) {
    const recovery = plan(timed(type, "recovery", 90, 150, 110), 110);
    assert.equal(recovery.contactTick, null, `${type} recovery start is not its attack commit`);
    const carried = plan(timed(type, "recovery", 90, 150, 110, { contactTick: 54 }), 110);
    assert.equal(carried.contactTick, 54, `${type} may preserve an explicit audit/replay contact marker`);
  }
  assert.equal(plan(timed("brute", "recovery", 48, 132, 60), 60).contactTick, 48, "Brute recovery start is its damage tick");
});

test("hurt, death, cancellation, and stun suppress false attack contact", () => {
  assert.equal(plan(timed("hound", "windup", 10, 40, 20, { dead: true }), 20).state, "death");
  assert.equal(plan(timed("spitter", "windup", 10, 43, 20, { hitFlash: .08 }), 20).state, "hurt");
  const stunned = plan(timed("hound", "windup", 10, 40, 20, { stun: .4 }), 20);
  assert.deepEqual([stunned.state, stunned.interrupted, stunned.contactTick], ["hurt", true, null]);
  const cancelledSlam = plan(timed("brute", "recovery", 48, 132, 48, { stun: .4 }), 48);
  assert.deepEqual([cancelledSlam.state, cancelledSlam.interrupted, cancelledSlam.contactTick], ["attackRecovery", true, null], "stun-created recovery never synthesizes slam contact");
  const ordinaryStun = plan({ id: "hound-idle", type: "hound", behaviorState: "approach", stun: .4 }, 20);
  assert.equal(ordinaryStun.state, "idle", "non-attack stun presentation remains unchanged");
  const cancelled = plan({ id: "spitter-cancel", type: "spitter", behaviorState: "approach" }, 44);
  assert.equal(cancelled.state, "idle");
});

test("Bomber reaches its terminal live compression then disappears without a body ghost", () => {
  const rig = getThemeEnemyAnimation("bomber"), live = timed("bomber", "windup", 0, 30, 29), terminal = plan(live, 29);
  const frame = motionFrame(rig, terminal.state, terminal.elapsed);
  assert.equal(terminal.state, "attackWindup");
  assert.equal(terminal.contactTick, 30);
  assert.equal(frame.row, 3, "last live windup tick uses the authored action row");
  const removed = plan({ ...live, dead: true, _deathElapsed: 0 }, 30);
  assert.equal(removed.state, "death");
  assert.equal(removed.terminal, false);
  const defused = plan({ ...live, dead: true, _deathElapsed: 0 }, 20);
  assert.equal(defused.state, "death", "killed-during-fuse never emits contact");
});

test("reduced motion preserves semantic pose rows while removing body transforms", () => {
  for (const type of ["hound", "spitter", "brute", "bomber", "shark"]) {
    const rig = getThemeEnemyAnimation(type), enemy = timed(type, "windup", 0, type === "shark" ? 54 : 30, 20);
    const body = plan(enemy, 20), normal = motionFrame(rig, body.state, body.elapsed), reduced = motionFrame(rig, body.state, body.elapsed, { reducedMotion: true });
    assert.equal(reduced.row, normal.row);
    assert.deepEqual([reduced.offsetX, reduced.offsetY, reduced.rotation, reduced.scaleX, reduced.scaleY], [0, 0, 0, 1, 1]);
  }
});

test("missing simulation ticks fall back to the renderer clock instead of faking phase zero", () => {
  const enemy = timed("hound", "windup", 10, 40, undefined);
  const result = enemyBodyMotionPlan({ enemy, tick: undefined, rig: getThemeEnemyAnimation("hound"), fallbackState: "attackWindup", fallbackElapsed: .17 });
  assert.deepEqual([result.authoritative, result.elapsed, result.contactTick], [false, .17, null]);
});

test("deterministic body audit covers five enemies, accessibility, checkpoints, and unchanged geometry", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("enemy body audit must not consume gameplay RNG"); };
  try {
    const report = buildEnemyBodyMotionAuditMetadata();
    assert.deepEqual(assertEnemyBodyMotionAuditMetadata(report), []);
    assert.deepEqual(report.coverage, { enemies: 5, modes: 2, checkpoints: 5, frames: 50 });
  } finally { Math.random = originalRandom; }
});

test("runtime consumes the shared tick plan without touching simulation entities", () => {
  const render = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  assert.match(render, /drawEnemies\(\[item\.value\].*state\.tick\)/);
  assert.match(render, /const bodyPlan = enemyBodyMotionPlan\(/);
  assert.equal((render.match(/enemyBodyMotionPlan\(/g) || []).length, 1, "one bounded plan allocation per rendered enemy");
  assert.doesNotMatch(render, /simulationTick = 0/);
});

test("generated interactive audit compiles its inline review script", () => {
  const root = new URL("..", import.meta.url);
  execFileSync(process.execPath, ["tooling/run_enemy_body_motion_audit.js", "report"], { cwd: root, stdio: "pipe" });
  const html = readFileSync(new URL("../artifacts/enemy-body-motion-audit/index.html", import.meta.url), "utf8");
  const source = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(source?.length > 1_000, "report contains the interactive review program");
  assert.doesNotThrow(() => new Script(source));
});
