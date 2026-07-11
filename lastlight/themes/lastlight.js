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
  enemies: ["mite", "hound", "spitter", "brute", "bomber", "shark"],
  effects: ["xpShard", "hostileBolt", "barricade"],
  guidePassives: ["damage", "haste", "maxHealth", "armor", "move", "area", "crit", "duration", "projectiles", "xp", "pickup", "regen"],
  guideEnemies: ["mite", "hound", "spitter", "brute", "bomber", "shark"],
  guideField: ["combatData", "supplyCache", "hostileProjectile", "repairKit", "relayBall", "fieldDevice"],
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
  enemies: {
    mite: "assets/enemies/skitter.webp",
    hound: "assets/enemies/rusher.webp",
    spitter: "assets/enemies/spitter.webp",
    brute: "assets/enemies/brute.webp",
    bomber: "assets/enemies/bomber.webp",
    shark: "assets/enemies/siegebreaker.webp",
  },
  effects: {
    xpShard: "assets/effects/xp-shard.webp",
    hostileBolt: "assets/effects/hostile-bolt.webp",
    barricade: "assets/effects/barricade.webp",
  },
  guide: {
    passives: {
      damage: "assets/guide/passives/output.webp",
      haste: "assets/guide/passives/cycle-rate.webp",
      maxHealth: "assets/guide/passives/hull.webp",
      armor: "assets/guide/passives/plating.webp",
      move: "assets/guide/passives/thrusters.webp",
      area: "assets/guide/passives/field-size.webp",
      crit: "assets/guide/passives/critical-link.webp",
      duration: "assets/guide/passives/persistence.webp",
      projectiles: "assets/guide/passives/multishot.webp",
      xp: "assets/guide/passives/data-gain.webp",
      pickup: "assets/guide/passives/magnetics.webp",
      regen: "assets/guide/passives/repair.webp",
    },
    enemies: {
      mite: "assets/guide/enemies/skitter.webp",
      hound: "assets/guide/enemies/rusher.webp",
      spitter: "assets/guide/enemies/spitter.webp",
      brute: "assets/guide/enemies/brute.webp",
      bomber: "assets/guide/enemies/bomber.webp",
      shark: "assets/guide/enemies/siegebreaker.webp",
    },
    field: {
      combatData: "assets/guide/field/combat-data.webp",
      supplyCache: "assets/guide/field/supply-cache.webp",
      hostileProjectile: "assets/guide/field/hostile-projectile.webp",
      repairKit: "assets/guide/field/repair-kit.webp",
      relayBall: "assets/guide/field/relay-ball.webp",
      fieldDevice: "assets/guide/field/field-device.webp",
    },
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
  animations: {
    enemies: {
      mite: { anchor: [.5, .78], drawSize: [72, 59], groundY: 10, shadow: [26, 9], stride: 1.5 },
      hound: { anchor: [.5, .77], drawSize: [96, 67], groundY: 13, shadow: [36, 12], stride: 2.5 },
      spitter: { anchor: [.5, .76], drawSize: [88, 82], groundY: 14, shadow: [32, 12], stride: 1.4 },
      brute: { anchor: [.5, .78], drawSize: [118, 108], groundY: 20, shadow: [45, 15], stride: 1.7 },
      bomber: { anchor: [.5, .77], drawSize: [98, 92], groundY: 16, shadow: [38, 13], stride: 2 },
      shark: { anchor: [.5, .78], drawSize: [168, 125], groundY: 28, shadow: [66, 21], stride: 1.3 },
    },
    specialists: {
      zuri: {
        atlas: "assets/sprites/zuri-motion-atlas.png",
        grid: { columns: 4, rows: 5 },
        directions: ["south", "west", "north", "east"],
        anchor: [.5, .82],
        drawSize: [138, 110],
        spriteBounds: [0, 0, 138, 110],
        collisionOffset: [0, 0],
        groundY: 18,
        shadow: [34, 12],
        muzzleDistance: 58,
        sockets: { muzzle: { distance: 58, vertical: -8 } },
        states: {
          idle: { loop: true, frames: [{ row: 0, ms: 260 }, { row: 0, ms: 260, scaleY: .985, offsetY: 1 }] },
          run: { loop: true, frames: [
            { row: 1, ms: 58, offsetY: 0 }, { row: 1, ms: 58, scaleY: .98, offsetY: 1 },
            { row: 2, ms: 58, offsetY: -1 }, { row: 2, ms: 58, scaleY: 1.01, offsetY: -2 },
            { row: 1, ms: 58, offsetY: 0 }, { row: 1, ms: 58, scaleY: .98, offsetY: 1 },
            { row: 2, ms: 58, offsetY: -1 }, { row: 2, ms: 58, scaleY: 1.01, offsetY: -2 },
          ] },
          dash: { loop: false, frames: [{ row: 3, ms: 180, scaleX: 1.04, scaleY: .96 }] },
          castE: { loop: false, frames: [{ row: 3, ms: 90, scaleX: .97 }, { row: 0, ms: 150, offsetY: 1 }] },
          castR: { loop: false, frames: [{ row: 3, ms: 130, scaleX: 1.06, scaleY: .94 }, { row: 0, ms: 220 }] },
          hurt: { loop: false, frames: [{ row: 4, ms: 220, scaleX: .96, rotation: -.05 }] },
          down: { loop: false, frames: [{ row: 4, ms: 500, rotation: -.12, offsetY: 5 }] },
          revive: { loop: false, frames: [{ row: 0, ms: 400, scaleY: 1.03 }] },
          victory: { loop: true, frames: [{ row: 0, ms: 300, scaleY: 1.03, offsetY: -1 }, { row: 0, ms: 300 }] },
        },
      },
    },
  },
});

/** Resolve a dotted logical key such as `archive.augments.glassCannon`. */
export function getThemeAsset(assetKey, theme = LASTLIGHT_THEME) {
  const parts = String(assetKey).split(".").filter(Boolean);
  let value = theme?.assets;
  for (const part of parts) value = value?.[part];
  if (typeof value !== "string") throw new Error(`Unknown theme asset: ${assetKey}`);
  return value;
}

export function getThemeAnimation(specialistId, theme = LASTLIGHT_THEME) {
  return theme?.animations?.specialists?.[specialistId] || null;
}

export function getThemeEnemyAnimation(enemyType, theme = LASTLIGHT_THEME) {
  return theme?.animations?.enemies?.[enemyType] || null;
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
    ["enemies", theme.assets?.enemies, THEME_ASSET_KEYS.enemies],
    ["effects", theme.assets?.effects, THEME_ASSET_KEYS.effects],
    ["guide.passives", theme.assets?.guide?.passives, THEME_ASSET_KEYS.guidePassives],
    ["guide.enemies", theme.assets?.guide?.enemies, THEME_ASSET_KEYS.guideEnemies],
    ["guide.field", theme.assets?.guide?.field, THEME_ASSET_KEYS.guideField],
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

  for (const [specialistId, animation] of Object.entries(theme.animations?.specialists || {})) {
    if (!THEME_ASSET_KEYS.specialists.includes(specialistId)) {
      errors.push(`Unknown animated specialist: ${specialistId}.`); continue;
    }
    if (typeof animation?.atlas !== "string" || !/^assets\/[a-z0-9/_-]+\.(?:png|webp)$/.test(animation.atlas)) {
      errors.push(`animations.specialists.${specialistId}.atlas must be a relative PNG or WebP asset path.`);
    } else paths.push([`animations.specialists.${specialistId}.atlas`, animation.atlas]);
    if (!Number.isInteger(animation?.grid?.columns) || !Number.isInteger(animation?.grid?.rows)) errors.push(`animations.specialists.${specialistId}.grid must define integer columns and rows.`);
    if (!Array.isArray(animation?.anchor) || animation.anchor.length !== 2 || animation.anchor.some((value) => !Number.isFinite(value))) errors.push(`animations.specialists.${specialistId}.anchor must be [x, y].`);
    if (!Array.isArray(animation?.spriteBounds) || animation.spriteBounds.length !== 4 || animation.spriteBounds.some((value) => !Number.isFinite(value))) errors.push(`animations.specialists.${specialistId}.spriteBounds must be [x, y, width, height].`);
    if (!Array.isArray(animation?.collisionOffset) || animation.collisionOffset.length !== 2 || animation.collisionOffset.some((value) => !Number.isFinite(value))) errors.push(`animations.specialists.${specialistId}.collisionOffset must be [x, y].`);
    if (!Number.isFinite(animation?.sockets?.muzzle?.distance) || !Number.isFinite(animation?.sockets?.muzzle?.vertical)) errors.push(`animations.specialists.${specialistId}.sockets.muzzle must define distance and vertical offsets.`);
    if (!animation?.states?.idle?.frames?.length || !animation?.states?.run?.frames?.length || !animation?.states?.hurt?.frames?.length) errors.push(`animations.specialists.${specialistId} must define idle, run, and hurt clips.`);
  }

  for (const enemyType of THEME_ASSET_KEYS.enemies) {
    const animation = theme.animations?.enemies?.[enemyType];
    if (!animation || typeof animation !== "object") {
      errors.push(`Missing enemy render metadata: animations.enemies.${enemyType}.`);
      continue;
    }
    if (!Array.isArray(animation.anchor) || animation.anchor.length !== 2 || animation.anchor.some((value) => !Number.isFinite(value))) errors.push(`animations.enemies.${enemyType}.anchor must be [x, y].`);
    if (!Array.isArray(animation.drawSize) || animation.drawSize.length !== 2 || animation.drawSize.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`animations.enemies.${enemyType}.drawSize must be [width, height].`);
    if (!Array.isArray(animation.shadow) || animation.shadow.length !== 2 || animation.shadow.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`animations.enemies.${enemyType}.shadow must be [width, height].`);
    if (!Number.isFinite(animation.groundY) || !Number.isFinite(animation.stride)) errors.push(`animations.enemies.${enemyType} must define finite groundY and stride values.`);
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
