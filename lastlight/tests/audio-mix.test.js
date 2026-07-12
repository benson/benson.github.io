import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_MIX_SCHEMA, AUDIO_POLICIES, AudioVoiceBudget, DynamicAudioMixer, audioCuePolicy, audioCueVariation } from "../audio-mix.js";

test("audio hierarchy classifies every shipped cue with critical information above chatter", () => {
  const categories = new Set(Object.keys(AUDIO_POLICIES));
  for (const cue of ["xp", "shot", "kill", "select", "ui", "deploy", "ability", "hurt", "reward", "level", "objective", "danger", "ultimate", "victory", "weapon:pulse", "material:metal"]) {
    assert.ok(categories.has(audioCuePolicy(cue).category), cue);
  }
  assert.ok(audioCuePolicy("hurt").priority > audioCuePolicy("weapon:pulse").priority);
  assert.ok(audioCuePolicy("danger").priority > audioCuePolicy("material:metal").priority);
  assert.ok(audioCuePolicy("victory").duck < audioCuePolicy("ability").duck);
});

test("cue variation is deterministic, bounded, and does not use gameplay randomness", () => {
  const first = audioCueVariation("weapon:pulse", 4), again = audioCueVariation("weapon:pulse", 4), next = audioCueVariation("weapon:pulse", 5);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, next);
  assert.ok(first.pitch >= .965 && first.pitch <= 1.035);
  assert.ok(first.gain >= .9 && first.gain <= 1);
});

test("voice budgets cap categories and global concurrency while admitting critical cues", () => {
  const budget = new AudioVoiceBudget({ globalLimit: 6 });
  for (let index = 0; index < 6; index++) budget.request(`weapon:${index}`, 1, 1);
  assert.equal(budget.request("weapon:overflow", 1, 1), null);
  const danger = budget.request("danger", 1, 1);
  assert.ok(danger, "critical cues displace lower-priority chatter");
  const diagnostics = budget.diagnostics(1);
  assert.equal(diagnostics.schema, AUDIO_MIX_SCHEMA);
  assert.ok(diagnostics.active <= diagnostics.globalLimit);
  assert.ok(diagnostics.suppressed >= 1);
  budget.setDensity("low");
  budget.prune(3);
  assert.equal(budget.categoryCap(audioCuePolicy("weapon:pulse")), 2);
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
  };
}

test("dynamic mixer routes buses, ducks low-priority channels, and exposes bounded diagnostics", () => {
  const context = audioContext(), mixer = new DynamicAudioMixer(context, { globalLimit: 8 });
  const weapon = mixer.requestCue("weapon:pulse"), ultimate = mixer.requestCue("ultimate");
  assert.equal(weapon.destination, mixer.buses.combat);
  assert.equal(ultimate.destination, mixer.buses.critical);
  assert.ok(mixer.buses.low.gain.calls.some(([kind]) => kind === "ramp"));
  assert.ok(mixer.buses.combat.gain.calls.some(([kind]) => kind === "target"));
  mixer.setDensity("balanced"); mixer.setMuted(true);
  const diagnostics = mixer.diagnostics();
  assert.equal(diagnostics.density, "balanced");
  assert.deepEqual(diagnostics.buses.sort(), ["combat", "critical", "low", "ui"]);
  mixer.dispose();
  assert.equal(mixer.budget.active.length, 0);
});
