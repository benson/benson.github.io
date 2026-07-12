export const AUDIO_MIX_SCHEMA = "lastlight.audio-mix.v1";
export const AUDIO_DENSITIES = Object.freeze({ full: 1, balanced: .72, low: .42, off: .2 });

const policy = (category, bus, priority, cap, duration, duck = 1) => Object.freeze({ category, bus, priority, cap, duration, duck });

export const AUDIO_POLICIES = Object.freeze({
  ambient: policy("ambient", "low", 0, 1, 1.2),
  pickup: policy("pickup", "low", 1, 3, .09),
  weapon: policy("weapon", "combat", 1, 6, .18),
  impact: policy("impact", "combat", 2, 5, .22),
  ui: policy("ui", "ui", 2, 3, .24),
  ability: policy("ability", "combat", 3, 3, .4, .72),
  damage: policy("damage", "critical", 4, 2, .34, .52),
  objective: policy("objective", "critical", 4, 2, .58, .46),
  danger: policy("danger", "critical", 5, 2, .62, .38),
  ultimate: policy("ultimate", "critical", 5, 2, .78, .32),
  victory: policy("victory", "critical", 5, 1, .92, .26),
});

const EXACT_CATEGORIES = Object.freeze({
  xp: "pickup", shot: "weapon", kill: "impact", select: "ui", ui: "ui", deploy: "objective",
  ability: "ability", hurt: "damage", reward: "objective", level: "objective", objective: "objective",
  danger: "danger", ultimate: "ultimate", victory: "victory", defeat: "victory",
});

export function audioCuePolicy(name) {
  const cue = String(name || "ui");
  const category = cue.startsWith("weapon:") ? "weapon" : cue.startsWith("material:") ? "impact" : EXACT_CATEGORIES[cue] || "ui";
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
  constructor({ globalLimit = 18, density = "full" } = {}) {
    this.globalLimit = Math.max(4, Math.floor(Number(globalLimit) || 18));
    this.active = [];
    this.sequence = 0;
    this.accepted = 0;
    this.suppressed = 0;
    this.peak = 0;
    this.setDensity(density);
  }

  setDensity(density) {
    this.density = Object.hasOwn(AUDIO_DENSITIES, density) ? density : "full";
    this.densityScale = AUDIO_DENSITIES[this.density];
  }

  prune(now) { this.active = this.active.filter((voice) => voice.endsAt > now); }

  categoryCap(rule) {
    if (rule.priority >= 4) return rule.cap;
    return Math.max(1, Math.floor(rule.cap * this.densityScale));
  }

  request(name, nowSeconds, durationSeconds) {
    const now = Math.max(0, Number(nowSeconds) || 0), rule = audioCuePolicy(name);
    this.prune(now);
    if (this.active.filter((voice) => voice.category === rule.category).length >= this.categoryCap(rule)) {
      this.suppressed += 1; return null;
    }
    if (this.active.length >= this.globalLimit) {
      let index = -1;
      for (let cursor = 0; cursor < this.active.length; cursor++) {
        if (this.active[cursor].priority >= rule.priority) continue;
        if (index < 0 || this.active[cursor].priority < this.active[index].priority || this.active[cursor].endsAt < this.active[index].endsAt) index = cursor;
      }
      if (index < 0) { this.suppressed += 1; return null; }
      this.active.splice(index, 1);
    }
    const sequence = this.sequence++, duration = Math.max(.02, Number(durationSeconds) || rule.duration);
    const voice = { id: sequence, name: String(name), category: rule.category, priority: rule.priority, endsAt: now + duration };
    this.active.push(voice); this.accepted += 1; this.peak = Math.max(this.peak, this.active.length);
    return { ...voice, sequence, rule };
  }

  diagnostics(now = Infinity) {
    if (Number.isFinite(now)) this.prune(now);
    return { schema: AUDIO_MIX_SCHEMA, density: this.density, globalLimit: this.globalLimit, active: this.active.length, peak: this.peak, accepted: this.accepted, suppressed: this.suppressed };
  }
}

export class DynamicAudioMixer {
  constructor(context, options = {}) {
    if (!context?.createGain || !context?.destination) throw new TypeError("DynamicAudioMixer requires a Web Audio context");
    this.context = context;
    this.budget = new AudioVoiceBudget(options);
    this.baseGains = Object.freeze({ low: .7, combat: .86, critical: 1, ui: .78 });
    this.master = context.createGain(); this.master.gain.value = .82; this.master.connect(context.destination);
    this.buses = Object.fromEntries(Object.entries(this.baseGains).map(([name, gain]) => {
      const node = context.createGain(); node.gain.value = gain; node.connect(this.master); return [name, node];
    }));
  }

  setDensity(density) { this.budget.setDensity(density); }

  setMuted(muted) {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues?.(now);
    this.master.gain.setTargetAtTime(muted ? .0001 : .82, now, .025);
  }

  duck(rule, now) {
    if (rule.duck >= 1) return;
    for (const busName of ["low", "combat"]) {
      const parameter = this.buses[busName].gain, base = this.baseGains[busName], target = Math.max(.0001, base * rule.duck);
      parameter.cancelScheduledValues?.(now);
      parameter.setValueAtTime(Math.max(target, Number(parameter.value) || base), now);
      parameter.linearRampToValueAtTime(target, now + .012);
      parameter.setTargetAtTime(base, now + rule.duration, .12);
    }
  }

  requestCue(name, details = {}) {
    const now = this.context.currentTime, rule = audioCuePolicy(name);
    const allocation = this.budget.request(name, now, details.duration || rule.duration);
    if (!allocation) return null;
    this.duck(rule, now);
    return { ...allocation, destination: this.buses[rule.bus], variation: audioCueVariation(name, allocation.sequence) };
  }

  diagnostics() { return { ...this.budget.diagnostics(this.context.currentTime), buses: Object.keys(this.buses), muted: this.master.gain.value < .01 }; }

  dispose() {
    for (const bus of Object.values(this.buses)) bus.disconnect?.();
    this.master.disconnect?.(); this.budget.active = [];
  }
}
