import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260718.2";

export const PROJECTILE_MODES = Object.freeze(["counted", "field", "single-effect", "utility"]);
export const SCALE_TAGS = Object.freeze([
  "damage", "haste", "area", "duration", "projectiles", "crit",
  "maxHealth", "armor", "move", "xp", "pickup", "regen",
]);

const source = (projectileMode, multishotCompatible, scalesWith, projectileNote = "") => Object.freeze({
  projectileMode,
  projectileCountApplicable: projectileMode === "counted",
  multishotCompatible,
  scalesWith: Object.freeze(scalesWith),
  projectileNote,
});

// These tags intentionally describe the current simulation, rather than an
// aspirational balance model. That makes upgrade cards and loadout inspection
// trustworthy even while individual weapons are rebalanced.
export const UNIVERSAL_WEAPON_COMBAT = Object.freeze({
  uwu: source("counted", true, ["damage", "haste", "projectiles", "crit"]),
  slicers: source("counted", true, ["haste", "area", "projectiles"], "orbiting blades"),
  aura: source("field", false, ["haste", "area", "maxHealth"]),
  mines: source("counted", true, ["haste", "area", "projectiles"], "deployed mines"),
  crossbow: source("counted", true, ["damage", "haste", "projectiles", "crit"]),
  boomerang: source("counted", true, ["damage", "haste", "move", "projectiles", "crit"]),
  rail: source("counted", true, ["damage", "haste", "projectiles", "crit"], "paired rails"),
  glove: source("counted", true, ["damage", "haste", "projectiles", "crit"], "orb streams"),
  transit: source("single-effect", false, ["haste"]),
  ice: source("utility", false, ["haste"]),
  annihilator: source("single-effect", false, ["haste", "area"]),
  drone: source("counted", false, ["damage", "haste", "crit"], "autonomous pulses"),
});

export const SPECIALIST_COMBAT = Object.freeze({
  zuri: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "projectiles", "crit"]),
    active: source("counted", true, ["damage", "haste", "area", "projectiles", "crit"], "rockets"),
    ultimate: source("counted", false, ["damage", "haste", "area", "crit"], "execution rocket"),
  }),
  echo: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "projectiles", "crit"], "sound waves"),
    active: source("utility", false, ["haste"]),
    ultimate: source("field", false, ["haste"]),
  }),
  sola: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "area", "projectiles", "crit", "armor"]),
    active: source("field", false, ["haste", "area", "maxHealth", "armor"]),
    ultimate: source("single-effect", false, ["haste", "area"]),
  }),
  bront: Object.freeze({
    signature: source("single-effect", false, ["haste", "area"]),
    active: source("field", false, ["haste", "area", "duration"]),
    ultimate: source("single-effect", false, ["haste", "area", "duration"]),
  }),
  fang: Object.freeze({
    signature: source("single-effect", false, ["damage", "haste", "area", "maxHealth"]),
    active: source("utility", false, ["haste", "duration", "maxHealth"]),
    ultimate: source("single-effect", false, ["haste", "area"]),
  }),
  gale: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "area", "projectiles", "crit"], "tornadoes"),
    active: source("single-effect", false, ["haste"]),
    ultimate: source("field", false, ["haste"]),
  }),
  rift: Object.freeze({
    signature: source("single-effect", false, ["damage", "haste", "area"]),
    active: source("single-effect", false, ["haste", "area"]),
    ultimate: source("utility", false, ["haste", "duration", "move"]),
  }),
  nova: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "projectiles", "crit"], "hex bolts"),
    active: source("single-effect", false, ["haste", "area"]),
    ultimate: source("single-effect", false, ["haste", "area"]),
  }),
  vesper: Object.freeze({
    signature: source("counted", true, ["damage", "haste", "projectiles", "crit"], "daggers"),
    active: source("single-effect", false, ["damage", "haste"]),
    ultimate: source("counted", true, ["damage", "haste", "projectiles", "crit"], "storm daggers"),
  }),
});

const percentage = (value, digits = 0) => `${(Number(value) * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
const multiplier = (value) => `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;

export function armorDamageReduction(armor) {
  const safeArmor = Math.max(0, Number(armor) || 0);
  return safeArmor / (100 + safeArmor);
}

export function armorDamageMultiplier(armor) {
  return 1 - armorDamageReduction(armor);
}

export function cooldownMultiplierFromHaste(haste) {
  return 100 / (100 + Math.max(0, Number(haste) || 0));
}

export const STAT_DEFINITIONS = Object.freeze({
  damage: Object.freeze({ name: "Damage", unit: "multiplier", definition: "Multiplies damage dealt by compatible attacks." }),
  haste: Object.freeze({ name: "Ability haste", unit: "haste", definition: "Shortens compatible weapon and ability cooldowns using 100 / (100 + haste)." }),
  maxHealth: Object.freeze({ name: "Maximum health", unit: "vitality", definition: "The total vitality available before the specialist is downed." }),
  armor: Object.freeze({ name: "Armor", unit: "armor", definition: "Reduces incoming damage by armor / (100 + armor)." }),
  move: Object.freeze({ name: "Movement speed", unit: "speed", definition: "The specialist's maximum ground movement in world units per second." }),
  area: Object.freeze({ name: "Area size", unit: "multiplier", definition: "Multiplies the radius or reach of compatible attacks and fields." }),
  crit: Object.freeze({ name: "Critical chance", unit: "probability", definition: "Chance for compatible attacks to deal critical damage." }),
  duration: Object.freeze({ name: "Duration", unit: "multiplier", definition: "Multiplies the lifetime of compatible buffs, fields, and effects." }),
  projectiles: Object.freeze({ name: "Multishot", unit: "count", definition: "Adds instances only to attacks marked as multishot-compatible." }),
  xp: Object.freeze({ name: "Data gain", unit: "multiplier", definition: "Multiplies combat data gained from collected motes." }),
  pickup: Object.freeze({ name: "Pickup radius", unit: "distance", definition: "The world-space radius within which pickups are collected." }),
  regen: Object.freeze({ name: "Repair rate", unit: "rate", definition: "Restores this many vitality points each second." }),
});

export function getCombatMetadata(sourceId, specialistId) {
  if (sourceId === "ability:e") sourceId = "active";
  if (sourceId === "ability:r") sourceId = "ultimate";
  if (sourceId === "signature" || sourceId === "active" || sourceId === "ultimate") {
    return SPECIALIST_COMBAT[specialistId]?.[sourceId] || null;
  }
  return UNIVERSAL_WEAPON_COMBAT[sourceId] || null;
}

export function projectileDisplay(metadata, count) {
  if (!metadata) return "—";
  if (metadata.projectileMode === "counted") {
    const numeric = Number(count);
    if (!Number.isFinite(numeric)) return "Count varies";
    const total = Math.max(0, Math.floor(numeric));
    const note = total === 1
      ? metadata.projectileNote.replace(/oes$/, "o").replace(/ies$/, "y").replace(/s$/, "")
      : metadata.projectileNote;
    return `${total}${note ? ` ${note}` : ""}`;
  }
  const labels = {
    field: "N/A — continuous field",
    "single-effect": "N/A — single effect",
    utility: "N/A — utility",
  };
  return labels[metadata.projectileMode] || "N/A";
}

function specialistSourceName(specialistId, slot) {
  const specialist = SPECIALISTS[specialistId];
  if (!specialist) return "Unknown source";
  if (slot === "signature") return specialist.signature.name;
  if (slot === "active") return specialist.active[0];
  return specialist.ultimate[0];
}

export function passiveAffectedSources(passiveId, { specialistId, weapons = {}, includeAbilities = true } = {}) {
  if (!PASSIVES[passiveId] || !SPECIALIST_COMBAT[specialistId]) return [];
  const results = [];
  const add = (id, kind, name, metadata) => {
    if (metadata?.scalesWith.includes(passiveId)) results.push({ id, kind, name });
  };

  const signatureEquipped = weapons.signature === undefined || Boolean(weapons.signature);
  if (signatureEquipped) add("signature", "weapon", specialistSourceName(specialistId, "signature"), SPECIALIST_COMBAT[specialistId].signature);
  for (const [weaponId, state] of Object.entries(weapons)) {
    if (weaponId === "signature" || !WEAPONS[weaponId] || state === false || state === null) continue;
    if (typeof state === "object" && Number(state.level ?? 1) <= 0) continue;
    add(weaponId, "weapon", WEAPONS[weaponId].name, UNIVERSAL_WEAPON_COMBAT[weaponId]);
  }
  if (includeAbilities) {
    add("ability:e", "active", specialistSourceName(specialistId, "active"), SPECIALIST_COMBAT[specialistId].active);
    add("ability:r", "ultimate", specialistSourceName(specialistId, "ultimate"), SPECIALIST_COMBAT[specialistId].ultimate);
  }
  return results;
}

export function currentStatExplanation(statId, currentValue) {
  const definition = STAT_DEFINITIONS[statId];
  if (!definition) return null;
  const numeric = Number(currentValue);
  let display = Number.isFinite(numeric) ? String(numeric) : "—";
  if (Number.isFinite(numeric)) {
    if (definition.unit === "multiplier") display = multiplier(numeric);
    else if (definition.unit === "probability") display = percentage(numeric);
    else if (definition.unit === "haste") display = `${numeric} haste · ${percentage(1 - cooldownMultiplierFromHaste(numeric))} shorter cooldowns`;
    else if (definition.unit === "armor") display = `${numeric} armor · ${percentage(armorDamageReduction(numeric), 1)} damage reduction`;
    else if (definition.unit === "speed") display = `${Math.round(numeric)} units/s`;
    else if (definition.unit === "distance") display = `${Math.round(numeric)} units`;
    else if (definition.unit === "rate") display = `${numeric.toFixed(2)} vitality/s`;
    else if (definition.unit === "vitality") display = `${numeric.toFixed(1).replace(/\.0$/, "")} vitality`;
    else if (definition.unit === "count") display = `+${Math.floor(numeric)}`;
  }
  return { id: statId, name: definition.name, value: display, definition: definition.definition };
}

export function validateCombatMetadata() {
  const errors = [];
  const validate = (id, metadata) => {
    if (!PROJECTILE_MODES.includes(metadata?.projectileMode)) errors.push(`${id}: invalid projectileMode`);
    if (metadata?.projectileCountApplicable !== (metadata?.projectileMode === "counted")) errors.push(`${id}: projectile applicability mismatch`);
    if (metadata?.multishotCompatible && !metadata?.scalesWith.includes("projectiles")) errors.push(`${id}: multishot missing projectiles tag`);
    if (!metadata?.multishotCompatible && metadata?.scalesWith.includes("projectiles")) errors.push(`${id}: projectiles tag without multishot compatibility`);
    for (const tag of metadata?.scalesWith || []) if (!SCALE_TAGS.includes(tag)) errors.push(`${id}: invalid scale tag ${tag}`);
  };
  for (const weaponId of Object.keys(WEAPONS)) {
    if (!UNIVERSAL_WEAPON_COMBAT[weaponId]) errors.push(`weapon:${weaponId}: missing metadata`);
    else validate(`weapon:${weaponId}`, UNIVERSAL_WEAPON_COMBAT[weaponId]);
  }
  for (const specialistId of Object.keys(SPECIALISTS)) {
    const metadata = SPECIALIST_COMBAT[specialistId];
    for (const slot of ["signature", "active", "ultimate"]) {
      if (!metadata?.[slot]) errors.push(`${specialistId}:${slot}: missing metadata`);
      else validate(`${specialistId}:${slot}`, metadata[slot]);
    }
  }
  return errors;
}

// UI-oriented aliases keep call sites explicit without creating a separate
// presentation implementation of these combat rules.
export const formatProjectileDisplay = projectileDisplay;
export const getPassiveAffectedSources = passiveAffectedSources;
export const getCurrentStatExplanation = currentStatExplanation;
