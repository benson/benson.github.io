import { ENEMY_MOTION_STATES, MOTION_DIRECTIONS, MOTION_SCHEMA, SPECIALIST_MOTION_STATES, validateMotionRig } from "../motion.js?v=20260713.1";
import { LASTLIGHT_MATERIAL_THEME, MATERIAL_CLASSES, validateMaterialTheme } from "../material-impacts.js?v=20260718.1";
import { LASTLIGHT_ENVIRONMENT_INTERACTIONS, validateEnvironmentInteractions } from "../environment-interactions.js?v=20260712.1";
import { LASTLIGHT_ENVIRONMENT_CHUNKS, validateEnvironmentChunks } from "../environment-chunks.js?v=20260718.1";

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
  environmentChunks: ["warehouse", "outskirts", "lab", "beachhead"],
  mapMechanics: ["warehouse", "outskirts", "lab", "beachhead"],
  supplyContainerMaps: ["warehouse", "outskirts", "lab", "beachhead"],
  supplyContainers: ["cargo", "utility", "pressure"],
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
  environmentChunks: {
    warehouse: "assets/environment-chunks/warehouse-atlas.webp",
    outskirts: "assets/environment-chunks/outskirts-atlas.webp",
    lab: "assets/environment-chunks/lab-atlas.webp",
    beachhead: "assets/environment-chunks/beachhead-atlas.webp",
  },
  mapMechanics: {
    warehouse: "assets/map-mechanics/freight-conveyor-v14.webp",
    outskirts: "assets/map-mechanics/ion-lane-v14.webp",
    lab: "assets/map-mechanics/cryo-lane-v14.webp",
    beachhead: "assets/map-mechanics/undertow-lane-v14.webp",
  },
  supplyContainers: {
    warehouse: {
      cargo: "assets/supply-containers/warehouse-cargo-v14.webp",
      utility: "assets/supply-containers/warehouse-utility-v14.webp",
      pressure: "assets/supply-containers/warehouse-pressure-v14.webp",
    },
    outskirts: {
      cargo: "assets/supply-containers/outskirts-cargo-v14.webp",
      utility: "assets/supply-containers/outskirts-utility-v14.webp",
      pressure: "assets/supply-containers/outskirts-pressure-v14.webp",
    },
    lab: {
      cargo: "assets/supply-containers/lab-cargo-v14.webp",
      utility: "assets/supply-containers/lab-utility-v14.webp",
      pressure: "assets/supply-containers/lab-pressure-v14.webp",
    },
    beachhead: {
      cargo: "assets/supply-containers/beachhead-cargo-v14.webp",
      utility: "assets/supply-containers/beachhead-utility-v14.webp",
      pressure: "assets/supply-containers/beachhead-pressure-v14.webp",
    },
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

export const MOTION_BOSS_IDS = deepFreeze(["warehouse", "outskirts", "lab", "beachhead"]);

const specialistSizes = {
  zuri: [138, 110], echo: [112, 108], sola: [126, 118], bront: [120, 116], fang: [112, 106],
  gale: [112, 110], rift: [114, 108], nova: [110, 108], vesper: [116, 112],
};

const enemyLayout = {
  mite: { anchor: [.5, .875], drawSize: [72, 59], groundY: 10, shadow: [26, 9], contact: [30, 1] },
  hound: { anchor: [.5, .875], drawSize: [96, 67], groundY: 13, shadow: [36, 12], contact: [42, 2] },
  spitter: { anchor: [.5, .875], drawSize: [88, 82], groundY: 14, shadow: [32, 12], contact: [40, -8] },
  brute: { anchor: [.5, .875], drawSize: [118, 108], groundY: 20, shadow: [45, 15], contact: [54, 1] },
  bomber: { anchor: [.5, .875], drawSize: [98, 92], groundY: 16, shadow: [38, 13], contact: [44, 0] },
  shark: { anchor: [.5, .875], drawSize: [168, 125], groundY: 28, shadow: [66, 21], contact: [78, 2] },
};

const frames = (rows, ms, authored = false) => ({
  loop: false, authored,
  frames: rows.map((row, index) => ({ row, ms: Array.isArray(ms) ? ms[index] : ms })),
});

function plannedSpecialistRig(id) {
  return {
    schema: MOTION_SCHEMA, kind: "specialist", status: "ready",
    atlas: { src: `assets/motion-normalized/specialists/${id}.webp`, available: true, expectedSize: [1024, 1536] },
    grid: { columns: 4, rows: 6 }, directions: [...MOTION_DIRECTIONS],
    anchor: [.5, .875], drawSize: specialistSizes[id], collisionOffset: [0, 0], groundY: 18, shadow: [34, 12],
    sockets: { muzzle: { distance: id === "sola" || id === "bront" ? 53 : 58, vertical: -8 } },
    bindings: { dash: "mobility", castE: "cast", castR: "cast" },
    states: {
      idle: { ...frames([0, 1], [320, 320], true), loop: true },
      // These are two authored key poses, not dense in-between frames. A
      // half-second stride reads as grounded motion; the previous 250ms stride
      // presented them as a rapid full-silhouette flash at gameplay scale.
      run: { ...frames([2, 3], 250, true), loop: true },
      mobility: { loop: false, authored: true, frames: [{ row: 4, ms: 70, scaleX: 1.03, scaleY: .97 }, { row: 4, ms: 70 }, { row: 4, ms: 100, scaleX: .98 }] },
      cast: { loop: false, authored: true, frames: [{ row: 1, ms: 80, scaleX: .98 }, { row: 1, ms: 80 }, { row: 4, ms: 70, scaleX: 1.03 }, { row: 0, ms: 130 }] },
      hurt: frames([5, 5], [80, 150], true),
      down: { loop: false, authored: true, frames: [{ row: 5, ms: 90 }, { row: 5, ms: 110, rotation: -.06 }, { row: 5, ms: 140, rotation: -.11, offsetY: 4 }, { row: 5, ms: 420, rotation: -.13, offsetY: 6 }] },
      revive: { loop: false, authored: false, frames: [{ row: 5, ms: 100, offsetY: 5 }, { row: 0, ms: 100, scaleY: .96 }, { row: 0, ms: 100 }, { row: 1, ms: 180 }] },
      victory: { loop: true, authored: false, frames: [{ row: 0, ms: 150 }, { row: 1, ms: 150, offsetY: -2 }, { row: 0, ms: 180 }, { row: 1, ms: 220, offsetY: -1 }] },
    },
  };
}

function plannedEnemyRig(id, layout, boss = false) {
  const source = boss ? `assets/motion-normalized/bosses/${id}.webp` : `assets/motion-normalized/enemies/${id}.webp`;
  const compactFiveRows = id === "spitter" || id === "bomber" || (boss && id === "beachhead");
  const locomotionRows = compactFiveRows ? [2] : [2, 3];
  const actionRow = compactFiveRows ? 3 : 4;
  const hurtDeathRow = compactFiveRows ? 4 : 5;
  const fieldAttack = !boss && {
    hound: {
      windup: [{ row: 1, ms: 100, scaleX: .98 }, { row: 1, ms: 100, offsetX: -2, scaleX: .95, scaleY: 1.03 }, { row: 1, ms: 100, offsetX: -4, scaleX: .91, scaleY: 1.06 }],
      contact: [{ row: actionRow, ms: 80, offsetX: 4, scaleX: 1.05, scaleY: .96 }, { row: actionRow, ms: 120, offsetX: 2, scaleX: 1.02, scaleY: .98 }],
      recovery: [{ row: actionRow, ms: 90, scaleX: 1.02 }, { row: 0, ms: 150 }],
    },
    spitter: {
      windup: [{ row: 1, ms: 100, scaleX: .98 }, { row: 1, ms: 100, offsetX: -2, rotation: -.025, scaleX: .95, scaleY: 1.03 }, { row: 1, ms: 100, offsetX: -3, rotation: -.045, scaleX: .92, scaleY: 1.05 }],
      contact: [{ row: actionRow, ms: 65, offsetX: 4, rotation: .035, scaleX: 1.06, scaleY: .95 }, { row: actionRow, ms: 35, offsetX: 1, scaleX: 1.02 }],
      recovery: [{ row: actionRow, ms: 80, scaleX: 1.02 }, { row: 0, ms: 170 }],
    },
    brute: {
      windup: [{ row: 1, ms: 100, scaleY: .99 }, { row: 1, ms: 100, offsetY: 2, scaleX: 1.03, scaleY: .96 }, { row: 1, ms: 100, offsetY: 4, scaleX: 1.06, scaleY: .92 }],
      contact: [{ row: actionRow, ms: 70, offsetY: 3, scaleX: 1.07, scaleY: .93 }, { row: actionRow, ms: 50, scaleX: 1.03, scaleY: .98 }],
      recovery: [{ row: actionRow, ms: 100, scaleX: 1.03 }, { row: 0, ms: 180 }],
    },
    bomber: {
      windup: [{ row: 1, ms: 100, scaleX: .98 }, { row: 1, ms: 100, rotation: -.025, scaleX: 1.03, scaleY: .97 }, { row: 1, ms: 84, rotation: .035, scaleX: 1.08, scaleY: .92 }, { row: actionRow, ms: 16, offsetY: 2, scaleX: 1.1, scaleY: .9 }],
      contact: [{ row: actionRow, ms: 70, scaleX: 1.06, scaleY: .94 }],
      recovery: [{ row: actionRow, ms: 70 }, { row: 0, ms: 130 }],
    },
    shark: {
      windup: [{ row: 1, ms: 100, scaleX: .98 }, { row: 1, ms: 100, offsetX: -3, scaleX: .95, scaleY: 1.03 }, { row: 1, ms: 100, offsetX: -6, scaleX: .9, scaleY: 1.07 }],
      contact: [{ row: actionRow, ms: 90, offsetX: 6, scaleX: 1.06, scaleY: .95 }, { row: actionRow, ms: 130, offsetX: 3, scaleX: 1.025, scaleY: .98 }],
      recovery: [{ row: actionRow, ms: 110, scaleX: 1.035 }, { row: 0, ms: 190 }],
    },
  }[id];
  return {
    schema: MOTION_SCHEMA, kind: "enemy", status: "ready",
    atlas: { src: source, available: true, expectedSize: [1024, compactFiveRows ? 1280 : 1536] },
    grid: { columns: 4, rows: compactFiveRows ? 5 : 6 }, directions: [...MOTION_DIRECTIONS],
    anchor: layout.anchor, drawSize: layout.drawSize, collisionOffset: [0, 0], groundY: layout.groundY, shadow: layout.shadow,
    sockets: { contact: { distance: layout.contact[0], vertical: layout.contact[1] } }, bindings: {},
    states: {
      idle: { ...frames([0, 1], [300, 300], true), loop: true },
      locomotion: { ...frames(locomotionRows, boss ? 135 : compactFiveRows ? 140 : 110, true), loop: true },
      attackWindup: { loop: false, authored: false, frames: fieldAttack?.windup || [{ row: 1, ms: 90, scaleX: .96 }, { row: 1, ms: 90, scaleX: .93, scaleY: 1.03 }] },
      attackContact: { loop: false, authored: true, frames: fieldAttack?.contact || [{ row: actionRow, ms: 70 }] },
      attackRecovery: { loop: false, authored: true, frames: fieldAttack?.recovery || [{ row: actionRow, ms: 90, scaleX: 1.03 }, { row: 0, ms: 130 }] },
      hurt: frames([hurtDeathRow, hurtDeathRow], [70, 110], true),
      death: { loop: false, authored: true, frames: [{ row: hurtDeathRow, ms: 80 }, { row: hurtDeathRow, ms: 100, rotation: -.05 }, { row: hurtDeathRow, ms: 130, rotation: -.11, offsetY: 5 }, { row: hurtDeathRow, ms: 220, rotation: -.14, offsetY: 8 }] },
    },
  };
}

const specialistMotions = Object.fromEntries(THEME_ASSET_KEYS.specialists.map((id) => [id, plannedSpecialistRig(id)]));
const enemyMotions = Object.fromEntries(THEME_ASSET_KEYS.enemies.map((id) => [id, plannedEnemyRig(id, enemyLayout[id])]));
const bossMotions = Object.fromEntries(MOTION_BOSS_IDS.map((id) => [id, plannedEnemyRig(id, { anchor: [.5, .875], drawSize: [190, 160], groundY: 32, shadow: [76, 24], contact: [90, 2] }, true)]));

export const LASTLIGHT_THEME = defineTheme({
  id: "lastlight",
  name: "Lastlight",
  assets: LASTLIGHT_ASSETS,
  materials: LASTLIGHT_MATERIAL_THEME,
  environmentInteractions: LASTLIGHT_ENVIRONMENT_INTERACTIONS,
  environmentChunks: LASTLIGHT_ENVIRONMENT_CHUNKS,
  animations: {
    specialists: specialistMotions,
    enemies: enemyMotions,
    bosses: bossMotions,
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

export function getThemeEnemyAnimation(enemyType, theme = LASTLIGHT_THEME, mapId = "") {
  return enemyType === "boss" ? theme?.animations?.bosses?.[mapId] || null : theme?.animations?.enemies?.[enemyType] || null;
}

export function getThemeMaterial(materialId, theme = LASTLIGHT_THEME) {
  if (!MATERIAL_CLASSES.includes(materialId) || !theme?.materials?.[materialId]) throw new Error(`Unknown theme material: ${materialId}`);
  return theme.materials[materialId];
}

export function getThemeEnvironmentInteractions(theme = LASTLIGHT_THEME) {
  return theme?.environmentInteractions || null;
}

export function getThemeEnvironmentChunks(theme = LASTLIGHT_THEME) {
  return theme?.environmentChunks || null;
}

export function getMissingMotionAssets(theme = LASTLIGHT_THEME) {
  const entries = [];
  for (const [id, rig] of Object.entries(theme.animations?.specialists || {})) if (rig.status !== "ready") entries.push({ kind: "specialist", id, status: rig.status, src: rig.atlas.src, expectedSize: [...rig.atlas.expectedSize] });
  for (const [id, rig] of Object.entries(theme.animations?.enemies || {})) if (rig.status !== "ready") entries.push({ kind: "enemy", id, status: rig.status, src: rig.atlas.src, expectedSize: [...rig.atlas.expectedSize] });
  for (const [id, rig] of Object.entries(theme.animations?.bosses || {})) if (rig.status !== "ready") entries.push({ kind: "boss", id, status: rig.status, src: rig.atlas.src, expectedSize: [...rig.atlas.expectedSize] });
  return entries;
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
  for (const error of validateMaterialTheme(theme.materials)) errors.push(error);
  for (const error of validateEnvironmentInteractions(theme.environmentInteractions)) errors.push(error);
  for (const error of validateEnvironmentChunks(theme.environmentChunks)) errors.push(error);

  const groups = [
    ["specialists", theme.assets?.specialists, THEME_ASSET_KEYS.specialists],
    ["weapons.signatures", theme.assets?.weapons?.signatures, THEME_ASSET_KEYS.signatureWeapons],
    ["weapons.universal", theme.assets?.weapons?.universal, THEME_ASSET_KEYS.universalWeapons],
    ["environments", theme.assets?.environments, THEME_ASSET_KEYS.environments],
    ["environmentChunks", theme.assets?.environmentChunks, THEME_ASSET_KEYS.environmentChunks],
    ["mapMechanics", theme.assets?.mapMechanics, THEME_ASSET_KEYS.mapMechanics],
    ...THEME_ASSET_KEYS.supplyContainerMaps.map((mapId) => [`supplyContainers.${mapId}`, theme.assets?.supplyContainers?.[mapId], THEME_ASSET_KEYS.supplyContainers]),
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

  const validateRigGroup = (groupName, group, ids, kind) => {
    if (!group || typeof group !== "object") { errors.push(`Missing motion group: animations.${groupName}.`); return; }
    for (const id of ids) {
      const rig = group[id];
      if (!rig) { errors.push(`Missing motion rig: animations.${groupName}.${id}.`); continue; }
      for (const error of validateMotionRig(rig, kind)) errors.push(`animations.${groupName}.${id}: ${error}`);
      if (rig.atlas?.available) paths.push([`animations.${groupName}.${id}.atlas`, rig.atlas.src]);
    }
    for (const id of Object.keys(group)) if (!ids.includes(id)) errors.push(`Unexpected motion rig: animations.${groupName}.${id}.`);
  };
  validateRigGroup("specialists", theme.animations?.specialists, THEME_ASSET_KEYS.specialists, "specialist");
  validateRigGroup("enemies", theme.animations?.enemies, THEME_ASSET_KEYS.enemies, "enemy");
  validateRigGroup("bosses", theme.animations?.bosses, MOTION_BOSS_IDS, "enemy");

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
