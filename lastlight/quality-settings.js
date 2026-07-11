export const QUALITY_STORAGE_KEY = "lastlight:quality:v1";
export const QUALITY_SETTINGS_VERSION = 1;

const INTENSITIES = new Set(["full", "balanced", "low", "off"]);
const HEALTH_BARS = new Set(["all", "important", "off"]);
const PRESETS = new Set(["auto", "high", "reduced", "minimal", "custom"]);

export const QUALITY_PRESETS = Object.freeze({
  auto: Object.freeze({ preset: "auto", effectsDensity: "full", shake: "full", hitFlashes: "full", healthBars: "important", reducedMotion: false, flashIntensity: "full" }),
  high: Object.freeze({ preset: "high", effectsDensity: "full", shake: "full", hitFlashes: "full", healthBars: "all", reducedMotion: false, flashIntensity: "full" }),
  reduced: Object.freeze({ preset: "reduced", effectsDensity: "balanced", shake: "balanced", hitFlashes: "balanced", healthBars: "important", reducedMotion: false, flashIntensity: "balanced" }),
  minimal: Object.freeze({ preset: "minimal", effectsDensity: "low", shake: "off", hitFlashes: "low", healthBars: "important", reducedMotion: true, flashIntensity: "low" }),
});

export const RENDER_PROFILES = Object.freeze({
  high: Object.freeze({ tier: "high", dpr: 2, enemies: 420, projectiles: 700, hostileProjectiles: 360, effects: 240, orbs: 600, particles: 70 }),
  reduced: Object.freeze({ tier: "reduced", dpr: 1.5, enemies: 240, projectiles: 420, hostileProjectiles: 240, effects: 140, orbs: 360, particles: 36 }),
  minimal: Object.freeze({ tier: "minimal", dpr: 1, enemies: 150, projectiles: 240, hostileProjectiles: 160, effects: 80, orbs: 220, particles: 0 }),
});

const INTENSITY_VALUES = Object.freeze({ full: 1, balanced: 0.6, low: 0.3, off: 0 });

function exactObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}

export function normalizeQualitySettings(source, systemReducedMotion = false) {
  const fallback = QUALITY_PRESETS.auto;
  if (!exactObject(source, ["version", "preset", "effectsDensity", "shake", "hitFlashes", "healthBars", "reducedMotion", "flashIntensity"])) {
    return { ...fallback, reducedMotion: Boolean(systemReducedMotion) };
  }
  const preset = PRESETS.has(source.preset) ? source.preset : fallback.preset;
  const base = QUALITY_PRESETS[preset] || fallback;
  return {
    preset,
    effectsDensity: INTENSITIES.has(source.effectsDensity) ? source.effectsDensity : base.effectsDensity,
    shake: INTENSITIES.has(source.shake) ? source.shake : base.shake,
    hitFlashes: INTENSITIES.has(source.hitFlashes) ? source.hitFlashes : base.hitFlashes,
    healthBars: HEALTH_BARS.has(source.healthBars) ? source.healthBars : base.healthBars,
    reducedMotion: typeof source.reducedMotion === "boolean" ? source.reducedMotion : Boolean(systemReducedMotion || base.reducedMotion),
    flashIntensity: INTENSITIES.has(source.flashIntensity) ? source.flashIntensity : base.flashIntensity,
  };
}

export function settingsForPreset(preset, systemReducedMotion = false) {
  const source = QUALITY_PRESETS[preset] || QUALITY_PRESETS.auto;
  return { ...source, reducedMotion: Boolean(source.reducedMotion || systemReducedMotion) };
}

export function loadQualitySettings(storage = globalThis.localStorage, systemReducedMotion = false) {
  try {
    const parsed = JSON.parse(storage?.getItem(QUALITY_STORAGE_KEY) || "null");
    return normalizeQualitySettings(parsed, systemReducedMotion);
  } catch {
    return settingsForPreset("auto", systemReducedMotion);
  }
}

export function saveQualitySettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizeQualitySettings(settings);
  try { storage?.setItem(QUALITY_STORAGE_KEY, JSON.stringify({ version: QUALITY_SETTINGS_VERSION, ...normalized })); } catch { /* Storage is optional. */ }
  return normalized;
}

export function resolveQualityProfile(settings, effectiveTier = null) {
  const normalized = normalizeQualitySettings(settings);
  const tier = effectiveTier || (normalized.preset === "minimal" ? "minimal" : normalized.preset === "reduced" ? "reduced" : "high");
  return {
    ...RENDER_PROFILES[tier],
    effectsDensity: INTENSITY_VALUES[normalized.effectsDensity],
    shake: INTENSITY_VALUES[normalized.shake],
    hitFlashes: INTENSITY_VALUES[normalized.hitFlashes],
    healthBars: normalized.healthBars,
    reducedMotion: normalized.reducedMotion,
    flashIntensity: INTENSITY_VALUES[normalized.flashIntensity],
  };
}

export class AdaptiveQualityController {
  constructor(settings = QUALITY_PRESETS.auto) {
    this.settings = normalizeQualitySettings(settings);
    this.tier = this.settings.preset === "minimal" ? "minimal" : this.settings.preset === "reduced" ? "reduced" : "high";
    this.ema = 16.7;
    this.slowSamples = 0;
    this.fastSamples = 0;
    this.cooldown = 0;
  }

  setSettings(settings) {
    this.settings = normalizeQualitySettings(settings);
    if (this.settings.preset !== "auto") this.tier = this.settings.preset === "minimal" ? "minimal" : this.settings.preset === "reduced" ? "reduced" : "high";
    this.slowSamples = 0; this.fastSamples = 0; this.cooldown = 180;
    return this.profile();
  }

  sample(frameMilliseconds) {
    if (!Number.isFinite(frameMilliseconds) || frameMilliseconds <= 0) return this.profile();
    this.ema += (Math.min(100, frameMilliseconds) - this.ema) * 0.035;
    if (this.cooldown > 0) this.cooldown -= 1;
    if (this.settings.preset !== "auto" || this.cooldown > 0) return this.profile();

    if (this.ema > 22) { this.slowSamples += 1; this.fastSamples = 0; }
    else if (this.ema < 15.5) { this.fastSamples += 1; this.slowSamples = 0; }
    else { this.slowSamples = Math.max(0, this.slowSamples - 2); this.fastSamples = Math.max(0, this.fastSamples - 2); }

    if (this.slowSamples >= 150 && this.tier !== "minimal") {
      this.tier = this.tier === "high" ? "reduced" : "minimal";
      this.slowSamples = 0; this.cooldown = 300;
    } else if (this.fastSamples >= 600 && this.tier !== "high") {
      this.tier = this.tier === "minimal" ? "reduced" : "high";
      this.fastSamples = 0; this.cooldown = 600;
    }
    return this.profile();
  }

  profile() { return resolveQualityProfile(this.settings, this.tier); }
  status() { return { preset: this.settings.preset, tier: this.tier, frameMilliseconds: Math.round(this.ema * 10) / 10 }; }
}
