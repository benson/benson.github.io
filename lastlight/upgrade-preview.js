import { BALANCE_CONFIG } from "./balance-config.js?v=20260712.1";
import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260711.8";
import { formatProjectileDisplay, getCombatMetadata } from "./combat-metadata.js?v=20260711.8";
import { playerCombatStat, playerMovementSpeed, previewPlayerUpgrade } from "./engine.js?v=20260712.1";

const { weapons: weaponBalance } = BALANCE_CONFIG;

function roundedDamage(value, player, metadata) {
  const multiplier = metadata?.scalesWith.includes("damage") ? playerCombatStat(player, "damage") : 1;
  return Math.round(value * multiplier);
}

export function weaponTelemetry(weaponId, weapon, player) {
  const level = Math.max(1, Math.floor(Number(weapon?.level) || 1));
  const evolved = Boolean(weapon?.evolved);
  const extra = playerCombatStat(player, "projectiles");
  const haste = playerCombatStat(player, "haste");
  const cooldown = (base) => Math.max(.01, base * 100 / (100 + haste));
  const metadata = getCombatMetadata(weaponId, player.specialist);

  if (weaponId === "signature") {
    const tuning = weaponBalance.signatures[player.specialist];
    const baseCycle = tuning.cycle + (level - 1) * tuning.cyclePerLevel;
    const cycle = evolved ? (tuning.evolvedCycleSeconds ?? baseCycle * tuning.evolvedCycle) : baseCycle;
    let damage = tuning.damageBase + level * tuning.damagePerLevel;
    if (player.specialist === "sola") damage += player.armor * tuning.armorDamage;
    if (player.specialist === "fang") damage += player.maxHp * tuning.maxHealthDamage;
    const counts = {
      zuri: tuning.countBase + level * tuning.countPerLevel + extra,
      echo: Math.min(tuning.countCap, level * tuning.countPerLevel + extra),
      sola: tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra,
      bront: 1,
      fang: 1,
      gale: Math.min(tuning.countCap, tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra),
      rift: 1,
      nova: Math.min(tuning.countCap, tuning.countBase + Math.ceil(level / tuning.countEveryLevels) + extra),
      vesper: tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra,
    };
    const interval = cooldown(cycle);
    return {
      damage: `${roundedDamage(damage, player, metadata)} / hit`,
      interval: `${interval.toFixed(2)}s`,
      cooldownSeconds: interval,
      projectiles: formatProjectileDisplay(metadata, counts[player.specialist]),
      note: SPECIALISTS[player.specialist].signature.evolve,
    };
  }

  const tuning = weaponBalance.universal[weaponId];
  if (!tuning) return { damage: "—", interval: "—", cooldownSeconds: 0, projectiles: "—", note: "" };
  let damage = 0, cycle = tuning.cooldown ?? tuning.cooldownBase + level * tuning.cooldownPerLevel, count = 1;
  if (weaponId === "uwu") { damage = tuning.damageBase + level * tuning.damagePerLevel; cycle = evolved ? tuning.evolvedCooldown : cycle; count = tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra; }
  else if (weaponId === "slicers") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = tuning.countBase + level * tuning.countPerLevel + extra; }
  else if (weaponId === "aura") damage = tuning.damageBase + level * tuning.damagePerLevel + player.maxHp * tuning.maxHealthDamage;
  else if (weaponId === "mines") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = tuning.countBase + level * tuning.countPerLevel + extra; }
  else if (weaponId === "crossbow") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = tuning.countBase + level * tuning.countPerLevel + extra; }
  else if (weaponId === "boomerang") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra; }
  else if (weaponId === "rail") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = (tuning.countBase + Math.floor(level / tuning.countEveryLevels) + extra) * 2; }
  else if (weaponId === "glove") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = (tuning.countBase + level * tuning.countPerLevel + extra) * (evolved ? tuning.evolvedStreams : tuning.streams); }
  else if (weaponId === "transit") damage = tuning.damageBase + level * tuning.damagePerLevel;
  else if (weaponId === "ice") { cycle = evolved ? tuning.evolvedCooldown : cycle; count = 1; }
  else if (weaponId === "annihilator") { damage = tuning.damageBase + level * tuning.damagePerLevel; cycle = evolved ? tuning.evolvedCooldown : cycle; }
  else if (weaponId === "drone") { damage = tuning.damageBase + level * tuning.damagePerLevel; count = tuning.countBase + Math.floor((level - 1) / tuning.countEveryLevels); }
  const interval = cooldown(cycle);
  return {
    damage: damage ? `${roundedDamage(damage, player, metadata)} / hit` : "Utility",
    interval: `${interval.toFixed(2)}s`,
    cooldownSeconds: interval,
    projectiles: formatProjectileDisplay(metadata, count),
    note: WEAPONS[weaponId]?.copy || "",
  };
}

const decimal = (value, digits = 2) => Number(value).toFixed(digits).replace(/\.?0+$/, "");
const vitality = (value) => `${decimal(value, 2)} vitality`;
const percent = (value) => `${decimal(Number(value) * 100, 1)}%`;
const multiplier = (value) => `${decimal(value, 2)}×`;

function globalStat(passiveId, player) {
  const definitions = {
    damage: ["Damage", multiplier(playerCombatStat(player, "damage"))],
    haste: ["Ability haste", `${decimal(playerCombatStat(player, "haste"))} haste`],
    maxHealth: ["Maximum health", vitality(player.maxHp)],
    armor: ["Armor", decimal(player.armor)],
    move: ["Movement speed", `${Math.round(playerMovementSpeed(player))} units/s`],
    area: ["Area size", multiplier(playerCombatStat(player, "area"))],
    crit: ["Critical chance", percent(playerCombatStat(player, "crit"))],
    duration: ["Duration", multiplier(playerCombatStat(player, "duration"))],
    projectiles: ["Extra projectiles", `+${Math.floor(playerCombatStat(player, "projectiles"))}`],
    xp: ["Data gain", multiplier(playerCombatStat(player, "xp"))],
    pickup: ["Pickup radius", `${Math.round(playerCombatStat(player, "pickup"))} units`],
    regen: ["Repair rate", `${decimal(playerCombatStat(player, "regen"))} vitality/s`],
  };
  return definitions[passiveId] || [PASSIVES[passiveId]?.name || passiveId, "—"];
}

function comparison(id, label, before, after) {
  return Object.freeze({ id, label, before: String(before), after: String(after), changed: String(before) !== String(after) });
}

export function buildUpgradeComparison(choice, player) {
  if (!choice || !player) return [];
  const preview = previewPlayerUpgrade(player, choice);
  const [kind, target] = String(choice.id).split(":");
  if (kind === "weapon") {
    const weaponId = target === "signature" ? "signature" : target;
    const beforeWeapon = player.weapons?.[weaponId];
    const afterWeapon = preview.weapons?.[weaponId];
    const before = beforeWeapon ? weaponTelemetry(weaponId, beforeWeapon, player) : null;
    const after = weaponTelemetry(weaponId, afterWeapon, preview);
    return [
      comparison("level", "Weapon level", beforeWeapon ? `Level ${beforeWeapon.level}` : "Not owned", `Level ${afterWeapon.level}`),
      comparison("damage", "Damage", before?.damage || "—", after.damage),
      comparison("cooldown", "Cooldown", before?.interval || "—", after.interval),
      comparison("projectiles", "Projectiles", before?.projectiles || "—", after.projectiles),
    ];
  }
  if (kind === "passive") {
    const beforeRank = Math.max(0, Math.floor(Number(player.passives?.[target] || 0)));
    const afterRank = Math.max(0, Math.floor(Number(preview.passives?.[target] || 0)));
    const [label, beforeValue] = globalStat(target, player);
    const [, afterValue] = globalStat(target, preview);
    const rows = [
      comparison("rank", "Passive rank", beforeRank ? `Rank ${beforeRank}` : "Not owned", `Rank ${afterRank}`),
      comparison(target, label, beforeValue, afterValue),
    ];
    if (player.hp !== preview.hp) rows.push(comparison("health", "Current health", vitality(player.hp), vitality(preview.hp)));
    return rows;
  }
  return [comparison("health", "Current health", vitality(player.hp), vitality(preview.hp))];
}
