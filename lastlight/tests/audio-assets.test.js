import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  AUDIO_ASSET_SCHEMA,
  AUDIO_PRELOAD_CUES,
  DecodedSampleBank,
  sampleCueDescriptor,
  sampleVariantIndex,
} from "../audio-assets.js";

test("sample registry covers UI, materials, weapon families, enemies, and field mechanics", () => {
  for (const cue of [
    "ui", "select", "reward", "material:metal", "material:void",
    "weapon:signature-zuri", "weapon:signature-bront", "weapon:signature-fang",
    "enemy:spitter", "enemy:apex", "world:heal", "world:freight-loop",
  ]) {
    const descriptor = sampleCueDescriptor(cue);
    assert.ok(descriptor, cue);
    assert.ok(descriptor.files.every((file) => file.startsWith("./assets/audio/") && file.endsWith(".ogg")));
    assert.ok(descriptor.gain > 0 && descriptor.gain <= 1);
  }
  assert.equal(sampleCueDescriptor("world:freight-loop").sampleOnly, true);
  assert.equal(sampleCueDescriptor("world:freight-loop").loop, true);
  assert.ok(AUDIO_PRELOAD_CUES.includes("enemy:apex"));
});

test("audio manifest covers every local recording with matching sizes and hashes", async () => {
  const audioRoot = new URL("../assets/audio/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("asset-manifest.json", audioRoot), "utf8"));
  assert.equal(manifest.count, manifest.files.length);
  assert.equal(manifest.count, 37);

  let totalBytes = 0;
  for (const asset of manifest.files) {
    const contents = await readFile(new URL(asset.path, audioRoot));
    totalBytes += contents.byteLength;
    assert.equal(contents.byteLength, asset.bytes, asset.path);
    assert.equal(createHash("sha256").update(contents).digest("hex"), asset.sha256, asset.path);
  }
  assert.equal(totalBytes, manifest.totalBytes);
});

test("sample variants are deterministic and bounded", () => {
  assert.equal(sampleVariantIndex("weapon:pulse", 12, 3), sampleVariantIndex("weapon:pulse", 12, 3));
  assert.ok(sampleVariantIndex("weapon:pulse", 13, 3) >= 0);
  assert.ok(sampleVariantIndex("weapon:pulse", 13, 3) < 3);
});

function parameter(value = 1) {
  return {
    value,
    cancelScheduledValues() {},
    setValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
  };
}

test("decoded sample bank caches assets, plays spatial variants, and owns bounded loops", async () => {
  const started = [];
  const context = {
    currentTime: 1,
    destination: {},
    async decodeAudioData(data) { return { bytes: data.byteLength }; },
    createBufferSource() {
      return {
        buffer: null, loop: false, playbackRate: { value: 1 },
        connect(target) { return target; },
        disconnect() {},
        addEventListener(name, callback) { this.ended = callback; },
        start() { started.push(this); },
        stop() { this.ended?.(); },
      };
    },
    createGain() { return { gain: parameter(), connect(target) { return target; }, disconnect() {} }; },
    createStereoPanner() { return { pan: parameter(0), connect(target) { return target; }, disconnect() {} }; },
  };
  const bank = new DecodedSampleBank(context, {
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    resolveUrl: (file) => file,
  });
  const descriptor = sampleCueDescriptor("ui");
  await Promise.all(descriptor.files.map((file) => bank.load(file)));
  const playback = bank.playCue("ui", { pan: -.5, sequence: 1 });
  assert.ok(playback);
  assert.equal(started.length, 1);
  const loopDescriptor = sampleCueDescriptor("world:freight-loop");
  await bank.load(loopDescriptor.files[0]);
  assert.equal(bank.startLoop("map", "world:freight-loop"), true);
  assert.equal(bank.startLoop("map", "world:freight-loop"), true);
  assert.equal(bank.diagnostics().schema, AUDIO_ASSET_SCHEMA);
  assert.deepEqual(bank.diagnostics().loops, ["map"]);
  assert.equal(bank.stopLoop("map"), true);
});
