import { WEAPON_EVOLUTION_CONTRACT, validateWeaponEvolutionContract } from "./weapon-evolution.js?v=20260713.1";
import { validateEnemyIdentityContract } from "./enemy-archetypes.js?v=20260713.1";
import { APEX_CONTRACTS, validateApexContracts } from "./apex-encounters.js?v=20260713.1";
import { CAMPAIGN_MUTATIONS, validateCampaignMutations } from "./campaign-mutations.js?v=20260713.18";
import { SPECIALIST_MASTERY, validateSpecialistMasteryRegistry } from "./specialist-mastery.js?v=20260713.18";
import { RARE_DISCOVERY_REGISTRY, validateRareDiscoveryRegistry } from "./rare-discoveries.js?v=20260713.18";

// Balance is a versioned simulation input. Replays and fixtures should record
// this exact version so a future tuning pass never silently changes old runs.
export const BALANCE_VERSION = "2026.07.13-discoveries.1";

export const BALANCE_IDS = Object.freeze({
  specialists: Object.freeze(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]),
  passives: Object.freeze(["damage", "haste", "maxHealth", "armor", "move", "area", "crit", "duration", "projectiles", "xp", "pickup", "regen"]),
  difficulties: Object.freeze(["story", "hard", "extreme"]),
  enemies: Object.freeze(["mite", "hound", "spitter", "brute", "bomber", "shark"]),
  shieldAbilities: Object.freeze(["echoE", "solaE", "galeE", "riftE"]),
  universalWeapons: Object.freeze(["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"]),
  synergies: Object.freeze(["breach-window", "ultimate-resonance", "moving-screen"]),
});

const config = {
  version: BALANCE_VERSION,
  rareDiscoveries: RARE_DISCOVERY_REGISTRY,
  specialistMastery: SPECIALIST_MASTERY,
  campaignMutations: CAMPAIGN_MUTATIONS,
  evolutions: WEAPON_EVOLUTION_CONTRACT,
  apex: APEX_CONTRACTS,
  synergies: {
    version: "lastlight.squad-synergy.v1",
    breachWindow: {
      controlMinimumTicks: 30,
      followupWindowTicks: 150,
      targetCooldownTicks: 480,
      bonusDamageRatio: 0.2,
      bonusDamageCapBase: 4,
      bonusDamageCapPerLevel: 0.75,
      maxTrackedTargets: 16,
      maxProcsPerTick: 2,
    },
    ultimateResonance: {
      castWindowTicks: 180,
      teamCooldownTicks: 1200,
      contributorRange: 700,
      effectRadius: 650,
      shieldMaxHealth: 0.15,
      shieldCapMaxHealth: 0.35,
      maxWindowCasts: 4,
    },
    movingScreen: {
      evaluationIntervalTicks: 6,
      enterDistanceMin: 100,
      enterDistanceMax: 280,
      stayDistanceMin: 70,
      stayDistanceMax: 340,
      enterMoveRatio: 0.35,
      stayMoveRatio: 0.2,
      enterHeadingDegrees: 35,
      stayHeadingDegrees: 55,
      enterTicks: 48,
      leaveTicks: 24,
      directDamageMultiplier: 0.85,
      maxLinks: 6,
    },
  },
  core: {
    baseVitality: 10,
    defaultDurationSeconds: 240,
    startingLevel: 1,
    startingXpNeed: 48,
    maxWeaponLevel: 5,
    maxWeaponSlots: 5,
    maxPassiveSlots: 6,
    draft: {
      rerolls: 2,
      banishes: 2,
      skips: 1,
      choiceGold: 10,
      skipGold: 30,
      maxBanished: 2,
    },
  },
  specialists: {
    zuri: { health: 10, armor: 0, speed: 285, cooldownE: 8, cooldownR: 50 },
    echo: { health: 10, armor: 0, speed: 275, cooldownE: 16, cooldownR: 90 },
    sola: { health: 11, armor: 25, speed: 245, cooldownE: 17, cooldownR: 80 },
    bront: { health: 15, armor: 15, speed: 235, cooldownE: 12, cooldownR: 90 },
    fang: { health: 12, armor: 15, speed: 270, cooldownE: 17, cooldownR: 120 },
    gale: { health: 9.5, armor: 10, speed: 280, cooldownE: 10, cooldownR: 25 },
    rift: { health: 10, armor: 20, speed: 300, cooldownE: 8, cooldownR: 100 },
    nova: { health: 9, armor: 0, speed: 295, cooldownE: 15, cooldownR: 90 },
    vesper: { health: 9.5, armor: 0, speed: 275, cooldownE: 13, cooldownR: 90 },
  },
  identityTuning: {
    zuri: { speedPerHotStack: 0.10, maxHotStacks: 5, executeMissingHealthBonus: 1.0 },
    echo: { repeatChance: 0.25, repeatDelay: 0.25 },
    sola: { armorMultiplier: 2, aftershockShieldMaxHealth: 0.25, guardReturnBase: 0.15, guardReturnArmorRatio: 0.003, guardReturnMax: 0.45 },
    bront: { crashDashDistance: 170 },
    fang: { missingHealthDamageBonus: 0.60, signatureKnockbackScale: 0.22, predatorHookEvery: 3, predatorHookBase: 45, predatorHookMaxHealthRatio: 2, predatorHookMin: 65, predatorHookMax: 90 },
    gale: { flowPerSecond: 30, flowHasteRatio: 0.50, evolvedFlowMultiplier: 1.15, windwallKnockback: 240, windwallProjectilePadding: 18 },
    rift: { damageShieldRatio: 0.03, damageShieldCapMaxHealth: 0.35, damageShieldLockoutSeconds: 5, signatureKnockbackScale: 0.22, kineticReserveDistance: 120, kineticReserveMinScale: 0.12, kineticReserveMaxScale: 0.32 },
    nova: { hexDuration: 8 },
    vesper: { recallPierce: 30, innatePickupRadius: 299 },
  },
  movement: {
    version: "lastlight.movement.v1",
    profiles: {
      skirmisher: { acceleration: 17, braking: 22, startImpulse: .34, turnImpulse: .22, settleSpeed: 8, dashRecovery: .20, dashControl: .58, strafeSpeed: .96, backpedalSpeed: .88, leanDegrees: 3.5 },
      gunner: { acceleration: 14.5, braking: 20, startImpulse: .30, turnImpulse: .19, settleSpeed: 7, dashRecovery: .22, dashControl: .55, strafeSpeed: .92, backpedalSpeed: .80, leanDegrees: 3 },
      vanguard: { acceleration: 11.5, braking: 17, startImpulse: .25, turnImpulse: .15, settleSpeed: 6, dashRecovery: .28, dashControl: .43, strafeSpeed: .88, backpedalSpeed: .72, leanDegrees: 2.2 },
      brawler: { acceleration: 15, braking: 19, startImpulse: .32, turnImpulse: .20, settleSpeed: 7, dashRecovery: .24, dashControl: .50, strafeSpeed: .91, backpedalSpeed: .78, leanDegrees: 3.2 },
      caster: { acceleration: 13, braking: 21, startImpulse: .28, turnImpulse: .18, settleSpeed: 7, dashRecovery: .24, dashControl: .50, strafeSpeed: .90, backpedalSpeed: .77, leanDegrees: 2.6 },
    },
    specialists: {
      zuri: { profile: "skirmisher", facing: "aim" },
      echo: { profile: "gunner", facing: "aim" },
      sola: { profile: "vanguard", facing: "hybrid" },
      bront: { profile: "vanguard", facing: "contact" },
      fang: { profile: "brawler", facing: "contact" },
      gale: { profile: "skirmisher", facing: "aim" },
      rift: { profile: "brawler", facing: "contact" },
      nova: { profile: "caster", facing: "aim" },
      vesper: { profile: "gunner", facing: "hybrid" },
    },
  },
  passives: {
    damage: { amount: 0.10, max: 5 },
    haste: { amount: 10, max: 5 },
    maxHealth: { amount: 1.5, max: 5 },
    armor: { amount: 8, max: 5 },
    move: { amount: 0.09, max: 5 },
    area: { amount: 0.11, max: 5 },
    crit: { amount: 0.08, max: 5 },
    duration: { amount: 0.12, max: 5 },
    projectiles: { amount: 1, max: 5 },
    xp: { amount: 0.10, max: 5 },
    pickup: { amount: 0.35, max: 5 },
    regen: { amount: 0.04, max: 5 },
  },
  shields: {
    // Flat shield values use the same readable vitality units as player health.
    // The cap prevents short-cooldown actives from accumulating into effective
    // invulnerability while preserving larger one-off boons already in flight.
    echoE: { flatBase: 1.5, flatPerLevel: 0.25, maxHealth: 0, capMaxHealth: 0.5 },
    solaE: { flatBase: 0, flatPerLevel: 0, maxHealth: 0.25, capMaxHealth: 0.5 },
    galeE: { flatBase: 1.5, flatPerLevel: 0, maxHealth: 0.1, capMaxHealth: 0.5 },
    riftE: { flatBase: 2.5, flatPerLevel: 0, maxHealth: 0, capMaxHealth: 0.5 },
  },
  difficulties: {
    story: { health: 1.2, attack: 1.3, spell: 1.2, gold: 1, spawn: 0.98, passiveRegen: 0.015 },
    hard: { health: 2.5, attack: 1.8, spell: 1.4, gold: 1.5, spawn: 1.22, passiveRegen: 0 },
    extreme: { health: 4.5, attack: 2.4, spell: 1.7, gold: 2.25, spawn: 1.42, passiveRegen: 0 },
  },
  enemies: {
    mite: { radius: 19, health: 42, speed: 92, damage: 0.75, xp: 6 },
    hound: { radius: 24, health: 88, speed: 132, damage: 1.3, xp: 9 },
    spitter: { radius: 25, health: 120, speed: 62, damage: 1.6, xp: 12 },
    brute: { radius: 36, health: 390, speed: 47, damage: 2.5, xp: 26 },
    bomber: { radius: 28, health: 170, speed: 76, damage: 3.85, xp: 18 },
    shark: { radius: 55, health: 1800, speed: 42, damage: 3.1, xp: 100 },
  },
  enemyIdentity: {
    version: "lastlight.enemy-identity.v1",
    archetypes: {
      mite: { handler: "swarm-contact-v1", role: "swarm", contactCooldown: 0.8, weave: 0.18 },
      hound: { handler: "charge-v1", role: "flanker", contactCooldown: 0.8, triggerRange: 390, windup: 0.5, active: 0.3, recovery: 0.7, cooldown: 3, chargeSpeed: 440 },
      spitter: { handler: "kite-shot-v1", role: "suppressor", preferredRange: 330, retreatRange: 260, windup: 0.55, cooldownMin: 1.6, cooldownMax: 2.4, projectileSpeed: 260, projectileRadius: 9, projectileLife: 4 },
      brute: { handler: "slam-v1", role: "blocker", contactCooldown: 0.9, triggerRange: 125, windup: 0.8, recovery: 1.4, cooldown: 2.4, radius: 115 },
      bomber: { handler: "detonate-v1", role: "area-denial", triggerRange: 70, windup: 0.5, radius: 170 },
      shark: { handler: "siege-charge-v1", role: "linebreaker", contactCooldown: 1.3, triggerRange: 520, windup: 0.9, active: 0.6, recovery: 1.2, cooldown: 4, chargeSpeed: 360, endpointRadius: 150 },
    },
    spawnPhases: [
      { after: 0, weights: { mite: 100 } },
      { after: 0.13, weights: { mite: 62, hound: 38 } },
      { after: 0.34, weights: { mite: 45, hound: 33, brute: 22 } },
      { after: 0.52, weights: { mite: 35, hound: 32, spitter: 20, brute: 13 } },
      { after: 0.68, weights: { mite: 25, hound: 25, spitter: 20, brute: 12, bomber: 18 } },
    ],
    elite: {
      radiusMultiplier: 1.45,
      healthMultiplier: 7,
      speedMultiplier: 0.88,
      damageMultiplier: 1.4,
      xpMultiplier: 4,
      affixCount: 1,
      affixes: {
        hasted: { weight: 35, speedMultiplier: 1.2, cooldownMultiplier: 0.8 },
        shielded: { weight: 35, shieldMaxHealth: 0.35 },
        volatile: { weight: 30, windup: 0.55, radius: 150, damageMultiplier: 1.25, excludes: ["bomber"] },
      },
    },
  },
  waves: {
    names: ["Contact", "Pressure", "Pincer", "Heavy signal", "Breach", "Black tide", "Last stand", "Apex"],
    survivalWaveCount: 7,
    spawn: {
      intervalStart: 0.95,
      intervalProgressReduction: 0.65,
      openingRampSeconds: 35,
      openingIntervalMultiplier: 1.35,
      openingMultiplierReduction: 0.35,
      capStart: 65,
      capProgress: 105,
      capPerAdditionalPlayer: 32,
      distanceMin: 650,
      distanceMax: 880,
      healthProgressScale: 0.9,
    },
    events: {
      firstEliteAt: 0.16, eliteRepeat: 0.18, eliteBruteAfter: 0.6,
      firstMinibossAt: 0.44, minibossRepeat: 0.31,
      treasureFirstAt: 0.18, treasureFirstMin: 18, treasureFirstMax: 42,
      treasureRepeat: 0.5, treasureRepeatMin: 105,
      relayFirstAt: 0.46, relayFirstMin: 38, relayFirstMax: 88,
      relayRepeat: 0.62, relayRepeatMin: 150,
      objectivesAt: [0.28, 0.63],
    },
    xp: { base: 48, exponent: 1.16, activeLevel: 3, ultimateLevel: 6 },
    boss: {
      baseHealth: 14500,
      healthPerAdditionalPlayer: 0.55,
      speed: 68,
      contactDamage: 3.5,
      enrageAtSeconds: 300,
      lethalAtSeconds: 330,
    },
  },
  weapons: {
    system: { failedSignatureRetry: 0.08, criticalDamageMultiplier: 1.75, defaultProjectileRadius: 6, defaultProjectileLife: 2 },
    signatures: {
      zuri: { cycle: 2.5, cyclePerLevel: 0, evolvedCycle: 0.5, countBase: 2, countPerLevel: 1, speed: 780, damageBase: 31, damagePerLevel: 11, spread: 0.07, radius: 5, evolvedPierce: 4, life: 1.7 },
      echo: { cycle: 3, cyclePerLevel: -0.25, evolvedCycle: 0.68, countCap: 6, countPerLevel: 1, speed: 490, damageBase: 48, damagePerLevel: 14, spread: 0.17, radius: 12, pierce: 7, life: 1.9, evolvedLife: 2.6, repeatChance: 0.25, repeatDelay: 0.25 },
      sola: { cycle: 2.75, cyclePerLevel: -0.25, evolvedCycleSeconds: 1.5, countBase: 2, countEveryLevels: 2, speed: 650, damageBase: 20, damagePerLevel: 11, armorDamage: 0.85, spread: 0.38, radius: 7, pierce: 7, life: 0.62 },
      bront: { cycle: 4.8, cyclePerLevel: -0.20, evolvedCycle: 0.68, range: 700, radiusBase: 95, radiusPerLevel: 16, damageBase: 70, damagePerLevel: 24, evolvedDelay: 0.35, evolvedRadius: 155, evolvedDamageBase: 110 },
      fang: { cycle: 2, cyclePerLevel: -0.10, evolvedCycle: 0.78, offset: 86, radiusBase: 90, radiusPerLevel: 14, damageBase: 36, damagePerLevel: 14, maxHealthDamage: 0.75 },
      gale: { cycle: 0.25, cyclePerLevel: 0, evolvedCycle: 0.68, flowCost: 100, countBase: 1, countEveryLevels: 2, countCap: 7, speed: 430, damageBase: 65, damagePerLevel: 21, spread: 0.16, radiusBase: 14, radiusPerLevel: 2, pierce: 5, evolvedPierce: 12, life: 3.2 },
      rift: { cycle: 0.9, cyclePerLevel: 0, evolvedCycle: 0.75, offset: 58, radiusBase: 72, radiusPerLevel: 10, damageBase: 22, damagePerLevel: 18 },
      nova: { cycle: 2.8, cyclePerLevel: 0, evolvedCycle: 0.62, countBase: 1, countEveryLevels: 2, countCap: 8, speed: 480, damageBase: 58, damagePerLevel: 17, spread: 0.38, radius: 10, pierce: 8, life: 2.25, evolvedLife: 3 },
      vesper: { cycle: 2.5, cyclePerLevel: -0.125, evolvedCycle: 0.62, countBase: 1, countEveryLevels: 3, speed: 700, damageBase: 56, damagePerLevel: 16, spread: 0.32, radius: 7, pierce: 7, evolvedPierce: 14, life: 1.7 },
    },
    universal: {
      uwu: { cooldownBase: 0.75, cooldownPerLevel: -0.07, evolvedCooldown: 0.35, countBase: 1, countEveryLevels: 3, speed: 820, damageBase: 28, damagePerLevel: 10, spreadRandom: 0.045, radius: 5, evolvedRetargetRange: 240, evolvedRetargetDamageMultiplier: 0.7 },
      slicers: { cooldown: 0.24, countBase: 2, countPerLevel: 1, orbitSpeed: 2.2, evolvedOrbitSpeed: 3.1, orbitRadius: 125, radius: 34, damageBase: 24, damagePerLevel: 9 },
      aura: { cooldown: 0.34, radiusBase: 105, radiusPerLevel: 26, damageBase: 16, damagePerLevel: 8, maxHealthDamage: 0.8, evolvedChargeThreshold: 8, evolvedEruptionRadiusMultiplier: 1.45, evolvedEruptionDamageMultiplier: 2.5 },
      mines: { cooldownBase: 6.8, cooldownPerLevel: -0.45, countBase: 2, countPerLevel: 1, spreadRandom: 0.15, orbitBase: 145, orbitPerLevel: 12, radiusBase: 50, radiusPerLevel: 8, fuseBase: 0.8, fusePerMine: 0.08, damageBase: 60, damagePerLevel: 25, evolvedGroupSize: 3, evolvedChainFuseStep: 0.12, evolvedChainRadiusMultiplier: 1.25 },
      crossbow: { cooldownBase: 4.2, cooldownPerLevel: -0.25, countBase: 2, countPerLevel: 1, spread: 0.14, speed: 630, damageBase: 48, damagePerLevel: 17, radius: 6, pierce: 1, evolvedPierce: 8, corridorRange: 1400, corridorHalfWidth: 52, corridorMaxCandidates: 12, deepCritAfterTargets: 3 },
      boomerang: { cooldownBase: 3.8, cooldownPerLevel: -0.2, countBase: 1, countEveryLevels: 2, spread: 0.2, speed: 490, damageBase: 65, damagePerLevel: 21, radius: 10, pierce: 8, life: 1.45, returnAfter: 0.72, evolvedHitsPerPhase: 9, evolvedReturnTravelForMaxBonus: 360, evolvedReturnDamageMaxBonus: 0.3 },
      rail: { cooldownBase: 3.7, cooldownPerLevel: -0.22, countBase: 1, countEveryLevels: 2, laneSpacing: 28, speed: 800, damageBase: 45, damagePerLevel: 18, radius: 9, pierce: 20 },
      glove: { cooldown: 2.7, streams: 1, evolvedStreams: 2, countBase: 2, countPerLevel: 1, orbitSpeed: 2.4, spread: 0.16, speed: 390, damageBase: 31, damagePerLevel: 13, radius: 11, pierce: 10, life: 2.2 },
      transit: { cooldownBase: 14, cooldownPerLevel: -0.8, yRange: 300, radius: 52, life: 2.5, damageBase: 135, damagePerLevel: 55, speed: 1700, corridorHalfHeight: 58, corridorMaxCandidates: 12, evolvedPushDistance: 120, evolvedStun: 1.25, bossStun: 1 },
      ice: { cooldownBase: 13, cooldownPerLevel: -0.6, evolvedCooldown: 9 },
      annihilator: { cooldownBase: 30, cooldownPerLevel: -1.4, evolvedCooldown: 21, radius: 900, fuse: 0.8, damageBase: 450, damagePerLevel: 175 },
      drone: { cooldownBase: 1.6, cooldownPerLevel: -0.1, rangeBase: 1100, rangePerLevel: 45, countBase: 1, countEveryLevels: 2, spread: 0.11, speedBase: 590, speedPerLevel: 12, damageBase: 40, damagePerLevel: 15, radius: 7, pierce: 1, evolvedPierce: 3, orbitSpeedBase: 1.15, orbitSpeedPerLevel: 0.09, orbitRadiusBase: 86, orbitRadiusPerLevel: 6, repairCooldownBase: 25, repairCooldownPerLevel: -2.5, initialRepairCooldownMin: 10, repairCooldownMin: 9, evolvedRepairMultiplier: 0.72, pickupRangeBase: 115, pickupRangePerLevel: 38, evolvedPickupBonus: 95, protocolMotes: 5, protocolChargeCap: 1, protocolRepairThreshold: 0.7, protocolRepairMaxHealth: 0.25, protocolChainTargets: 3, protocolChainRange: 420 },
    },
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const BALANCE_CONFIG = deepFreeze(config);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalBalanceData(candidate = BALANCE_CONFIG) {
  return JSON.stringify(canonicalize(candidate));
}

export function balanceFingerprint(candidate = BALANCE_CONFIG) {
  const text = canonicalBalanceData(candidate);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export const BALANCE_HASH = balanceFingerprint(BALANCE_CONFIG);

export function validateBalanceConfig(candidate = BALANCE_CONFIG) {
  const errors = [];
  const requireFinite = (path, value, { min = -Infinity, exclusiveMin = false } = {}) => {
    if (!Number.isFinite(value)) errors.push(`${path}: must be finite`);
    else if (exclusiveMin ? value <= min : value < min) errors.push(`${path}: must be ${exclusiveMin ? ">" : ">="} ${min}`);
  };
  if (!candidate || typeof candidate !== "object") return ["config: must be an object"];
  if (typeof candidate.version !== "string" || !candidate.version.trim()) errors.push("version: required");
  for (const section of ["core", "rareDiscoveries", "specialistMastery", "campaignMutations", "evolutions", "apex", "synergies", "specialists", "identityTuning", "movement", "passives", "shields", "difficulties", "enemies", "enemyIdentity", "waves", "weapons"]) {
    if (!candidate[section] || typeof candidate[section] !== "object") errors.push(`${section}: required`);
  }
  const requireExactIds = (path, value, ids) => {
    const actual = Object.keys(value || {}).sort();
    const expected = [...ids].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${path}: expected ${expected.join(", ")}; got ${actual.join(", ")}`);
  };
  requireExactIds("specialists", candidate.specialists, BALANCE_IDS.specialists);
  requireExactIds("identityTuning", candidate.identityTuning, BALANCE_IDS.specialists);
  requireExactIds("movement.specialists", candidate.movement?.specialists, BALANCE_IDS.specialists);
  requireExactIds("passives", candidate.passives, BALANCE_IDS.passives);
  requireExactIds("shields", candidate.shields, BALANCE_IDS.shieldAbilities);
  requireExactIds("difficulties", candidate.difficulties, BALANCE_IDS.difficulties);
  requireExactIds("enemies", candidate.enemies, BALANCE_IDS.enemies);
  requireExactIds("weapons.signatures", candidate.weapons?.signatures, BALANCE_IDS.specialists);
  requireExactIds("weapons.universal", candidate.weapons?.universal, BALANCE_IDS.universalWeapons);
  for (const key of ["baseVitality", "defaultDurationSeconds", "startingLevel", "startingXpNeed", "maxWeaponLevel", "maxWeaponSlots", "maxPassiveSlots"]) {
    requireFinite(`core.${key}`, candidate.core?.[key], { min: 0, exclusiveMin: true });
  }
  errors.push(...validateApexContracts(candidate.apex).map((error) => `apex.${error}`));
  errors.push(...validateCampaignMutations(candidate.campaignMutations).map((error) => `campaignMutations.${error}`));
  errors.push(...validateSpecialistMasteryRegistry(candidate.specialistMastery).map((error) => `specialistMastery.${error}`));
  errors.push(...validateRareDiscoveryRegistry(candidate.rareDiscoveries).map((error) => `rareDiscoveries.${error}`));
  const synergy = candidate.synergies || {};
  const exactSynergyKeys = (path, value, expected) => {
    const actual = Object.keys(value || {}).sort(), wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) errors.push(`${path}: expected ${wanted.join(", ")}; got ${actual.join(", ")}`);
  };
  exactSynergyKeys("synergies", synergy, ["version", "breachWindow", "ultimateResonance", "movingScreen"]);
  if (synergy.version !== "lastlight.squad-synergy.v1") errors.push("synergies.version: unsupported version");
  exactSynergyKeys("synergies.breachWindow", synergy.breachWindow, ["controlMinimumTicks", "followupWindowTicks", "targetCooldownTicks", "bonusDamageRatio", "bonusDamageCapBase", "bonusDamageCapPerLevel", "maxTrackedTargets", "maxProcsPerTick"]);
  exactSynergyKeys("synergies.ultimateResonance", synergy.ultimateResonance, ["castWindowTicks", "teamCooldownTicks", "contributorRange", "effectRadius", "shieldMaxHealth", "shieldCapMaxHealth", "maxWindowCasts"]);
  exactSynergyKeys("synergies.movingScreen", synergy.movingScreen, ["evaluationIntervalTicks", "enterDistanceMin", "enterDistanceMax", "stayDistanceMin", "stayDistanceMax", "enterMoveRatio", "stayMoveRatio", "enterHeadingDegrees", "stayHeadingDegrees", "enterTicks", "leaveTicks", "directDamageMultiplier", "maxLinks"]);
  for (const [key, value] of Object.entries(synergy.breachWindow || {})) if (key !== "bonusDamageRatio") requireFinite(`synergies.breachWindow.${key}`, value, { min: 0, exclusiveMin: true });
  requireFinite("synergies.breachWindow.bonusDamageRatio", synergy.breachWindow?.bonusDamageRatio, { min: 0, exclusiveMin: true });
  for (const [key, value] of Object.entries(synergy.ultimateResonance || {})) requireFinite(`synergies.ultimateResonance.${key}`, value, { min: 0, exclusiveMin: true });
  for (const [key, value] of Object.entries(synergy.movingScreen || {})) requireFinite(`synergies.movingScreen.${key}`, value, { min: 0, exclusiveMin: true });
  if (synergy.breachWindow?.controlMinimumTicks > synergy.breachWindow?.followupWindowTicks) errors.push("synergies.breachWindow.controlMinimumTicks: must not exceed followup window");
  if (synergy.ultimateResonance?.effectRadius > synergy.ultimateResonance?.contributorRange) errors.push("synergies.ultimateResonance.effectRadius: must not exceed contributor range");
  if (synergy.ultimateResonance?.shieldMaxHealth > synergy.ultimateResonance?.shieldCapMaxHealth) errors.push("synergies.ultimateResonance.shieldMaxHealth: must not exceed shield cap");
  if (synergy.movingScreen?.stayDistanceMin > synergy.movingScreen?.enterDistanceMin || synergy.movingScreen?.stayDistanceMax < synergy.movingScreen?.enterDistanceMax) errors.push("synergies.movingScreen: stay distance must contain enter distance");
  if (synergy.movingScreen?.stayMoveRatio > synergy.movingScreen?.enterMoveRatio || synergy.movingScreen?.stayHeadingDegrees < synergy.movingScreen?.enterHeadingDegrees) errors.push("synergies.movingScreen: stay thresholds must provide hysteresis");
  if (synergy.movingScreen?.directDamageMultiplier >= 1) errors.push("synergies.movingScreen.directDamageMultiplier: must be < 1");
  for (const key of ["rerolls", "banishes", "skips", "choiceGold", "skipGold", "maxBanished"]) {
    requireFinite(`core.draft.${key}`, candidate.core?.draft?.[key], { min: 0 });
  }
  if (candidate.core.draft.maxBanished !== candidate.core.draft.banishes) throw new TypeError("core.draft maxBanished must equal the banish budget");
  if (candidate.core.draft.skipGold <= candidate.core.draft.choiceGold) throw new TypeError("core.draft skipGold must exceed the ordinary choice reward");
  for (const [id, specialist] of Object.entries(candidate.specialists || {})) {
    for (const key of ["health", "speed", "cooldownE", "cooldownR"]) requireFinite(`specialists.${id}.${key}`, specialist[key], { min: 0, exclusiveMin: true });
    requireFinite(`specialists.${id}.armor`, specialist.armor, { min: 0 });
  }
  for (const [id, tuning] of Object.entries(candidate.identityTuning || {})) {
    for (const [key, value] of Object.entries(tuning)) requireFinite(`identityTuning.${id}.${key}`, value, { min: 0 });
  }
  const movementProfiles = candidate.movement?.profiles || {};
  if (typeof candidate.movement?.version !== "string" || !candidate.movement.version.trim()) errors.push("movement.version: required");
  for (const [id, profile] of Object.entries(movementProfiles)) {
    for (const key of ["acceleration", "braking", "settleSpeed", "dashRecovery", "strafeSpeed", "backpedalSpeed", "leanDegrees"]) requireFinite(`movement.profiles.${id}.${key}`, profile[key], { min: 0, exclusiveMin: true });
    for (const key of ["startImpulse", "turnImpulse", "dashControl"]) {
      requireFinite(`movement.profiles.${id}.${key}`, profile[key], { min: 0 });
      if (profile[key] > 1) errors.push(`movement.profiles.${id}.${key}: must be <= 1`);
    }
  }
  for (const [id, policy] of Object.entries(candidate.movement?.specialists || {})) {
    if (!movementProfiles[policy.profile]) errors.push(`movement.specialists.${id}.profile: unknown profile ${policy.profile}`);
    if (!["aim", "hybrid", "contact"].includes(policy.facing)) errors.push(`movement.specialists.${id}.facing: unsupported policy ${policy.facing}`);
  }
  for (const [id, difficulty] of Object.entries(candidate.difficulties || {})) {
    for (const key of ["health", "attack", "spell", "gold", "spawn"]) requireFinite(`difficulties.${id}.${key}`, difficulty[key], { min: 0, exclusiveMin: true });
  }
  for (const [id, passive] of Object.entries(candidate.passives || {})) {
    requireFinite(`passives.${id}.amount`, passive.amount, { min: 0, exclusiveMin: true });
    requireFinite(`passives.${id}.max`, passive.max, { min: 0, exclusiveMin: true });
  }
  for (const [id, shield] of Object.entries(candidate.shields || {})) {
    for (const key of ["flatBase", "flatPerLevel", "maxHealth"]) requireFinite(`shields.${id}.${key}`, shield[key], { min: 0 });
    requireFinite(`shields.${id}.capMaxHealth`, shield.capMaxHealth, { min: 0, exclusiveMin: true });
  }
  for (const [id, enemy] of Object.entries(candidate.enemies || {})) {
    for (const key of ["radius", "health", "speed", "damage", "xp"]) requireFinite(`enemies.${id}.${key}`, enemy[key], { min: 0, exclusiveMin: true });
  }
  for (const [group, weapons] of Object.entries(candidate.weapons || {})) {
    for (const [id, weapon] of Object.entries(weapons || {})) {
      for (const [key, value] of Object.entries(weapon)) {
        if (typeof value === "number") requireFinite(`weapons.${group}.${id}.${key}`, value);
      }
    }
  }
  const names = candidate.waves?.names;
  if (!Array.isArray(names) || names.length !== Number(candidate.waves?.survivalWaveCount) + 1) errors.push("waves.names: must contain every survival wave plus Apex");
  errors.push(...validateEnemyIdentityContract(candidate.enemyIdentity, candidate.enemies).map((error) => `enemyIdentity.${error}`));
  for (const id of Object.keys(candidate.specialists || {})) if (!candidate.weapons?.signatures?.[id]) errors.push(`weapons.signatures.${id}: required`);
  errors.push(...validateWeaponEvolutionContract(candidate.evolutions, candidate).map((error) => `evolutions.${error}`));
  return errors;
}

// Validated accessor for replay manifests, fixtures, and future balance
// selection. It intentionally rejects unknown versions instead of falling back.
export function getBalanceConfig(version = BALANCE_VERSION) {
  if (version !== BALANCE_VERSION) throw new RangeError(`Unknown balance version: ${version}`);
  const errors = validateBalanceConfig(BALANCE_CONFIG);
  if (errors.length) throw new TypeError(`Invalid balance config: ${errors.join("; ")}`);
  return BALANCE_CONFIG;
}

export function getBalanceManifest() {
  getBalanceConfig();
  return Object.freeze({ balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH });
}

export function valueAtLevel(base, perLevel, level) {
  return Number(base) + (Math.max(1, Number(level) || 1) - 1) * Number(perLevel || 0);
}
