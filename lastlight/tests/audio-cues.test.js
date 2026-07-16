import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUDIO_CUE_MAX_VOICES, AUDIO_CUE_PEAK_LIMIT, AUDIO_CUE_SCHEMA, AUDIO_HEADROOM_TARGET_DB, LASTLIGHT_AUDIO_CUES, audioCueEnvelopeDuration, resolveAudioCue, validateAudioCueRegistry } from "../audio-cues.js";

const signatures = ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"];
const universals = ["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"];

test("default cue registry is strict, complete, calibrated, and runtime-generated", () => {
  assert.equal(LASTLIGHT_AUDIO_CUES.schema, AUDIO_CUE_SCHEMA);
  assert.deepEqual(validateAudioCueRegistry(), []);
  assert.deepEqual(LASTLIGHT_AUDIO_CUES.provenance, { source: "runtime-generated", license: "project-authored", externalAssets: false });
  assert.equal(Object.keys(LASTLIGHT_AUDIO_CUES.material).length, 6);
  assert.equal(Object.keys(LASTLIGHT_AUDIO_CUES.weapon).length, 34);
  assert.ok(Object.keys(LASTLIGHT_AUDIO_CUES.cues).length >= 16);
  assert.equal(Object.isFrozen(LASTLIGHT_AUDIO_CUES.cues.test.voices), true);
  const allVoices = [LASTLIGHT_AUDIO_CUES.material, LASTLIGHT_AUDIO_CUES.weapon, LASTLIGHT_AUDIO_CUES.cues].flatMap((group) => Object.values(group).flatMap((entry) => entry.voices));
  assert.ok(allVoices.every((voice) => voice.volume >= .005 && voice.volume <= .08));
  assert.ok([...Object.values(LASTLIGHT_AUDIO_CUES.material), ...Object.values(LASTLIGHT_AUDIO_CUES.weapon), ...Object.values(LASTLIGHT_AUDIO_CUES.cues)].every((entry) => entry.voices.length <= AUDIO_CUE_MAX_VOICES && entry.voices.reduce((sum, voice) => sum + voice.volume, 0) <= AUDIO_CUE_PEAK_LIMIT));
  assert.equal(AUDIO_HEADROOM_TARGET_DB, -3);
  assert.ok(Math.max(...LASTLIGHT_AUDIO_CUES.cues.ultimate.voices.map((voice) => voice.volume)) > LASTLIGHT_AUDIO_CUES.weapon.pulse.voices[0].volume);
  assert.equal(LASTLIGHT_AUDIO_CUES.cues.test.voices.length, 3);
  assert.ok(resolveAudioCue("impact-critical").voices.reduce((sum, voice) => sum + voice.volume, 0) > resolveAudioCue("impact-heavy").voices.reduce((sum, voice) => sum + voice.volume, 0));
});

test("theme resolver handles named families, calibration details, and safe fallbacks", () => {
  const metal = resolveAudioCue("material:metal", { pitch: 1.25, volume: .5 });
  assert.equal(metal.voices[0].frequency, LASTLIGHT_AUDIO_CUES.material.metal.voices[0].frequency * 1.25);
  assert.equal(metal.voices[0].volume, LASTLIGHT_AUDIO_CUES.material.metal.voices[0].volume * .5);
  assert.deepEqual(resolveAudioCue("weapon:not-real").voices, LASTLIGHT_AUDIO_CUES.weapon.pulse.voices);
  assert.deepEqual(resolveAudioCue("enemy:not-real").voices, LASTLIGHT_AUDIO_CUES.cues["enemy-melee"].voices);
  assert.deepEqual(resolveAudioCue("not-real").voices, LASTLIGHT_AUDIO_CUES.cues.ui.voices);
  assert.equal(resolveAudioCue("material:void", { volume: 0 }).voices[0].volume, 0);
});

test("all 21 weapon identities and five hostile classes resolve to distinct layered profiles", () => {
  const names = [
    ...signatures.map((id) => `weapon:signature-${id}`),
    ...universals.map((id) => `weapon:universal-${id}`),
  ];
  const fingerprints = names.map((name) => JSON.stringify(resolveAudioCue(name).voices));
  assert.equal(new Set(fingerprints).size, names.length);
  assert.ok(names.every((name) => resolveAudioCue(name).voices.length >= 2));
  assert.ok(names.every((name) => audioCueEnvelopeDuration(name) >= Math.max(...resolveAudioCue(name).voices.map((voice) => voice.offset + voice.duration))));
  const hostile = ["melee", "heavy", "spitter", "bomber", "apex"].map((id) => JSON.stringify(resolveAudioCue(`enemy:${id}`).voices));
  assert.equal(new Set(hostile).size, 5);
  assert.ok(resolveAudioCue("enemy:apex").voices.reduce((sum, voice) => sum + voice.volume, 0) > resolveAudioCue("weapon:signature-zuri").voices.reduce((sum, voice) => sum + voice.volume, 0));
});

test("strict registry validation permits theme swaps but rejects unsafe or unlicensed cues", () => {
  const replacement = structuredClone(LASTLIGHT_AUDIO_CUES);
  replacement.cues.ui.voices[0].frequency = 500;
  assert.deepEqual(validateAudioCueRegistry(replacement), []);
  replacement.cues.ui.voices[0].volume = .5;
  assert.match(validateAudioCueRegistry(replacement).join("\n"), /calibration out of bounds/);
  const external = structuredClone(LASTLIGHT_AUDIO_CUES);
  external.provenance.externalAssets = true;
  assert.match(validateAudioCueRegistry(external).join("\n"), /provenance: unsupported/);
  const crowded = structuredClone(LASTLIGHT_AUDIO_CUES);
  crowded.weapon.pulse.voices = Array.from({ length: AUDIO_CUE_MAX_VOICES + 1 }, () => ({ ...crowded.weapon.pulse.voices[0] }));
  assert.match(validateAudioCueRegistry(crowded).join("\n"), /too many voices|authored peak exceeds limit/);
});

test("provenance document explicitly excludes external packs and explains optional speech", () => {
  const provenance = readFileSync(new URL("../AUDIO-ASSETS.md", import.meta.url), "utf8");
  assert.match(provenance, /does not ship or download a third-party sound pack/i);
  assert.match(provenance, /runtime-generated/);
  assert.match(provenance, /project-authored/);
  assert.match(provenance, /pew pew pew/i);
  assert.match(provenance, /fallback/i);
});
