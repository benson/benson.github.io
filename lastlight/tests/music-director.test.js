import test from "node:test";
import assert from "node:assert/strict";
import { MUSIC_CROSSFADE_SECONDS, MUSIC_TRACKS, musicStateForGame } from "../music-director.js";

test("music progression follows wave state instead of absolute run duration", () => {
  for (const duration of [240, 900]) {
    assert.equal(musicStateForGame("home", null), "home");
    assert.equal(musicStateForGame("lobby", null), "home");
    assert.equal(musicStateForGame("game", { stage: "running", duration, wave: 0 }), "containment");
    assert.equal(musicStateForGame("game", { stage: "running", duration, wave: 1 }), "containment");
    assert.equal(musicStateForGame("game", { stage: "running", duration, wave: 2 }), "pressure");
    assert.equal(musicStateForGame("game", { stage: "running", duration, wave: 4 }), "pressure");
    assert.equal(musicStateForGame("game", { stage: "running", duration, wave: 5 }), "breach");
    assert.equal(musicStateForGame("game", { stage: "boss", duration, wave: 7 }), "apex");
  }
  assert.equal(musicStateForGame("result", { stage: "won" }), "victory");
  assert.equal(musicStateForGame("result", { stage: "lost" }), null);
});

test("every adaptive state owns a local OGG track and a restrained mix target", () => {
  assert.ok(MUSIC_CROSSFADE_SECONDS >= 2.5 && MUSIC_CROSSFADE_SECONDS <= 4);
  assert.deepEqual(Object.keys(MUSIC_TRACKS), ["home", "containment", "pressure", "breach", "apex", "victory"]);
  for (const track of Object.values(MUSIC_TRACKS)) {
    assert.match(track.file, /^\.\/assets\/audio\/music\/.+\.ogg$/);
    assert.ok(track.gain > 0 && track.gain < 1);
  }
  assert.equal(MUSIC_TRACKS.victory.loop, false);
});
