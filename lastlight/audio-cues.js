export const AUDIO_CUE_SCHEMA = "lastlight.audio-cues.v1";
export const AUDIO_CUE_VERSION = 1;
export const AUDIO_WAVEFORMS = Object.freeze(["sine", "square", "triangle", "sawtooth"]);

const voice = (frequency, endFrequency, offset, duration, waveform, volume) => Object.freeze({ frequency, endFrequency, offset, duration, waveform, volume });
const cue = (...voices) => Object.freeze({ voices: Object.freeze(voices) });

const material = {
  metal: cue(voice(1180, 430, 0, .05, "triangle", .032)),
  concrete: cue(voice(170, 68, 0, .085, "sawtooth", .036)),
  liquid: cue(voice(760, 1280, 0, .11, "sine", .034)),
  organic: cue(voice(220, 92, 0, .075, "triangle", .035)),
  energy: cue(voice(680, 1120, 0, .08, "square", .032)),
  void: cue(voice(105, 44, 0, .15, "sawtooth", .038)),
};

const weapon = {
  pulse: cue(voice(880, 240, 0, .05, "square", .022)),
  resonance: cue(voice(520, 760, 0, .09, "sine", .025)),
  solar: cue(voice(690, 390, 0, .1, "triangle", .028)),
  heavy: cue(voice(115, 58, 0, .13, "sawtooth", .04)),
  blade: cue(voice(1250, 480, 0, .045, "triangle", .022)),
  wind: cue(voice(760, 1180, 0, .11, "sine", .024)),
  kinetic: cue(voice(210, 620, 0, .075, "square", .032)),
  arcane: cue(voice(470, 940, 0, .12, "sine", .028)),
  tech: cue(voice(960, 420, 0, .045, "square", .022)),
  ballistic: cue(voice(640, 170, 0, .055, "square", .03)),
  industrial: cue(voice(92, 42, 0, .16, "sawtooth", .042)),
  crystal: cue(voice(1320, 760, 0, .13, "sine", .025)),
  void: cue(voice(82, 260, 0, .2, "sawtooth", .038)),
};

const cues = {
  shot: cue(voice(820, 210, 0, .055, "square", .022)),
  hurt: cue(voice(145, 65, 0, .11, "sawtooth", .055), voice(72, 48, .025, .16, "square", .034)),
  kill: cue(voice(150, 80, 0, .07, "triangle", .036), voice(440, 260, .025, .06, "square", .022)),
  select: cue(voice(520, 650, 0, .08, "triangle", .042), voice(780, 900, .06, .1, "sine", .032)),
  ui: cue(voice(440, 560, 0, .08, "sine", .035)),
  deploy: cue(voice(170, 420, 0, .18, "sawtooth", .052), voice(520, 760, .1, .16, "triangle", .04)),
  ability: cue(voice(280, 680, 0, .14, "sawtooth", .052), voice(920, 460, .04, .09, "sine", .03)),
  ultimate: cue(voice(92, 180, 0, .45, "sawtooth", .07), voice(230, 860, .08, .35, "square", .048), voice(980, 420, .2, .22, "sine", .045)),
  danger: cue(voice(108, 82, 0, .22, "sawtooth", .06), voice(108, 82, .25, .22, "sawtooth", .055)),
  objective: cue(voice(320, 420, 0, .09, "triangle", .042), voice(510, 620, .08, .12, "sine", .042)),
  reward: cue(voice(440, 520, 0, .12, "triangle", .046), voice(660, 760, .09, .14, "triangle", .044), voice(920, 1040, .19, .2, "sine", .04)),
  level: cue(voice(392, 440, 0, .1, "triangle", .04), voice(587, 660, .07, .12, "triangle", .044), voice(880, 980, .16, .18, "sine", .04)),
  xp: cue(voice(980, 1320, 0, .045, "sine", .018), voice(1480, 1120, .018, .035, "triangle", .012)),
  victory: cue(...[392, 523, 659, 784, 1046].map((frequency, index) => voice(frequency, frequency * 1.05, index * .09, .28, "triangle", .045))),
  defeat: cue(voice(330, 220, 0, .22, "triangle", .05), voice(220, 147, .16, .28, "sawtooth", .046), voice(110, 73, .34, .34, "sine", .04)),
  test: cue(voice(330, 440, 0, .12, "triangle", .05), voice(554, 660, .1, .15, "triangle", .05), voice(880, 990, .22, .2, "sine", .045)),
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const LASTLIGHT_AUDIO_CUES = deepFreeze({
  schema: AUDIO_CUE_SCHEMA,
  schemaVersion: AUDIO_CUE_VERSION,
  provenance: { source: "runtime-generated", license: "project-authored", externalAssets: false },
  material,
  weapon,
  cues,
});

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

export function validateAudioCueRegistry(registry = LASTLIGHT_AUDIO_CUES) {
  const errors = [];
  if (!exactKeys(registry, ["schema", "schemaVersion", "provenance", "material", "weapon", "cues"])) return ["registry: fields mismatch"];
  if (registry.schema !== AUDIO_CUE_SCHEMA || registry.schemaVersion !== AUDIO_CUE_VERSION) errors.push("registry: schema mismatch");
  if (!exactKeys(registry.provenance, ["source", "license", "externalAssets"]) || registry.provenance.source !== "runtime-generated" || registry.provenance.license !== "project-authored" || registry.provenance.externalAssets !== false) errors.push("provenance: unsupported");
  const validateGroup = (name, group) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) { errors.push(`${name}: required`); return; }
    for (const [id, entry] of Object.entries(group)) {
      const path = `${name}.${id}`;
      if (!exactKeys(entry, ["voices"]) || !Array.isArray(entry.voices) || !entry.voices.length) { errors.push(`${path}: voices required`); continue; }
      for (const [index, item] of entry.voices.entries()) {
        if (!exactKeys(item, ["frequency", "endFrequency", "offset", "duration", "waveform", "volume"])) { errors.push(`${path}.voices.${index}: fields mismatch`); continue; }
        for (const key of ["frequency", "endFrequency", "offset", "duration", "volume"]) if (!Number.isFinite(item[key])) errors.push(`${path}.voices.${index}.${key}: must be finite`);
        if (item.frequency < 20 || item.endFrequency < 20 || item.offset < 0 || item.duration < .02 || item.duration > 1 || item.volume < .005 || item.volume > .08) errors.push(`${path}.voices.${index}: calibration out of bounds`);
        if (!AUDIO_WAVEFORMS.includes(item.waveform)) errors.push(`${path}.voices.${index}.waveform: unsupported`);
      }
    }
  };
  validateGroup("material", registry.material);
  validateGroup("weapon", registry.weapon);
  validateGroup("cues", registry.cues);
  for (const required of ["ui", "test", "hurt", "danger", "ultimate", "victory"]) if (!registry.cues?.[required]) errors.push(`cues.${required}: required`);
  return errors;
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function resolveAudioCue(name, details = {}, registry = LASTLIGHT_AUDIO_CUES) {
  const cueName = String(name || "ui");
  let entry = registry.cues[cueName] || registry.cues.ui;
  let pitch = 1, volume = 1;
  if (cueName.startsWith("material:")) {
    entry = registry.material[cueName.slice(9)] || registry.material.concrete;
    const requestedPitch = Number(details.pitch), requestedVolume = Number(details.volume);
    pitch = clamp(Number.isFinite(requestedPitch) ? requestedPitch : 1, .5, 1.5);
    volume = clamp(Number.isFinite(requestedVolume) ? requestedVolume : .6, 0, .8);
  } else if (cueName.startsWith("weapon:")) entry = registry.weapon[cueName.slice(7)] || registry.weapon.pulse;
  return Object.freeze({
    name: cueName,
    voices: Object.freeze(entry.voices.map((item) => Object.freeze({
      ...item,
      frequency: item.frequency * pitch,
      endFrequency: item.endFrequency * pitch,
      volume: item.volume * volume,
    }))),
  });
}
