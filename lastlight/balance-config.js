// Balance is a versioned simulation input. Replays and fixtures should record
// this exact version so a future tuning pass never silently changes old runs.
export const BALANCE_VERSION = "2026.07.11-baseline.1";

export const BALANCE_IDS = Object.freeze({
  specialists: Object.freeze(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]),
  passives: Object.freeze(["damage", "haste", "maxHealth", "armor", "move", "area", "crit", "duration", "projectiles", "xp", "pickup", "regen"]),
  difficulties: Object.freeze(["story", "hard", "extreme"]),
  enemies: Object.freeze(["mite", "hound", "spitter", "brute", "bomber", "shark"]),
  universalWeapons: Object.freeze(["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"]),
});

const config = {
  version: BALANCE_VERSION,
  core: {
    baseVitality: 10,
    defaultDurationSeconds: 240,
    startingLevel: 1,
    startingXpNeed: 48,
    maxWeaponLevel: 5,
    maxWeaponSlots: 5,
    maxPassiveSlots: 6,
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
  difficulties: {
    story: { health: 1.2, attack: 1.3, spell: 1.2, gold: 1, spawn: 0.98, passiveRegen: 0.015 },
    hard: { health: 3, attack: 2, spell: 1.5, gold: 1.5, spawn: 1.35, passiveRegen: 0 },
    extreme: { health: 7, attack: 3, spell: 2, gold: 2.25, spawn: 1.68, passiveRegen: 0 },
  },
  enemies: {
    mite: { radius: 19, health: 42, speed: 92, damage: 0.75, xp: 6 },
    hound: { radius: 24, health: 88, speed: 132, damage: 1.3, xp: 9 },
    spitter: { radius: 25, health: 120, speed: 62, damage: 1.6, xp: 12 },
    brute: { radius: 36, health: 390, speed: 47, damage: 2.5, xp: 26 },
    bomber: { radius: 28, health: 170, speed: 76, damage: 3.85, xp: 18 },
    shark: { radius: 55, health: 1800, speed: 42, damage: 3.1, xp: 100 },
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
      composition: [
        { id: "bomber", after: 0.68, rollBelow: 0.18 },
        { id: "spitter", after: 0.52, rollBelow: 0.33 },
        { id: "brute", after: 0.34, rollBelow: 0.22 },
        { id: "hound", after: 0.13, rollBelow: 0.38 },
      ],
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
      sola: { cycle: 2.75, cyclePerLevel: -0.25, evolvedCycleSeconds: 1.5, countBase: 3, countEveryLevels: 2, speed: 650, damageBase: 26, damagePerLevel: 11, armorDamage: 1.2, spread: 0.12, radius: 7, pierce: 7, life: 0.62 },
      bront: { cycle: 4.8, cyclePerLevel: -0.20, evolvedCycle: 0.68, range: 700, radiusBase: 95, radiusPerLevel: 16, damageBase: 70, damagePerLevel: 24, evolvedDelay: 0.35, evolvedRadius: 155, evolvedDamageBase: 110 },
      fang: { cycle: 2, cyclePerLevel: -0.10, evolvedCycle: 0.68, offset: 86, radiusBase: 90, radiusPerLevel: 14, damageBase: 36, damagePerLevel: 19, maxHealthDamage: 1.5 },
      gale: { cycle: 0.25, cyclePerLevel: 0, evolvedCycle: 0.68, flowCost: 100, countBase: 1, countEveryLevels: 2, countCap: 7, speed: 430, damageBase: 65, damagePerLevel: 21, spread: 0.16, radiusBase: 14, radiusPerLevel: 2, pierce: 5, evolvedPierce: 12, life: 3.2 },
      rift: { cycle: 0.3, cyclePerLevel: 0, evolvedCycle: 0.68, offset: 58, radiusBase: 72, radiusPerLevel: 10, damageBase: 30, damagePerLevel: 13 },
      nova: { cycle: 3, cyclePerLevel: 0, evolvedCycle: 0.68, countBase: 1, countEveryLevels: 2, countCap: 8, speed: 360, damageBase: 53, damagePerLevel: 14, spread: 0.32, radius: 10, pierce: 8, life: 1.75, evolvedLife: 2.25 },
      vesper: { cycle: 2.5, cyclePerLevel: -0.125, evolvedCycle: 0.68, countBase: 1, countEveryLevels: 3, speed: 700, damageBase: 51, damagePerLevel: 14, spread: 0.09, radius: 7, pierce: 7, evolvedPierce: 14, life: 1.7 },
    },
    universal: {
      uwu: { cooldownBase: 0.75, cooldownPerLevel: -0.07, evolvedCooldown: 0.35, countBase: 1, countEveryLevels: 3, speed: 820, damageBase: 28, damagePerLevel: 10, spreadRandom: 0.045, radius: 5, evolvedPierce: 1 },
      slicers: { cooldown: 0.24, countBase: 2, countPerLevel: 1, orbitSpeed: 2.2, evolvedOrbitSpeed: 3.1, orbitRadius: 125, radius: 34, damageBase: 24, damagePerLevel: 9 },
      aura: { cooldown: 0.34, radiusBase: 105, radiusPerLevel: 26, damageBase: 16, damagePerLevel: 8, maxHealthDamage: 0.8 },
      mines: { cooldownBase: 6.8, cooldownPerLevel: -0.45, countBase: 2, countPerLevel: 1, spreadRandom: 0.15, orbitBase: 145, orbitPerLevel: 12, radiusBase: 50, radiusPerLevel: 8, fuseBase: 0.8, fusePerMine: 0.08, damageBase: 60, damagePerLevel: 25 },
      crossbow: { cooldownBase: 4.2, cooldownPerLevel: -0.25, countBase: 2, countPerLevel: 1, spread: 0.14, speed: 630, damageBase: 48, damagePerLevel: 17, radius: 6, pierce: 1, evolvedPierce: 8 },
      boomerang: { cooldownBase: 3.8, cooldownPerLevel: -0.2, countBase: 1, countEveryLevels: 2, spread: 0.2, speed: 490, damageBase: 65, damagePerLevel: 21, radius: 10, pierce: 8, life: 1.45 },
      rail: { cooldownBase: 3.7, cooldownPerLevel: -0.22, countBase: 1, countEveryLevels: 2, laneSpacing: 28, speed: 800, damageBase: 45, damagePerLevel: 18, radius: 9, pierce: 20 },
      glove: { cooldown: 2.7, streams: 1, evolvedStreams: 2, countBase: 2, countPerLevel: 1, orbitSpeed: 2.4, spread: 0.16, speed: 390, damageBase: 31, damagePerLevel: 13, radius: 11, pierce: 10, life: 2.2 },
      transit: { cooldownBase: 14, cooldownPerLevel: -0.8, yRange: 300, radius: 52, life: 2.5, damageBase: 135, damagePerLevel: 55, speed: 1700 },
      ice: { cooldownBase: 13, cooldownPerLevel: -0.6, evolvedCooldown: 9 },
      annihilator: { cooldownBase: 30, cooldownPerLevel: -1.4, evolvedCooldown: 21, radius: 900, fuse: 0.8, damageBase: 450, damagePerLevel: 175 },
      drone: { cooldownBase: 1.6, cooldownPerLevel: -0.1, rangeBase: 1100, rangePerLevel: 45, countBase: 1, countEveryLevels: 2, spread: 0.11, speedBase: 590, speedPerLevel: 12, damageBase: 40, damagePerLevel: 15, radius: 7, pierce: 1, evolvedPierce: 3, orbitSpeedBase: 1.15, orbitSpeedPerLevel: 0.09, orbitRadiusBase: 86, orbitRadiusPerLevel: 6, repairCooldownBase: 25, repairCooldownPerLevel: -2.5, initialRepairCooldownMin: 10, repairCooldownMin: 9, evolvedRepairMultiplier: 0.72 },
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
  for (const section of ["core", "specialists", "passives", "difficulties", "enemies", "waves", "weapons"]) {
    if (!candidate[section] || typeof candidate[section] !== "object") errors.push(`${section}: required`);
  }
  const requireExactIds = (path, value, ids) => {
    const actual = Object.keys(value || {}).sort();
    const expected = [...ids].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${path}: expected ${expected.join(", ")}; got ${actual.join(", ")}`);
  };
  requireExactIds("specialists", candidate.specialists, BALANCE_IDS.specialists);
  requireExactIds("passives", candidate.passives, BALANCE_IDS.passives);
  requireExactIds("difficulties", candidate.difficulties, BALANCE_IDS.difficulties);
  requireExactIds("enemies", candidate.enemies, BALANCE_IDS.enemies);
  requireExactIds("weapons.signatures", candidate.weapons?.signatures, BALANCE_IDS.specialists);
  requireExactIds("weapons.universal", candidate.weapons?.universal, BALANCE_IDS.universalWeapons);
  for (const key of ["baseVitality", "defaultDurationSeconds", "startingLevel", "startingXpNeed", "maxWeaponLevel", "maxWeaponSlots", "maxPassiveSlots"]) {
    requireFinite(`core.${key}`, candidate.core?.[key], { min: 0, exclusiveMin: true });
  }
  for (const [id, specialist] of Object.entries(candidate.specialists || {})) {
    for (const key of ["health", "speed", "cooldownE", "cooldownR"]) requireFinite(`specialists.${id}.${key}`, specialist[key], { min: 0, exclusiveMin: true });
    requireFinite(`specialists.${id}.armor`, specialist.armor, { min: 0 });
  }
  for (const [id, difficulty] of Object.entries(candidate.difficulties || {})) {
    for (const key of ["health", "attack", "spell", "gold", "spawn"]) requireFinite(`difficulties.${id}.${key}`, difficulty[key], { min: 0, exclusiveMin: true });
  }
  for (const [id, passive] of Object.entries(candidate.passives || {})) {
    requireFinite(`passives.${id}.amount`, passive.amount, { min: 0, exclusiveMin: true });
    requireFinite(`passives.${id}.max`, passive.max, { min: 0, exclusiveMin: true });
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
  const composition = candidate.waves?.spawn?.composition;
  if (!Array.isArray(composition) || !composition.length) errors.push("waves.spawn.composition: required");
  for (const [index, entry] of (composition || []).entries()) {
    if (!candidate.enemies?.[entry.id]) errors.push(`waves.spawn.composition.${index}.id: unknown enemy ${entry.id}`);
    requireFinite(`waves.spawn.composition.${index}.after`, entry.after, { min: 0 });
    requireFinite(`waves.spawn.composition.${index}.rollBelow`, entry.rollBelow, { min: 0 });
    if (entry.after > 1) errors.push(`waves.spawn.composition.${index}.after: must be <= 1`);
    if (entry.rollBelow > 1) errors.push(`waves.spawn.composition.${index}.rollBelow: must be <= 1`);
  }
  for (const id of Object.keys(candidate.specialists || {})) if (!candidate.weapons?.signatures?.[id]) errors.push(`weapons.signatures.${id}: required`);
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
