/**
 * The canonical asset contract for a Lastlight visual theme.
 *
 * Asset paths are relative to lastlight/index.html. A replacement theme keeps
 * these logical keys and swaps only the values, so game data never needs to
 * know which art direction is active.
 */

export const THEME_ASSET_KEYS = deepFreeze({
  specialists: ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"],
  signatureWeapons: ["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"],
  universalWeapons: ["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"],
  environments: ["warehouse", "outskirts", "lab", "beachhead"],
  effects: ["xpShard", "hostileBolt", "barricade"],
  archiveEvents: ["eliteAccessCard", "treasureRunner", "relayBall"],
  archiveBoons: ["cruiseControl", "firedUp", "healthback", "squadShield", "stopwaves", "ultraRapidFire"],
  archiveAugments: [
    "glassCannon",
    "bulletMania",
    "cardCollector",
    "celebration",
    "crossCountry",
    "deathAndTaxes",
    "eliteBomber",
    "experiencedFighter",
    "largerThanLife",
    "longRange",
    "metabolicOverdrive",
    "missionCritical",
    "sprayAndPray",
    "uptimeUpgrade",
    "withHaste",
  ],
});

const LASTLIGHT_ASSETS = {
  specialists: {
    zuri: "assets/sprites/zuri.png",
    echo: "assets/sprites/echo.png",
    sola: "assets/sprites/sola.png",
    bront: "assets/sprites/bront.png",
    fang: "assets/sprites/fang.png",
    gale: "assets/sprites/gale.png",
    rift: "assets/sprites/rift.png",
    nova: "assets/sprites/nova.png",
    vesper: "assets/sprites/vesper.png",
  },
  weapons: {
    signatures: {
      zuri: "assets/weapons/signature-zuri.webp",
      echo: "assets/weapons/signature-echo.webp",
      sola: "assets/weapons/signature-sola.webp",
      bront: "assets/weapons/signature-bront.webp",
      fang: "assets/weapons/signature-fang.webp",
      gale: "assets/weapons/signature-gale.webp",
      rift: "assets/weapons/signature-rift.webp",
      nova: "assets/weapons/signature-nova.webp",
      vesper: "assets/weapons/signature-vesper.webp",
    },
    universal: {
      uwu: "assets/weapons/uwu.webp",
      slicers: "assets/weapons/slicers.webp",
      aura: "assets/weapons/aura.webp",
      mines: "assets/weapons/mines.webp",
      crossbow: "assets/weapons/crossbow.webp",
      boomerang: "assets/weapons/boomerang.webp",
      rail: "assets/weapons/rail.webp",
      glove: "assets/weapons/glove.webp",
      transit: "assets/weapons/transit.webp",
      ice: "assets/weapons/ice.webp",
      annihilator: "assets/weapons/annihilator.webp",
      drone: "assets/weapons/drone.webp",
    },
  },
  environments: {
    warehouse: "assets/environments/warehouse.webp",
    outskirts: "assets/environments/outskirts.webp",
    lab: "assets/environments/lab.webp",
    beachhead: "assets/environments/beachhead.webp",
  },
  effects: {
    xpShard: "assets/effects/xp-shard.webp",
    hostileBolt: "assets/effects/hostile-bolt.webp",
    barricade: "assets/effects/barricade.webp",
  },
  archive: {
    events: {
      eliteAccessCard: "assets/archive/elite-access-card.webp",
      treasureRunner: "assets/archive/treasure-runner.webp",
      relayBall: "assets/archive/relay-ball.webp",
    },
    boons: {
      cruiseControl: "assets/archive/cruise-control.webp",
      firedUp: "assets/archive/fired-up.webp",
      healthback: "assets/archive/healthback.webp",
      squadShield: "assets/archive/squad-shield.webp",
      stopwaves: "assets/archive/stopwaves.webp",
      ultraRapidFire: "assets/archive/ultra-rapid-fire-r.webp",
    },
    augments: {
      glassCannon: "assets/archive/glass-cannon.webp",
      bulletMania: "assets/archive/bullet-mania.webp",
      cardCollector: "assets/archive/card-collector.webp",
      celebration: "assets/archive/celebration.webp",
      crossCountry: "assets/archive/cross-country.webp",
      deathAndTaxes: "assets/archive/death-and-taxes.webp",
      eliteBomber: "assets/archive/elite-bomber.webp",
      experiencedFighter: "assets/archive/experienced-fighter.webp",
      largerThanLife: "assets/archive/larger-than-life.webp",
      longRange: "assets/archive/long-range.webp",
      metabolicOverdrive: "assets/archive/metabolic-overdrive.webp",
      missionCritical: "assets/archive/mission-critical.webp",
      sprayAndPray: "assets/archive/spray-and-pray.webp",
      uptimeUpgrade: "assets/archive/uptime-upgrade.webp",
      withHaste: "assets/archive/with-haste.webp",
    },
  },
};

export const LASTLIGHT_THEME = defineTheme({
  id: "lastlight",
  name: "Lastlight",
  assets: LASTLIGHT_ASSETS,
});

/** Resolve a dotted logical key such as `archive.augments.glassCannon`. */
export function getThemeAsset(assetKey, theme = LASTLIGHT_THEME) {
  const parts = String(assetKey).split(".").filter(Boolean);
  let value = theme?.assets;
  for (const part of parts) value = value?.[part];
  if (typeof value !== "string") throw new Error(`Unknown theme asset: ${assetKey}`);
  return value;
}

/** Validate and freeze a replacement theme before it enters the registry. */
export function defineTheme(theme) {
  const result = validateTheme(theme);
  if (!result.valid) throw new Error(`Invalid theme manifest:\n- ${result.errors.join("\n- ")}`);
  return deepFreeze(theme);
}

/**
 * Check that a theme satisfies the stable logical-key contract and does not
 * accidentally reuse a file for two different assets.
 */
export function validateTheme(theme) {
  const errors = [];
  if (!theme || typeof theme !== "object") return { valid: false, errors: ["Theme must be an object."], assetCount: 0 };
  if (typeof theme.id !== "string" || !theme.id.trim()) errors.push("Theme id must be a non-empty string.");
  if (typeof theme.name !== "string" || !theme.name.trim()) errors.push("Theme name must be a non-empty string.");

  const groups = [
    ["specialists", theme.assets?.specialists, THEME_ASSET_KEYS.specialists],
    ["weapons.signatures", theme.assets?.weapons?.signatures, THEME_ASSET_KEYS.signatureWeapons],
    ["weapons.universal", theme.assets?.weapons?.universal, THEME_ASSET_KEYS.universalWeapons],
    ["environments", theme.assets?.environments, THEME_ASSET_KEYS.environments],
    ["effects", theme.assets?.effects, THEME_ASSET_KEYS.effects],
    ["archive.events", theme.assets?.archive?.events, THEME_ASSET_KEYS.archiveEvents],
    ["archive.boons", theme.assets?.archive?.boons, THEME_ASSET_KEYS.archiveBoons],
    ["archive.augments", theme.assets?.archive?.augments, THEME_ASSET_KEYS.archiveAugments],
  ];

  const paths = [];
  for (const [groupName, group, requiredKeys] of groups) {
    if (!group || typeof group !== "object") {
      errors.push(`Missing asset group: ${groupName}.`);
      continue;
    }

    const actualKeys = Object.keys(group);
    for (const key of requiredKeys) {
      const path = group[key];
      if (typeof path !== "string" || !/^assets\/[a-z0-9/_-]+\.(?:png|webp)$/.test(path)) {
        errors.push(`${groupName}.${key} must be a relative PNG or WebP asset path.`);
      } else {
        paths.push([`${groupName}.${key}`, path]);
      }
    }
    for (const key of actualKeys) {
      if (!requiredKeys.includes(key)) errors.push(`Unexpected asset key: ${groupName}.${key}.`);
    }
  }

  const ownersByPath = new Map();
  for (const [key, path] of paths) {
    const previous = ownersByPath.get(path);
    if (previous) errors.push(`Asset path ${path} is reused by ${previous} and ${key}.`);
    else ownersByPath.set(path, key);
  }

  return { valid: errors.length === 0, errors, assetCount: paths.length };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
