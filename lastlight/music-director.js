export const MUSIC_DIRECTOR_SCHEMA = "lastlight.music-director.v1";
export const MUSIC_CROSSFADE_SECONDS = 3.2;

const music = (file, gain, { loop = true } = {}) => Object.freeze({
  file: `./assets/audio/music/${file}`,
  gain,
  loop,
});

export const MUSIC_TRACKS = Object.freeze({
  home: music("home-airy.ogg", .6),
  containment: music("combat-sector.ogg", .62),
  pressure: music("combat-pulse.ogg", .66),
  breach: music("combat-urgent.ogg", .72),
  apex: music("apex-space-boss.ogg", .76),
  victory: music("victory.ogg", .72, { loop: false }),
});

export function musicStateForGame(screen, game) {
  if (screen === "home" || screen === "lobby") return "home";
  if (screen === "result") return game?.stage === "won" ? "victory" : null;
  if (screen !== "game" || !game) return null;
  if (game.stage === "boss") return "apex";
  if (!["running", "paused"].includes(game.stage) && !game.paused) return null;
  const wave = Math.max(0, Math.min(7, Math.floor(Number(game.wave) || 0)));
  if (wave <= 1) return "containment";
  if (wave <= 4) return "pressure";
  return "breach";
}

export class AdaptiveMusicDirector {
  constructor(context, destination, {
    createAudio = () => new Audio(),
    resolveUrl = (file) => new URL(file, import.meta.url).href,
    crossfadeSeconds = MUSIC_CROSSFADE_SECONDS,
  } = {}) {
    if (!context?.createGain || !context?.createMediaElementSource || !destination) throw new TypeError("AdaptiveMusicDirector requires Web Audio media routing");
    this.context = context;
    this.destination = destination;
    this.createAudio = createAudio;
    this.resolveUrl = resolveUrl;
    this.crossfadeSeconds = Math.max(.2, Number(crossfadeSeconds) || MUSIC_CROSSFADE_SECONDS);
    this.output = context.createGain();
    this.output.gain.value = 1;
    this.output.connect(destination);
    this.channels = [];
    this.activeIndex = -1;
    this.state = null;
    this.paused = false;
    this.lastError = "";
    this.transitions = 0;
  }

  channel(index) {
    if (this.channels[index]) return this.channels[index];
    const element = this.createAudio();
    element.preload = "metadata";
    element.crossOrigin = "anonymous";
    const source = this.context.createMediaElementSource(element);
    const gain = this.context.createGain();
    gain.gain.value = .0001;
    source.connect(gain).connect(this.output);
    const channel = { element, source, gain, state: null };
    this.channels[index] = channel;
    return channel;
  }

  async transition(nextState, { immediate = false } = {}) {
    if (nextState === this.state) return true;
    const descriptor = nextState ? MUSIC_TRACKS[nextState] : null;
    if (nextState && !descriptor) throw new RangeError(`Unknown music state: ${nextState}`);
    const now = this.context.currentTime, duration = immediate ? .08 : this.crossfadeSeconds;
    const outgoing = this.activeIndex >= 0 ? this.channels[this.activeIndex] : null;
    if (outgoing) {
      outgoing.gain.gain.cancelScheduledValues?.(now);
      outgoing.gain.gain.setValueAtTime?.(Math.max(.0001, outgoing.gain.gain.value), now);
      outgoing.gain.gain.linearRampToValueAtTime?.(.0001, now + duration);
      setTimeout(() => {
        if (outgoing !== this.channels[this.activeIndex]) outgoing.element.pause?.();
      }, (duration + .08) * 1000);
    }
    this.state = nextState;
    this.transitions += 1;
    if (!descriptor) {
      this.activeIndex = -1;
      return true;
    }
    const nextIndex = this.activeIndex === 0 ? 1 : 0;
    const incoming = this.channel(nextIndex);
    if (incoming.state !== nextState) {
      incoming.element.pause?.();
      incoming.element.src = this.resolveUrl(descriptor.file);
      incoming.element.loop = descriptor.loop;
      incoming.element.currentTime = 0;
      incoming.state = nextState;
    }
    incoming.gain.gain.cancelScheduledValues?.(now);
    incoming.gain.gain.setValueAtTime?.(.0001, now);
    incoming.gain.gain.linearRampToValueAtTime?.(descriptor.gain, now + duration);
    this.activeIndex = nextIndex;
    try {
      await incoming.element.play();
      this.lastError = "";
      return true;
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 200);
      return false;
    }
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    const now = this.context.currentTime, target = this.paused ? .36 : 1;
    this.output.gain.cancelScheduledValues?.(now);
    this.output.gain.setTargetAtTime?.(target, now, this.paused ? .08 : .2);
  }

  diagnostics() {
    return {
      schema: MUSIC_DIRECTOR_SCHEMA,
      state: this.state,
      paused: this.paused,
      transitions: this.transitions,
      activeChannel: this.activeIndex,
      lastError: this.lastError || null,
    };
  }

  dispose() {
    for (const channel of this.channels) {
      if (!channel) continue;
      channel.element.pause?.();
      channel.source.disconnect?.();
      channel.gain.disconnect?.();
    }
    this.output.disconnect?.();
    this.channels = [];
    this.activeIndex = -1;
  }
}
