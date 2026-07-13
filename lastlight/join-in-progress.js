import { PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260713.14";
import { BALANCE_CONFIG } from "./balance-config.js?v=20260713.14";

export const JOIN_IN_PROGRESS_SCHEMA = "lastlight.join-in-progress.v1";
export const JOIN_PACKAGE_SCHEMA = "lastlight.join-package.v1";
export const JOIN_PACKAGE_IDS = Object.freeze(["signature", "assault", "survival"]);
export const JOIN_PACKAGE_STATES = Object.freeze(["offered", "selected", "applied"]);

const MAX_SLOT = 3;
const MAX_CAMPAIGN_TICKS = 60 * 60 * 60;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const PACKAGE_RECIPES = {
  signature: {
    weapons: [],
    passives: [],
    description: "Prioritize the specialist signature and its paired passive, then complete a stable compatible loadout.",
  },
  assault: {
    weapons: ["crossbow", "uwu", "rail", "annihilator"],
    passives: ["damage", "haste", "crit", "projectiles", "area", "duration"],
    description: "Prioritize direct output, projectile pressure, and area coverage.",
  },
  survival: {
    weapons: ["ice", "aura", "slicers", "drone"],
    passives: ["maxHealth", "armor", "regen", "move", "duration", "pickup"],
    description: "Prioritize durability, recovery, escape speed, and defensive weapons.",
  },
};

const legalGrantCapacity = (BALANCE_CONFIG.core.maxWeaponLevel - 1)
  + (BALANCE_CONFIG.core.maxWeaponSlots - 1) * BALANCE_CONFIG.core.maxWeaponLevel
  + BALANCE_CONFIG.core.maxPassiveSlots * Math.max(...Object.values(PASSIVES).map(({ max }) => max));

export const JOIN_IN_PROGRESS_REGISTRY = deepFreeze({
  schema: JOIN_IN_PROGRESS_SCHEMA,
  packageSchema: JOIN_PACKAGE_SCHEMA,
  packageIds: [...JOIN_PACKAGE_IDS],
  states: [...JOIN_PACKAGE_STATES],
  lifecycle: { offered: ["selected"], selected: ["applied"], applied: [] },
  caps: {
    slots: MAX_SLOT + 1,
    minSquadLevel: 1,
    maxSquadLevel: legalGrantCapacity + 2,
    maxCatchUpRanks: legalGrantCapacity,
    weaponLevel: BALANCE_CONFIG.core.maxWeaponLevel,
    weaponSlots: BALANCE_CONFIG.core.maxWeaponSlots,
    passiveSlots: BALANCE_CONFIG.core.maxPassiveSlots,
  },
  campaignEligibility: { maximumRequiredSeconds: 120, preApexCombatRatio: 0.25, tickRate: 60 },
  selection: { initialSignatureLevel: 1, tieBreak: "stable-id", evolution: false, randomness: false },
  packages: Object.fromEntries(JOIN_PACKAGE_IDS.map((id) => [id, { id, ...PACKAGE_RECIPES[id] }])),
});

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} has unexpected fields`);
}

function integer(value, min, max, path) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${path} is invalid`);
  return value;
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function clone(value) { return structuredClone(value); }
function stableIds(record) { return Object.keys(record).sort((left, right) => left.localeCompare(right)); }

function validateCatalogs({ specialists, weapons, passives, balance }) {
  if (!specialists || !weapons || !passives || !balance?.core) throw new TypeError("Join package catalogs are invalid");
  const expectedSpecialists = stableIds(SPECIALISTS), expectedWeapons = stableIds(WEAPONS), expectedPassives = stableIds(PASSIVES);
  if (!same(stableIds(specialists), expectedSpecialists) || !same(stableIds(weapons), expectedWeapons) || !same(stableIds(passives), expectedPassives)) {
    throw new TypeError("Join package catalog coverage mismatch");
  }
  for (const id of expectedSpecialists) {
    if (!expectedPassives.includes(specialists[id]?.signature?.passive)) throw new TypeError(`Specialist ${id} has an invalid paired passive`);
  }
  for (const id of expectedWeapons) {
    integer(weapons[id]?.max, 1, 100, `weapons.${id}.max`);
    if (!expectedPassives.includes(weapons[id]?.passive)) throw new TypeError(`Weapon ${id} has an invalid paired passive`);
  }
  for (const id of expectedPassives) integer(passives[id]?.max, 1, 100, `passives.${id}.max`);
  for (const key of ["maxWeaponLevel", "maxWeaponSlots", "maxPassiveSlots"]) integer(balance.core[key], 1, 100, `balance.core.${key}`);
  return { specialistIds: expectedSpecialists, weaponIds: expectedWeapons, passiveIds: expectedPassives };
}

export function validateJoinInProgressRegistry(value = JOIN_IN_PROGRESS_REGISTRY) {
  exactKeys(value, ["schema", "packageSchema", "packageIds", "states", "lifecycle", "caps", "campaignEligibility", "selection", "packages"], "registry");
  if (value.schema !== JOIN_IN_PROGRESS_SCHEMA || !same(value, JOIN_IN_PROGRESS_REGISTRY)) throw new TypeError("Join-in-progress registry contract mismatch");
  return value;
}

export function catchUpRankCount(squadLevel) {
  integer(squadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.minSquadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.maxSquadLevel, "squadLevel");
  return Math.max(0, squadLevel - 2);
}

function prioritizedIds(authored, allIds, limit) {
  const authoredIds = authored.filter((id) => allIds.includes(id));
  return [...new Set([...authoredIds, ...allIds])].slice(0, limit);
}

function packagePools(packageId, specialistId, catalogs, ids) {
  const recipe = PACKAGE_RECIPES[packageId], pairedPassive = catalogs.specialists[specialistId].signature.passive;
  let weaponPriority = recipe.weapons, passivePriority = recipe.passives;
  if (packageId === "signature") {
    weaponPriority = ids.weaponIds.filter((id) => catalogs.weapons[id].passive === pairedPassive);
    passivePriority = [pairedPassive];
  }
  return {
    weapons: prioritizedIds(weaponPriority, ids.weaponIds, catalogs.balance.core.maxWeaponSlots - 1),
    passives: prioritizedIds(passivePriority, ids.passiveIds, catalogs.balance.core.maxPassiveSlots),
  };
}

function createSchedule(packageId, specialistId, catalogs, ids) {
  const pools = packagePools(packageId, specialistId, catalogs, ids);
  const weapons = ["signature", ...pools.weapons].map((id) => ({ kind: "weapon", id }));
  const passives = pools.passives.map((id) => ({ kind: "passive", id }));
  if (packageId === "signature") return [weapons[0], passives[0], ...weapons.slice(1), ...passives.slice(1)];
  const schedule = [];
  for (let index = 0; index < Math.max(weapons.length, passives.length); index++) {
    if (passives[index]) schedule.push(passives[index]);
    if (weapons[index]) schedule.push(weapons[index]);
  }
  return schedule;
}

function grantCap(candidate, catalogs) {
  if (candidate.kind === "passive") return catalogs.passives[candidate.id].max;
  return candidate.id === "signature" ? catalogs.balance.core.maxWeaponLevel - JOIN_IN_PROGRESS_REGISTRY.selection.initialSignatureLevel : catalogs.balance.core.maxWeaponLevel;
}

function canonicalGrants(grants) {
  return [...grants].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

export function generateJoinPackage({ slot, specialistId, squadLevel, packageId }, sources = {}) {
  integer(slot, 0, MAX_SLOT, "slot");
  integer(squadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.minSquadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.maxSquadLevel, "squadLevel");
  if (!JOIN_PACKAGE_IDS.includes(packageId)) throw new TypeError("packageId is invalid");
  const catalogs = {
    specialists: sources.specialists || SPECIALISTS,
    weapons: sources.weapons || WEAPONS,
    passives: sources.passives || PASSIVES,
    balance: sources.balance || BALANCE_CONFIG,
  };
  const ids = validateCatalogs(catalogs);
  if (!ids.specialistIds.includes(specialistId)) throw new TypeError("specialistId is invalid");
  const targetRanks = catchUpRankCount(squadLevel), schedule = createSchedule(packageId, specialistId, catalogs, ids);
  const ranks = new Map(schedule.map((candidate) => [`${candidate.kind}:${candidate.id}`, 0]));
  let granted = 0;
  while (granted < targetRanks) {
    let progressed = false;
    for (const candidate of schedule) {
      if (granted >= targetRanks) break;
      const key = `${candidate.kind}:${candidate.id}`, current = ranks.get(key);
      if (current >= grantCap(candidate, catalogs)) continue;
      ranks.set(key, current + 1); granted++; progressed = true;
    }
    if (!progressed) throw new RangeError("Catch-up rank count exceeds legal package capacity");
  }
  const grants = canonicalGrants(schedule.map(({ kind, id }) => ({ kind, id, ranks: ranks.get(`${kind}:${id}`) })).filter(({ ranks: count }) => count > 0));
  return deepFreeze({
    schema: JOIN_PACKAGE_SCHEMA,
    registryVersion: JOIN_IN_PROGRESS_SCHEMA,
    slot,
    specialistId,
    squadLevel,
    packageId,
    state: "offered",
    catchUpRanks: targetRanks,
    grants,
  });
}

export function validateJoinPackage(value, { expectedState = null } = {}) {
  exactKeys(value, ["schema", "registryVersion", "slot", "specialistId", "squadLevel", "packageId", "state", "catchUpRanks", "grants"], "package");
  if (value.schema !== JOIN_PACKAGE_SCHEMA || value.registryVersion !== JOIN_IN_PROGRESS_SCHEMA) throw new TypeError("Join package schema mismatch");
  integer(value.slot, 0, MAX_SLOT, "package.slot");
  integer(value.squadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.minSquadLevel, JOIN_IN_PROGRESS_REGISTRY.caps.maxSquadLevel, "package.squadLevel");
  if (!SPECIALISTS[value.specialistId] || !JOIN_PACKAGE_IDS.includes(value.packageId) || !JOIN_PACKAGE_STATES.includes(value.state)) throw new TypeError("Join package identity is invalid");
  if (expectedState !== null && value.state !== expectedState) throw new TypeError(`Join package must be ${expectedState}`);
  integer(value.catchUpRanks, 0, JOIN_IN_PROGRESS_REGISTRY.caps.maxCatchUpRanks, "package.catchUpRanks");
  if (!Array.isArray(value.grants) || value.grants.length > JOIN_IN_PROGRESS_REGISTRY.caps.weaponSlots + JOIN_IN_PROGRESS_REGISTRY.caps.passiveSlots) throw new TypeError("Join package grants exceed bounds");
  let previous = "", total = 0;
  for (const [index, grant] of value.grants.entries()) {
    const path = `package.grants.${index}`;
    exactKeys(grant, ["kind", "id", "ranks"], path);
    const key = `${grant.kind}:${grant.id}`;
    if (key <= previous) throw new TypeError("Join package grants must be canonical and unique");
    previous = key;
    if (grant.kind === "weapon") {
      if (grant.id !== "signature" && !WEAPONS[grant.id]) throw new TypeError(`${path}.id is invalid`);
      integer(grant.ranks, 1, grant.id === "signature" ? BALANCE_CONFIG.core.maxWeaponLevel - 1 : BALANCE_CONFIG.core.maxWeaponLevel, `${path}.ranks`);
    } else if (grant.kind === "passive") {
      if (!PASSIVES[grant.id]) throw new TypeError(`${path}.id is invalid`);
      integer(grant.ranks, 1, PASSIVES[grant.id].max, `${path}.ranks`);
    } else throw new TypeError(`${path}.kind is invalid`);
    total += grant.ranks;
  }
  if (total !== value.catchUpRanks || value.catchUpRanks !== catchUpRankCount(value.squadLevel)) throw new TypeError("Join package rank total mismatch");
  const expected = generateJoinPackage(value);
  if (!same({ ...expected, state: value.state }, value)) throw new TypeError("Join package grants do not match deterministic contract");
  return value;
}

export function transitionJoinPackage(value, nextState) {
  validateJoinPackage(value);
  if (!JOIN_PACKAGE_STATES.includes(nextState) || !JOIN_IN_PROGRESS_REGISTRY.lifecycle[value.state].includes(nextState)) throw new TypeError("Invalid join package state transition");
  return deepFreeze({ ...clone(value), state: nextState });
}

export function joinPackageUpgradeIds(value) {
  validateJoinPackage(value);
  const result = [];
  for (const grant of value.grants) for (let rank = 0; rank < grant.ranks; rank++) result.push(`${grant.kind}:${grant.id}`);
  return Object.freeze(result);
}

export function applyJoinPackageToLoadout(loadout, value) {
  validateJoinPackage(value);
  exactKeys(loadout, ["weapons", "passives"], "loadout");
  if (!loadout.weapons || typeof loadout.weapons !== "object" || Array.isArray(loadout.weapons) || !loadout.passives || typeof loadout.passives !== "object" || Array.isArray(loadout.passives)) throw new TypeError("loadout fields are invalid");
  const result = clone(loadout);
  if (!result.weapons.signature) result.weapons.signature = { level: JOIN_IN_PROGRESS_REGISTRY.selection.initialSignatureLevel, evolved: false };
  for (const grant of value.grants) {
    if (grant.kind === "weapon") {
      const current = result.weapons[grant.id] || { level: 0, evolved: false };
      exactKeys(current, ["level", "evolved"], `loadout.weapons.${grant.id}`);
      if (current.evolved !== false) throw new TypeError("Join packages cannot apply to evolved weapons");
      const level = integer(current.level, 0, BALANCE_CONFIG.core.maxWeaponLevel, `loadout.weapons.${grant.id}.level`) + grant.ranks;
      if (level > BALANCE_CONFIG.core.maxWeaponLevel) throw new RangeError("Join package exceeds weapon rank cap");
      result.weapons[grant.id] = { level, evolved: false };
    } else {
      const level = integer(Number(result.passives[grant.id] || 0), 0, PASSIVES[grant.id].max, `loadout.passives.${grant.id}`) + grant.ranks;
      if (level > PASSIVES[grant.id].max) throw new RangeError("Join package exceeds passive rank cap");
      result.passives[grant.id] = level;
    }
  }
  if (Object.keys(result.weapons).length > BALANCE_CONFIG.core.maxWeaponSlots || Object.values(result.passives).filter((rank) => rank > 0).length > BALANCE_CONFIG.core.maxPassiveSlots) throw new RangeError("Join package exceeds loadout slot caps");
  return result;
}

export function campaignJoinEligibility({ activeCombatTicks, preApexCombatTicks, tickRate = JOIN_IN_PROGRESS_REGISTRY.campaignEligibility.tickRate }) {
  integer(tickRate, 1, 1_000, "tickRate");
  integer(activeCombatTicks, 0, MAX_CAMPAIGN_TICKS, "activeCombatTicks");
  integer(preApexCombatTicks, 0, MAX_CAMPAIGN_TICKS, "preApexCombatTicks");
  if (activeCombatTicks > preApexCombatTicks) throw new TypeError("activeCombatTicks cannot exceed preApexCombatTicks");
  const tuning = JOIN_IN_PROGRESS_REGISTRY.campaignEligibility;
  const requiredCombatTicks = Math.min(tuning.maximumRequiredSeconds * tickRate, Math.ceil(preApexCombatTicks * tuning.preApexCombatRatio));
  return deepFreeze({
    eligible: preApexCombatTicks > 0 && activeCombatTicks >= requiredCombatTicks,
    activeCombatTicks,
    preApexCombatTicks,
    requiredCombatTicks,
    requiredCombatSeconds: requiredCombatTicks / tickRate,
  });
}
