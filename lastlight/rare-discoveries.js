import { fnv1a64 } from "./replay.js?v=20260716.10";

export const RARE_DISCOVERY_SCHEMA = "lastlight.rare-discoveries.v1";
export const RARE_DISCOVERY_REGISTRY_VERSION = "lastlight.rare-discoveries.registry.v1";
export const RARE_DISCOVERY_STORAGE_VERSION = 1;
export const RARE_DISCOVERY_STORAGE_KEY = "lastlight:rare-discoveries:v1";
export const MAX_RARE_DISCOVERY_CLAIMS = 64;

const BOON_IDS = Object.freeze({
  "Cruise Control": "cruise-control",
  "Fired Up": "fired-up",
  Healthback: "healthback",
  "Squad Shield": "squad-shield",
  Stopwaves: "stopwaves",
  "Ultra Rapid Fire-r": "ultra-rapid-fire",
});

const BOON_SOURCE = Object.freeze([
  ["Cruise Control", "Massive movement speed for 15 seconds.", "cruise-control.webp"],
  ["Fired Up", "Strong fireballs hunt the nearest enemy.", "fired-up.webp"],
  ["Healthback", "Every kill restores a little health.", "healthback.webp"],
  ["Squad Shield", "The whole squad gains a massive shield.", "squad-shield.webp"],
  ["Stopwaves", "Periodic shockwaves freeze nearby enemies.", "stopwaves.webp"],
  ["Ultra Rapid Fire-r", "Massively increased weapon and ability haste.", "ultra-rapid-fire-r.webp"],
]);

const AUGMENT_SOURCE = Object.freeze([
  ["glass", "Glass Cannon", "+40% damage, −30% maximum health.", "glass-cannon.webp"],
  ["bullet", "Bullet Mania", "−15% damage; gain a projectile every six levels.", "bullet-mania.webp"],
  ["collector", "Card Collector", "Each access key grants +5% damage.", "card-collector.webp"],
  ["celebration", "Celebration!", "Level-ups trigger eight seconds of extreme stats.", "celebration.webp"],
  ["crosscountry", "Cross Country", "Distance traveled permanently raises damage, health, and area.", "cross-country.webp"],
  ["deathTax", "Death & Taxes", "Kills can explode and drop bonus gold.", "death-and-taxes.webp"],
  ["elite", "Elite Bomber", "+30% elite damage; slain elites leave a massive bomb.", "elite-bomber.webp"],
  ["experienced", "Experienced Fighter", "+10% data gain; pickups grant brief damage and speed.", "experienced-fighter.webp"],
  ["larger", "Larger Than Life", "+30% size, repair, and health; −15% movement speed.", "larger-than-life.webp"],
  ["long", "Long Range", "Deal up to 30% more damage at long distance.", "long-range.webp"],
  ["metabolic", "Metabolic Overdrive", "Heal 20% health each second, but lose 60% max health.", "metabolic-overdrive.webp"],
  ["critical", "Mission Critical", "+10% crit and +25% crit damage; weak non-crits.", "mission-critical.webp"],
  ["spray", "Spray & Pray", "+4 projectiles, −35% damage.", "spray-and-pray.webp"],
  ["uptime", "Uptime Upgrade", "+60% duration.", "uptime-upgrade.webp"],
  ["withhaste", "With Haste", "Every two ability haste grants 1% movement speed.", "with-haste.webp"],
]);

const record = (id, category, trigger, name, concealed, copy, lore, glyph, icon) => ({
  id, category, trigger, name, concealed, copy, lore, glyph, icon,
});

const EVENT_RECORDS = [
  record("event:elite-access-card", "event", "pickup", "Elite access card", "Encrypted access token", "Evolves one eligible level-five weapon whose matching passive is owned.", "Priority targets carry one-use authorization keys keyed to the squad's current loadout.", "KEY", "assets/archive/elite-access-card.webp"),
  record("event:treasure-runner", "event", "encounter", "Treasure runner", "Fast encrypted signal", "Catch the fleeing gold target before it escapes to recover bonus gold, data, and access cards.", "The signal prioritizes open escape lanes and never fights back; burst movement and focused fire are the counterplay.", "$", "assets/archive/treasure-runner.webp"),
  record("event:relay-ball", "event", "encounter", "Relay ball", "Dormant relay signature", "Push the relay core into its destination ring before the route window closes.", "Multiple specialists can add force. Only movement toward the destination earns objective credit.", "ORB", "assets/archive/relay-ball.webp"),
];

const AFFIX_RECORDS = [
  record("affix:hasted", "affix", "affix", "Hasted elite", "Unresolved elite signature", "Moves faster and recovers attacks sooner. Triple chevrons identify it without color.", "Keep lateral space and punish recovery rather than racing its approach.", "»", "assets/archive/with-haste.webp"),
  record("affix:shielded", "affix", "affix", "Shielded elite", "Unresolved elite signature", "Arrives with a one-time barrier. A diamond badge and separate barrier readout identify it.", "Focused opening damage removes the barrier permanently; control does not bypass it.", "◇", "assets/archive/squad-shield.webp"),
  record("affix:volatile", "affix", "affix", "Volatile elite", "Unresolved elite signature", "Leaves a delayed blast on death. A notched warning ring remains visible with effects reduced.", "Create space before the final hit, then cross the marked boundary only after discharge.", "!", "assets/archive/elite-bomber.webp"),
];

const BOON_RECORDS = BOON_SOURCE.map(([name, copy, icon]) => record(
  `boon:${BOON_IDS[name]}`, "boon", "boon", name, "Uncatalogued squad protocol", copy,
  "Relay hardware applies this protocol to every standing specialist for one bounded combat window.", "★", `assets/archive/${icon}`,
));

const augmentId = (id) => String(id).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const AUGMENT_RECORDS = AUGMENT_SOURCE.map(([id, name, copy, icon]) => record(
  `augment:${augmentId(id)}`, "augment", "dossier", name, "Sealed prototype dossier", copy,
  "Recovered command research. This dossier is an archive discovery and grants no persistent combat power.", "AUG", `assets/archive/${icon}`,
));

export const RARE_DISCOVERY_REGISTRY = deepFreeze({
  schema: RARE_DISCOVERY_REGISTRY_VERSION,
  entries: [...EVENT_RECORDS, ...AFFIX_RECORDS, ...BOON_RECORDS, ...AUGMENT_RECORDS],
});

export const RARE_DISCOVERY_IDS = Object.freeze(RARE_DISCOVERY_REGISTRY.entries.map(({ id }) => id));
export const AUGMENT_DISCOVERY_IDS = Object.freeze(AUGMENT_RECORDS.map(({ id }) => id));
const ID_SET = new Set(RARE_DISCOVERY_IDS);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exact(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function canonicalIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => ID_SET.has(id)))].sort((left, right) => left.localeCompare(right));
}

export function validateRareDiscoveryRegistry(value) {
  const errors = [];
  if (!exact(value, ["schema", "entries"]) || value.schema !== RARE_DISCOVERY_REGISTRY_VERSION || !Array.isArray(value.entries)) return ["rare discovery registry: invalid root"];
  const ids = new Set();
  for (const [index, entry] of value.entries.entries()) {
    const path = `entries.${index}`;
    if (!exact(entry, ["id", "category", "trigger", "name", "concealed", "copy", "lore", "glyph", "icon"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (!/^(event|affix|boon|augment):[a-z][a-z0-9-]{0,39}$/.test(entry.id) || ids.has(entry.id)) errors.push(`${path}: id invalid or duplicate`);
    ids.add(entry.id);
    if (!['event', 'affix', 'boon', 'augment'].includes(entry.category) || !['encounter', 'pickup', 'affix', 'boon', 'dossier'].includes(entry.trigger)) errors.push(`${path}: classification invalid`);
    for (const field of ["name", "concealed", "copy", "lore", "glyph"]) if (typeof entry[field] !== "string" || !entry[field].trim() || entry[field].length > (field === "glyph" ? 8 : field === "name" || field === "concealed" ? 64 : 240)) errors.push(`${path}.${field}: presentation invalid`);
    if (typeof entry.icon !== "string" || !/^assets\/archive\/[a-z0-9-]+\.webp$/.test(entry.icon)) errors.push(`${path}.icon: invalid`);
  }
  if (value.entries.length !== 27 || EVENT_RECORDS.some(({ id }) => !ids.has(id)) || AFFIX_RECORDS.some(({ id }) => !ids.has(id)) || BOON_RECORDS.some(({ id }) => !ids.has(id)) || AUGMENT_RECORDS.some(({ id }) => !ids.has(id))) errors.push("entries: coverage mismatch");
  return errors;
}

export function rareDiscoveryDefinition(id) {
  return RARE_DISCOVERY_REGISTRY.entries.find((entry) => entry.id === id) || null;
}

export function rareDiscoveryIdForBoon(boon) {
  const id = BOON_IDS[typeof boon === "string" ? boon : boon?.name];
  return id ? `boon:${id}` : null;
}

export function createRareDiscoveryRunState(enabled = true) {
  return deepFreeze({ schema: RARE_DISCOVERY_SCHEMA, enabled: Boolean(enabled), encountered: [], dossierSequence: 0 });
}

export function validateRareDiscoveryRunState(value) {
  return exact(value, ["schema", "enabled", "encountered", "dossierSequence"])
    && value.schema === RARE_DISCOVERY_SCHEMA && typeof value.enabled === "boolean"
    && Number.isSafeInteger(value.dossierSequence) && value.dossierSequence >= 0 && value.dossierSequence <= 1_000
    && Array.isArray(value.encountered) && value.encountered.length <= RARE_DISCOVERY_IDS.length
    && value.encountered.every((id) => ID_SET.has(id))
    && canonicalIds(value.encountered).every((id, index) => id === value.encountered[index]);
}

export function recordRareDiscovery(state, id) {
  if (!validateRareDiscoveryRunState(state) || !ID_SET.has(id)) throw new TypeError("Invalid rare discovery transition");
  if (!state.enabled || state.encountered.includes(id)) return deepFreeze({ state, discovery: null });
  const next = { ...state, encountered: canonicalIds([...state.encountered, id]) };
  return deepFreeze({ state: next, discovery: rareDiscoveryDefinition(id) });
}

export function revealNextAugmentDossier(state, seed = "") {
  if (!validateRareDiscoveryRunState(state)) throw new TypeError("Invalid rare discovery dossier state");
  if (!state.enabled) return deepFreeze({ state, discovery: null });
  const remaining = AUGMENT_DISCOVERY_IDS.filter((id) => !state.encountered.includes(id));
  const sequence = Math.min(1_000, state.dossierSequence + 1);
  if (!remaining.length) return deepFreeze({ state: deepFreeze({ ...state, dossierSequence: sequence }), discovery: null });
  const offset = Number(BigInt(`0x${fnv1a64(`${seed}:${sequence}`)}`) % BigInt(remaining.length));
  const transition = recordRareDiscovery({ ...state, dossierSequence: sequence }, remaining[offset]);
  return transition;
}

export function emptyRareDiscoveryCollection() {
  return { schema: RARE_DISCOVERY_SCHEMA, storageVersion: RARE_DISCOVERY_STORAGE_VERSION, registryVersion: RARE_DISCOVERY_REGISTRY_VERSION, discovered: [], appliedClaims: [] };
}

export function normalizeRareDiscoveryCollection(value) {
  return {
    ...emptyRareDiscoveryCollection(),
    discovered: canonicalIds(value?.discovered),
    appliedClaims: [...new Set((Array.isArray(value?.appliedClaims) ? value.appliedClaims : []).filter((claim) => /^[0-9a-f]{16}$/.test(claim)))].slice(-MAX_RARE_DISCOVERY_CLAIMS),
  };
}

export function validateRareDiscoveryCollection(value) {
  if (!exact(value, ["schema", "storageVersion", "registryVersion", "discovered", "appliedClaims"]) || value.schema !== RARE_DISCOVERY_SCHEMA || value.storageVersion !== RARE_DISCOVERY_STORAGE_VERSION || value.registryVersion !== RARE_DISCOVERY_REGISTRY_VERSION) return false;
  const normalized = normalizeRareDiscoveryCollection(value);
  return normalized.discovered.length === value.discovered.length && normalized.discovered.every((id, index) => id === value.discovered[index])
    && normalized.appliedClaims.length === value.appliedClaims.length && normalized.appliedClaims.every((id, index) => id === value.appliedClaims[index]);
}

export function loadRareDiscoveryCollection(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(RARE_DISCOVERY_STORAGE_KEY) || "null");
    return deepFreeze(validateRareDiscoveryCollection(parsed) ? parsed : normalizeRareDiscoveryCollection(parsed));
  } catch { return deepFreeze(emptyRareDiscoveryCollection()); }
}

export function saveRareDiscoveryCollection(storage, value) {
  const normalized = normalizeRareDiscoveryCollection(value);
  storage?.setItem?.(RARE_DISCOVERY_STORAGE_KEY, JSON.stringify(normalized));
  return deepFreeze(normalized);
}

export function awardRareDiscoveries(collection, report) {
  const current = normalizeRareDiscoveryCollection(collection);
  const canonical = canonicalIds(report?.discoveries);
  if (!report || !["lastlight.squad-run-report.v4", "lastlight.squad-run-report.v5"].includes(report.schema) || !/^[0-9a-f]{16}$/.test(report.fingerprint || "") || !Array.isArray(report.discoveries) || report.discoveries.length > RARE_DISCOVERY_IDS.length || canonical.length !== report.discoveries.length || canonical.some((id, index) => id !== report.discoveries[index])) throw new TypeError("Invalid terminal rare discovery evidence");
  const claim = fnv1a64(`${report.fingerprint}:rare-discoveries`);
  if (current.appliedClaims.includes(claim)) return deepFreeze({ state: current, award: null });
  const newlyDiscovered = report.discoveries.filter((id) => !current.discovered.includes(id));
  current.discovered = canonicalIds([...current.discovered, ...report.discoveries]);
  current.appliedClaims = [...current.appliedClaims, claim].slice(-MAX_RARE_DISCOVERY_CLAIMS);
  return deepFreeze({ state: current, award: { discovered: newlyDiscovered, total: current.discovered.length, available: RARE_DISCOVERY_IDS.length } });
}

export function rareDiscoveryTelemetry(collection, newlyDiscovered = []) {
  const current = normalizeRareDiscoveryCollection(collection);
  const categories = { event: 0, affix: 0, boon: 0, augment: 0 };
  for (const id of current.discovered) categories[rareDiscoveryDefinition(id).category]++;
  return deepFreeze({ discoveredCount: current.discovered.length, newlyRevealedCount: canonicalIds(newlyDiscovered).length, categories });
}

const registryErrors = validateRareDiscoveryRegistry(RARE_DISCOVERY_REGISTRY);
if (registryErrors.length) throw new Error(`Invalid rare discovery registry:\n- ${registryErrors.join("\n- ")}`);
