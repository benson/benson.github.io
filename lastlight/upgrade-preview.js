import { BALANCE_CONFIG } from "./balance-config.js?v=20260718.9";
import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260718.9";
import { formatProjectileDisplay, getCombatMetadata } from "./combat-metadata.js?v=20260718.9";
import { playerCombatStat, playerMovementSpeed, previewPlayerUpgrade } from "./engine.js?v=20260718.9";
import { passiveBuildcraft, sourceBuildcraft } from "./synergy-tags.js?v=20260718.9";

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
        ? `Guard Return: the first hit each volley returns ${decimal(Math.min(BALANCE_CONFIG.identityTuning.sola.guardReturnMax, BALANCE_CONFIG.identityTuning.sola.guardReturnBase + player.armor * BALANCE_CONFIG.identityTuning.sola.guardReturnArmorRatio))} vitality as shield; armor still increases hit damage and area.`
        : "No secondary hit; armor increases hit damage and area.",
      bront: evolved ? `A second ${Math.round(tuning.evolvedRadius * area)}-unit blast lands after ${decimal(tuning.evolvedDelay)}s for ${roundedDamage(tuning.evolvedDamageBase + level * tuning.damagePerLevel, player, metadata)} damage.` : "No secondary hit.",
      fang: evolved
        ? `Every third swipe triggers Predator Hook, pulling non-boss targets inward by ${BALANCE_CONFIG.identityTuning.fang.predatorHookMin}–${BALANCE_CONFIG.identityTuning.fang.predatorHookMax} units; it adds no bleed or damage instance. Frenzy healing is unchanged.`
        : "During Frenzy, each hit repairs 0.1 vitality plus 5% of missing health.",
      gale: `Each tornado stuns for 0.25s on hit; ${evolved ? `evolution also refills Flow ${decimal((flowTuning.evolvedFlowMultiplier - 1) * 100, 0)}% faster` : "evolution improves Flow refill"}.`,
      rift: `${evolved ? `Kinetic Reserve: resolved movement since the prior crash scales knockback from ${decimal(BALANCE_CONFIG.identityTuning.rift.kineticReserveMinScale, 2)}× to ${decimal(BALANCE_CONFIG.identityTuning.rift.kineticReserveMaxScale, 2)}×. ` : ""}Converts ${decimal(BALANCE_CONFIG.identityTuning.rift.damageShieldRatio * 100, 0)}% of damage into shield, capped at ${decimal(BALANCE_CONFIG.identityTuning.rift.damageShieldCapMaxHealth * 100, 0)}% max health.`,
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

export function buildUpgradeComparison(choice, player, { replacementId = "" } = {}) {
  if (!choice || !player) return [];
  const preview = previewPlayerUpgrade(player, choice, { replacementId });
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

export function playerBuildStats(player) {
  return Object.freeze({
    hp: Number(player.hp), maxHealth: Number(player.maxHp), armor: Number(player.armor),
    damage: playerCombatStat(player, "damage"), haste: playerCombatStat(player, "haste"), area: playerCombatStat(player, "area"),
    crit: playerCombatStat(player, "crit"), duration: playerCombatStat(player, "duration"), projectiles: playerCombatStat(player, "projectiles"),
    xp: playerCombatStat(player, "xp"), pickup: playerCombatStat(player, "pickup"), regen: playerCombatStat(player, "regen"), move: playerMovementSpeed(player),
  });
}

function equippedSources(player, gameLevel = 0) {
  const weapons = Object.entries(player.weapons || {}).filter(([, weapon]) => weapon && Number(weapon.level || 0) > 0).map(([sourceId, weapon]) => ({
    id: sourceId, name: sourceId === "signature" ? SPECIALISTS[player.specialist].signature.name : WEAPONS[sourceId]?.name || sourceId,
    metadata: getCombatMetadata(sourceId, player.specialist), tags: sourceBuildcraft(sourceId, { specialistId: player.specialist, evolved: weapon.evolved }),
  }));
  const abilities = [
    { id: "ability:e", name: "Active ability", unlockLevel: 3 },
    { id: "ability:r", name: "Ultimate", unlockLevel: 6 },
  ].filter(({ unlockLevel }) => gameLevel >= unlockLevel).map(({ id, name }) => ({ id, name, metadata: getCombatMetadata(id, player.specialist), tags: null }));
  return [...weapons, ...abilities];
}

function evolutionProgress(player) {
  return Object.entries(player.weapons || {}).map(([sourceId, weapon], order) => {
    const passiveId = sourceId === "signature" ? SPECIALISTS[player.specialist].signature.passive : WEAPONS[sourceId]?.passive;
    const levelReady = Number(weapon.level || 0) >= BALANCE_CONFIG.core.maxWeaponLevel;
    const pairReady = Number(player.passives?.[passiveId] || 0) > 0;
    return Object.freeze({ sourceId, order, passiveId, level: Number(weapon.level || 0), levelReady, pairReady, evolved: Boolean(weapon.evolved), ready: levelReady && pairReady && !weapon.evolved });
  });
}

export function forecastDraftChoice(choice, player, { gold = 0, gameLevel = 0, replacementId = "" } = {}) {
  if (!choice || !player) return null;
  const [kind, target] = String(choice.id).split(":");
  const categoryFull = kind === "weapon" ? Object.keys(player.weapons || {}).length >= BALANCE_CONFIG.core.maxWeaponSlots : kind === "passive" ? Object.values(player.passives || {}).filter((rank) => Number(rank) > 0).length >= BALANCE_CONFIG.core.maxPassiveSlots : false;
  const targetUnowned = kind === "weapon" ? !player.weapons?.[target] : kind === "passive" ? Number(player.passives?.[target] || 0) < 1 : false;
  const requiresReplacement = !replacementId && categoryFull && targetUnowned;
  const afterPlayer = requiresReplacement ? previewPlayerUpgrade(player, null) : previewPlayerUpgrade(player, choice, { replacementId }), beforeStats = playerBuildStats(player), afterStats = playerBuildStats(afterPlayer);
  const statChanges = Object.keys(beforeStats).filter((id) => beforeStats[id] !== afterStats[id]).map((id) => Object.freeze({ id, before: beforeStats[id], after: afterStats[id], direction: afterStats[id] > beforeStats[id] ? "up" : "down" }));
  const changedIds = new Set(statChanges.map(({ id }) => id));
  const affectedSources = equippedSources(afterPlayer, gameLevel).filter(({ metadata }) => metadata?.scalesWith.some((id) => changedIds.has(id))).map(({ id, name, tags }) => Object.freeze({ id, name, tags }));
  const beforeWeapons = Object.keys(player.weapons || {}).length, afterWeapons = Object.keys(afterPlayer.weapons || {}).length;
  const beforePassives = Object.values(player.passives || {}).filter((rank) => Number(rank) > 0).length, afterPassives = Object.values(afterPlayer.passives || {}).filter((rank) => Number(rank) > 0).length;
  const tags = kind === "weapon"
    ? sourceBuildcraft(target, { specialistId: player.specialist, evolved: Boolean(afterPlayer.weapons?.[target]?.evolved) })
    : kind === "passive" ? passiveBuildcraft(target) : null;
  const beforeEvolution = evolutionProgress(player), afterEvolution = evolutionProgress(afterPlayer);
  const newlyReady = afterEvolution.filter((after) => after.ready && !beforeEvolution.find((before) => before.sourceId === after.sourceId)?.ready);
  const noLongerReady = beforeEvolution.filter((before) => before.ready && !afterEvolution.find((after) => after.sourceId === before.sourceId)?.ready);
  const removed = replacementId ? Object.freeze({
    id: replacementId, kind,
    name: kind === "weapon" ? WEAPONS[replacementId]?.name || replacementId : PASSIVES[replacementId]?.name || replacementId,
    level: kind === "weapon" ? Number(player.weapons?.[replacementId]?.level || 0) : Number(player.passives?.[replacementId] || 0),
    evolved: kind === "weapon" ? Boolean(player.weapons?.[replacementId]?.evolved) : false,
    details: kind === "weapon" ? weaponTelemetry(replacementId, player.weapons[replacementId], player) : Object.freeze({ stat: globalStat(replacementId, player)[1] }),
  }) : null;
  return Object.freeze({
    choiceId: choice.id, replacementId, removed, requiresReplacement, comparisonRows: Object.freeze(requiresReplacement ? [comparison("replacement", "Loadout", "Full", "Choose replacement")] : buildUpgradeComparison(choice, player, { replacementId })), beforeStats, afterStats,
    statChanges: Object.freeze(statChanges), affectedSources: Object.freeze(affectedSources), tags,
    evolution: Object.freeze({ before: Object.freeze(beforeEvolution), after: Object.freeze(afterEvolution), newlyReady: Object.freeze(newlyReady), noLongerReady: Object.freeze(noLongerReady), nextEligible: afterEvolution.find(({ ready }) => ready)?.sourceId || null }),
    slots: Object.freeze({ weapons: Object.freeze({ before: beforeWeapons, after: afterWeapons, max: BALANCE_CONFIG.core.maxWeaponSlots }), passives: Object.freeze({ before: beforePassives, after: afterPassives, max: BALANCE_CONFIG.core.maxPassiveSlots }) }),
    economy: Object.freeze({ before: Number(gold) || 0, after: Number(gold) || 0, delta: 0 }),
    afterPlayer,
  });
}
