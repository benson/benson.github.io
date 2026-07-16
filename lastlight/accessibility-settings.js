export const ACCESSIBILITY_SETTINGS_VERSION = 2;
export const ACCESSIBILITY_STORAGE_KEY = "lastlight:accessibility:v2";

export const ACCESSIBILITY_ACTIONS = Object.freeze([
  "moveUp", "moveDown", "moveLeft", "moveRight", "active", "ultimate", "autoAim", "ping", "pause", "quickPause", "inspect", "report",
  "choice1", "choice2", "choice3", "reroll", "banish", "skip",
]);

export const DEFAULT_ACCESSIBILITY_BINDINGS = Object.freeze({
  moveUp: "KeyW", moveDown: "KeyS", moveLeft: "KeyA", moveRight: "KeyD",
  active: "KeyE", ultimate: "KeyR", autoAim: "KeyC", ping: "KeyG", pause: "Escape", quickPause: "Space", inspect: "ShiftLeft", report: "Backquote",
  choice1: "Digit1", choice2: "Digit2", choice3: "Digit3", reroll: "Digit4", banish: "Digit5", skip: "Digit0",
});

const KEY_CODES = new Set([
  "Escape", "Backquote", "Space", "Enter", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
  ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
const SCALES = new Set([1, 1.25, 1.5, 2]);
const TOUCH_SCALES = new Set([1, 1.25, 1.5]);
const COLOR_VISION = new Set(["default", "deuteranopia", "protanopia", "tritanopia", "high-contrast"]);
const DIRECTIONAL_AUDIO = new Set(["standard", "enhanced", "mono"]);
const SETTINGS_FIELDS = Object.freeze(["version", "bindings", "controller", "hudScale", "textScale", "touchScale", "colorVision", "reducedFlash", "directionalAudio"]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} contains missing or unsupported fields`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function defaultAccessibilitySettings(systemReducedMotion = false) {
  return deepFreeze({
    version: ACCESSIBILITY_SETTINGS_VERSION, bindings: { ...DEFAULT_ACCESSIBILITY_BINDINGS }, controller: { enabled: true, deadzone: .18 },
    hudScale: 1.25, textScale: 1.25, touchScale: 1, colorVision: "default", reducedFlash: Boolean(systemReducedMotion), directionalAudio: "standard",
  });
}

export function validateAccessibilitySettings(value) {
  exactKeys(value, SETTINGS_FIELDS, "accessibility settings");
  if (value.version !== ACCESSIBILITY_SETTINGS_VERSION) throw new TypeError("Unsupported accessibility settings version");
  exactKeys(value.bindings, ACCESSIBILITY_ACTIONS, "accessibility bindings");
  const codes = ACCESSIBILITY_ACTIONS.map((action) => value.bindings[action]);
  if (codes.some((code) => !KEY_CODES.has(code)) || new Set(codes).size !== codes.length) throw new TypeError("Accessibility bindings must use unique supported keys");
  exactKeys(value.controller, ["enabled", "deadzone"], "controller settings");
  if (typeof value.controller.enabled !== "boolean" || !Number.isFinite(value.controller.deadzone) || value.controller.deadzone < .05 || value.controller.deadzone > .5) throw new TypeError("Controller settings are invalid");
  if (!SCALES.has(value.hudScale) || !SCALES.has(value.textScale) || !TOUCH_SCALES.has(value.touchScale) || !COLOR_VISION.has(value.colorVision) || typeof value.reducedFlash !== "boolean" || !DIRECTIONAL_AUDIO.has(value.directionalAudio)) throw new TypeError("Accessibility presentation settings are invalid");
  return value;
}

export function normalizeAccessibilitySettings(source, systemReducedMotion = false) {
  const fallback = structuredClone(defaultAccessibilitySettings(systemReducedMotion));
  if (!source || typeof source !== "object" || Array.isArray(source)) return deepFreeze(fallback);
  const migrated = [0, 1].includes(source.version) ? { ...fallback, ...source, version: ACCESSIBILITY_SETTINGS_VERSION, controller: { ...fallback.controller, ...(source.controller || {}) }, bindings: { ...fallback.bindings, ...(source.bindings || {}) } } : source;
  try { return deepFreeze(structuredClone(validateAccessibilitySettings(migrated))); }
  catch { return deepFreeze(fallback); }
}

export function loadAccessibilitySettings(storage = globalThis.localStorage, systemReducedMotion = false) {
  try { return normalizeAccessibilitySettings(JSON.parse(storage?.getItem(ACCESSIBILITY_STORAGE_KEY) || "null"), systemReducedMotion); }
  catch { return defaultAccessibilitySettings(systemReducedMotion); }
}

export function saveAccessibilitySettings(value, storage = globalThis.localStorage) {
  const settings = normalizeAccessibilitySettings(value);
  try { storage?.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage remains optional. */ }
  return settings;
}

export function keyboardActionForEvent(settings, event = {}) {
  const code = String(event.code || "");
  return ACCESSIBILITY_ACTIONS.find((action) => settings.bindings[action] === code) || null;
}

export function bindingLabel(code) {
  return String(code).replace(/^Key/, "").replace(/^Digit/, "").replace("Backquote", "` / ~").replace("ShiftLeft", "Left Shift").replace("ShiftRight", "Right Shift").replace(/([a-z])([A-Z])/g, "$1 $2");
}

const pressed = (gamepad, index) => Boolean(gamepad?.buttons?.[index]?.pressed || Number(gamepad?.buttons?.[index]?.value) > .5);
const axis = (gamepad, index, deadzone) => { const value = Number(gamepad?.axes?.[index] || 0); return Math.abs(value) < deadzone ? 0 : Math.max(-1, Math.min(1, value)); };

export function readStandardGamepad(gamepad, previousButtons = new Set(), deadzone = .18) {
  if (!gamepad || gamepad.connected === false || gamepad.mapping !== "standard") return Object.freeze({ connected: false, movement: { x: 0, y: 0 }, aim: null, held: Object.freeze([]), pressed: Object.freeze([]) });
  const held = new Set();
  for (let index = 0; index < Math.min(17, gamepad.buttons?.length || 0); index++) if (pressed(gamepad, index)) held.add(index);
  const movement = { x: axis(gamepad, 0, deadzone), y: axis(gamepad, 1, deadzone) };
  if (held.has(14)) movement.x = -1; if (held.has(15)) movement.x = 1; if (held.has(12)) movement.y = -1; if (held.has(13)) movement.y = 1;
  const aimX = axis(gamepad, 2, deadzone), aimY = axis(gamepad, 3, deadzone), aim = aimX || aimY ? Math.atan2(aimY, aimX) : null;
  return Object.freeze({ connected: true, movement: Object.freeze(movement), aim, held: Object.freeze([...held]), pressed: Object.freeze([...held].filter((index) => !previousButtons.has(index))) });
}

export const GAMEPAD_ACTIONS = Object.freeze({ 0: "active", 1: "pause", 2: "ping", 3: "ultimate", 4: "inspect", 5: "autoAim", 9: "pause" });
