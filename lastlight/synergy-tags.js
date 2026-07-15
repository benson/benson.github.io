import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260715.2";
import { getCombatMetadata, SCALE_TAGS } from "./combat-metadata.js?v=20260715.2";
import { getSpecialistIdentity } from "./specialist-identity.js?v=20260715.2";

export const BUILDCRAFT_SCHEMA = "lastlight.buildcraft-tags.v1";
export const BUILDCRAFT_CATEGORIES = Object.freeze([
  "damage-shape", "cadence", "range", "area", "projectile-count", "duration", "crit",
  "control", "sustain", "mobility", "support",
]);

const category = (id, label) => Object.freeze({ id, label, themeToken: `buildcraft-${id}` });
export const BUILDCRAFT_CATEGORY_DEFINITIONS = Object.freeze(Object.fromEntries([
  ["damage-shape", "Damage shape"], ["cadence", "Cadence"], ["range", "Range"], ["area", "Area"],
  ["projectile-count", "Projectile count"], ["duration", "Duration"], ["crit", "Critical"],
  ["control", "Control"], ["sustain", "Sustain"], ["mobility", "Mobility"], ["support", "Support"],
].map(([id, label]) => [id, category(id, label)])));

const SHAPES = Object.freeze({ counted: "Projectile", field: "Field", "single-effect": "Burst", utility: "Utility" });
const SCALE_CATEGORIES = Object.freeze({ area: "area", projectiles: "projectile-count", duration: "duration", crit: "crit", move: "mobility", regen: "sustain" });
const UNIVERSAL_SEMANTICS = Object.freeze({
  uwu: ["rapid", "long", []], slicers: ["sustained", "close", []], aura: ["sustained", "close", []],
  mines: ["setup", "mid", []], crossbow: ["periodic", "long", []], boomerang: ["periodic", "mid", ["mobility"]],
  rail: ["periodic", "long", []], glove: ["periodic", "mid", []], transit: ["gated", "long", ["control"]],
  ice: ["gated", "self", ["control", "sustain"]], annihilator: ["gated", "global", []], drone: ["sustained", "long", ["sustain", "support"]],
});

const freezeList = (values) => Object.freeze(values.map((value) => Object.freeze(value)));
const trait = (categoryId, value) => ({ category: categoryId, value, themeToken: BUILDCRAFT_CATEGORY_DEFINITIONS[categoryId].themeToken });

function sourcePair(sourceId, specialistId) {
  const passiveId = sourceId === "signature" ? SPECIALISTS[specialistId]?.signature.passive : WEAPONS[sourceId]?.passive;
  return passiveId ? Object.freeze({ id: passiveId, name: PASSIVES[passiveId]?.name || passiveId }) : null;
}

export function sourceBuildcraft(sourceId, { specialistId, evolved = false } = {}) {
  const metadata = getCombatMetadata(sourceId, specialistId);
  if (!metadata) return null;
  const traits = [trait("damage-shape", SHAPES[metadata.projectileMode])];
  if (sourceId === "signature") {
    const identity = getSpecialistIdentity(specialistId);
    if (!identity) return null;
    traits.push(trait("cadence", identity.damageShape.cadence.replaceAll("-", " ")), trait("range", identity.range));
    if (["high", "very-high"].includes(identity.control.tier)) traits.push(trait("control", identity.control.tier.replace("very-", "very ")));
    if (["high", "very-high"].includes(identity.support.tier)) traits.push(trait("support", identity.support.tier.replace("very-", "very ")));
    if (["high", "very-high"].includes(identity.mobility.tier)) traits.push(trait("mobility", identity.mobility.tier.replace("very-", "very ")));
    if (["high", "very-high"].includes(identity.durability.tier)) traits.push(trait("sustain", identity.durability.tier.replace("very-", "very ")));
  } else {
    const semantics = UNIVERSAL_SEMANTICS[sourceId];
    if (!semantics) return null;
    traits.push(trait("cadence", semantics[0]), trait("range", semantics[1]));
    for (const categoryId of semantics[2]) traits.push(trait(categoryId, "built in"));
  }
  for (const scaleId of metadata.scalesWith) {
    const categoryId = SCALE_CATEGORIES[scaleId];
    if (categoryId && !traits.some((entry) => entry.category === categoryId)) traits.push(trait(categoryId, "scales"));
  }
  return Object.freeze({
    schema: BUILDCRAFT_SCHEMA, sourceId, specialistId: sourceId === "signature" ? specialistId : undefined,
    evolved: Boolean(evolved), shape: SHAPES[metadata.projectileMode], traits: freezeList(traits),
    scalesWith: freezeList(metadata.scalesWith.map((id) => ({ id, name: PASSIVES[id]?.name || id }))), pairedPassive: sourcePair(sourceId, specialistId),
  });
}

export function passiveBuildcraft(passiveId) {
  const passive = PASSIVES[passiveId];
  if (!passive) return null;
  const categoryId = SCALE_CATEGORIES[passiveId] || ({ damage: "damage-shape", haste: "cadence", maxHealth: "sustain", armor: "sustain", xp: "support", pickup: "support" })[passiveId] || "support";
  const pairedSources = [
    ...Object.values(WEAPONS).filter((weapon) => weapon.passive === passiveId).map((weapon) => ({ id: weapon.id, name: weapon.name })),
    ...Object.values(SPECIALISTS).filter((specialist) => specialist.signature.passive === passiveId).map((specialist) => ({ id: `signature:${specialist.id}`, name: specialist.signature.name })),
  ];
  return Object.freeze({ schema: BUILDCRAFT_SCHEMA, passiveId, trait: Object.freeze(trait(categoryId, "scales")), pairedSources: freezeList(pairedSources) });
}

export function validateBuildcraftTags() {
  const errors = [];
  if (Object.keys(BUILDCRAFT_CATEGORY_DEFINITIONS).join(",") !== BUILDCRAFT_CATEGORIES.join(",")) errors.push("category definitions/order mismatch");
  for (const id of BUILDCRAFT_CATEGORIES) {
    const definition = BUILDCRAFT_CATEGORY_DEFINITIONS[id];
    if (!definition?.label || definition.themeToken !== `buildcraft-${id}`) errors.push(`${id}: invalid definition`);
  }
  for (const id of SCALE_TAGS) if (!PASSIVES[id]) errors.push(`${id}: scale tag has no passive`);
  for (const id of Object.keys(WEAPONS)) if (!sourceBuildcraft(id)) errors.push(`${id}: missing source buildcraft`);
  for (const id of Object.keys(SPECIALISTS)) if (!sourceBuildcraft("signature", { specialistId: id })) errors.push(`signature:${id}: missing source buildcraft`);
  for (const id of Object.keys(PASSIVES)) if (!passiveBuildcraft(id)) errors.push(`passive:${id}: missing buildcraft`);
  return errors;
}
