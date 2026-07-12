import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, WEAPONS } from "../data.js";
import { Simulation, previewPlayerUpgrade } from "../engine.js";
import { buildUpgradeComparison, weaponTelemetry } from "../upgrade-preview.js";

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
