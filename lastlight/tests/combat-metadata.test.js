import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import { Simulation } from "../engine.js";
import {
  PROJECTILE_MODES,
  SPECIALIST_COMBAT,
  STAT_DEFINITIONS,
  UNIVERSAL_WEAPON_COMBAT,
  armorDamageMultiplier,
  armorDamageReduction,
  cooldownMultiplierFromHaste,
  currentStatExplanation,
  getCombatMetadata,
  passiveAffectedSources,
  projectileDisplay,
  validateCombatMetadata,
} from "../combat-metadata.js";

test("combat metadata exhaustively covers weapons and specialist actions", () => {
  assert.deepEqual(Object.keys(UNIVERSAL_WEAPON_COMBAT).sort(), Object.keys(WEAPONS).sort());
  assert.deepEqual(Object.keys(SPECIALIST_COMBAT).sort(), Object.keys(SPECIALISTS).sort());
  for (const specialistId of Object.keys(SPECIALISTS)) {
    assert.deepEqual(Object.keys(SPECIALIST_COMBAT[specialistId]).sort(), ["active", "signature", "ultimate"]);
  }
  assert.deepEqual(validateCombatMetadata(), []);
});

test("every source has a valid, internally consistent projectile contract", () => {
  const all = [
    ...Object.values(UNIVERSAL_WEAPON_COMBAT),
    ...Object.values(SPECIALIST_COMBAT).flatMap((specialist) => Object.values(specialist)),
  ];
  for (const metadata of all) {
    assert.ok(PROJECTILE_MODES.includes(metadata.projectileMode));
    assert.equal(metadata.projectileCountApplicable, metadata.projectileMode === "counted");
    assert.equal(metadata.multishotCompatible, metadata.scalesWith.includes("projectiles"));
    assert.equal(Object.isFrozen(metadata), true);
    assert.equal(Object.isFrozen(metadata.scalesWith), true);
  }
});

test("projectile display distinguishes counts, fields, effects, and utility", () => {
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.uwu, 3), "3");
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.mines, 5), "5 deployed mines");
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.aura, 1), "N/A — continuous field");
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.annihilator, 1), "N/A — single effect");
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.ice, 1), "N/A — utility");
  assert.equal(projectileDisplay(UNIVERSAL_WEAPON_COMBAT.uwu), "Count varies");
  assert.equal(projectileDisplay(null, 2), "—");
});

test("passive impact lists only compatible equipped sources", () => {
  const weapons = { signature: { level: 2 }, uwu: { level: 1 }, aura: { level: 2 }, ice: { level: 1 } };
  assert.deepEqual(
    passiveAffectedSources("projectiles", { specialistId: "zuri", weapons }).map((item) => item.id),
    ["signature", "uwu", "ability:e"],
  );
  assert.deepEqual(
    passiveAffectedSources("area", { specialistId: "zuri", weapons }).map((item) => item.id),
    ["aura", "ability:e", "ability:r"],
  );
  assert.deepEqual(
    passiveAffectedSources("haste", { specialistId: "zuri", weapons, includeAbilities: false }).map((item) => item.id),
    ["signature", "uwu", "aura", "ice"],
  );
  assert.deepEqual(passiveAffectedSources("not-a-passive", { specialistId: "zuri", weapons }), []);
});

test("all upgrade passives have a stat definition", () => {
  assert.deepEqual(Object.keys(STAT_DEFINITIONS).sort(), Object.keys(PASSIVES).sort());
  for (const passiveId of Object.keys(PASSIVES)) {
    const explanation = currentStatExplanation(passiveId, passiveId === "crit" ? .24 : 1);
    assert.equal(explanation.id, passiveId);
    assert.ok(explanation.name);
    assert.ok(explanation.value);
    assert.ok(explanation.definition.endsWith("."));
  }
});

test("stat explanations expose current values and formulas in plain language", () => {
  assert.deepEqual(currentStatExplanation("armor", 25), {
    id: "armor", name: "Armor", value: "25 armor · 20% damage reduction",
    definition: "Reduces incoming damage by armor / (100 + armor).",
  });
  assert.equal(currentStatExplanation("haste", 25).value, "25 haste · 20% shorter cooldowns");
  assert.equal(currentStatExplanation("crit", .24).value, "24%");
  assert.equal(currentStatExplanation("area", 1.33).value, "1.33x");
  assert.equal(currentStatExplanation("regen", .12).value, "0.12 vitality/s");
  assert.equal(currentStatExplanation("missing", 3), null);
});

test("formula helpers remain equivalent to the simulation", () => {
  for (const armor of [0, 8, 25, 100, 250]) {
    assert.equal(armorDamageReduction(armor), armor / (100 + armor));
    assert.equal(armorDamageMultiplier(armor), 100 / (100 + armor));
  }
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "zuri" }] });
  const player = sim.players[0];
  for (const haste of [0, 10, 50, 150]) {
    player.passives.haste = haste / 10;
    assert.equal(sim.cooldown(player, 2), 2 * cooldownMultiplierFromHaste(haste));
  }
});

test("armor helper predicts actual post-armor damage", () => {
  const sim = new Simulation({ players: [{ id: "p1", name: "One", specialist: "sola" }] });
  const player = sim.players[0];
  player.invuln = 0;
  player.hitGrace = 0;
  const before = player.hp;
  sim.takeDamage(player, 4);
  assert.ok(Math.abs((before - player.hp) - 4 * armorDamageMultiplier(player.armor)) < 1e-9);
});

test("metadata lookup resolves universal and specialist-owned sources", () => {
  assert.equal(getCombatMetadata("uwu"), UNIVERSAL_WEAPON_COMBAT.uwu);
  assert.equal(getCombatMetadata("signature", "gale"), SPECIALIST_COMBAT.gale.signature);
  assert.equal(getCombatMetadata("active", "echo"), SPECIALIST_COMBAT.echo.active);
  assert.equal(getCombatMetadata("ability:e", "echo"), SPECIALIST_COMBAT.echo.active);
  assert.equal(getCombatMetadata("ultimate", "rift"), SPECIALIST_COMBAT.rift.ultimate);
  assert.equal(getCombatMetadata("ability:r", "rift"), SPECIALIST_COMBAT.rift.ultimate);
  assert.equal(getCombatMetadata("unknown", "zuri"), null);
});

test("Fang and Rift signature metadata includes the global damage multiplier used by the engine", () => {
  assert.ok(SPECIALIST_COMBAT.fang.signature.scalesWith.includes("damage"));
  assert.ok(SPECIALIST_COMBAT.rift.signature.scalesWith.includes("damage"));
});
