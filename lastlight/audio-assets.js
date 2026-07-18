export const AUDIO_ASSET_SCHEMA = "lastlight.audio-assets.v1";
export const AUDIO_ASSET_VERSION = 1;
export const AUDIO_ASSET_BASE = "./assets/audio/";

const sample = (files, gain, {
  toneGain = 0.34,
  loop = false,
  sampleOnly = false,
} = {}) => Object.freeze({
  files: Object.freeze(files.map((file) => `${AUDIO_ASSET_BASE}${file}`)),
  gain,
  toneGain,
  loop,
  sampleOnly,
});

const samples = Object.freeze({
  ui: sample(["sfx/ui/select-01.ogg", "sfx/ui/select-02.ogg"], .34, { toneGain: .22 }),
  select: sample(["sfx/ui/select-01.ogg", "sfx/ui/select-02.ogg"], .42, { toneGain: .2 }),
  test: sample(["sfx/ui/confirm-01.ogg"], .48, { toneGain: .45 }),
  reward: sample(["sfx/ui/confirm-01.ogg", "sfx/ui/confirm-02.ogg"], .46, { toneGain: .28 }),
  level: sample(["sfx/ui/confirm-02.ogg", "sfx/ui/pickup-01.ogg"], .48, { toneGain: .32 }),
  xp: sample(["sfx/ui/pickup-01.ogg", "sfx/ui/pickup-02.ogg"], .2, { toneGain: .18 }),
  danger: sample(["sfx/ui/error-01.ogg", "sfx/world/low-impact-01.ogg"], .46, { toneGain: .5 }),
  objective: sample(["sfx/ui/confirm-02.ogg", "sfx/world/forcefield-01.ogg"], .42, { toneGain: .34 }),
  deploy: sample(["sfx/world/machinery-loop.ogg", "sfx/ui/confirm-01.ogg"], .36, { toneGain: .4 }),
  ability: sample(["sfx/world/forcefield-01.ogg", "sfx/world/forcefield-02.ogg"], .38, { toneGain: .38 }),
  ultimate: sample(["sfx/world/explosion-01.ogg", "sfx/world/explosion-02.ogg"], .58, { toneGain: .48 }),
  hurt: sample(["sfx/impacts/organic-01.ogg", "sfx/impacts/organic-02.ogg"], .52, { toneGain: .38 }),
  kill: sample(["sfx/impacts/organic-02.ogg", "sfx/impacts/metal-light-01.ogg"], .32, { toneGain: .24 }),
  "impact-heavy": sample(["sfx/impacts/metal-heavy-01.ogg", "sfx/impacts/concrete-01.ogg"], .44, { toneGain: .3 }),
  "impact-critical": sample(["sfx/impacts/metal-heavy-02.ogg", "sfx/world/low-impact-01.ogg"], .52, { toneGain: .4 }),
  victory: sample(["sfx/ui/confirm-01.ogg"], .3, { toneGain: .3 }),
  defeat: sample(["sfx/world/low-impact-01.ogg"], .46, { toneGain: .5 }),
  "material:metal": sample(["sfx/impacts/metal-light-01.ogg", "sfx/impacts/metal-light-02.ogg"], .34, { toneGain: .22 }),
  "material:concrete": sample(["sfx/impacts/concrete-01.ogg", "sfx/impacts/concrete-02.ogg"], .38, { toneGain: .25 }),
  "material:organic": sample(["sfx/impacts/organic-01.ogg", "sfx/impacts/organic-02.ogg"], .36, { toneGain: .24 }),
  "material:liquid": sample(["sfx/world/organic-projectile-01.ogg"], .3, { toneGain: .3 }),
  "material:energy": sample(["sfx/world/forcefield-01.ogg", "sfx/world/forcefield-02.ogg"], .34, { toneGain: .28 }),
  "material:void": sample(["sfx/world/low-impact-01.ogg"], .4, { toneGain: .34 }),
  "weapon:pulse": sample(["sfx/weapons/pulse-01.ogg", "sfx/weapons/pulse-02.ogg", "sfx/weapons/pulse-03.ogg"], .27, { toneGain: .25 }),
  "weapon:heavy": sample(["sfx/weapons/heavy-01.ogg", "sfx/weapons/heavy-02.ogg"], .4, { toneGain: .34 }),
  "weapon:blade": sample(["sfx/impacts/metal-light-01.ogg", "sfx/impacts/metal-light-02.ogg"], .3, { toneGain: .3 }),
  "weapon:energy": sample(["sfx/world/forcefield-01.ogg", "sfx/weapons/pulse-03.ogg"], .32, { toneGain: .3 }),
  "enemy:melee": sample(["sfx/impacts/organic-01.ogg", "sfx/impacts/organic-02.ogg"], .36, { toneGain: .32 }),
  "enemy:heavy": sample(["sfx/impacts/organic-01.ogg", "sfx/impacts/concrete-01.ogg"], .46, { toneGain: .38 }),
  "enemy:spitter": sample(["sfx/world/organic-projectile-01.ogg", "sfx/weapons/pulse-02.ogg"], .34, { toneGain: .32 }),
  "enemy:bomber": sample(["sfx/world/explosion-01.ogg", "sfx/world/explosion-02.ogg"], .5, { toneGain: .4 }),
  "enemy:apex": sample(["sfx/world/low-impact-01.ogg", "sfx/world/explosion-02.ogg"], .58, { toneGain: .48 }),
  "world:heal": sample(["sfx/world/forcefield-01.ogg", "sfx/ui/confirm-02.ogg"], .46, { toneGain: .28 }),
  "world:cannon": sample(["sfx/weapons/heavy-02.ogg", "sfx/world/explosion-02.ogg"], .56, { toneGain: .38 }),
  "world:freeze": sample(["sfx/impacts/glass-01.ogg", "sfx/impacts/glass-02.ogg"], .48, { toneGain: .28 }),
  "world:warning": sample(["sfx/ui/error-01.ogg"], .34, { toneGain: .4 }),
  "world:freight-active": sample(["sfx/impacts/metal-heavy-01.ogg"], .36, { toneGain: .24 }),
  "world:ion-active": sample(["sfx/world/explosion-02.ogg"], .58, { toneGain: .42 }),
  "world:cryo-active": sample(["sfx/impacts/glass-01.ogg"], .4, { toneGain: .28 }),
  "world:undertow-active": sample(["sfx/world/low-impact-01.ogg"], .48, { toneGain: .32 }),
  "world:freight-loop": sample(["sfx/world/machinery-loop.ogg"], .24, { toneGain: 0, loop: true, sampleOnly: true }),
  "world:cryo-loop": sample(["sfx/world/cryo-loop.ogg"], .16, { toneGain: 0, loop: true, sampleOnly: true }),
  "world:undertow-loop": sample(["sfx/world/undertow-loop.ogg"], .2, { toneGain: 0, loop: true, sampleOnly: true }),
});

const heavyWeaponTokens = Object.freeze(["heavy", "bront", "transit", "rail", "annihilator", "industrial"]);
const bladeWeaponTokens = Object.freeze(["blade", "fang", "slicers", "boomerang", "crossbow", "ballistic"]);
const energyWeaponTokens = Object.freeze(["solar", "aura", "ice", "crystal", "arcane", "nova", "resonance"]);

export const AUDIO_PRELOAD_CUES = Object.freeze([
  "ui", "select", "test", "reward", "xp", "danger", "objective", "hurt", "kill",
  "impact-heavy", "material:metal", "material:concrete", "material:organic",
  "weapon:pulse", "weapon:heavy", "weapon:blade", "weapon:energy",
  "enemy:melee", "enemy:spitter", "enemy:bomber", "enemy:apex",
  "world:heal", "world:cannon", "world:freeze", "world:warning",
  "world:freight-loop", "world:cryo-loop", "world:undertow-loop",
]);

function weaponSampleKey(name) {
  const id = String(name).slice(7);
  if (heavyWeaponTokens.some((token) => id.includes(token))) return "weapon:heavy";
  if (bladeWeaponTokens.some((token) => id.includes(token))) return "weapon:blade";
  if (energyWeaponTokens.some((token) => id.includes(token))) return "weapon:energy";
  return "weapon:pulse";
}

export function sampleCueDescriptor(name) {
  const cue = String(name || "ui");
  if (samples[cue]) return samples[cue];
  if (cue.startsWith("weapon:")) return samples[weaponSampleKey(cue)];
  if (cue.startsWith("material:")) return samples["material:concrete"];
  if (cue.startsWith("enemy:")) return samples["enemy:melee"];
  return null;
}

export function sampleVariantIndex(name, sequence, length) {
  const count = Math.max(1, Math.floor(Number(length) || 1));
  let hash = 0x811c9dc5;
  for (const character of `${name}:${Math.max(0, Number(sequence) || 0)}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % count;
}

export class DecodedSampleBank {
  constructor(context, {
    fetcher = globalThis.fetch?.bind(globalThis),
    resolveUrl = (file) => new URL(file, import.meta.url).href,
  } = {}) {
    if (!context?.createBufferSource || !context?.createGain || !fetcher) throw new TypeError("DecodedSampleBank requires Web Audio and fetch");
    this.context = context;
    this.fetcher = fetcher;
    this.resolveUrl = resolveUrl;
    this.buffers = new Map();
    this.pending = new Map();
    this.failed = new Set();
    this.loops = new Map();
    this.active = 0;
    this.peak = 0;
    this.played = 0;
  }

  async load(file) {
    if (this.buffers.has(file)) return this.buffers.get(file);
    if (this.pending.has(file)) return this.pending.get(file);
    const promise = (async () => {
      try {
        const response = await this.fetcher(this.resolveUrl(file));
        if (!response.ok) throw new Error(`Audio asset returned ${response.status}`);
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(file, buffer);
        this.failed.delete(file);
        return buffer;
      } catch {
        this.failed.add(file);
        return null;
      } finally {
        this.pending.delete(file);
      }
    })();
    this.pending.set(file, promise);
    return promise;
  }

  preload(cues = AUDIO_PRELOAD_CUES) {
    const files = new Set();
    for (const name of cues) for (const file of sampleCueDescriptor(name)?.files || []) files.add(file);
    return Promise.allSettled([...files].map((file) => this.load(file)));
  }

  playCue(name, {
    destination = this.context.destination,
    pan = 0,
    variation = { pitch: 1, gain: 1 },
    sequence = 0,
  } = {}) {
    const descriptor = sampleCueDescriptor(name);
    if (!descriptor) return false;
    const file = descriptor.files[sampleVariantIndex(name, sequence, descriptor.files.length)];
    const buffer = this.buffers.get(file);
    if (!buffer) {
      if (!this.failed.has(file)) this.load(file);
      return false;
    }
    const source = this.context.createBufferSource(), gain = this.context.createGain(), panner = this.context.createStereoPanner?.();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(.82, Math.min(1.18, Number(variation.pitch) || 1));
    gain.gain.value = descriptor.gain * Math.max(.7, Math.min(1.1, Number(variation.gain) || 1));
    if (descriptor.loop) source.loop = true;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
      source.connect(gain).connect(panner).connect(destination);
    } else source.connect(gain).connect(destination);
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    this.played += 1;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.active = Math.max(0, this.active - 1);
      source.disconnect?.();
      gain.disconnect?.();
      panner?.disconnect?.();
    };
    source.addEventListener?.("ended", cleanup, { once: true });
    source.start();
    return { source, gain, cleanup, descriptor, file };
  }

  startLoop(id, name, options = {}) {
    if (this.loops.has(id)) return true;
    const playback = this.playCue(name, options);
    if (!playback) return false;
    this.loops.set(id, playback);
    return true;
  }

  stopLoop(id, fadeSeconds = .18) {
    const playback = this.loops.get(id);
    if (!playback) return false;
    this.loops.delete(id);
    const now = this.context.currentTime, fade = Math.max(.02, Number(fadeSeconds) || .18);
    playback.gain.gain.cancelScheduledValues?.(now);
    playback.gain.gain.setValueAtTime?.(Math.max(.0001, playback.gain.gain.value), now);
    playback.gain.gain.exponentialRampToValueAtTime?.(.0001, now + fade);
    try { playback.source.stop(now + fade + .02); } catch { playback.cleanup(); }
    return true;
  }

  stopAllLoops() {
    for (const id of [...this.loops.keys()]) this.stopLoop(id, .04);
  }

  diagnostics() {
    return {
      schema: AUDIO_ASSET_SCHEMA,
      version: AUDIO_ASSET_VERSION,
      loaded: this.buffers.size,
      pending: this.pending.size,
      failed: this.failed.size,
      active: this.active,
      peak: this.peak,
      played: this.played,
      loops: [...this.loops.keys()],
    };
  }

  dispose() {
    this.stopAllLoops();
    this.buffers.clear();
    this.pending.clear();
  }
}
