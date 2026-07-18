import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_CALIBRATION_VERSION,
  AUDIO_OUTPUT_STATES,
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  audioOutputState,
  audioPercent,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
  settleAudioResume,
} from "../audio-settings.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

test("audio settings normalize, clamp, persist, and recover without identity", () => {
  const target = storage();
  const saved = saveAudioSettings({ enabled: false, master: 2, effects: -.5, music: .44, funnyVoice: false, ignored: "secret" }, target);
  assert.deepEqual(saved, { enabled: false, master: 1, effects: 0, music: .44, calibrationVersion: AUDIO_CALIBRATION_VERSION });
  assert.deepEqual(loadAudioSettings(target), saved);
  assert.deepEqual(Object.keys(JSON.parse(target.value(AUDIO_SETTINGS_STORAGE_KEY))).sort(), ["calibrationVersion", "effects", "enabled", "master", "music"]);
  assert.doesNotMatch(target.value(AUDIO_SETTINGS_STORAGE_KEY), /name|room|token|specialist/i);
});

test("legacy untouched defaults migrate to the louder calibrated mix without overriding custom levels", () => {
  const legacy = storage({ [AUDIO_SETTINGS_STORAGE_KEY]: JSON.stringify({ enabled: true, master: .85, effects: .9, voice: .32, funnyVoice: true }) });
  assert.equal(loadAudioSettings(legacy).master, DEFAULT_AUDIO_SETTINGS.master);
  assert.equal(loadAudioSettings(legacy).effects, DEFAULT_AUDIO_SETTINGS.effects);
  const custom = storage({ [AUDIO_SETTINGS_STORAGE_KEY]: JSON.stringify({ enabled: true, master: .4, effects: .7, voice: .2, funnyVoice: false }) });
  assert.equal(loadAudioSettings(custom).master, .4);
  assert.equal(loadAudioSettings(custom).effects, .7);
  assert.equal(loadAudioSettings(custom).music, DEFAULT_AUDIO_SETTINGS.music);
});

test("malformed or unavailable storage falls back to calibrated defaults", () => {
  const malformed = storage({ [AUDIO_SETTINGS_STORAGE_KEY]: "{" });
  assert.deepEqual(loadAudioSettings(malformed), DEFAULT_AUDIO_SETTINGS);
  assert.deepEqual(normalizeAudioSettings(null), DEFAULT_AUDIO_SETTINGS);
  assert.deepEqual(loadAudioSettings({ getItem() { throw new Error("blocked"); } }), DEFAULT_AUDIO_SETTINGS);
  assert.doesNotThrow(() => saveAudioSettings(DEFAULT_AUDIO_SETTINGS, { setItem() { throw new Error("full"); } }));
  assert.equal(audioPercent(.854), "85%");
});

test("output state is explicit across browser support, gesture lock, readiness, and mute", () => {
  assert.deepEqual(AUDIO_OUTPUT_STATES, ["locked", "ready", "muted", "unavailable"]);
  assert.equal(audioOutputState({ supported: false, enabled: true, contextState: "running" }), "unavailable");
  assert.equal(audioOutputState({ supported: true, enabled: false, contextState: "running" }), "muted");
  assert.equal(audioOutputState({ supported: true, enabled: true, contextState: "suspended" }), "locked");
  assert.equal(audioOutputState({ supported: true, enabled: true, contextState: "interrupted" }), "locked");
  assert.equal(audioOutputState({ supported: true, enabled: true, contextState: "running" }), "ready");
  assert.equal(audioOutputState({ supported: true, enabled: true, contextState: "closed" }), "unavailable");
});

test("audio resume attempts settle instead of leaving the sound test pending forever", async () => {
  assert.equal(await settleAudioResume(Promise.resolve(), 20), true);
  assert.equal(await settleAudioResume(new Promise(() => {}), 5), false);
  await assert.rejects(() => settleAudioResume(Promise.reject(new Error("blocked")), 20), /blocked/);
  await assert.rejects(() => settleAudioResume(Promise.resolve(), 0), /timeout must be positive/);
});
