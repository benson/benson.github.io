export const AUDIO_SETTINGS_SCHEMA = "lastlight.audio-settings.v2";
export const AUDIO_SETTINGS_STORAGE_KEY = "lastlight:audio-settings:v1";
export const AUDIO_OUTPUT_STATES = Object.freeze(["locked", "ready", "muted", "unavailable"]);
export const AUDIO_CALIBRATION_VERSION = 3;

export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  enabled: true,
  master: 0.95,
  effects: 1,
  music: 0.72,
  calibrationVersion: AUDIO_CALIBRATION_VERSION,
});

const clamp01 = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
};

export function normalizeAudioSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const legacyDefaults = source.calibrationVersion === undefined && Number(source.master) === .85 && Number(source.effects) === .9;
  return Object.freeze({
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_AUDIO_SETTINGS.enabled,
    master: legacyDefaults ? DEFAULT_AUDIO_SETTINGS.master : clamp01(source.master, DEFAULT_AUDIO_SETTINGS.master),
    effects: legacyDefaults ? DEFAULT_AUDIO_SETTINGS.effects : clamp01(source.effects, DEFAULT_AUDIO_SETTINGS.effects),
    music: clamp01(source.music, DEFAULT_AUDIO_SETTINGS.music),
    calibrationVersion: AUDIO_CALIBRATION_VERSION,
  });
}

export function loadAudioSettings(storage = globalThis.localStorage) {
  try { return normalizeAudioSettings(JSON.parse(storage?.getItem?.(AUDIO_SETTINGS_STORAGE_KEY) || "null")); }
  catch { return normalizeAudioSettings(); }
}

export function saveAudioSettings(value, storage = globalThis.localStorage) {
  const settings = normalizeAudioSettings(value);
  try { storage?.setItem?.(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Browser storage is optional. */ }
  return settings;
}

export function audioOutputState({ supported = true, enabled = true, contextState = "suspended" } = {}) {
  if (!supported || contextState === "closed") return "unavailable";
  if (!enabled) return "muted";
  return contextState === "running" ? "ready" : "locked";
}

export async function settleAudioResume(resumePromise, timeoutMs = 2500) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("Audio resume timeout must be positive");
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(resumePromise).then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export function audioPercent(value) { return `${Math.round(clamp01(value, 0) * 100)}%`; }
