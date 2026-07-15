export const FEEDBACK_HAPTICS_VERSION = "lastlight.feedback-haptics.v1";
export const FEEDBACK_HAPTIC_LIMITS = Object.freeze({ durationMs: 250, magnitude: 1 });

const freeze = (value) => Object.freeze(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function normalizeHapticSignal(value = {}) {
  const source = value?.haptic && typeof value.haptic === "object" ? value.haptic : value;
  return freeze({
    duration: Math.round(clamp(finite(source?.duration), 0, FEEDBACK_HAPTIC_LIMITS.durationMs)),
    strong: clamp(finite(source?.strong), 0, FEEDBACK_HAPTIC_LIMITS.magnitude),
    weak: clamp(finite(source?.weak), 0, FEEDBACK_HAPTIC_LIMITS.magnitude),
  });
}

function signalRank(signal) {
  return [Math.max(signal.strong, signal.weak), signal.strong, signal.weak, signal.duration];
}

function strongerThan(candidate, incumbent) {
  const left = signalRank(candidate), right = signalRank(incumbent);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

/** Select one bounded signal rather than stacking several motors in one frame. */
export function coalesceHapticSignals(values = []) {
  const entries = Array.isArray(values) ? values : [values];
  let strongest = normalizeHapticSignal();
  for (const value of entries) {
    const candidate = normalizeHapticSignal(value);
    if (strongerThan(candidate, strongest)) strongest = candidate;
  }
  return strongest;
}

const result = (played, method, reason, signal) => freeze({ played, method, reason, signal });

async function attempt(effect) {
  try {
    return await effect() !== false;
  } catch {
    return false;
  }
}

function hiddenDocument(documentObject) {
  try {
    return Boolean(documentObject?.hidden || documentObject?.visibilityState === "hidden");
  } catch {
    return true;
  }
}

/**
 * Plays one coalesced feedback signal through injected browser capabilities.
 * Platform failures are deliberately contained: feedback must never affect play.
 */
export async function playFeedbackHaptics(values, {
  gamepad = null,
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  paused = false,
  connected = gamepad ? gamepad.connected !== false : true,
  allowVibrate = false,
} = {}) {
  const signal = coalesceHapticSignals(values);
  if (paused) return result(false, null, "paused", signal);
  if (hiddenDocument(documentObject)) return result(false, null, "hidden", signal);
  if (connected === false || gamepad?.connected === false) return result(false, null, "disconnected", signal);
  if (signal.duration <= 0 || Math.max(signal.strong, signal.weak) <= 0) return result(false, null, "empty", signal);

  const actuator = gamepad?.vibrationActuator;
  if (typeof actuator?.playEffect === "function") {
    const played = await attempt(() => actuator.playEffect("dual-rumble", {
      duration: signal.duration,
      startDelay: 0,
      strongMagnitude: signal.strong,
      weakMagnitude: signal.weak,
    }));
    if (played) return result(true, "dual-rumble", null, signal);
  }

  const pulseActuators = [actuator, ...(Array.isArray(gamepad?.hapticActuators) ? gamepad.hapticActuators : [])]
    .filter((candidate, index, entries) => candidate && entries.indexOf(candidate) === index && typeof candidate.pulse === "function");
  for (const pulseActuator of pulseActuators) {
    const played = await attempt(() => pulseActuator.pulse(Math.max(signal.strong, signal.weak), signal.duration));
    if (played) return result(true, "pulse", null, signal);
  }

  if (allowVibrate && typeof navigatorObject?.vibrate === "function") {
    const played = await attempt(() => navigatorObject.vibrate(signal.duration));
    if (played) return result(true, "vibrate", null, signal);
  }
  return result(false, null, "unsupported", signal);
}
