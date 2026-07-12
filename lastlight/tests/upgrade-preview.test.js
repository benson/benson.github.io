import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import { Simulation, previewPlayerUpgrade } from "../engine.js";
import { buildUpgradeComparison, signatureEvolutionTelemetry, weaponTelemetry } from "../upgrade-preview.js";

const relevantPlayerState = (player) => ({
  hp: player.hp,
  maxHp: player.maxHp,
  armor: player.armor,
  weapons: player.weapons,
  passives: player.passives,
});

function rowMap(rows) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

test("upgrade previews never mutate their source and exactly match engine application", () => {
  const choices = [
    { id: "weapon:signature" },
    ...Object.keys(WEAPONS).map((id) => ({ id: `weapon:${id}` })),
    ...Object.keys(PASSIVES).map((id) => ({ id: `passive:${id}` })),
    { id: "heal" },
  ];
  for (const choice of choices) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
    const player = sim.players[0];
    player.hp = 4;
    const before = structuredClone(relevantPlayerState(player));
    const preview = previewPlayerUpgrade(player, choice);
    assert.deepEqual(relevantPlayerState(player), before, `${choice.id} mutated the live player`);
    sim.applyUpgrade(player, choice);
    assert.deepEqual(relevantPlayerState(preview), relevantPlayerState(player), `${choice.id} diverged from engine application`);
  }
});

test("weapon cards normalize level, damage, cooldown, and projectile before-to-after values", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const player = sim.players[0];
  const rows = rowMap(buildUpgradeComparison({ id: "weapon:signature" }, player));
  assert.deepEqual(Object.keys(rows), ["level", "damage", "cooldown", "projectiles"]);
  assert.deepEqual([rows.level.before, rows.level.after], ["Level 1", "Level 2"]);
  assert.deepEqual([rows.damage.before, rows.damage.after], ["42 / hit", "53 / hit"]);
  assert.deepEqual([rows.cooldown.before, rows.cooldown.after], ["2.50s", "2.50s"]);
  assert.deepEqual([rows.projectiles.before, rows.projectiles.after], ["3", "4"]);
  assert.equal(rows.cooldown.changed, false);

  const newWeapon = rowMap(buildUpgradeComparison({ id: "weapon:uwu" }, player));
  assert.deepEqual([newWeapon.level.before, newWeapon.level.after], ["Not owned", "Level 1"]);
  assert.deepEqual([newWeapon.damage.before, newWeapon.damage.after], ["—", "38 / hit"]);
});

test("passive and heal cards use the same applied player state for rank and health comparisons", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const player = sim.players[0];
  player.hp = 5;
  const hull = rowMap(buildUpgradeComparison({ id: "passive:maxHealth" }, player));
  assert.deepEqual([hull.rank.before, hull.rank.after], ["Not owned", "Rank 1"]);
  assert.deepEqual([hull.maxHealth.before, hull.maxHealth.after], ["10 vitality", "11.5 vitality"]);
  assert.deepEqual([hull.health.before, hull.health.after], ["5 vitality", "6.5 vitality"]);

  player.hp = 9;
  const heal = rowMap(buildUpgradeComparison({ id: "heal" }, player));
  assert.deepEqual([heal.health.before, heal.health.after], ["9 vitality", "10 vitality"]);
});

test("weapon telemetry applies global damage only to runtime sources that scale with it", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const player = sim.players[0];
  player.passives.damage = 1;
  assert.equal(weaponTelemetry("crossbow", { level: 1 }, player).damage, "72 / hit");
  assert.equal(weaponTelemetry("transit", { level: 1 }, player).damage, "190 / hit");
});

test("signature telemetry derives geometry, secondary hits, and evolution requirements from runtime tuning", () => {
  for (const specialist of Object.values(SPECIALISTS)) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: specialist.id }] });
    const telemetry = weaponTelemetry("signature", { level: 5, evolved: false }, sim.players[0]);
    for (const key of ["damage", "interval", "projectiles", "radius", "reach", "pierce", "lifetime", "secondary", "cadenceKind"]) {
      assert.ok(telemetry[key], `${specialist.id}.${key}`);
    }
    const evolution = signatureEvolutionTelemetry(specialist.id, sim.players[0]);
    assert.match(evolution.requirement, /Signature level 5 \+ .+ \(rank 1\+\) \+ an elite access card/);
    assert.equal(evolution.pairedPassive.id, specialist.signature.passive);
    assert.ok(evolution.pairedPassive.effect);
    assert.ok(evolution.changes.length, `${specialist.id} evolution has no runtime delta`);
  }
});

test("Gale cadence reports Flow generation and time-to-ready instead of the retry timer", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "gale" }] });
  const player = sim.players[0];
  const base = weaponTelemetry("signature", { level: 5, evolved: false }, player);
  const evolved = weaponTelemetry("signature", { level: 5, evolved: true }, player);
  assert.equal(base.cadenceKind, "flow");
  assert.equal(base.interval, "30 Flow/s · 3.33s from empty");
  assert.equal(base.cooldownSeconds, 100 / 30);
  assert.equal(evolved.interval, "34.5 Flow/s · 2.9s from empty");
  assert.ok(evolved.cooldownSeconds < base.cooldownSeconds);
  assert.doesNotMatch(base.interval, /^0\.25s$/);
  const rows = rowMap(buildUpgradeComparison({ id: "weapon:signature" }, player));
  assert.equal(rows.cooldown.label, "Flow cadence");
  assert.match(rows.cooldown.before, /Flow\/s/);
});

test("previously false evolution claims collapse to their actual engine deltas", () => {
  const expected = {
    sola: ["cadence"],
    fang: ["cadence"],
    gale: ["cadence", "pierce", "secondary"],
    vesper: ["cadence", "pierce"],
  };
  for (const [specialist, ids] of Object.entries(expected)) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] });
    const evolution = signatureEvolutionTelemetry(specialist, sim.players[0]);
    assert.deepEqual(evolution.changes.map((change) => change.id), ids);
  }
  const fang = signatureEvolutionTelemetry("fang", new Simulation({ players: [{ id: "p", name: "P", specialist: "fang" }] }).players[0]);
  assert.doesNotMatch(fang.summary, /bleed|sustain/i);
  const vesper = signatureEvolutionTelemetry("vesper", new Simulation({ players: [{ id: "p", name: "P", specialist: "vesper" }] }).players[0]);
  assert.doesNotMatch(vesper.summary, /recall/i);
});
