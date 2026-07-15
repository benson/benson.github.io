import test from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK_HAPTIC_LIMITS,
  coalesceHapticSignals,
  normalizeHapticSignal,
  playFeedbackHaptics,
} from "../feedback-haptics.js";

const visible = Object.freeze({ hidden: false, visibilityState: "visible" });

test("haptic signals are finite, clamped, rounded, immutable, and may come from feedback plans", () => {
  const normalized = normalizeHapticSignal({ haptic: { duration: 900.8, strong: 7, weak: -2 } });
  assert.deepEqual(normalized, { duration: FEEDBACK_HAPTIC_LIMITS.durationMs, strong: 1, weak: 0 });
  assert.equal(Object.isFrozen(normalized), true);
  assert.deepEqual(normalizeHapticSignal({ duration: NaN, strong: Infinity, weak: "0.4" }), { duration: 0, strong: 0, weak: .4 });
});

test("coalescing selects one strongest signal instead of stacking frame feedback", () => {
  const weakLong = { duration: 200, strong: .2, weak: .1 };
  const heavyShort = { duration: 46, strong: .28, weak: .12 };
  const selected = coalesceHapticSignals([weakLong, heavyShort, { duration: 72, strong: .1, weak: .1 }]);
  assert.deepEqual(selected, heavyShort);
  assert.deepEqual(coalesceHapticSignals([]), { duration: 0, strong: 0, weak: 0 });
});

test("standard gamepads receive one bounded dual-rumble effect", async () => {
  const calls = [];
  const gamepad = { connected: true, vibrationActuator: { playEffect: async (...args) => { calls.push(args); return "complete"; } } };
  const outcome = await playFeedbackHaptics([
    { duration: 24, strong: .08, weak: .04 },
    { duration: 72, strong: .58, weak: .24 },
  ], { gamepad, documentObject: visible });
  assert.deepEqual(outcome, { played: true, method: "dual-rumble", reason: null, signal: { duration: 72, strong: .58, weak: .24 } });
  assert.deepEqual(calls, [["dual-rumble", { duration: 72, startDelay: 0, strongMagnitude: .58, weakMagnitude: .24 }]]);
});

test("pulse is used when dual-rumble is absent or rejects", async () => {
  const calls = [];
  const rejected = {
    connected: true,
    vibrationActuator: {
      playEffect: async () => { throw new Error("unsupported effect"); },
      pulse: async (...args) => { calls.push(args); return true; },
    },
  };
  assert.equal((await playFeedbackHaptics({ duration: 40, strong: .3, weak: .7 }, { gamepad: rejected, documentObject: visible })).method, "pulse");
  assert.deepEqual(calls, [[.7, 40]]);

  const legacyCalls = [];
  const legacy = { connected: true, hapticActuators: [{ pulse: (...args) => { legacyCalls.push(args); return true; } }] };
  assert.equal((await playFeedbackHaptics({ duration: 30, strong: .4, weak: .2 }, { gamepad: legacy, documentObject: visible })).method, "pulse");
  assert.deepEqual(legacyCalls, [[.4, 30]]);
});

test("navigator vibration is an explicit final fallback", async () => {
  const calls = [], navigatorObject = { vibrate: (duration) => { calls.push(duration); return true; } };
  const disabled = await playFeedbackHaptics({ duration: 31, strong: .4, weak: 0 }, { navigatorObject, documentObject: visible });
  assert.deepEqual([disabled.played, disabled.reason, calls.length], [false, "unsupported", 0]);
  const enabled = await playFeedbackHaptics({ duration: 31, strong: .4, weak: 0 }, { navigatorObject, documentObject: visible, allowVibrate: true });
  assert.deepEqual([enabled.played, enabled.method, calls], [true, "vibrate", [31]]);
});

test("hidden, paused, disconnected, and empty feedback is safely suppressed", async () => {
  let calls = 0;
  const gamepad = { connected: true, vibrationActuator: { playEffect: () => { calls += 1; return true; } } };
  const signal = { duration: 50, strong: .5, weak: .2 };
  assert.equal((await playFeedbackHaptics(signal, { gamepad, paused: true, documentObject: visible })).reason, "paused");
  assert.equal((await playFeedbackHaptics(signal, { gamepad, documentObject: { hidden: true } })).reason, "hidden");
  assert.equal((await playFeedbackHaptics(signal, { gamepad: { ...gamepad, connected: false }, documentObject: visible })).reason, "disconnected");
  assert.equal((await playFeedbackHaptics(signal, { gamepad, connected: false, documentObject: visible })).reason, "disconnected");
  assert.equal((await playFeedbackHaptics({ duration: 0, strong: 1, weak: 1 }, { gamepad, documentObject: visible })).reason, "empty");
  assert.equal(calls, 0);
});

test("platform exceptions and rejected fallbacks are fail-silent", async () => {
  const gamepad = {
    connected: true,
    vibrationActuator: { playEffect: () => { throw new Error("blocked"); } },
    hapticActuators: [{ pulse: async () => Promise.reject(new Error("gone")) }],
  };
  const navigatorObject = { vibrate: () => { throw new Error("privacy"); } };
  await assert.doesNotReject(async () => {
    const outcome = await playFeedbackHaptics({ duration: 50, strong: .5, weak: .2 }, { gamepad, navigatorObject, documentObject: visible, allowVibrate: true });
    assert.deepEqual([outcome.played, outcome.reason], [false, "unsupported"]);
  });
});
