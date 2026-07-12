import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("sound settings expose an accessible readiness, volume, voice, and test surface", () => {
  for (const id of ["audio-dialog", "audio-title", "audio-status", "audio-mute", "audio-master", "audio-effects", "audio-voice", "audio-funny-voice", "audio-test", "audio-test-result"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="audio-dialog"[^>]+aria-labelledby="audio-title"/);
  assert.match(html, /id="audio-status"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="audio-test-result"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="audio-master" type="range" min="0" max="100"/);
  assert.match(html, /id="audio-test"[^>]+type="button"/);
  assert.match(css, /\.audio-readiness p\[data-state="ready"\]/);
  assert.match(css, /\.audio-range input:focus-visible/);
  assert.match(html, /id="pause-audio"[^>]+aria-haspopup="dialog"/);
});

test("lobby, deploy, and game gestures share one guaranteed audio unlock path", () => {
  assert.match(game, /async function unlockAudioFromGesture\(reason = "gesture"\)/);
  assert.match(game, /document\.addEventListener\("pointerdown", unlockFromInteraction, \{ capture: true, passive: true \}\)/);
  assert.match(game, /document\.addEventListener\("click", unlockFromInteraction, \{ capture: true, passive: true \}\)/);
  assert.match(game, /window\.addEventListener\("keydown", unlockFromInteraction, \{ capture: true \}\)/);
  assert.match(game, /if \(audio\.state !== "running" && !await settleAudioResume\(audio\.resume\(\)\)\) throw new Error\("Audio unlock timed out"\)/);
  assert.match(game, /unlockAudioFromGesture\("settings-open"\)/);
  assert.match(game, /unlockAudioFromGesture\("sound-test"\)/);
  assert.match(game, /\$\("deploy-button"\)\.addEventListener\("click", deploy\)/);
});

test("audio persistence, cue registry, mixer diagnostics, and error context are wired", () => {
  assert.match(game, /loadAudioSettings\(localStorage\)/);
  assert.match(game, /saveAudioSettings\(settings\)/);
  assert.match(game, /new DynamicAudioMixer\(state\.audioContext, \{/);
  assert.match(game, /resolveAudioCue\(name, details\)/);
  assert.match(game, /audio: audioDiagnostics\(\)/);
  assert.match(game, /lastError: state\.audioLastError \|\| null/);
  assert.match(game, /cueRegistry: \{ schema: LASTLIGHT_AUDIO_CUES\.schema/);
  assert.match(game, /state\.audioSettings\.funnyVoice/);
  assert.match(game, /utterance\.volume = state\.audioSettings\.voice \* state\.audioSettings\.master/);
});
