import test from "node:test";
import assert from "node:assert/strict";
import {
  AdaptiveQualityController, QUALITY_STORAGE_KEY, loadQualitySettings, normalizeQualitySettings,
  resolveQualityProfile, saveQualitySettings, settingsForPreset,
} from "../quality-settings.js";

test("four presets resolve to coherent renderer and accessibility settings", () => {
  assert.equal(resolveQualityProfile(settingsForPreset("high")).dpr, 2);
  assert.equal(resolveQualityProfile(settingsForPreset("reduced")).effects, 140);
  const minimal = resolveQualityProfile(settingsForPreset("minimal"));
  assert.equal(minimal.particles, 0);
  assert.equal(minimal.shake, 0);
  assert.equal(minimal.reducedMotion, true);
  assert.equal(settingsForPreset("auto").preset, "auto");
});

test("quality settings persist safely and malformed storage falls back to auto", () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const saved = saveQualitySettings({ ...settingsForPreset("reduced"), preset: "custom", healthBars: "off" }, storage);
  assert.equal(saved.healthBars, "off");
  assert.equal(loadQualitySettings(storage).preset, "custom");
  assert.match(memory.get(QUALITY_STORAGE_KEY), /"version":1/);
  memory.set(QUALITY_STORAGE_KEY, "not json");
  assert.equal(loadQualitySettings(storage).preset, "auto");
});

test("normalization rejects unknown values without carrying unknown fields", () => {
  const normalized = normalizeQualitySettings({ preset: "warp", effectsDensity: "infinite", mystery: true });
  assert.deepEqual(normalized, settingsForPreset("auto"));
  assert.equal("mystery" in normalized, false);
});

test("system reduced-motion preference is honored by fresh defaults", () => {
  assert.equal(normalizeQualitySettings(null, true).reducedMotion, true);
  assert.equal(settingsForPreset("auto", true).reducedMotion, true);
});

test("adaptive quality degrades quickly but recovers slowly with hysteresis", () => {
  const controller = new AdaptiveQualityController(settingsForPreset("auto"));
  for (let index = 0; index < 450; index++) controller.sample(32);
  assert.equal(controller.status().tier, "reduced");
  for (let index = 0; index < 450; index++) controller.sample(32);
  assert.equal(controller.status().tier, "minimal");
  for (let index = 0; index < 800; index++) controller.sample(10);
  assert.equal(controller.status().tier, "reduced", "recovery changes only one tier after a long stable window");
});

test("manual presets never adapt in response to frame timing", () => {
  const controller = new AdaptiveQualityController(settingsForPreset("high"));
  for (let index = 0; index < 2_000; index++) controller.sample(60);
  assert.equal(controller.status().tier, "high");
  controller.setSettings(settingsForPreset("minimal"));
  for (let index = 0; index < 2_000; index++) controller.sample(8);
  assert.equal(controller.status().tier, "minimal");
});
