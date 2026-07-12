import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_SPATIAL_FULL_PAN_DISTANCE,
  AUDIO_SPATIAL_MAX_PAN,
  enemyAudioCueName,
  newEntities,
  spatialAudioPan,
  weaponAudioCueName,
  weaponTimerActivations,
} from "../audio-events.js";

test("weapon cue identities distinguish every authored source before family fallback", () => {
  assert.equal(weaponAudioCueName({ sourceId: "signature", specialistId: "zuri", soundFamily: "pulse" }), "weapon:signature-zuri");
  assert.equal(weaponAudioCueName({ sourceId: "uwu", soundFamily: "pulse" }), "weapon:universal-uwu");
  assert.equal(weaponAudioCueName({ soundFamily: "industrial" }), "weapon:industrial");
});

test("hostile cue identities preserve melee, heavy, ranged, bomber, and apex hierarchy", () => {
  const enemies = [
    { id: "s", type: "spitter" }, { id: "b", type: "brute" }, { id: "m", type: "mite" }, { id: "x", boss: true },
  ];
  assert.equal(enemyAudioCueName({ ownerId: "s" }, enemies), "enemy:spitter");
  assert.equal(enemyAudioCueName(enemies[1], enemies), "enemy:heavy");
  assert.equal(enemyAudioCueName(enemies[2], enemies), "enemy:melee");
  assert.equal(enemyAudioCueName({ type: "bomber" }, enemies), "enemy:bomber");
  assert.equal(enemyAudioCueName({ ownerId: "x", bossShot: true }, enemies), "enemy:apex");
});

test("spatial pan is finite, centered, symmetric, and deliberately bounded", () => {
  assert.equal(spatialAudioPan({ x: 0 }, { x: 0 }), 0);
  assert.equal(spatialAudioPan({ x: AUDIO_SPATIAL_FULL_PAN_DISTANCE }, { x: 0 }), AUDIO_SPATIAL_MAX_PAN);
  assert.equal(spatialAudioPan({ x: -AUDIO_SPATIAL_FULL_PAN_DISTANCE }, { x: 0 }), -AUDIO_SPATIAL_MAX_PAN);
  assert.equal(spatialAudioPan({ x: Infinity }, { x: 0 }), 0);
});

test("entity discovery preserves deterministic simulation order and forgets disappeared entities without unbounded history", () => {
  const first = newEntities(new Set(["b"]), [{ id: "c" }, { id: "a" }, { id: "b" }], 2);
  assert.deepEqual(first.added.map(({ id }) => id), ["c", "a"]);
  assert.deepEqual([...first.ids], ["a", "b"]);
  const second = newEntities(first.ids, [{ id: "a" }, { id: "d" }], 2);
  assert.deepEqual(second.added.map(({ id }) => id), ["d"]);
  assert.deepEqual([...second.ids], ["a", "d"]);
});

test("timer-only Aura and Ice activations dispatch once on reset edges", () => {
  const player = { id: "p1", weapons: { aura: { level: 1 }, ice: { level: 1 } }, weaponTimers: { aura: 2, ice: 5 } };
  const initial = weaponTimerActivations(new Map(), [player]);
  assert.deepEqual(initial.activated, []);
  const ticking = weaponTimerActivations(initial.timers, [{ ...player, weaponTimers: { aura: 1.5, ice: 4.5 } }]);
  assert.deepEqual(ticking.activated, []);
  const reset = weaponTimerActivations(ticking.timers, [{ ...player, weaponTimers: { aura: 3, ice: 8 } }]);
  assert.deepEqual(reset.activated.map(({ weaponId }) => weaponId), ["aura", "ice"]);
});
