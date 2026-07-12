export const WEAPON_EVOLUTION_SCHEMA = "lastlight.weapon-evolution.v1";
export const WEAPON_EVOLUTION_VERSION = 1;

export const WEAPON_EVOLUTION_CAPABILITIES = Object.freeze([
  "cadence",
  "pierce",
  "lifetime",
  "repeat",
  "flow-regeneration",
  "orbit-speed",
  "projectile-streams",
  "repair-rate",
  "impact-identity",
]);

export const WEAPON_EVOLUTION_STATUSES = Object.freeze(["gameplay", "presentation-only"]);

const SIGNATURE_IDS = Object.freeze(["zuri", "echo", "sola", "bront", "fang", "gale", "rift", "nova", "vesper"]);
const UNIVERSAL_IDS = Object.freeze(["uwu", "slicers", "aura", "mines", "crossbow", "boomerang", "rail", "glove", "transit", "ice", "annihilator", "drone"]);
const PASSIVE_IDS = Object.freeze(["damage", "haste", "maxHealth", "armor", "move", "area", "crit", "duration", "projectiles", "xp", "pickup", "regen"]);

const capability = (id, tuningKeys, note) => Object.freeze({ id, tuningKeys: Object.freeze(tuningKeys), note });
const gameplay = (id, tuningKeys, note) => capability(id, tuningKeys, note);
const presentation = (note) => capability("impact-identity", [], note);

function entry({ key, scope, sourceId, specialistId, baseName, evolvedName, pairedPassive, status = "gameplay", handler, capabilities }) {
  return Object.freeze({
    key,
    scope,
    sourceId,
    specialistId,
    baseName,
    evolvedName,
    pairedPassive,
    status,
    handler,
    capabilities: Object.freeze(capabilities),
  });
}

const signatures = {
  zuri: entry({ key: "signature:zuri", scope: "signature", sourceId: "signature", specialistId: "zuri", baseName: "Pulse Carbine", evolvedName: "Overdrive Barrage", pairedPassive: "haste", handler: "signature-zuri-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.zuri.evolvedCycle"], "Shortens the signature firing cycle."),
    gameplay("pierce", ["weapons.signatures.zuri.evolvedPierce"], "Allows rounds to continue through additional targets."),
  ] }),
  echo: entry({ key: "signature:echo", scope: "signature", sourceId: "signature", specialistId: "echo", baseName: "Sound Wave", evolvedName: "Anima Echo", pairedPassive: "projectiles", handler: "signature-echo-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.echo.evolvedCycle"], "Shortens the signature firing cycle."),
    gameplay("lifetime", ["weapons.signatures.echo.evolvedLife"], "Extends each sound wave's lifetime and reach."),
  ] }),
  sola: entry({ key: "signature:sola", scope: "signature", sourceId: "signature", specialistId: "sola", baseName: "Shield Beam", evolvedName: "Lion's Light", pairedPassive: "armor", handler: "signature-sola-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.sola.evolvedCycleSeconds"], "Sets a shorter fixed evolved firing cycle."),
  ] }),
  bront: entry({ key: "signature:bront", scope: "signature", sourceId: "signature", specialistId: "bront", baseName: "Tidal Hammer", evolvedName: "Grizzly Surge", pairedPassive: "duration", handler: "signature-bront-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.bront.evolvedCycle"], "Shortens the signature firing cycle."),
    gameplay("repeat", ["weapons.signatures.bront.evolvedDelay", "weapons.signatures.bront.evolvedRadius", "weapons.signatures.bront.evolvedDamageBase"], "Schedules a second larger crash after the first impact."),
  ] }),
  fang: entry({ key: "signature:fang", scope: "signature", sourceId: "signature", specialistId: "fang", baseName: "Rending Swipe", evolvedName: "Savage Slice", pairedPassive: "maxHealth", handler: "signature-fang-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.fang.evolvedCycle"], "Shortens the signature firing cycle without adding bleed."),
  ] }),
  gale: entry({ key: "signature:gale", scope: "signature", sourceId: "signature", specialistId: "gale", baseName: "Steel Current", evolvedName: "Wandering Storms", pairedPassive: "crit", handler: "signature-gale-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.gale.evolvedCycle"], "Shortens the post-fire signature cycle."),
    gameplay("pierce", ["weapons.signatures.gale.evolvedPierce"], "Allows tornadoes to continue through additional targets."),
    gameplay("flow-regeneration", ["identityTuning.gale.evolvedFlowMultiplier"], "Refills the Flow resource faster."),
  ] }),
  rift: entry({ key: "signature:rift", scope: "signature", sourceId: "signature", specialistId: "rift", baseName: "Kinetic Crash", evolvedName: "Golden Overrun", pairedPassive: "move", handler: "signature-rift-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.rift.evolvedCycle"], "Shortens the signature firing cycle."),
  ] }),
  nova: entry({ key: "signature:nova", scope: "signature", sourceId: "signature", specialistId: "nova", baseName: "Guiding Hex", evolvedName: "Hopped-Up Hex", pairedPassive: "xp", handler: "signature-nova-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.nova.evolvedCycle"], "Shortens the signature firing cycle."),
    gameplay("lifetime", ["weapons.signatures.nova.evolvedLife"], "Extends each hex bolt's lifetime and reach."),
  ] }),
  vesper: entry({ key: "signature:vesper", scope: "signature", sourceId: "signature", specialistId: "vesper", baseName: "Winged Dagger", evolvedName: "Lover's Ricochet", pairedPassive: "pickup", handler: "signature-vesper-v1", capabilities: [
    gameplay("cadence", ["weapons.signatures.vesper.evolvedCycle"], "Shortens the signature firing cycle."),
    gameplay("pierce", ["weapons.signatures.vesper.evolvedPierce"], "Allows daggers to continue through additional targets."),
  ] }),
};

const universal = {
  uwu: entry({ key: "universal:uwu", scope: "universal", sourceId: "uwu", specialistId: null, baseName: "Needle Blaster", evolvedName: "Twin Needle Array", pairedPassive: "haste", handler: "universal-uwu-v1", capabilities: [
    gameplay("cadence", ["weapons.universal.uwu.evolvedCooldown"], "Shortens the weapon cooldown."),
    gameplay("pierce", ["weapons.universal.uwu.evolvedPierce"], "Allows needles to continue through additional targets."),
  ] }),
  slicers: entry({ key: "universal:slicers", scope: "universal", sourceId: "slicers", specialistId: null, baseName: "Cyclonic Slicers", evolvedName: "Unceasing Cyclone", pairedPassive: "regen", handler: "universal-slicers-v1", capabilities: [
    gameplay("orbit-speed", ["weapons.universal.slicers.evolvedOrbitSpeed"], "Rotates the slicer pattern faster."),
  ] }),
  aura: entry({ key: "universal:aura", scope: "universal", sourceId: "aura", specialistId: null, baseName: "Radiant Field", evolvedName: "Explosive Embrace", pairedPassive: "maxHealth", status: "presentation-only", handler: "universal-aura-v1", capabilities: [presentation("The current simulation changes the evolved impact identity but not gameplay output.")] }),
  mines: entry({ key: "universal:mines", scope: "universal", sourceId: "mines", specialistId: null, baseName: "Arc Mines", evolvedName: "Tri-Mine Grid", pairedPassive: "area", status: "presentation-only", handler: "universal-mines-v1", capabilities: [presentation("The current simulation changes the evolved mine identity but not gameplay output.")] }),
  crossbow: entry({ key: "universal:crossbow", scope: "universal", sourceId: "crossbow", specialistId: null, baseName: "Scatter Bow", evolvedName: "Prime Ballista", pairedPassive: "crit", handler: "universal-crossbow-v1", capabilities: [
    gameplay("pierce", ["weapons.universal.crossbow.evolvedPierce"], "Allows bolts to continue through additional targets."),
  ] }),
  boomerang: entry({ key: "universal:boomerang", scope: "universal", sourceId: "boomerang", specialistId: null, baseName: "Blade-o-rang", evolvedName: "Quad-o-rang", pairedPassive: "move", status: "presentation-only", handler: "universal-boomerang-v1", capabilities: [presentation("The current simulation changes the evolved impact identity but not gameplay output.")] }),
  rail: entry({ key: "universal:rail", scope: "universal", sourceId: "rail", specialistId: null, baseName: "Lioness Rails", evolvedName: "Enveloping Light", pairedPassive: "haste", status: "presentation-only", handler: "universal-rail-v1", capabilities: [presentation("The current simulation changes the evolved impact identity but not gameplay output.")] }),
  glove: entry({ key: "universal:glove", scope: "universal", sourceId: "glove", specialistId: null, baseName: "Vortex Glove", evolvedName: "Tempest Gauntlet", pairedPassive: "regen", handler: "universal-glove-v1", capabilities: [
    gameplay("projectile-streams", ["weapons.universal.glove.evolvedStreams"], "Adds a counter-rotating projectile stream."),
  ] }),
  transit: entry({ key: "universal:transit", scope: "universal", sourceId: "transit", specialistId: null, baseName: "Final City Transit", evolvedName: "Limited Express", pairedPassive: "damage", status: "presentation-only", handler: "universal-transit-v1", capabilities: [presentation("The current simulation changes the evolved train identity but not gameplay output.")] }),
  ice: entry({ key: "universal:ice", scope: "universal", sourceId: "ice", specialistId: null, baseName: "Iceblast Armor", evolvedName: "Deep Freeze", pairedPassive: "armor", handler: "universal-ice-v1", capabilities: [
    gameplay("cadence", ["weapons.universal.ice.evolvedCooldown"], "Shortens the block-and-freeze recharge."),
  ] }),
  annihilator: entry({ key: "universal:annihilator", scope: "universal", sourceId: "annihilator", specialistId: null, baseName: "Annihilator", evolvedName: "Animapocalypse", pairedPassive: "xp", handler: "universal-annihilator-v1", capabilities: [
    gameplay("cadence", ["weapons.universal.annihilator.evolvedCooldown"], "Shortens the annihilation recharge."),
  ] }),
  drone: entry({ key: "universal:drone", scope: "universal", sourceId: "drone", specialistId: null, baseName: "Yuum.AI Drone", evolvedName: "Yuum.AI Final", pairedPassive: "pickup", handler: "universal-drone-v1", capabilities: [
    gameplay("pierce", ["weapons.universal.drone.evolvedPierce"], "Allows drone bolts to continue through additional targets."),
    gameplay("repair-rate", ["weapons.universal.drone.evolvedRepairMultiplier"], "Shortens the drone's repair cycle."),
  ] }),
};

export const WEAPON_EVOLUTION_CONTRACT = Object.freeze({
  schema: WEAPON_EVOLUTION_SCHEMA,
  schemaVersion: WEAPON_EVOLUTION_VERSION,
  requirement: Object.freeze({ weaponLevel: 5, passiveLevel: 1, trigger: "elite-access-card", selection: "first-eligible-loadout-order" }),
  signatures: Object.freeze(signatures),
  universal: Object.freeze(universal),
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalEvolutionContract(candidate = WEAPON_EVOLUTION_CONTRACT) {
  return JSON.stringify(canonicalize(candidate));
}

export function evolutionContractFingerprint(candidate = WEAPON_EVOLUTION_CONTRACT) {
  const text = canonicalEvolutionContract(candidate);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export const WEAPON_EVOLUTION_HASH = evolutionContractFingerprint();

const exactKeys = (value, expected) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
};

function valueAtPath(root, path) {
  let value = root;
  for (const part of path.split(".")) value = value?.[part];
  return value;
}

export function validateWeaponEvolutionContract(candidate = WEAPON_EVOLUTION_CONTRACT, balance = null) {
  const errors = [];
  if (!exactKeys(candidate, ["schema", "schemaVersion", "requirement", "signatures", "universal"])) return ["contract: fields mismatch"];
  if (candidate.schema !== WEAPON_EVOLUTION_SCHEMA || candidate.schemaVersion !== WEAPON_EVOLUTION_VERSION) errors.push("contract: schema mismatch");
  if (!exactKeys(candidate.requirement, ["weaponLevel", "passiveLevel", "trigger", "selection"])) errors.push("requirement: fields mismatch");
  else {
    if (candidate.requirement.weaponLevel !== 5 || candidate.requirement.passiveLevel !== 1) errors.push("requirement: unsupported ranks");
    if (candidate.requirement.trigger !== "elite-access-card") errors.push("requirement.trigger: unsupported");
    if (candidate.requirement.selection !== "first-eligible-loadout-order") errors.push("requirement.selection: unsupported");
  }
  const validateMap = (scope, entries, ids) => {
    if (!exactKeys(entries, ids)) { errors.push(`${scope}: exact coverage mismatch`); return; }
    for (const id of ids) {
      const record = entries[id], path = `${scope}.${id}`;
      if (!exactKeys(record, ["key", "scope", "sourceId", "specialistId", "baseName", "evolvedName", "pairedPassive", "status", "handler", "capabilities"])) { errors.push(`${path}: fields mismatch`); continue; }
      const signature = scope === "signatures";
      if (record.key !== `${signature ? "signature" : "universal"}:${id}`) errors.push(`${path}.key: mismatch`);
      if (record.scope !== (signature ? "signature" : "universal")) errors.push(`${path}.scope: mismatch`);
      if (record.sourceId !== (signature ? "signature" : id)) errors.push(`${path}.sourceId: mismatch`);
      if (record.specialistId !== (signature ? id : null)) errors.push(`${path}.specialistId: mismatch`);
      if (typeof record.baseName !== "string" || !record.baseName || typeof record.evolvedName !== "string" || !record.evolvedName) errors.push(`${path}: names required`);
      if (!PASSIVE_IDS.includes(record.pairedPassive)) errors.push(`${path}.pairedPassive: unsupported`);
      if (!WEAPON_EVOLUTION_STATUSES.includes(record.status)) errors.push(`${path}.status: unsupported`);
      if (record.handler !== `${signature ? "signature" : "universal"}-${id}-v1`) errors.push(`${path}.handler: mismatch`);
      if (!Array.isArray(record.capabilities) || !record.capabilities.length) { errors.push(`${path}.capabilities: required`); continue; }
      const seen = new Set();
      for (const [index, item] of record.capabilities.entries()) {
        const capPath = `${path}.capabilities.${index}`;
        if (!exactKeys(item, ["id", "tuningKeys", "note"])) { errors.push(`${capPath}: fields mismatch`); continue; }
        if (!WEAPON_EVOLUTION_CAPABILITIES.includes(item.id)) errors.push(`${capPath}.id: unsupported`);
        if (seen.has(item.id)) errors.push(`${capPath}.id: duplicate`);
        seen.add(item.id);
        if (!Array.isArray(item.tuningKeys) || new Set(item.tuningKeys).size !== item.tuningKeys.length || item.tuningKeys.some((key) => typeof key !== "string" || !key)) errors.push(`${capPath}.tuningKeys: invalid`);
        if (typeof item.note !== "string" || !item.note) errors.push(`${capPath}.note: required`);
        if (item.id === "impact-identity" && item.tuningKeys.length) errors.push(`${capPath}.tuningKeys: impact identity must not claim gameplay tuning`);
        if (item.id !== "impact-identity" && !item.tuningKeys.length) errors.push(`${capPath}.tuningKeys: gameplay capability requires tuning`);
        if (balance) for (const key of item.tuningKeys) if (!Number.isFinite(valueAtPath(balance, key))) errors.push(`${capPath}.tuningKeys: ${key} is not finite balance tuning`);
      }
      const presentationOnly = record.capabilities.every((item) => item.id === "impact-identity");
      if ((record.status === "presentation-only") !== presentationOnly) errors.push(`${path}.status: must match capability scope`);
    }
  };
  validateMap("signatures", candidate.signatures, SIGNATURE_IDS);
  validateMap("universal", candidate.universal, UNIVERSAL_IDS);
  return errors;
}

export function getWeaponEvolution(sourceId, specialistId = null, candidate = WEAPON_EVOLUTION_CONTRACT) {
  if (sourceId === "signature") return candidate.signatures?.[specialistId] || null;
  return candidate.universal?.[sourceId] || null;
}

export function resolveWeaponVariant(player, sourceId, evolvedOverride) {
  const contract = getWeaponEvolution(sourceId, player?.specialist);
  if (!contract) return null;
  const state = sourceId === "signature" ? player?.weapons?.signature : player?.weapons?.[sourceId];
  const evolved = evolvedOverride === undefined ? Boolean(state?.evolved) : Boolean(evolvedOverride);
  return Object.freeze({
    key: contract.key,
    sourceId: contract.sourceId,
    specialistId: contract.specialistId,
    evolved,
    variantId: `${contract.key}:${evolved ? "evolved" : "base"}`,
    contract,
  });
}

export function stampWeaponVariant(target, variant) {
  if (!target || !variant) return target;
  for (const [key, value] of [["sourceId", variant.sourceId], ["variantId", variant.variantId]]) {
    const current = Object.getOwnPropertyDescriptor(target, key);
    if (current && current.value !== undefined && current.value !== value) throw new TypeError(`${key} conflicts with resolved weapon variant`);
    Object.defineProperty(target, key, { value, enumerable: true, writable: false, configurable: false });
  }
  return target;
}

export function parseWeaponVariantId(variantId, candidate = WEAPON_EVOLUTION_CONTRACT) {
  const match = /^(signature|universal):([a-z0-9]+):(base|evolved)$/.exec(String(variantId || ""));
  if (!match) return null;
  const [, scope, id, variant] = match;
  const contract = scope === "signature" ? candidate.signatures?.[id] : candidate.universal?.[id];
  if (!contract) return null;
  return Object.freeze({ key: contract.key, sourceId: contract.sourceId, specialistId: contract.specialistId, evolved: variant === "evolved", variantId, contract });
}
