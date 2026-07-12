import { BALANCE_CONFIG } from "./balance-config.js?v=20260712.5";
import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260712.5";
import { formatProjectileDisplay, getCombatMetadata } from "./combat-metadata.js?v=20260712.5";
import { playerCombatStat, playerMovementSpeed, previewPlayerUpgrade } from "./engine.js?v=20260712.5";

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
    const area = playerCombatStat(player, "area");
    const interval = cooldown(cycle);
    const flowTuning = BALANCE_CONFIG.identityTuning.gale;
    const flowRate = player.specialist === "gale"
      ? flowTuning.flowPerSecond * (1 + haste / 100 * flowTuning.flowHasteRatio) * (evolved ? flowTuning.evolvedFlowMultiplier : 1)
      : null;
    const cadenceSeconds = flowRate ? tuning.flowCost / flowRate : interval;
    const radiusValue = tuning.radius != null ? tuning.radius * (player.specialist === "sola" ? area : 1)
      : tuning.radiusBase != null ? (tuning.radiusBase + level * tuning.radiusPerLevel) * area
        : null;
    const projectileLife = ["echo", "nova"].includes(player.specialist) ? (evolved ? tuning.evolvedLife : tuning.life) : tuning.life;
    const reachValue = player.specialist === "bront" ? tuning.range
      : ["fang", "rift"].includes(player.specialist) ? tuning.offset + radiusValue
        : tuning.speed && projectileLife ? tuning.speed * projectileLife : radiusValue;
    const pierceValue = player.specialist === "zuri" ? (evolved ? tuning.evolvedPierce : 0)
      : ["gale", "vesper"].includes(player.specialist) ? (evolved ? tuning.evolvedPierce : tuning.pierce)
        : Number(tuning.pierce || 0);
    const secondary = {
      zuri: evolved ? `Each round can continue through ${pierceValue} additional targets.` : "No secondary hit.",
      echo: `${decimal(BALANCE_CONFIG.identityTuning.echo.repeatChance * 100, 0)}% chance for each weapon projectile to repeat after ${decimal(BALANCE_CONFIG.identityTuning.echo.repeatDelay)}s.`,
      sola: evolved
        ? `First hit each volley returns ${decimal(Math.min(BALANCE_CONFIG.identityTuning.sola.guardReturnMax, BALANCE_CONFIG.identityTuning.sola.guardReturnBase + player.armor * BALANCE_CONFIG.identityTuning.sola.guardReturnArmorRatio))} vitality as shield; armor still increases hit damage and area.`
        : "No secondary hit; armor increases hit damage and area.",
      bront: evolved ? `A second ${Math.round(tuning.evolvedRadius * area)}-unit blast lands after ${decimal(tuning.evolvedDelay)}s for ${roundedDamage(tuning.evolvedDamageBase + level * tuning.damagePerLevel, player, metadata)} damage.` : "No secondary hit.",
      fang: evolved
        ? `Every third swipe triggers Predator Hook, pulling non-boss targets inward by ${BALANCE_CONFIG.identityTuning.fang.predatorHookMin}–${BALANCE_CONFIG.identityTuning.fang.predatorHookMax} units; it adds no bleed or damage instance. Frenzy healing is unchanged.`
        : "During Frenzy, each hit repairs 0.1 vitality plus 5% of missing health.",
      gale: `Each tornado stuns for 0.25s on hit; ${evolved ? `evolution also refills Flow ${decimal((flowTuning.evolvedFlowMultiplier - 1) * 100, 0)}% faster` : "evolution improves Flow refill"}.`,
      rift: `${evolved ? `Resolved movement since the prior crash scales knockback from ${decimal(BALANCE_CONFIG.identityTuning.rift.kineticReserveMinScale, 2)}× to ${decimal(BALANCE_CONFIG.identityTuning.rift.kineticReserveMaxScale, 2)}×. ` : ""}Converts ${decimal(BALANCE_CONFIG.identityTuning.rift.damageShieldRatio * 100, 0)}% of damage into shield, capped at ${decimal(BALANCE_CONFIG.identityTuning.rift.damageShieldCapMaxHealth * 100, 0)}% max health.`,
      nova: `Hits apply Hex for ${decimal(BALANCE_CONFIG.identityTuning.nova.hexDuration, 0)}s for Veilstep to detonate.`,
      vesper: `Daggers leave 15s feathers; Blade Recall returns them with ${BALANCE_CONFIG.identityTuning.vesper.recallPierce} pierce regardless of evolution.`,
    }[player.specialist];
    return {
      damage: `${roundedDamage(damage, player, metadata)} / hit`,
      interval: flowRate ? `${decimal(flowRate, 1)} Flow/s · ${decimal(cadenceSeconds)}s from empty` : `${interval.toFixed(2)}s`,
      cooldownSeconds: cadenceSeconds,
      cadenceKind: flowRate ? "flow" : "cooldown",
      flowRate,
      projectiles: formatProjectileDisplay(metadata, counts[player.specialist]),
      radius: radiusValue == null ? "—" : `${Math.round(radiusValue)} units`,
      reach: reachValue == null ? "—" : `${Math.round(reachValue)} units`,
      pierce: pierceValue ? `${pierceValue} additional · up to ${pierceValue + 1} targets` : "Stops on first target",
      lifetime: projectileLife ? `${decimal(projectileLife)}s` : player.specialist === "bront" ? "Instant blast" : "Instant area hit",
      secondary,
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

export function signatureEvolutionTelemetry(specialistId, player) {
  const specialist = SPECIALISTS[specialistId];
  if (!specialist || !player) return null;
  const level = BALANCE_CONFIG.core.maxWeaponLevel;
  const passiveId = specialist.signature.passive;
  const passive = PASSIVES[passiveId];
  const pairedPlayer = Number(player.passives?.[passiveId] || 0) > 0
    ? player
    : previewPlayerUpgrade(player, { id: `passive:${passiveId}` });
  const unpaired = weaponTelemetry("signature", { level, evolved: false }, player);
  const base = weaponTelemetry("signature", { level, evolved: false }, pairedPlayer);
  const evolved = weaponTelemetry("signature", { level, evolved: true }, pairedPlayer);
  const fields = [
    ["cadence", "Cadence", "interval"], ["damage", "Damage", "damage"], ["projectiles", "Projectiles", "projectiles"],
    ["radius", "Radius", "radius"], ["reach", "Reach", "reach"], ["pierce", "Pierce", "pierce"],
    ["lifetime", "Lifetime", "lifetime"], ["secondary", "Secondary", "secondary"],
  ];
  const changes = fields
    .filter(([, , key]) => base[key] !== evolved[key])
    .map(([id, label, key]) => Object.freeze({ id, label, before: base[key], after: evolved[key] }));
  const pairedChanges = fields
    .filter(([, , key]) => unpaired[key] !== base[key])
    .map(([id, label, key]) => Object.freeze({ id, label, before: unpaired[key], after: base[key] }));
  const requirement = `Signature level ${level} + ${passive?.name || specialist.signature.passive} (rank 1+) + an elite access card`;
  const summary = changes.length
    ? changes.map((change) => `${change.label}: ${change.before} → ${change.after}`).join(" · ")
    : "No runtime signature change.";
  return Object.freeze({
    specialistId, base, evolved, changes: Object.freeze(changes), requirement, summary,
    pairedPassive: Object.freeze({ id: passiveId, name: passive?.name || passiveId, effect: passive?.amount || "Required passive", changes: Object.freeze(pairedChanges) }),
  });
}

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
      comparison("cooldown", after.cadenceKind === "flow" ? "Flow cadence" : "Cooldown", before?.interval || "—", after.interval),
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
