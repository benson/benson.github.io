import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import { Simulation, previewPlayerUpgrade, UPGRADE_GOLD_REWARD } from "../engine.js";
import { buildUpgradeComparison, forecastDraftChoice, playerBuildStats, signatureEvolutionTelemetry, weaponTelemetry } from "../upgrade-preview.js";

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

test("draft forecasts use the exact engine outcome, slots, and shared gold reward", () => {
  for (const specialist of Object.keys(SPECIALISTS)) {
    for (const choice of [{ id: "weapon:uwu" }, { id: "passive:haste" }, { id: "heal" }]) {
      const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] });
      const player = sim.players[0]; player.hp = 4;
      const before = structuredClone(relevantPlayerState(player));
      const forecast = forecastDraftChoice(choice, player, { gold: 30 });
      assert.deepEqual(relevantPlayerState(player), before);
      sim.applyUpgrade(player, choice);
      assert.deepEqual(relevantPlayerState(forecast.afterPlayer), relevantPlayerState(player));
      assert.deepEqual(forecast.economy, { before: 30, after: 30 + UPGRADE_GOLD_REWARD, delta: UPGRADE_GOLD_REWARD });
      assert.equal(forecast.slots.weapons.max, 5); assert.equal(forecast.slots.passives.max, 6);
    }
  }
});

test("draft forecasts include only currently unlocked specialist abilities", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const choice = { id: "passive:damage" };
  const early = forecastDraftChoice(choice, sim.players[0], { gameLevel: 2 });
  const active = forecastDraftChoice(choice, sim.players[0], { gameLevel: 3 });
  const ultimate = forecastDraftChoice(choice, sim.players[0], { gameLevel: 6 });
  assert.equal(early.affectedSources.some(({ id }) => id.startsWith("ability:")), false);
  assert.equal(active.affectedSources.some(({ id }) => id === "ability:e"), true);
  assert.equal(active.affectedSources.some(({ id }) => id === "ability:r"), false);
  assert.equal(ultimate.affectedSources.some(({ id }) => id === "ability:r"), true);
});

test("canonical build stats expose transitive and negative specialist consequences", () => {
  const sola = new Simulation({ players: [{ id: "p", name: "P", specialist: "sola" }] }).players[0];
  const armor = forecastDraftChoice({ id: "passive:armor" }, sola);
  assert.ok(armor.statChanges.some(({ id }) => id === "area"), "Sola armor must forecast transitive area");
  const fang = new Simulation({ players: [{ id: "p", name: "P", specialist: "fang" }] }).players[0];
  fang.hp = 2;
  const heal = forecastDraftChoice({ id: "heal" }, fang);
  assert.ok(heal.statChanges.some(({ id, direction }) => id === "damage" && direction === "down"));
  assert.ok(heal.statChanges.some(({ id, direction }) => id === "move" && direction === "down"));
  assert.deepEqual(playerBuildStats(fang), playerBuildStats(fang));
});

test("forecast evolution readiness never claims the draft evolves immediately", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const player = sim.players[0]; player.weapons.signature.level = 5;
  const forecast = forecastDraftChoice({ id: "passive:haste" }, player);
  assert.equal(forecast.afterPlayer.weapons.signature.evolved, false);
  assert.deepEqual(forecast.evolution.newlyReady.map(({ sourceId }) => sourceId), ["signature"]);
  assert.equal(forecast.evolution.nextEligible, "signature");
});

test("replacement forecasts exactly match atomic engine outcomes without mutating the source", () => {
  const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "sola" }] });
  const player = sim.players[0];
  player.weapons = {
    signature: { level: 5, evolved: false }, aura: { level: 5, evolved: false }, mines: { level: 2, evolved: false },
    crossbow: { level: 1, evolved: false }, drone: { level: 3, evolved: true },
  };
  player.passives = { area: 1, duration: 1, damage: 2, maxHealth: 3, armor: 2, regen: 1 };
  player.maxHp += 4.5; player.hp = player.maxHp; player.armor += 16;
  const before = structuredClone(player);
  const weaponChoice = { id: "weapon:uwu" };
  const unresolved = forecastDraftChoice(weaponChoice, player, { gold: 50 });
  assert.equal(unresolved.requiresReplacement, true);
  assert.equal(unresolved.economy.delta, 0);
  assert.deepEqual(unresolved.afterPlayer, player);
  const forecast = forecastDraftChoice(weaponChoice, player, { replacementId: "drone", gold: 50 });
  const applied = previewPlayerUpgrade(player, weaponChoice, { replacementId: "drone" });
  assert.deepEqual(forecast.afterPlayer, applied);
  assert.deepEqual(player, before);
  assert.deepEqual({ id: forecast.removed.id, kind: forecast.removed.kind, name: forecast.removed.name, level: forecast.removed.level, evolved: forecast.removed.evolved }, { id: "drone", kind: "weapon", name: WEAPONS.drone.name, level: 3, evolved: true });
  assert.ok(forecast.removed.details.damage && forecast.removed.details.interval);
  assert.deepEqual(forecast.slots.weapons, { before: 5, after: 5, max: 5 });
  const passive = forecastDraftChoice({ id: "passive:crit" }, player, { replacementId: "maxHealth" });
  assert.equal(passive.afterPlayer.passives.maxHealth, undefined);
  assert.equal(passive.afterPlayer.passives.crit, 1);
  assert.equal(passive.afterPlayer.maxHp, player.maxHp - 4.5);
  assert.equal(passive.afterPlayer.hp, passive.afterPlayer.maxHp);
  assert.deepEqual(passive.slots.passives, { before: 6, after: 6, max: 6 });
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
    sola: ["cadence", "secondary"],
    fang: ["cadence", "secondary"],
    gale: ["cadence", "pierce", "secondary"],
    rift: ["cadence", "secondary"],
    vesper: ["cadence", "pierce"],
  };
  for (const [specialist, ids] of Object.entries(expected)) {
    const sim = new Simulation({ players: [{ id: "p", name: "P", specialist }] });
    const evolution = signatureEvolutionTelemetry(specialist, sim.players[0]);
    assert.deepEqual(evolution.changes.map((change) => change.id), ids);
  }
  const fang = signatureEvolutionTelemetry("fang", new Simulation({ players: [{ id: "p", name: "P", specialist: "fang" }] }).players[0]);
  assert.match(fang.summary, /Predator Hook/i);
  assert.match(fang.summary, /no bleed/i);
  const vesper = signatureEvolutionTelemetry("vesper", new Simulation({ players: [{ id: "p", name: "P", specialist: "vesper" }] }).players[0]);
  assert.doesNotMatch(vesper.summary, /recall/i);
});
