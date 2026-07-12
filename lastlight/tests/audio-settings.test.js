import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_OUTPUT_STATES,
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  audioOutputState,
  audioPercent,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
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
  const saved = saveAudioSettings({ enabled: false, master: 2, effects: -.5, voice: .44, funnyVoice: false, ignored: "secret" }, target);
  assert.deepEqual(saved, { enabled: false, master: 1, effects: 0, voice: .44, funnyVoice: false });
  assert.deepEqual(loadAudioSettings(target), saved);
  assert.deepEqual(Object.keys(JSON.parse(target.value(AUDIO_SETTINGS_STORAGE_KEY))).sort(), ["effects", "enabled", "funnyVoice", "master", "voice"]);
  assert.doesNotMatch(target.value(AUDIO_SETTINGS_STORAGE_KEY), /name|room|token|specialist/i);
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
