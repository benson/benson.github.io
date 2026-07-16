import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESSIBILITY_ACTIONS, ACCESSIBILITY_STORAGE_KEY, DEFAULT_ACCESSIBILITY_BINDINGS, GAMEPAD_ACTIONS,
  bindingLabel, defaultAccessibilitySettings, keyboardActionForEvent, loadAccessibilitySettings,
  normalizeAccessibilitySettings, readStandardGamepad, saveAccessibilitySettings, validateAccessibilitySettings,
} from "../accessibility-settings.js";
import { Simulation } from "../engine.js";
import { hashSimulationState } from "../replay.js";

const memoryStorage = (initial = {}) => { const values = new Map(Object.entries(initial)); return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), values }; };

test("accessibility settings are strict, complete, immutable, identity-free, and migration safe", () => {
  const defaults = defaultAccessibilitySettings();
  assert.deepEqual(Object.keys(defaults.bindings), ACCESSIBILITY_ACTIONS);
  assert.equal(Object.isFrozen(defaults.bindings), true);
  assert.equal(validateAccessibilitySettings(structuredClone(defaults)).version, 2);
  assert.throws(() => validateAccessibilitySettings({ ...structuredClone(defaults), callsign: "Rookie" }), /unsupported/);
  assert.throws(() => validateAccessibilitySettings({ ...structuredClone(defaults), bindings: { ...defaults.bindings, active: defaults.bindings.ultimate } }), /unique/);
  assert.throws(() => validateAccessibilitySettings({ ...structuredClone(defaults), bindings: { ...defaults.bindings, active: "Tab" } }), /supported/);
  assert.throws(() => validateAccessibilitySettings({ ...structuredClone(defaults), controller: { enabled: true, deadzone: .9 } }), /invalid/);
  assert.deepEqual(normalizeAccessibilitySettings({ version: 0, hudScale: 1.5 }), { ...defaults, hudScale: 1.5 });
  assert.deepEqual(normalizeAccessibilitySettings({ arbitrary: true }), defaults);
});

test("optional local persistence never serializes identity and fails safely", () => {
  const storage = memoryStorage(), saved = saveAccessibilitySettings({ ...structuredClone(defaultAccessibilitySettings()), colorVision: "high-contrast", reducedFlash: true }, storage);
  assert.equal(loadAccessibilitySettings(storage).colorVision, "high-contrast");
  assert.equal(saved.reducedFlash, true);
  assert.doesNotMatch(storage.values.get(ACCESSIBILITY_STORAGE_KEY), /name|callsign|room|seed|token|replay/i);
  assert.deepEqual(loadAccessibilitySettings({ getItem() { throw new Error("blocked"); } }), defaultAccessibilitySettings());
});

test("remapped keyboard actions resolve by physical code with readable labels", () => {
  const settings = structuredClone(defaultAccessibilitySettings()); settings.bindings.active = "KeyQ"; settings.bindings.moveUp = "KeyE";
  assert.equal(keyboardActionForEvent(settings, { code: "KeyQ", key: "a" }), "active");
  assert.equal(keyboardActionForEvent(settings, { code: "KeyE" }), "moveUp");
  assert.equal(keyboardActionForEvent(settings, { code: "Unknown" }), null);
  assert.equal(bindingLabel("Backquote"), "` / ~"); assert.equal(bindingLabel(DEFAULT_ACCESSIBILITY_BINDINGS.inspect), "Left Shift");
  assert.equal(bindingLabel(DEFAULT_ACCESSIBILITY_BINDINGS.quickPause), "Space");
});

test("standard gamepad sampling applies deadzones, d-pad precedence, aim, and edge actions", () => {
  const gamepad = { connected: true, mapping: "standard", axes: [.3, .01, .5, -.5], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: [0, 9, 14].includes(index), value: [0, 9, 14].includes(index) ? 1 : 0 })) };
  const first = readStandardGamepad(gamepad, new Set(), .18);
  assert.deepEqual(first.movement, { x: -1, y: 0 }); assert.ok(first.aim < 0); assert.deepEqual(first.pressed, [0, 9, 14]);
  const held = readStandardGamepad(gamepad, new Set(first.held), .18); assert.deepEqual(held.pressed, []);
  assert.equal(GAMEPAD_ACTIONS[0], "active"); assert.equal(GAMEPAD_ACTIONS[9], "pause");
  assert.equal(readStandardGamepad({ connected: true, mapping: "xinput", axes: [], buttons: [] }).connected, false);
});

test("every accessibility profile preserves exact simulation and replay hashes", () => {
  const base = defaultAccessibilitySettings();
  const profiles = [
    base,
    normalizeAccessibilitySettings({ ...structuredClone(base), textScale: 2, hudScale: 2, touchScale: 1.5 }),
    ...["deuteranopia", "protanopia", "tritanopia", "high-contrast"].map((colorVision) => normalizeAccessibilitySettings({ ...structuredClone(base), colorVision, reducedFlash: true, directionalAudio: "mono" })),
  ];
  const hashes = profiles.map(() => {
    const simulation = new Simulation({ players: [{ id: "p1", name: "Profile", specialist: "zuri" }] }, { seed: "0123456789abcdef0123456789abcdef" });
    for (let tick = 0; tick < 120; tick++) {
      simulation.setInput("p1", { x: tick % 40 < 20 ? 1 : -1, y: .25, aim: tick / 20, autoAim: false });
      simulation.update(1 / 60);
    }
    return hashSimulationState(simulation);
  });
  assert.equal(new Set(hashes).size, 1);
});
