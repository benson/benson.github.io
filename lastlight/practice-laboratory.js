import { BALANCE_CONFIG } from "./balance-config.js?v=20260717.1";
import { DIFFICULTIES, MAPS, PASSIVES, SPECIALISTS, WEAPONS } from "./data.js?v=20260717.1";
import { Simulation, applyPlayerUpgrade } from "./engine.js?v=20260717.1";
import { ELITE_AFFIX_IDS, ENEMY_ARCHETYPE_IDS, eliteAffixEligibility } from "./enemy-archetypes.js?v=20260713.1";
import { gameplayFeatureContract } from "./feature-config.js?v=20260717.1";
import { playerBuildStats, weaponTelemetry } from "./upgrade-preview.js?v=20260717.1";

export const PRACTICE_LABORATORY_SCHEMA = "lastlight.practice-laboratory.v1";
export const PRACTICE_LABORATORY_SEED = "1a57cafe1a57cafe1a57cafe1a57cafe";
export const PRACTICE_MEASUREMENT_WINDOWS = Object.freeze([5, 10, 30]);
export const PRACTICE_MAX_WEAPONS = BALANCE_CONFIG.core.maxWeaponSlots;
export const PRACTICE_MAX_PASSIVES = BALANCE_CONFIG.core.maxPassiveSlots;

const CONFIG_FIELDS = Object.freeze(["schema", "specialist", "masteryStart", "map", "difficulty", "measurementSeconds", "playerInvulnerable", "target", "weapons", "passives", "seed"]);
const TARGET_FIELDS = Object.freeze(["type", "eliteAffix", "behavior"]);
const WEAPON_FIELDS = Object.freeze(["id", "level", "evolved"]);
const PASSIVE_FIELDS = Object.freeze(["id", "rank"]);
const SEED = /^[0-9a-f]{32}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) { return structuredClone(value); }

function exactKeys(value, expected, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${path} contains unsupported fields`);
}

function codePointCompare(left, right) { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }

function pairedPassive(specialist, weaponId) {
  return weaponId === "signature" ? SPECIALISTS[specialist].signature.passive : WEAPONS[weaponId]?.passive;
}

export function defaultPracticeLaboratoryConfig() {
  return deepFreeze({
    schema: PRACTICE_LABORATORY_SCHEMA,
    specialist: "zuri",
    masteryStart: "baseline",
    map: "warehouse",
    difficulty: "story",
    measurementSeconds: 10,
    playerInvulnerable: true,
    target: { type: "mite", eliteAffix: "none", behavior: "stationary" },
    weapons: [{ id: "signature", level: 1, evolved: false }],
    passives: [],
    seed: PRACTICE_LABORATORY_SEED,
  });
}

export function validatePracticeLaboratoryConfig(value) {
  exactKeys(value, CONFIG_FIELDS, "practice laboratory config");
  if (value.schema !== PRACTICE_LABORATORY_SCHEMA || !SPECIALISTS[value.specialist] || !["baseline", "field-kit"].includes(value.masteryStart) || !MAPS[value.map] || !DIFFICULTIES[value.difficulty] || !PRACTICE_MEASUREMENT_WINDOWS.includes(value.measurementSeconds) || typeof value.playerInvulnerable !== "boolean" || !SEED.test(value.seed)) throw new TypeError("Practice laboratory metadata is invalid");
  exactKeys(value.target, TARGET_FIELDS, "practice laboratory target");
  if (![...ENEMY_ARCHETYPE_IDS, "apex"].includes(value.target.type) || !["none", ...ELITE_AFFIX_IDS].includes(value.target.eliteAffix) || !["stationary", "active"].includes(value.target.behavior)) throw new TypeError("Practice laboratory target is invalid");
  if (value.target.type === "apex" && value.target.eliteAffix !== "none") throw new TypeError("Apex practice targets cannot use elite affixes");
  if (value.target.eliteAffix !== "none" && !eliteAffixEligibility({ spawnContext: "practice-laboratory", typeId: value.target.type, elite: true, miniboss: value.target.type === "shark", boss: false, eventType: null }, value.target.eliteAffix).eligible) throw new TypeError("Practice laboratory elite affix is incompatible");
  if (!Array.isArray(value.weapons) || value.weapons.length < 1 || value.weapons.length > PRACTICE_MAX_WEAPONS) throw new TypeError("Practice laboratory weapons are invalid");
  let previous = "";
  for (const [index, weapon] of value.weapons.entries()) {
    exactKeys(weapon, WEAPON_FIELDS, `practice laboratory weapons.${index}`);
    if ((weapon.id !== "signature" && !WEAPONS[weapon.id]) || (index === 0 ? weapon.id !== "signature" : weapon.id === "signature" || weapon.id <= previous) || !Number.isSafeInteger(weapon.level) || weapon.level < 1 || weapon.level > BALANCE_CONFIG.core.maxWeaponLevel || typeof weapon.evolved !== "boolean") throw new TypeError("Practice laboratory weapon loadout is noncanonical");
    previous = index === 0 ? "" : weapon.id;
  }
  if (!Array.isArray(value.passives) || value.passives.length > PRACTICE_MAX_PASSIVES) throw new TypeError("Practice laboratory passives are invalid");
  previous = "";
  for (const [index, passive] of value.passives.entries()) {
    exactKeys(passive, PASSIVE_FIELDS, `practice laboratory passives.${index}`);
    if (!PASSIVES[passive.id] || passive.id <= previous || !Number.isSafeInteger(passive.rank) || passive.rank < 1 || passive.rank > PASSIVES[passive.id].max) throw new TypeError("Practice laboratory passive loadout is noncanonical");
    previous = passive.id;
  }
  const ranks = new Map(value.passives.map(({ id, rank }) => [id, rank]));
  if (value.masteryStart === "field-kit" && !ranks.has(SPECIALISTS[value.specialist].signature.passive)) throw new TypeError("Field Kit practice requires its paired passive");
  for (const weapon of value.weapons) if (weapon.evolved && (weapon.level !== BALANCE_CONFIG.core.maxWeaponLevel || !ranks.has(pairedPassive(value.specialist, weapon.id)))) throw new TypeError("Evolved practice weapons require level five and their paired passive");
  return value;
}

export function normalizePracticeLaboratoryConfig(value = {}) {
  const defaults = defaultPracticeLaboratoryConfig(), source = { ...defaults, ...clone(value) };
  const weapons = Array.isArray(source.weapons) ? source.weapons.map((weapon) => ({ id: String(weapon.id), level: Number(weapon.level), evolved: Boolean(weapon.evolved) })).sort(codePointCompare) : clone(defaults.weapons);
  const signature = weapons.findIndex(({ id }) => id === "signature");
  if (signature > 0) weapons.unshift(...weapons.splice(signature, 1));
  const passives = Array.isArray(source.passives) ? source.passives.map((passive) => ({ id: String(passive.id), rank: Number(passive.rank) })).sort(codePointCompare) : [];
  const normalized = { ...source, target: { ...defaults.target, ...(source.target || {}) }, weapons, passives };
  return deepFreeze(validatePracticeLaboratoryConfig(normalized));
}

function applyLoadout(simulation, config) {
  const player = simulation.players[0];
  for (const passive of config.passives) {
    const current = Math.floor(Number(player.passives[passive.id] || 0));
    for (let rank = current; rank < passive.rank; rank++) applyPlayerUpgrade(player, { id: `passive:${passive.id}` });
  }
  for (const weapon of config.weapons) {
    const current = player.weapons[weapon.id]?.level || 0;
    for (let level = current; level < weapon.level; level++) applyPlayerUpgrade(player, { id: `weapon:${weapon.id}` });
  }
  for (const weapon of config.weapons) if (weapon.evolved) player.weapons[weapon.id].evolved = true;
  return player;
}

function spawnTarget(simulation, config, player) {
  let target;
  if (config.target.type === "apex") {
    simulation.spawnBoss();
    target = simulation.enemies.find(({ boss }) => boss);
  } else {
    const elite = config.target.eliteAffix !== "none";
    target = simulation.spawnEnemy(config.target.type, {
      x: player.x + 120, y: player.y, elite, spawnContext: elite ? "practice-laboratory" : "practice-target",
      ...(elite ? { practiceAffixId: config.target.eliteAffix } : {}),
    });
  }
  target.x = player.x + 120; target.y = player.y; target.hp = 1_000_000_000; target.maxHp = 1_000_000_000; target.xp = 0;
  if (config.target.behavior === "stationary") { target.speed = 0; target.stun = config.measurementSeconds + 2; }
  if (config.playerInvulnerable) target.damage = 0;
  return target;
}

export function createPracticeLaboratory(value, { features = gameplayFeatureContract() } = {}) {
  const config = normalizePracticeLaboratoryConfig(value);
  const simulation = new Simulation({
    map: config.map, difficulty: config.difficulty, duration: 3_600, features,
    players: [{ id: "practice-player", name: "Practice", specialist: config.specialist, masteryStart: config.masteryStart, replaySlot: 0 }],
  }, { seed: config.seed, features });
  simulation.enemies = []; simulation.spawnClock = -1_000_000; simulation.nextElite = 1_000_000; simulation.nextMiniBoss = 1_000_000; simulation.nextTreasure = 1_000_000; simulation.nextRelayBall = 1_000_000;
  simulation.objectiveEvents = false; simulation.level = 9;
  const player = applyLoadout(simulation, config), target = spawnTarget(simulation, config, player);
  simulation.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: true });
  return { config, simulation, player, target };
}

function numericDamage(value) { const match = /^(\d+(?:\.\d+)?) \/ hit$/.exec(String(value)); return match ? Number(match[1]) : 0; }

export function measurePracticeLaboratory(value, options = {}) {
  const laboratory = createPracticeLaboratory(value, options), { config, simulation, player, target } = laboratory;
  const ticks = config.measurementSeconds * 60;
  for (let tick = 0; tick < ticks; tick++) simulation.update(1 / 60);
  const sources = Object.entries(player.damageBySource || {}).filter(([, damage]) => Number(damage) > 0).map(([id, damage]) => ({ id, damage: Math.round(damage * 10) / 10, dps: Math.round(damage / config.measurementSeconds * 10) / 10 })).sort((left, right) => right.damage - left.damage || left.id.localeCompare(right.id));
  const totalDamage = Math.round(sources.reduce((sum, source) => sum + source.damage, 0) * 10) / 10;
  const weapons = config.weapons.map((weapon) => {
    const telemetry = weaponTelemetry(weapon.id, player.weapons[weapon.id], player);
    return { id: weapon.id, level: weapon.level, evolved: weapon.evolved, damage: telemetry.damage, damagePerHit: numericDamage(telemetry.damage), interval: telemetry.interval, cooldownSeconds: telemetry.cooldownSeconds, projectiles: telemetry.projectiles, note: telemetry.note };
  });
  return deepFreeze({
    schema: PRACTICE_LABORATORY_SCHEMA, config, ticks, totalDamage, dps: Math.round(totalDamage / config.measurementSeconds * 10) / 10,
    sources, stats: playerBuildStats(player), weapons,
    target: { type: config.target.type, eliteAffix: config.target.eliteAffix, behavior: config.target.behavior, remainingHealth: Math.round(target.hp * 10) / 10 },
  });
}
