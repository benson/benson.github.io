import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LAB_PROFILES, NetworkLab, createActivatedNetworkLab, resolveNetworkLabActivation, validateNetworkLabProfile,
} from "../network-lab.js";

function fakeClock() {
  let now = 0, nextId = 1;
  const timers = new Map();
  const clock = {
    now: () => now,
    setTimer(callback, delay) { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      let due;
      do {
        due = [...timers.entries()].filter(([, timer]) => timer.due <= now).sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
        for (const [id, timer] of due) { timers.delete(id); timer.callback(); }
      } while (due.length);
    },
    pending: () => timers.size,
  };
  return clock;
}

function lab(options = {}) {
  const clock = options.clock || fakeClock();
  return { clock, instance: new NetworkLab({ enabled: true, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...options }) };
}

test("activation is explicit, profile-bounded, and unavailable on production origins", () => {
  assert.deepEqual(resolveNetworkLabActivation({ url: "http://localhost:4173/lastlight/" }), { enabled: false, reason: "not_requested" });
  assert.deepEqual(resolveNetworkLabActivation({ url: "https://bensonperry.com/lastlight/?llNetwork=lossy" }), { enabled: false, reason: "untrusted_origin" });
  assert.deepEqual(resolveNetworkLabActivation({ url: "http://localhost:4173/lastlight/?llNetwork=mobile&llNetworkSeed=trial-4" }), { enabled: true, reason: "enabled", profile: "mobile", seed: "trial-4" });
  assert.equal(resolveNetworkLabActivation({ url: "http://localhost/?llNetwork=unknown" }).reason, "unknown_profile");
  assert.equal(resolveNetworkLabActivation({ url: "http://localhost/?llNetwork=toString" }).reason, "unknown_profile");
  assert.equal(resolveNetworkLabActivation({ url: "https://dev.example/?llNetwork=regional", development: "true" }).reason, "untrusted_origin");
  assert.equal(resolveNetworkLabActivation({ url: "https://dev.example/?llNetwork=regional", development: true }).enabled, true);
  assert.equal(createActivatedNetworkLab({ enabled: false }), null);
});

test("every built-in profile satisfies strict finite bounds", () => {
  for (const profile of Object.values(NETWORK_LAB_PROFILES)) assert.doesNotThrow(() => validateNetworkLabProfile(profile));
  assert.throws(() => validateNetworkLabProfile({ ...NETWORK_LAB_PROFILES.healthy, extra: true }), /unknown fields/i);
  assert.throws(() => validateNetworkLabProfile({ ...NETWORK_LAB_PROFILES.healthy, upstream: { ...NETWORK_LAB_PROFILES.healthy.upstream, loss: NaN } }), /between/);
  assert.throws(() => new NetworkLab(), /explicit enabled/);
});

test("same seed and traffic produce identical delays, loss, duplication, and order", () => {
  const run = (seed) => {
    const { clock, instance } = lab({ profile: "lossy", seed });
    const delivered = [];
    for (let index = 0; index < 80; index++) instance.downstream(`m${index}`, (message) => delivered.push([clock.now(), message]));
    for (let index = 0; index < 20; index++) clock.advance(100);
    return { delivered, diagnostics: instance.diagnostics().downstream };
  };
  assert.deepEqual(run("repeatable-1"), run("repeatable-1"));
  assert.notDeepEqual(run("repeatable-1").delivered, run("repeatable-2").delivered);
});

test("upstream draws cannot perturb the independent downstream random stream", () => {
  const baseline = lab({ profile: "mobile", seed: "duplex" });
  const noisy = lab({ profile: "mobile", seed: "duplex" });
  const left = [], right = [];
  for (let index = 0; index < 100; index++) noisy.instance.upstream(`noise-${index}`, () => {});
  for (let index = 0; index < 30; index++) {
    baseline.instance.downstream(`d${index}`, (value) => left.push(value));
    noisy.instance.downstream(`d${index}`, (value) => right.push(value));
  }
  baseline.clock.advance(2_000); noisy.clock.advance(2_000);
  assert.deepEqual(right, left);
});

test("forced loss, duplication, and bounded reordering are observable without payload mutation", () => {
  const custom = validateNetworkLabProfile({
    upstream: { delayMs: 10, jitterMs: 0, loss: 0, duplication: 1, reordering: 1, reorderWindowMs: 10 },
    downstream: { delayMs: 0, jitterMs: 0, loss: 1, duplication: 0, reordering: 0, reorderWindowMs: 0 },
    forcedDisconnect: null,
  });
  const { clock, instance } = lab({ profile: custom, seed: "forced" });
  const delivered = [];
  assert.equal(instance.upstream("immutable", (value) => delivered.push(value)), true);
  assert.equal(instance.downstream("lost", () => assert.fail("lost payload delivered")), false);
  clock.advance(100);
  assert.deepEqual(delivered, ["immutable", "immutable"]);
  assert.equal(instance.diagnostics().upstream.duplicated, 1);
  assert.ok(instance.diagnostics().upstream.reordered >= 1);
  assert.equal(instance.diagnostics().downstream.dropReasons.profile_loss, 1);
});

test("message, byte, and queue limits fail closed", () => {
  const delayed = validateNetworkLabProfile({
    upstream: { delayMs: 1_000, jitterMs: 0, loss: 0, duplication: 0, reordering: 0, reorderWindowMs: 0 },
    downstream: NETWORK_LAB_PROFILES.healthy.downstream, forcedDisconnect: null,
  });
  const { instance } = lab({ profile: delayed, seed: "bounds", limits: { maxMessageBytes: 8, maxQueueBytes: 12, maxQueueMessages: 2 } });
  assert.equal(instance.upstream("123456789", () => {}), false);
  assert.equal(instance.upstream("12345678", () => {}), true);
  assert.equal(instance.upstream("abcde", () => {}), false);
  assert.equal(instance.upstream("four", () => {}), true);
  assert.equal(instance.upstream("x", () => {}), false);
  assert.deepEqual(instance.diagnostics().upstream.dropReasons, { message_bytes: 1, queue_bytes: 1, queue_messages: 1 });
  assert.throws(() => instance.upstream({ private: "object" }, () => {}), /strings, ArrayBuffers/);
  assert.throws(() => lab({ limits: { unknown: 1 } }), /unknown fields/);
  assert.throws(() => lab({ limits: { maxQueueMessages: 1.5 } }), /safe integer/);
});

test("an earlier reordered message reschedules the active delivery timer", () => {
  const profile = validateNetworkLabProfile({
    upstream: NETWORK_LAB_PROFILES.healthy.upstream,
    downstream: { delayMs: 100, jitterMs: 100, loss: 0, duplication: 0, reordering: 0, reorderWindowMs: 0 },
    forcedDisconnect: null,
  });
  let found = null;
  for (let seed = 0; seed < 100 && !found; seed++) {
    const clock = fakeClock(), delivered = [];
    const instance = new NetworkLab({ enabled: true, profile, seed: `reschedule-${seed}`, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    instance.downstream("first", (value) => delivered.push(value));
    const firstDue = instance.timerDue.downstream;
    instance.downstream("second", (value) => delivered.push(value));
    if (instance.timerDue.downstream < firstDue) found = { clock, delivered, instance };
  }
  assert.ok(found, "test vector should contain a later-enqueued earlier delivery");
  found.clock.advance(found.instance.timerDue.downstream);
  assert.deepEqual(found.delivered, ["second"]);
});

test("reconnect profile clears queues and emits one deterministic disconnect hook", () => {
  const clock = fakeClock(), disconnects = [];
  const instance = new NetworkLab({ enabled: true, profile: "reconnect", seed: "reconnect-1", now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onForcedDisconnect: (event) => disconnects.push(event) });
  for (let index = 0; index < 30; index++) instance.downstream(`snapshot-${index}`, () => {});
  assert.deepEqual(disconnects, [{ profile: "reconnect", direction: "downstream", sequence: 24 }]);
  assert.equal(instance.diagnostics().disconnectTriggered, true);
  assert.ok(instance.diagnostics().downstream.dropReasons.forced_disconnect >= 1);
  for (let index = 0; index < 30; index++) instance.downstream(`after-${index}`, () => {});
  assert.equal(disconnects.length, 1);
});

test("reset and teardown clear timers, queues, counters, and streams", () => {
  const { clock, instance } = lab({ profile: "regional", seed: "lifecycle" });
  instance.upstream("queued", () => {}); instance.downstream("queued", () => {});
  assert.equal(clock.pending(), 2);
  instance.reset();
  assert.equal(clock.pending(), 0);
  assert.equal(instance.diagnostics().upstream.submitted, 0);
  instance.upstream("queued-again", () => {});
  const tornDown = instance.teardown();
  assert.equal(tornDown.active, false);
  assert.equal(clock.pending(), 0);
  assert.equal(instance.upstream("ignored", () => {}), false);
  assert.equal(instance.diagnostics().upstream.dropReasons.inactive, 1);
});

test("diagnostics report aggregate counters but never message content", () => {
  const { instance } = lab({ profile: "healthy", seed: "privacy" });
  instance.upstream("SECRET-CALLSIGN-TOKEN", () => {});
  const serialized = JSON.stringify(instance.diagnostics());
  assert.doesNotMatch(serialized, /SECRET|CALLSIGN|TOKEN/);
  assert.match(serialized, /"profile":"healthy"/);
  assert.match(serialized, /"queueBytes":21/);
});
