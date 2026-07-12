import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_CRITICAL_OSCILLATOR_RESERVE, AUDIO_HEADROOM_TARGET_DB, AUDIO_LIMITER_SETTINGS, AUDIO_MASTER_CALIBRATION, AUDIO_MIX_SCHEMA, AUDIO_OSCILLATOR_LIMIT, AUDIO_OUTPUT_CEILING_GAIN, AUDIO_POLICIES, AudioVoiceBudget, DynamicAudioMixer, audioCuePolicy, audioCueVariation, audioSoftClipCurve } from "../audio-mix.js";

test("audio hierarchy classifies every shipped cue with critical information above chatter", () => {
  const categories = new Set(Object.keys(AUDIO_POLICIES));
  for (const cue of ["xp", "shot", "kill", "select", "ui", "deploy", "ability", "hurt", "reward", "level", "objective", "danger", "ultimate", "victory", "weapon:pulse", "material:metal", "enemy:spitter", "enemy:apex"]) {
    assert.ok(categories.has(audioCuePolicy(cue).category), cue);
  }
  assert.ok(audioCuePolicy("hurt").priority > audioCuePolicy("weapon:pulse").priority);
  assert.ok(audioCuePolicy("danger").priority > audioCuePolicy("material:metal").priority);
  assert.ok(audioCuePolicy("enemy:spitter").priority > audioCuePolicy("weapon:pulse").priority);
  assert.ok(audioCuePolicy("enemy:apex").priority >= audioCuePolicy("danger").priority);
  assert.ok(audioCuePolicy("victory").duck < audioCuePolicy("ability").duck);
});

test("cue variation is deterministic, bounded, and does not use gameplay randomness", () => {
  const first = audioCueVariation("weapon:pulse", 4), again = audioCueVariation("weapon:pulse", 4), next = audioCueVariation("weapon:pulse", 5);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, next);
  assert.ok(first.pitch >= .965 && first.pitch <= 1.035);
  assert.ok(first.gain >= .9 && first.gain <= 1);
});

test("voice budgets reserve real oscillator headroom for critical cues and suppress chatter when effects are off", () => {
  const budget = new AudioVoiceBudget({ globalLimit: 6, oscillatorLimit: 18 });
  for (let index = 0; index < 6; index++) budget.request(`weapon:${index}`, 1, 1, 3);
  assert.equal(budget.request("weapon:overflow", 1, 1), null);
  const danger = budget.request("danger", 1, 1, 3);
  assert.ok(danger, "critical cues consume reserved headroom above chatter");
  const diagnostics = budget.diagnostics(1);
  assert.equal(diagnostics.schema, AUDIO_MIX_SCHEMA);
  assert.ok(diagnostics.active <= diagnostics.globalLimit);
  assert.ok(diagnostics.activeOscillators <= diagnostics.oscillatorLimit);
  assert.equal(diagnostics.criticalOscillatorReserve, AUDIO_CRITICAL_OSCILLATOR_RESERVE);
  assert.ok(diagnostics.suppressed >= 1);
  budget.setDensity("low");
  budget.prune(3);
  assert.equal(budget.categoryCap(audioCuePolicy("weapon:pulse")), 2);
  budget.setDensity("off");
  assert.equal(budget.request("weapon:pulse", 4, 1, 2), null);
  assert.ok(budget.request("hurt", 4, 1, 2));
});

test("the explicit output test remains audible in Essential-only density", () => {
  const budget = new AudioVoiceBudget({ density: "off" });
  assert.equal(budget.request("weapon:signature-zuri", 0, .2, 2), null);
  assert.ok(budget.request("test", 0, .2, 3));
});

function audioParameter(value = 1) {
  return {
    value, calls: [],
    cancelScheduledValues(time) { this.calls.push(["cancel", time]); },
    setValueAtTime(next, time) { this.value = next; this.calls.push(["set", next, time]); },
    linearRampToValueAtTime(next, time) { this.value = next; this.calls.push(["ramp", next, time]); },
    setTargetAtTime(next, time, constant) { this.calls.push(["target", next, time, constant]); },
  };
}

function audioContext() {
  const nodes = [];
  return {
    currentTime: 10,
    destination: { kind: "destination" },
    nodes,
    createGain() {
      const node = { gain: audioParameter(), connections: [], connect(target) { this.connections.push(target); return target; }, disconnect() { this.disconnected = true; } };
      nodes.push(node); return node;
    },
    createDynamicsCompressor() {
      const node = { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connections: [], connect(target) { this.connections.push(target); return target; }, disconnect() { this.disconnected = true; } };
      nodes.push(node); return node;
    },
    createWaveShaper() {
      const node = { curve: null, oversample: "none", connections: [], connect(target) { this.connections.push(target); return target; }, disconnect() { this.disconnected = true; } };
      nodes.push(node); return node;
    },
  };
}

test("dynamic mixer routes buses, ducks low-priority channels, and exposes bounded diagnostics", () => {
  const context = audioContext(), mixer = new DynamicAudioMixer(context, { globalLimit: 8, masterVolume: .75, effectsVolume: .5 });
  assert.equal(mixer.master.gain.value, AUDIO_MASTER_CALIBRATION * .75);
  assert.equal(mixer.buses.combat.gain.value, mixer.baseGains.combat * .5);
  const weapon = mixer.requestCue("weapon:pulse", { voiceCount: 2, pan: -.6, duration: .3 }), ultimate = mixer.requestCue("ultimate", { voiceCount: 3 });
  assert.equal(weapon.destination, mixer.buses.combat);
  assert.equal(weapon.pan, -.6);
  assert.equal(ultimate.destination, mixer.buses.critical);
  assert.ok(mixer.buses.low.gain.calls.some(([kind]) => kind === "ramp"));
  assert.ok(mixer.buses.combat.gain.calls.some(([kind]) => kind === "target"));
  mixer.setDensity("balanced"); mixer.setMuted(true); mixer.setVolumes({ master: .6, effects: .4 });
  const diagnostics = mixer.diagnostics();
  assert.equal(diagnostics.density, "balanced");
  assert.deepEqual(diagnostics.buses.sort(), ["combat", "critical", "low", "ui"]);
  assert.deepEqual(diagnostics.volumes, { master: .6, effects: .4 });
  assert.equal(diagnostics.masterCalibration, AUDIO_MASTER_CALIBRATION);
  assert.equal(diagnostics.headroomTargetDb, AUDIO_HEADROOM_TARGET_DB);
  assert.equal(diagnostics.outputCeilingGain, AUDIO_OUTPUT_CEILING_GAIN);
  assert.deepEqual(diagnostics.limiter, { ...AUDIO_LIMITER_SETTINGS, softClip: true, oversample: "4x" });
  assert.equal(diagnostics.oscillatorLimit, AUDIO_OSCILLATOR_LIMIT);
  assert.equal(diagnostics.activeOscillators, 5);
  assert.equal(diagnostics.muted, true);
  assert.ok(mixer.buses.combat.gain.calls.some(([kind, target]) => kind === "target" && target === mixer.baseGains.combat * .4));
  mixer.dispose();
  assert.equal(mixer.budget.active.length, 0);
});

test("the deterministic soft-clip transfer is monotonic, symmetric, and cannot exceed the output ceiling", () => {
  const curve = audioSoftClipCurve();
  assert.equal(curve.length, 2048);
  assert.ok(curve.every(Number.isFinite));
  assert.ok(curve.every((value, index) => index === 0 || value >= curve[index - 1]));
  assert.ok(Math.abs(curve[0] + curve.at(-1)) < 1e-6);
  assert.ok(Math.max(...curve.map((value) => Math.abs(value * AUDIO_OUTPUT_CEILING_GAIN))) <= AUDIO_OUTPUT_CEILING_GAIN + 1e-7);
});

test("a deterministic dense-wave timeline remains bounded while every critical warning is admitted", () => {
  const budget = new AudioVoiceBudget();
  let criticalRequested = 0, criticalAccepted = 0;
  for (let tick = 0; tick < 60 * 60; tick++) {
    const now = tick / 60;
    if (tick % 8 === 0) for (let burst = 0; burst < 8; burst++) budget.request("weapon:universal-uwu", now, .09, 2);
    if (tick % 10 === 0) budget.request("xp", now, .09, 2);
    if (tick % 12 === 0) budget.request("material:metal", now, .11, 1);
    if (tick % 60 === 0) { criticalRequested++; if (budget.request("danger", now, .48, 2)) criticalAccepted++; }
    const diagnostics = budget.diagnostics(now);
    assert.ok(diagnostics.active <= diagnostics.globalLimit);
    assert.ok(diagnostics.activeOscillators <= diagnostics.oscillatorLimit);
  }
  assert.equal(criticalAccepted, criticalRequested);
  const diagnostics = budget.diagnostics(61);
  assert.ok(diagnostics.peakOscillators <= diagnostics.oscillatorLimit);
  assert.ok(diagnostics.suppressed > 0, "dense chatter should be thinned instead of accumulating");
});
