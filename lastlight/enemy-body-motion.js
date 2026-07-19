import { enemyMotionState, motionClipDuration } from "./motion.js";
import { impactPhaseProgress } from "./impact-feel.js?v=20260718.9";

export const ENEMY_BODY_MOTION_SCHEMA = "lastlight.enemy-body-motion.v1";
export const ENEMY_BODY_MOTION_TYPES = Object.freeze(["hound", "spitter", "brute", "bomber", "shark"]);
export const ENEMY_BODY_CONTACT_HOLD_TICKS = 6;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function behaviorPhase(enemy) {
  const value = enemy?.behaviorState;
  if (value && typeof value === "object" && !Array.isArray(value)) return String(value.phase || value.state || value.id || "").toLowerCase();
  return String(value || "").toLowerCase();
}

function behaviorClock(enemy, tick) {
  const startedTick = finite(enemy?.behaviorStartedTick, NaN), untilTick = finite(enemy?.behaviorUntilTick, NaN), now = finite(tick, NaN);
  if (![startedTick, untilTick, now].every(Number.isFinite) || untilTick <= startedTick) return null;
  const durationTicks = untilTick - startedTick, elapsedTicks = clamp(now - startedTick, 0, durationTicks);
  return Object.freeze({ startedTick, untilTick, durationTicks, elapsedTicks, progress: elapsedTicks / durationTicks });
}

function clipElapsed(rig, state, progress, type, phase) {
  const duration = motionClipDuration(rig, state);
  const curvedProgress = impactPhaseProgress(type, phase, clamp(progress, 0, 1));
  return duration > 0 ? curvedProgress * duration : 0;
}

function result({ enemy, state, elapsed, phase, clock, contactTick = null, interrupted = false, authoritative = false, terminal = false }) {
  return Object.freeze({
    schema: ENEMY_BODY_MOTION_SCHEMA,
    type: String(enemy?.type || ""), state, elapsed: Math.max(0, finite(elapsed)), phase,
    progress: clock?.progress ?? 0, startedTick: clock?.startedTick ?? null, untilTick: clock?.untilTick ?? null,
    contactTick, interrupted: Boolean(interrupted), authoritative: Boolean(authoritative), terminal: Boolean(terminal),
  });
}

/**
 * Selects a presentation-only enemy body clip clock. Attack phases are driven
 * by simulation ticks carried in the snapshot, not renderer wall time, so
 * replay, interpolation, reconnect, and low frame rates land on the same pose.
 */
export function enemyBodyMotionPlan({
  enemy, tick, rig, moving = false, nearTarget = false,
  fallbackState = null, fallbackElapsed = 0,
} = {}) {
  const phase = behaviorPhase(enemy), clock = behaviorClock(enemy, tick);
  const fallback = fallbackState || enemyMotionState(enemy, moving, nearTarget);

  // Death and hit reactions are semantic interruptions. A Bomber that reaches
  // detonation is intentionally not given a post-removal body ghost: the last
  // live windup pose compresses to contact and the explosion effect owns impact.
  if (enemy?.dead) return result({ enemy, state: "death", elapsed: finite(enemy?._deathElapsed, fallbackElapsed), phase, clock, interrupted: phase === "windup" || phase === "charge" });
  if ((enemy?.hitFlash || 0) > .015) return result({ enemy, state: "hurt", elapsed: fallback === "hurt" ? fallbackElapsed : 0, phase, clock, interrupted: phase === "windup" || phase === "charge" });
  if ((enemy?.stun || 0) > 0 && ["windup", "charge", "contact", "recovery"].includes(phase)) {
    const state = phase === "recovery" ? "attackRecovery" : "hurt";
    return result({ enemy, state, elapsed: 0, phase, clock, contactTick: null, interrupted: true, authoritative: phase === "recovery" });
  }

  if (clock && phase === "windup") return result({ enemy, state: "attackWindup", elapsed: clipElapsed(rig, "attackWindup", clock.progress, enemy?.type, phase), phase, clock, contactTick: clock.untilTick, authoritative: true, terminal: enemy?.type === "bomber" });
  if (clock && (phase === "charge" || phase === "contact")) return result({ enemy, state: "attackContact", elapsed: clipElapsed(rig, "attackContact", clock.progress, enemy?.type, phase), phase, clock, contactTick: clock.startedTick, authoritative: true });
  if (clock && phase === "recovery") {
    const carriedContactTick = Number.isFinite(Number(enemy?.contactTick)) ? Number(enemy.contactTick) : null;
    const recoveryContactTick = enemy?.type === "brute" ? clock.startedTick : carriedContactTick;
    // Brute damage and recovery begin on the same simulation tick. Hold the
    // authored contact row briefly before settling, unless stun created this
    // recovery and therefore cancelled the slam.
    if (enemy?.type === "brute" && clock.elapsedTicks < ENEMY_BODY_CONTACT_HOLD_TICKS) {
      const contactProgress = clock.elapsedTicks / ENEMY_BODY_CONTACT_HOLD_TICKS;
      return result({ enemy, state: "attackContact", elapsed: clipElapsed(rig, "attackContact", contactProgress, enemy?.type, "contact"), phase, clock, contactTick: clock.startedTick, authoritative: true });
    }
    const recoveryStart = enemy?.type === "brute" ? ENEMY_BODY_CONTACT_HOLD_TICKS : 0;
    const recoveryProgress = clamp((clock.elapsedTicks - recoveryStart) / Math.max(1, clock.durationTicks - recoveryStart), 0, 1);
    return result({ enemy, state: "attackRecovery", elapsed: clipElapsed(rig, "attackRecovery", recoveryProgress, enemy?.type, phase), phase, clock, contactTick: recoveryContactTick, authoritative: true });
  }

  return result({ enemy, state: fallback, elapsed: fallbackElapsed, phase, clock, interrupted: false, authoritative: false });
}
