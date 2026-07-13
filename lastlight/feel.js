import { advancePlayerMovement } from "./movement.js?v=20260712.11";

export const FIXED_STEP_SECONDS = 1 / 60;

export class FixedStepClock {
  constructor(stepSeconds = FIXED_STEP_SECONDS, maxSteps = 5) {
    this.stepSeconds = stepSeconds;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
    this.droppedSeconds = 0;
  }

  reset() {
    this.accumulator = 0;
    this.droppedSeconds = 0;
  }

  advance(frameSeconds, update) {
    this.accumulator += Math.min(.1, Math.max(0, Number(frameSeconds) || 0));
    let steps = 0;
    while (this.accumulator >= this.stepSeconds && steps < this.maxSteps) {
      update(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    if (this.accumulator >= this.stepSeconds) {
      const dropped = this.accumulator - this.accumulator % this.stepSeconds;
      this.droppedSeconds += dropped;
      this.accumulator %= this.stepSeconds;
    }
    return { steps, alpha: this.accumulator / this.stepSeconds, droppedSeconds: this.droppedSeconds };
  }
}

export class MovementPredictor {
  constructor() {
    this.player = null;
    this.authoritative = null;
    this.lastCorrectionDistance = 0;
    this.maxCorrectionDistance = 0;
  }

  reset() {
    this.player = null;
    this.authoritative = null;
    this.lastCorrectionDistance = 0;
    this.maxCorrectionDistance = 0;
  }

  sync(player) {
    if (!player) return null;
    if (!this.player || this.player.id !== player.id) {
      this.player = { ...player, predicted: true };
      this.authoritative = { x: player.x, y: player.y };
      return this.player;
    }
    const dx = player.x - this.player.x, dy = player.y - this.player.y;
    const distance = Math.hypot(dx, dy);
    this.lastCorrectionDistance = distance;
    this.maxCorrectionDistance = Math.max(this.maxCorrectionDistance, distance);
    this.authoritative = { x: player.x, y: player.y };
    Object.assign(this.player, player, { x: this.player.x, y: this.player.y, predicted: true });
    if (distance > 260) {
      this.player.x = player.x;
      this.player.y = player.y;
    } else {
      // Apply only a small immediate correction. The remainder is absorbed over
      // following frames so ordinary relay jitter never becomes a teleport.
      this.player.x += dx * .12;
      this.player.y += dy * .12;
    }
    return this.player;
  }

  advance(input, frameSeconds, speed, move) {
    if (!this.player) return null;
    const dt = Math.min(.05, Math.max(0, Number(frameSeconds) || 0));
    advancePlayerMovement(this.player, input, dt, speed, move);
    if (this.authoritative && !this.player.moving) {
      const blend = 1 - Math.exp(-7 * dt);
      this.player.x += (this.authoritative.x - this.player.x) * blend;
      this.player.y += (this.authoritative.y - this.player.y) * blend;
    }
    return this.player;
  }
}

export function springCamera(camera, target, frameSeconds, options = {}) {
  const dt = Math.min(.05, Math.max(0, Number(frameSeconds) || 0));
  const stiffness = options.stiffness ?? 115, damping = options.damping ?? 19;
  camera.vx = Number(camera.vx) || 0; camera.vy = Number(camera.vy) || 0;
  camera.vx += ((target.x - camera.x) * stiffness - camera.vx * damping) * dt;
  camera.vy += ((target.y - camera.y) * stiffness - camera.vy * damping) * dt;
  camera.x += camera.vx * dt; camera.y += camera.vy * dt;
  return camera;
}

export function directionColumn(angle) {
  const x = Math.cos(Number(angle) || 0), y = Math.sin(Number(angle) || 0);
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 1 : 3;
  return y < 0 ? 2 : 0;
}

export function animationFrame(animation, state, elapsedSeconds) {
  const clip = animation?.states?.[state] || animation?.states?.idle;
  if (!clip?.frames?.length) return null;
  const total = clip.frames.reduce((sum, frame) => sum + Math.max(1, frame.ms || 100), 0);
  if (clip.loop === false && Math.max(0, elapsedSeconds) * 1000 >= total) return clip.frames.at(-1);
  let cursor = ((Math.max(0, elapsedSeconds) * 1000) % total + total) % total;
  for (const frame of clip.frames) {
    const duration = Math.max(1, frame.ms || 100);
    if (cursor < duration) return frame;
    cursor -= duration;
  }
  return clip.frames.at(-1);
}
