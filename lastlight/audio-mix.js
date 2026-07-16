export const AUDIO_MIX_SCHEMA = "lastlight.audio-mix.v1";
export const AUDIO_DENSITIES = Object.freeze({ full: 1, balanced: .72, low: .42, off: .2 });
export const AUDIO_HEADROOM_TARGET_DB = -3;
export const AUDIO_OUTPUT_CEILING_GAIN = 10 ** (AUDIO_HEADROOM_TARGET_DB / 20);
export const AUDIO_MASTER_CALIBRATION = 1.08;
export const AUDIO_OSCILLATOR_LIMIT = 42;
export const AUDIO_CRITICAL_OSCILLATOR_RESERVE = 12;
export const AUDIO_CRITICAL_ALLOCATION_RESERVE = 4;
export const AUDIO_LIMITER_SETTINGS = Object.freeze({ threshold: -8, knee: 6, ratio: 20, attack: .003, release: .18 });
export const AUDIO_SOFT_CLIP_CURVE_SIZE = 2048;

export function audioSoftClipCurve(size = AUDIO_SOFT_CLIP_CURVE_SIZE) {
  const length = Math.max(32, Math.floor(Number(size) || AUDIO_SOFT_CLIP_CURVE_SIZE)), curve = new Float32Array(length);
  const normalization = Math.tanh(2);
  for (let index = 0; index < length; index++) curve[index] = Math.tanh(((index / (length - 1)) * 2 - 1) * 2) / normalization;
  return curve;
}

const policy = (category, bus, priority, cap, duration, duck = 1) => Object.freeze({ category, bus, priority, cap, duration, duck });

export const AUDIO_POLICIES = Object.freeze({
  ambient: policy("ambient", "low", 0, 1, 1.2),
  pickup: policy("pickup", "low", 1, 3, .09),
  weapon: policy("weapon", "combat", 1, 6, .18),
  impact: policy("impact", "combat", 2, 5, .22),
  ui: policy("ui", "ui", 2, 3, .24),
  test: policy("test", "ui", 4, 1, .24),
  ability: policy("ability", "combat", 3, 3, .4, .72),
  damage: policy("damage", "critical", 4, 2, .34, .52),
  hostile: policy("hostile", "critical", 4, 3, .34, .48),
  apex: policy("apex", "critical", 5, 2, .62, .3),
  objective: policy("objective", "critical", 4, 2, .58, .46),
  danger: policy("danger", "critical", 5, 2, .62, .38),
  ultimate: policy("ultimate", "critical", 5, 2, .78, .32),
  victory: policy("victory", "critical", 5, 1, .92, .26),
});

const EXACT_CATEGORIES = Object.freeze({
  xp: "pickup", shot: "weapon", kill: "impact", select: "ui", ui: "ui", test: "test", deploy: "objective",
  "impact-heavy": "impact", "impact-critical": "damage",
  ability: "ability", hurt: "damage", reward: "objective", level: "objective", objective: "objective",
  danger: "danger", ultimate: "ultimate", victory: "victory", defeat: "victory",
});

export function audioCuePolicy(name) {
  const cue = String(name || "ui");
  const category = cue.startsWith("weapon:") ? "weapon"
    : cue.startsWith("material:") ? "impact"
      : cue === "enemy:apex" ? "apex"
        : cue.startsWith("enemy:") ? "hostile"
          : EXACT_CATEGORIES[cue] || "ui";
  return AUDIO_POLICIES[category];
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

export function audioCueVariation(name, sequence) {
  const hash = stableHash(`${name}:${Math.max(0, Number(sequence) || 0)}`);
  return Object.freeze({
    pitch: .965 + (hash & 255) / 255 * .07,
    gain: .9 + ((hash >>> 8) & 255) / 255 * .1,
  });
}

export class AudioVoiceBudget {
  constructor({ globalLimit = 18, oscillatorLimit = AUDIO_OSCILLATOR_LIMIT, density = "full" } = {}) {
    this.globalLimit = Math.max(4, Math.floor(Number(globalLimit) || 18));
    this.oscillatorLimit = Math.max(8, Math.floor(Number(oscillatorLimit) || AUDIO_OSCILLATOR_LIMIT));
    this.active = [];
    this.sequence = 0;
    this.accepted = 0;
    this.suppressed = 0;
    this.peak = 0;
    this.peakOscillators = 0;
    this.setDensity(density);
  }

  setDensity(density) {
    this.density = Object.hasOwn(AUDIO_DENSITIES, density) ? density : "full";
    this.densityScale = AUDIO_DENSITIES[this.density];
  }

  prune(now) { this.active = this.active.filter((voice) => voice.endsAt > now); }

  categoryCap(rule) {
    if (rule.priority >= 4) return rule.cap;
    if (this.density === "off") return 0;
    return Math.max(1, Math.floor(rule.cap * this.densityScale));
  }

  activeOscillators() { return this.active.reduce((sum, voice) => sum + voice.oscillatorCount, 0); }

  request(name, nowSeconds, durationSeconds, oscillatorCount = 1) {
    const now = Math.max(0, Number(nowSeconds) || 0), rule = audioCuePolicy(name);
    const requestedOscillators = Math.max(1, Math.min(8, Math.floor(Number(oscillatorCount) || 1)));
    this.prune(now);
    if (this.active.filter((voice) => voice.category === rule.category).length >= this.categoryCap(rule)) {
      this.suppressed += 1; return null;
    }
    const allocationLimit = rule.priority >= 4 ? this.globalLimit : Math.max(1, this.globalLimit - AUDIO_CRITICAL_ALLOCATION_RESERVE);
    const oscillatorLimit = rule.priority >= 4 ? this.oscillatorLimit : Math.max(1, this.oscillatorLimit - AUDIO_CRITICAL_OSCILLATOR_RESERVE);
    if (this.active.length >= allocationLimit || this.activeOscillators() + requestedOscillators > oscillatorLimit) { this.suppressed += 1; return null; }
    const sequence = this.sequence++, duration = Math.max(.02, Number(durationSeconds) || rule.duration);
    const voice = { id: sequence, name: String(name), category: rule.category, priority: rule.priority, oscillatorCount: requestedOscillators, endsAt: now + duration };
    this.active.push(voice); this.accepted += 1; this.peak = Math.max(this.peak, this.active.length); this.peakOscillators = Math.max(this.peakOscillators, this.activeOscillators());
    return { ...voice, sequence, rule };
  }

  diagnostics(now = Infinity) {
    if (Number.isFinite(now)) this.prune(now);
    return { schema: AUDIO_MIX_SCHEMA, density: this.density, globalLimit: this.globalLimit, oscillatorLimit: this.oscillatorLimit, criticalAllocationReserve: AUDIO_CRITICAL_ALLOCATION_RESERVE, criticalOscillatorReserve: AUDIO_CRITICAL_OSCILLATOR_RESERVE, active: this.active.length, activeOscillators: this.activeOscillators(), peak: this.peak, peakOscillators: this.peakOscillators, accepted: this.accepted, suppressed: this.suppressed };
  }
}

export class DynamicAudioMixer {
  constructor(context, options = {}) {
    if (!context?.createGain || !context?.destination) throw new TypeError("DynamicAudioMixer requires a Web Audio context");
    this.context = context;
    this.budget = new AudioVoiceBudget(options);
    this.baseGains = Object.freeze({ low: .7, combat: .86, critical: 1, ui: .78 });
    this.volumes = { master: 1, effects: 1 };
    this.muted = Boolean(options.muted);
    this.master = context.createGain(); this.master.gain.value = this.muted ? .0001 : AUDIO_MASTER_CALIBRATION;
    this.compressor = context.createDynamicsCompressor?.() || null;
    this.saturator = context.createWaveShaper?.() || null;
    this.ceiling = context.createGain(); this.ceiling.gain.value = AUDIO_OUTPUT_CEILING_GAIN;
    if (this.saturator) { this.saturator.curve = audioSoftClipCurve(); this.saturator.oversample = "4x"; }
    if (this.compressor) {
      for (const [key, value] of Object.entries(AUDIO_LIMITER_SETTINGS)) if (this.compressor[key]) this.compressor[key].value = value;
      this.master.connect(this.compressor);
      if (this.saturator) this.compressor.connect(this.saturator); else this.compressor.connect(this.ceiling);
    } else if (this.saturator) this.master.connect(this.saturator); else this.master.connect(this.ceiling);
    this.saturator?.connect(this.ceiling);
    this.ceiling.connect(context.destination);
    this.buses = Object.fromEntries(Object.entries(this.baseGains).map(([name, gain]) => {
      const node = context.createGain(); node.gain.value = gain; node.connect(this.master); return [name, node];
    }));
    this.setVolumes({ master: options.masterVolume, effects: options.effectsVolume }, false);
  }

  setDensity(density) { this.budget.setDensity(density); }

  effectiveBusGain(name) { return this.baseGains[name] * this.volumes.effects; }

  setVolumes({ master, effects } = {}, smooth = true) {
    const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
    this.volumes.master = clamp(master, this.volumes.master);
    this.volumes.effects = clamp(effects, this.volumes.effects);
    const now = this.context.currentTime, masterTarget = this.muted ? .0001 : Math.max(.0001, AUDIO_MASTER_CALIBRATION * this.volumes.master);
    this.master.gain.cancelScheduledValues?.(now);
    if (smooth) this.master.gain.setTargetAtTime(masterTarget, now, .025); else this.master.gain.value = masterTarget;
    for (const [name, bus] of Object.entries(this.buses)) {
      const target = Math.max(.0001, this.effectiveBusGain(name));
      bus.gain.cancelScheduledValues?.(now);
      if (smooth) bus.gain.setTargetAtTime(target, now, .025); else bus.gain.value = target;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues?.(now);
    this.master.gain.setTargetAtTime(this.muted ? .0001 : Math.max(.0001, AUDIO_MASTER_CALIBRATION * this.volumes.master), now, .025);
  }

  duck(rule, now) {
    if (rule.duck >= 1) return;
    for (const busName of ["low", "combat"]) {
      const parameter = this.buses[busName].gain, base = this.effectiveBusGain(busName), target = Math.max(.0001, base * rule.duck);
      parameter.cancelScheduledValues?.(now);
      parameter.setValueAtTime(Math.max(target, Number(parameter.value) || base), now);
      parameter.linearRampToValueAtTime(target, now + .012);
      parameter.setTargetAtTime(base, now + rule.duration, .12);
    }
  }

  requestCue(name, details = {}) {
    const now = this.context.currentTime, rule = audioCuePolicy(name);
    const allocation = this.budget.request(name, now, details.duration || rule.duration, details.voiceCount || 1);
    if (!allocation) return null;
    this.duck(rule, now);
    return { ...allocation, destination: this.buses[rule.bus], pan: Math.max(-1, Math.min(1, Number(details.pan) || 0)), variation: audioCueVariation(name, allocation.sequence) };
  }

  diagnostics() { return { ...this.budget.diagnostics(this.context.currentTime), buses: Object.keys(this.buses), muted: this.muted, volumes: { ...this.volumes }, masterCalibration: AUDIO_MASTER_CALIBRATION, headroomTargetDb: AUDIO_HEADROOM_TARGET_DB, outputCeilingGain: AUDIO_OUTPUT_CEILING_GAIN, limiter: this.compressor ? { ...AUDIO_LIMITER_SETTINGS, softClip: Boolean(this.saturator), oversample: this.saturator?.oversample || null } : null }; }

  dispose() {
    for (const bus of Object.values(this.buses)) bus.disconnect?.();
    this.master.disconnect?.(); this.compressor?.disconnect?.(); this.saturator?.disconnect?.(); this.ceiling.disconnect?.(); this.budget.active = [];
  }
}
