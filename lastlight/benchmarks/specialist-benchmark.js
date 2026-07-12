import { BALANCE_HASH, BALANCE_VERSION, getBalanceConfig } from "../balance-config.js";
import { SPECIALIST_ORDER, SPECIALISTS } from "../data.js";
import { SIMULATION_TICK_RATE, Simulation, applyPlayerUpgrade } from "../engine.js";
import { hashCanonicalState } from "../replay.js";
import { deterministicWorkUnits } from "../fixtures/fixture-runner.js";

export const SPECIALIST_BENCHMARK_SCHEMA = "lastlight.specialist-benchmark.v1";
export const SPECIALIST_BENCHMARK_VERSION = 1;
export const SPECIALIST_BENCHMARK_STEP = 1 / SIMULATION_TICK_RATE;

export const SPECIALIST_BENCHMARK_BUDGETS = Object.freeze({
  maxCases: 100,
  maxTicksPerCase: 7_200,
  maxTotalTicks: 260_000,
  maxEntitiesPerCase: 600,
  maxSnapshotBytes: 500_000,
  maxWorkUnitsPerTick: 500_000,
  maxSuiteRuntimeMs: 30_000,
});

export const SPECIALIST_BENCHMARK_SCENARIOS = Object.freeze([
  Object.freeze({ id: "level-1", label: "Level 1 single target", stage: "level1", level: 1, teamSize: 1, durationSeconds: 30, primaryMetrics: ["singleTargetDps", "ttkSeconds", "effectiveVitality"] }),
  Object.freeze({ id: "e-unlock", label: "First ability unlock", stage: "e", level: 3, teamSize: 1, durationSeconds: 20, primaryMetrics: ["areaDps", "shieldGranted", "controlEnemySeconds"] }),
  Object.freeze({ id: "r-unlock", label: "Ultimate unlock", stage: "r", level: 6, teamSize: 1, durationSeconds: 20, primaryMetrics: ["areaDps", "abilityDamage", "abilityUptimeSeconds"] }),
  Object.freeze({ id: "mature-loadout", label: "Mature signature and loadout", stage: "mature", level: 20, teamSize: 1, durationSeconds: 30, primaryMetrics: ["areaDps", "signatureDamage", "peakEffectiveVitality"] }),
  Object.freeze({ id: "mobility-escape", label: "Travel and escape", stage: "mobility", level: 6, teamSize: 1, durationSeconds: 8, primaryMetrics: ["travelDistance", "escapeTimeSeconds"] }),
  Object.freeze({ id: "pickup-objective", label: "Pickup and objective value", stage: "utility", level: 20, teamSize: 1, durationSeconds: 6, primaryMetrics: ["pickupReach", "xpPickedUp", "objectiveProgress"] }),
  Object.freeze({ id: "solo-pressure", label: "Solo pressure", stage: "pressure", level: 20, teamSize: 1, durationSeconds: 45, primaryMetrics: ["survivalSeconds", "damageTaken", "combatUptime"] }),
  Object.freeze({ id: "elite-duel", label: "Elite duel", stage: "elite", level: 20, teamSize: 1, durationSeconds: 60, primaryMetrics: ["ttkSeconds", "damagePerSecond", "survivalSeconds"] }),
  Object.freeze({ id: "apex-duel", label: "Apex duel", stage: "apex", level: 20, teamSize: 1, durationSeconds: 90, primaryMetrics: ["ttkSeconds", "damagePerSecond", "damageTaken"] }),
  Object.freeze({ id: "four-player", label: "Four-player contribution", stage: "squad", level: 20, teamSize: 4, durationSeconds: 45, primaryMetrics: ["teamDamageShare", "shieldGranted", "repairAllies"] }),
]);

const METRIC_KEYS = Object.freeze([
  "damageTotal", "signatureDamage", "abilityDamage", "damagePerSecond", "singleTargetDps", "areaDps", "ttkSeconds", "kills", "teamDamageShare",
  "effectiveVitality", "peakEffectiveVitality", "damageTaken", "hpRemaining", "survivalSeconds", "downed",
  "travelDistance", "escapeTimeSeconds", "combatUptime", "abilityUptimeSeconds", "controlEnemySeconds",
  "shieldGranted", "shieldAllies", "repairSelf", "repairAllies", "invulnerabilityAllySeconds",
  "xpPickedUp", "pickupReach", "objectiveParticipationSeconds", "objectiveProgress",
]);

const SUMMARY_KEYS = Object.freeze([
  "level1Dps", "matureAreaDps", "effectiveVitality", "escapeTimeSeconds", "soloSurvivalSeconds", "soloDamageTaken",
  "eliteTtkSeconds", "apexTtkSeconds", "squadDamageShare", "squadSupport", "pickupReach", "objectiveProgress",
]);

const RANKING_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "level1Dps", label: "Level 1 single-target DPS", direction: "desc" }),
  Object.freeze({ id: "matureAreaDps", label: "Mature area DPS", direction: "desc" }),
  Object.freeze({ id: "effectiveVitality", label: "Base effective vitality", direction: "desc" }),
  Object.freeze({ id: "escapeTimeSeconds", label: "Escape time", direction: "asc" }),
  Object.freeze({ id: "soloSurvivalSeconds", label: "Solo pressure survival", direction: "desc" }),
  Object.freeze({ id: "eliteTtkSeconds", label: "Elite time-to-kill", direction: "asc" }),
  Object.freeze({ id: "apexTtkSeconds", label: "Apex time-to-kill", direction: "asc" }),
  Object.freeze({ id: "squadDamageShare", label: "Four-player damage share", direction: "desc" }),
  Object.freeze({ id: "squadSupport", label: "Four-player support score", direction: "desc" }),
  Object.freeze({ id: "pickupReach", label: "Measured pickup reach", direction: "desc" }),
]);

const LIMITATIONS = Object.freeze([
  "Fixed seeds and scripted inputs are deterministic comparisons, not confidence intervals or substitutes for human playtests.",
  "Stationary single-target and radial pack geometry deliberately isolate mechanics and can favor piercing, radial, or close-range damage shapes differently.",
  "Four-player contribution holds three allies to standardized mature loadouts and lets only the candidate cast abilities, improving attribution at the cost of realistic coordination.",
  "Shield and invulnerability contribution use immediate cast deltas; repair uses net positive health movement and can undercount healing that lands on the same tick as damage.",
  "Objective participation is intentionally identical when no specialist mechanic modifies capture rate; it documents the current lack of objective-specific differentiation.",
  "The report is diagnostic only. It does not approve balance changes or replace the immutable balance-version and fixture-migration process.",
]);

const round = (value, places = 3) => value == null || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 10 ** places) / 10 ** places;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

function seedFor(specialist, scenario) {
  const text = `lastlight:${BALANCE_VERSION}:${specialist}:${scenario}`;
  const chunk = (salt) => {
    let hash = 2166136261;
    for (const character of `${text}:${salt}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  return `${chunk(0)}${chunk(1)}${chunk(2)}${chunk(3)}`;
}

function createSimulation(specialists, seed, difficulty = "story") {
  const players = specialists.map((specialist, index) => ({ id: index ? `ally-${index}` : "candidate", name: index ? `Ally ${index}` : "Candidate", specialist, replaySlot: index }));
  const sim = new Simulation({ map: "warehouse", difficulty, duration: 3_600, players }, { seed });
  sim.pods = []; sim.events = []; sim.spawnClock = -1_000_000; sim.nextElite = Infinity; sim.nextMiniBoss = Infinity; sim.nextTreasure = Infinity; sim.nextRelayBall = Infinity; sim.objectiveEvents = false; sim.machine.cooldown = 1_000_000;
  for (const player of sim.players) { player.invuln = 0; player.hitGrace = 0; player.x = 0; player.y = 0; }
  return sim;
}

function applyUpgradeTo(player, id, target) {
  const current = () => id.startsWith("weapon:") ? Number(player.weapons[id.slice(7)]?.level || 0) : Number(player.passives[id.slice(8)] || 0);
  while (current() < target) applyPlayerUpgrade(player, { id });
}

function maturePlayer(player) {
  applyUpgradeTo(player, "weapon:signature", 5);
  for (const weapon of ["uwu", "slicers", "aura", "rail"]) applyUpgradeTo(player, `weapon:${weapon}`, 3);
  for (const [passive, level] of Object.entries({ damage: 3, haste: 3, area: 3, maxHealth: 2, armor: 2 })) applyUpgradeTo(player, `passive:${passive}`, level);
  applyUpgradeTo(player, `passive:${SPECIALISTS[player.specialist].signature.passive}`, 5);
}

function matureSimulation(sim) {
  for (const player of sim.players) maturePlayer(player);
  sim.useAccessCard();
  for (const player of sim.players) {
    if (!player.weapons.signature.evolved) throw new Error(`${player.specialist}: mature signature failed to evolve`);
    player.weaponTimers = {}; player.hp = player.maxHp; player.shield = 0; player.invuln = 0;
  }
}

function placeEnemy(sim, type, { x, y, elite = false, stationary = false, harmless = false } = {}) {
  const enemy = sim.spawnEnemy(type, { elite });
  enemy.x = x; enemy.y = y; enemy.xp = 0; enemy.spawnLife = 0;
  if (stationary) enemy.speed = 0;
  if (harmless) enemy.damage = 0;
  enemy.attackCd = 1; enemy.shotCd = 1;
  return enemy;
}

function placePack(sim, count, { radius = 125, type = "brute", elite = false, stationary = true, harmless = true, durable = false } = {}) {
  const enemies = [];
  for (let index = 0; index < count; index++) {
    const ring = Math.floor(index / 8), angle = index % 8 / Math.min(8, count) * Math.PI * 2, distance = radius + ring * 90;
    const enemy = placeEnemy(sim, type, { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, elite, stationary, harmless });
    if (durable) enemy.hp = enemy.maxHp = 1_000_000;
    enemies.push(enemy);
  }
  return enemies;
}

function entityCount(sim) {
  return ["players", "drones", "enemies", "projectiles", "hostile", "effects", "orbs", "drops", "pods", "objectives", "relayBalls", "feathers", "tasks"].reduce((sum, key) => sum + (sim[key]?.length || 0), 0);
}

function activeAbilityState(sim, player) {
  return player.frenzy > 0 || player.hasteBuff > 0 || player.speedBuff > 0 || player.invuln > 0
    || sim.effects.some((effect) => effect.owner === player.id && String(effect.sourceId || "").startsWith("ability:"));
}

function castTracked(sim, player, slot, tracking) {
  const before = new Map(sim.players.map((entry) => [entry.id, { shield: entry.shield, invuln: entry.invuln }]));
  if (!sim.cast(player.id, slot)) return false;
  tracking.casts[slot]++;
  for (const ally of sim.players) {
    const prior = before.get(ally.id);
    const shield = Math.max(0, ally.shield - prior.shield), invulnerability = Math.max(0, ally.invuln - prior.invuln);
    tracking.shieldGranted += shield;
    if (ally.id !== player.id) { tracking.shieldAllies += shield; tracking.invulnerabilityAllySeconds += invulnerability; }
  }
  return true;
}

function runSimulation({ sim, candidate, durationSeconds, controller = () => {}, target = null, targetCount = 1, escapeOrigin = null, escapeDistance = null, pickupSamples = [], objective = null, stop = () => false }) {
  const ticks = Math.round(durationSeconds * SIMULATION_TICK_RATE), tracking = {
    casts: { e: 0, r: 0 }, shieldGranted: 0, shieldAllies: 0, invulnerabilityAllySeconds: 0,
    repairSelf: 0, repairAllies: 0, controlEnemySeconds: 0, activeTicks: 0, abilityTicks: 0,
    objectiveParticipationSeconds: 0, escapeTimeSeconds: null, survivalSeconds: durationSeconds,
    peakShield: candidate.shield, peakEntities: entityCount(sim), maxWorkUnits: deterministicWorkUnits(sim), maxSnapshotBytes: 0,
  };
  const initialTeamDamage = sim.players.reduce((sum, player) => sum + player.damage, 0), initialDamage = candidate.damage;
  let completedTicks = 0, ttkSeconds = null;
  for (let tick = 0; tick < ticks; tick++) {
    if (sim.stage === "won" || sim.stage === "lost" || stop(sim, tracking)) break;
    const time = tick * SPECIALIST_BENCHMARK_STEP;
    controller({ sim, candidate, tick, time, tracking, cast: (slot) => castTracked(sim, candidate, slot, tracking) });
    const hpBefore = new Map(sim.players.map((player) => [player.id, player.hp])), damageBefore = candidate.damage;
    sim.update(SPECIALIST_BENCHMARK_STEP); completedTicks++;
    for (const player of sim.players) {
      const repair = Math.max(0, player.hp - (hpBefore.get(player.id) ?? player.hp));
      if (player.id === candidate.id) tracking.repairSelf += repair;
      else if (candidate.specialist === "bront" && sim.effects.some((effect) => effect.kind === "totem" && effect.owner === candidate.id && Math.hypot(player.x - effect.x, player.y - effect.y) < 260)) tracking.repairAllies += repair;
    }
    tracking.peakShield = Math.max(tracking.peakShield, candidate.shield);
    if (candidate.damage > damageBefore || sim.projectiles.some((projectile) => projectile.owner === candidate.id) || sim.effects.some((effect) => effect.owner === candidate.id && effect.damage)) tracking.activeTicks++;
    if (activeAbilityState(sim, candidate)) tracking.abilityTicks++;
    tracking.controlEnemySeconds += sim.enemies.filter((enemy) => enemy.stun > 0 && !enemy.dead).length * SPECIALIST_BENCHMARK_STEP;
    if (objective && !objective.done && Math.hypot(candidate.x - objective.x, candidate.y - objective.y) < objective.radius) tracking.objectiveParticipationSeconds += SPECIALIST_BENCHMARK_STEP;
    if (tracking.escapeTimeSeconds == null && escapeOrigin && escapeDistance != null && Math.hypot(candidate.x - escapeOrigin.x, candidate.y - escapeOrigin.y) >= escapeDistance) tracking.escapeTimeSeconds = (tick + 1) * SPECIALIST_BENCHMARK_STEP;
    if ((candidate.dead || candidate.downed) && tracking.survivalSeconds === durationSeconds) tracking.survivalSeconds = (tick + 1) * SPECIALIST_BENCHMARK_STEP;
    if (target && target.dead && ttkSeconds == null) ttkSeconds = (tick + 1) * SPECIALIST_BENCHMARK_STEP;
    tracking.peakEntities = Math.max(tracking.peakEntities, entityCount(sim)); tracking.maxWorkUnits = Math.max(tracking.maxWorkUnits, deterministicWorkUnits(sim));
    if (tick % SIMULATION_TICK_RATE === 0 || tick === ticks - 1) tracking.maxSnapshotBytes = Math.max(tracking.maxSnapshotBytes, new TextEncoder().encode(JSON.stringify(sim.snapshot())).byteLength);
  }
  const elapsedSeconds = Math.max(SPECIALIST_BENCHMARK_STEP, completedTicks * SPECIALIST_BENCHMARK_STEP), damage = candidate.damage - initialDamage;
  const teamDamage = sim.players.reduce((sum, player) => sum + player.damage, 0) - initialTeamDamage;
  const armorMultiplier = (100 + Math.max(0, candidate.armor)) / 100;
  const collected = pickupSamples.filter((sample) => sample.orb.dead);
  const metrics = {
    damageTotal: round(damage), signatureDamage: round(candidate.damageBySource.signature || 0),
    abilityDamage: round(Object.entries(candidate.damageBySource).filter(([source]) => source.startsWith("ability:")).reduce((sum, [, value]) => sum + value, 0)),
    damagePerSecond: round(damage / elapsedSeconds), singleTargetDps: targetCount === 1 ? round(damage / elapsedSeconds) : null,
    areaDps: targetCount > 1 ? round(damage / elapsedSeconds) : null, ttkSeconds: round(ttkSeconds), kills: candidate.kills,
    teamDamageShare: sim.players.length > 1 && teamDamage > 0 ? round(damage / teamDamage) : null,
    effectiveVitality: round(candidate.maxHp * armorMultiplier), peakEffectiveVitality: round((candidate.maxHp + tracking.peakShield) * armorMultiplier),
    damageTaken: round(candidate.damageTaken), hpRemaining: round(candidate.hp), survivalSeconds: round(tracking.survivalSeconds), downed: Boolean(candidate.dead || candidate.downed),
    travelDistance: round(candidate.traveled), escapeTimeSeconds: round(tracking.escapeTimeSeconds), combatUptime: round(tracking.activeTicks / Math.max(1, completedTicks)), abilityUptimeSeconds: round(tracking.abilityTicks * SPECIALIST_BENCHMARK_STEP), controlEnemySeconds: round(tracking.controlEnemySeconds),
    shieldGranted: round(tracking.shieldGranted), shieldAllies: round(tracking.shieldAllies), repairSelf: round(tracking.repairSelf), repairAllies: round(tracking.repairAllies), invulnerabilityAllySeconds: round(tracking.invulnerabilityAllySeconds),
    xpPickedUp: round(candidate.xpCollected), pickupReach: collected.length ? Math.max(...collected.map((sample) => sample.radius)) : 0,
    objectiveParticipationSeconds: round(tracking.objectiveParticipationSeconds), objectiveProgress: round(Math.min(1, objective?.progress || 0)),
  };
  return {
    elapsedSeconds: round(elapsedSeconds), ticks: completedTicks, metrics,
    structure: { peakEntities: tracking.peakEntities, maxWorkUnitsPerTick: tracking.maxWorkUnits, maxSnapshotBytes: tracking.maxSnapshotBytes },
    finalHash: hashCanonicalState(JSON.parse(JSON.stringify(sim.snapshot()))),
  };
}

function aimAndCastController({ move = false, useE = true, useR = true, candidateCasts = true } = {}) {
  return ({ sim, candidate, time, cast }) => {
    const movementAngle = time * .48 + Math.PI / 2;
    sim.setInput(candidate.id, { x: move ? Math.cos(movementAngle) : 0, y: move ? Math.sin(movementAngle) : 0, aim: movementAngle, autoAim: true });
    if (candidateCasts && useR && candidate.rCd <= 0) cast("r");
    if (candidateCasts && useE && candidate.eCd <= 0) cast("e");
  };
}

function benchmarkCase(specialist, definition) {
  const seed = seedFor(specialist, definition.id);
  let sim, candidate, target = null, targetCount = 1, controller = aimAndCastController({ useE: false, useR: false }), stop = () => false;
  let escapeOrigin = null, escapeDistance = null, pickupSamples = [], objective = null;
  if (definition.stage === "squad") {
    sim = createSimulation([specialist, "zuri", "sola", "bront"], seed, "hard"); matureSimulation(sim); sim.level = definition.level; candidate = sim.players[0];
    sim.players.forEach((player, index) => { player.x = Math.cos(index * Math.PI / 2) * 70; player.y = Math.sin(index * Math.PI / 2) * 70; player.hp *= .7; sim.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: true }); });
    sim.spawnBoss(); target = sim.enemies.find((enemy) => enemy.boss); targetCount = 1; controller = aimAndCastController({ move: true }); stop = () => target.dead;
  } else {
    const difficulty = ["pressure", "elite", "apex"].includes(definition.stage) ? (definition.stage === "pressure" ? "hard" : "story") : "story";
    sim = createSimulation([specialist], seed, difficulty); candidate = sim.players[0]; sim.level = definition.level;
    if (["mature", "mobility", "utility", "pressure", "elite", "apex"].includes(definition.stage)) matureSimulation(sim);
    if (definition.stage === "level1") {
      target = placeEnemy(sim, "brute", { x: 115, y: 0, stationary: true, harmless: true }); stop = () => target.dead;
    } else if (definition.stage === "e" || definition.stage === "r") {
      const pack = placePack(sim, 10, { radius: 115, durable: true }); target = pack[0]; targetCount = pack.length; controller = aimAndCastController({ useE: true, useR: definition.stage === "r" });
    } else if (definition.stage === "mature") {
      const pack = placePack(sim, 14, { radius: 120, durable: true }); target = pack[0]; targetCount = pack.length; controller = aimAndCastController();
    } else if (definition.stage === "mobility") {
      candidate.x = 0; candidate.y = 80; escapeOrigin = { x: 0, y: 0 }; escapeDistance = 650;
      placeEnemy(sim, "brute", { x: 0, y: 0, stationary: true, harmless: true });
      controller = ({ sim: active, candidate: player, tick, cast }) => { active.setInput(player.id, { x: 0, y: 1, aim: Math.PI / 2, autoAim: false }); if (tick === 0) { cast("r"); cast("e"); } };
    } else if (definition.stage === "utility") {
      const radii = [80, 120, 160, 200, 240, 280, 320, 360, 400];
      pickupSamples = radii.map((radius, index) => { const orb = { id: `benchmark-orb-${index}`, x: radius, y: 0, radius: 5, value: 1, color: "#63f2df", dead: false }; sim.orbs.push(orb); return { radius, orb }; });
      objective = { id: "benchmark-objective", x: 0, y: 0, radius: 85, progress: 0, life: 20, kind: "uplink" }; sim.objectives.push(objective);
      controller = ({ sim: active, candidate: player }) => active.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: false });
    } else if (definition.stage === "pressure") {
      placePack(sim, 12, { radius: 95, type: "hound", stationary: false, harmless: false, durable: true });
      placePack(sim, 8, { radius: 360, type: "spitter", stationary: false, harmless: false, durable: true });
      placePack(sim, 4, { radius: 165, type: "brute", stationary: false, harmless: false, durable: true });
      candidate.hp *= .8; controller = aimAndCastController({ move: true });
    } else if (definition.stage === "elite") {
      target = placeEnemy(sim, "brute", { x: 190, y: 0, elite: true }); controller = aimAndCastController({ move: true }); stop = () => target.dead;
    } else if (definition.stage === "apex") {
      sim.spawnBoss(); target = sim.enemies.find((enemy) => enemy.boss); controller = aimAndCastController({ move: true }); stop = () => target.dead;
    }
  }
  const result = runSimulation({ sim, candidate, durationSeconds: definition.durationSeconds, controller, target, targetCount, escapeOrigin, escapeDistance, pickupSamples, objective, stop });
  return {
    id: definition.id, seed, level: definition.level, teamSize: definition.teamSize, elapsedSeconds: result.elapsedSeconds, ticks: result.ticks,
    metrics: result.metrics, structure: result.structure, finalHash: result.finalHash,
  };
}

function specialistSummary(scenarios) {
  const byId = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.metrics]));
  return {
    level1Dps: byId["level-1"].singleTargetDps,
    matureAreaDps: byId["mature-loadout"].areaDps,
    effectiveVitality: byId["level-1"].effectiveVitality,
    escapeTimeSeconds: byId["mobility-escape"].escapeTimeSeconds,
    soloSurvivalSeconds: byId["solo-pressure"].survivalSeconds,
    soloDamageTaken: byId["solo-pressure"].damageTaken,
    eliteTtkSeconds: byId["elite-duel"].ttkSeconds,
    apexTtkSeconds: byId["apex-duel"].ttkSeconds,
    squadDamageShare: byId["four-player"].teamDamageShare,
    squadSupport: round(byId["four-player"].shieldAllies + byId["four-player"].repairAllies + byId["four-player"].invulnerabilityAllySeconds),
    pickupReach: byId["pickup-objective"].pickupReach,
    objectiveProgress: byId["pickup-objective"].objectiveProgress,
  };
}

function rankingDocument(specialists) {
  return RANKING_DEFINITIONS.map((definition) => ({
    ...definition,
    entries: specialists.map((specialist) => ({ specialist: specialist.id, value: specialist.summary[definition.id] }))
      .sort((left, right) => {
        if (left.value == null && right.value == null) return left.specialist.localeCompare(right.specialist);
        if (left.value == null) return 1; if (right.value == null) return -1;
        return (definition.direction === "asc" ? left.value - right.value : right.value - left.value) || left.specialist.localeCompare(right.specialist);
      }),
  }));
}

function outlierDocument(specialists) {
  const outliers = [];
  for (const definition of RANKING_DEFINITIONS) {
    const values = specialists.map((specialist) => specialist.summary[definition.id]).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (values.length < 5) continue;
    const median = values[Math.floor(values.length / 2)];
    for (const specialist of specialists) {
      const value = specialist.summary[definition.id];
      if (!Number.isFinite(value) || !median) continue;
      const ratio = value / median;
      if (ratio >= 1.35 || ratio <= .65) outliers.push({ metric: definition.id, specialist: specialist.id, direction: ratio >= 1.35 ? "high" : "low", value, ratioToMedian: round(ratio) });
    }
  }
  return outliers.sort((a, b) => a.metric.localeCompare(b.metric) || a.specialist.localeCompare(b.specialist));
}

function matureLoadoutFor(specialist) {
  const sim = createSimulation([specialist], seedFor(specialist, "loadout")); matureSimulation(sim); const player = sim.players[0];
  return {
    weapons: Object.fromEntries(Object.entries(player.weapons).map(([id, weapon]) => [id, { level: weapon.level, evolved: weapon.evolved }])),
    passives: Object.fromEntries(Object.entries(player.passives).map(([id, level]) => [id, round(level)])),
  };
}

export function runSpecialistBenchmarks() {
  getBalanceConfig();
  const specialists = SPECIALIST_ORDER.map((id) => {
    const scenarios = SPECIALIST_BENCHMARK_SCENARIOS.map((definition) => benchmarkCase(id, definition));
    return { id, name: SPECIALISTS[id].name, matureLoadout: matureLoadoutFor(id), scenarios, summary: specialistSummary(scenarios) };
  });
  const report = {
    schema: SPECIALIST_BENCHMARK_SCHEMA, schemaVersion: SPECIALIST_BENCHMARK_VERSION,
    contract: "actual-simulation-fixed-seed-v1",
    versions: { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, simulationTickRate: SIMULATION_TICK_RATE },
    budgets: { ...SPECIALIST_BENCHMARK_BUDGETS },
    scenarioDefinitions: SPECIALIST_BENCHMARK_SCENARIOS.map((definition) => ({ ...definition })),
    specialists,
    rankings: rankingDocument(specialists),
    outliers: outlierDocument(specialists),
    limitations: [...LIMITATIONS],
  };
  const errors = validateSpecialistBenchmarkReport(report);
  if (errors.length) throw new Error(`Generated specialist benchmark report is invalid:\n- ${errors.join("\n- ")}`);
  assertSpecialistBenchmarkBudgets(report);
  return report;
}

export function validateSpecialistBenchmarkReport(report) {
  const errors = [];
  if (!exactKeys(report, ["schema", "schemaVersion", "contract", "versions", "budgets", "scenarioDefinitions", "specialists", "rankings", "outliers", "limitations"])) return ["report: root fields mismatch"];
  if (report.schema !== SPECIALIST_BENCHMARK_SCHEMA || report.schemaVersion !== SPECIALIST_BENCHMARK_VERSION) errors.push("report: unsupported schema");
  if (!exactKeys(report.versions, ["balanceVersion", "balanceHash", "simulationTickRate"]) || report.versions.balanceVersion !== BALANCE_VERSION || report.versions.balanceHash !== BALANCE_HASH || report.versions.simulationTickRate !== SIMULATION_TICK_RATE) errors.push("report.versions: runtime identity mismatch");
  if (!exactKeys(report.budgets, Object.keys(SPECIALIST_BENCHMARK_BUDGETS))) errors.push("report.budgets: fields mismatch");
  for (const [key, value] of Object.entries(SPECIALIST_BENCHMARK_BUDGETS)) if (report.budgets?.[key] !== value) errors.push(`report.budgets.${key}: mismatch`);
  if (!Array.isArray(report.scenarioDefinitions) || report.scenarioDefinitions.length !== SPECIALIST_BENCHMARK_SCENARIOS.length) errors.push("report.scenarioDefinitions: incomplete");
  else for (const definition of report.scenarioDefinitions) if (!exactKeys(definition, ["id", "label", "stage", "level", "teamSize", "durationSeconds", "primaryMetrics"])) errors.push(`scenarioDefinitions.${definition?.id}: fields mismatch`);
  if (!Array.isArray(report.specialists) || report.specialists.map(({ id }) => id).join(",") !== SPECIALIST_ORDER.join(",")) errors.push("report.specialists: must exactly cover specialist order");
  for (const specialist of report.specialists || []) {
    if (!exactKeys(specialist, ["id", "name", "matureLoadout", "scenarios", "summary"])) errors.push(`specialists.${specialist?.id}: fields mismatch`);
    if (!exactKeys(specialist.summary, SUMMARY_KEYS)) errors.push(`specialists.${specialist?.id}.summary: fields mismatch`);
    if (!Array.isArray(specialist.scenarios) || specialist.scenarios.map(({ id }) => id).join(",") !== SPECIALIST_BENCHMARK_SCENARIOS.map(({ id }) => id).join(",")) errors.push(`specialists.${specialist?.id}.scenarios: incomplete`);
    for (const scenario of specialist.scenarios || []) {
      if (!exactKeys(scenario, ["id", "seed", "level", "teamSize", "elapsedSeconds", "ticks", "metrics", "structure", "finalHash"])) errors.push(`specialists.${specialist?.id}.${scenario?.id}: fields mismatch`);
      if (!/^[0-9a-f]{32}$/.test(scenario.seed || "") || !/^[0-9a-f]{16}$/.test(scenario.finalHash || "")) errors.push(`specialists.${specialist?.id}.${scenario?.id}: invalid deterministic identity`);
      if (!exactKeys(scenario.metrics, METRIC_KEYS)) errors.push(`specialists.${specialist?.id}.${scenario?.id}.metrics: fields mismatch`);
      else for (const [key, value] of Object.entries(scenario.metrics)) if (value !== null && typeof value !== "boolean" && !Number.isFinite(value)) errors.push(`specialists.${specialist?.id}.${scenario?.id}.metrics.${key}: non-finite`);
      if (!exactKeys(scenario.structure, ["peakEntities", "maxWorkUnitsPerTick", "maxSnapshotBytes"])) errors.push(`specialists.${specialist?.id}.${scenario?.id}.structure: fields mismatch`);
    }
  }
  if (!Array.isArray(report.rankings) || report.rankings.length !== RANKING_DEFINITIONS.length) errors.push("report.rankings: incomplete");
  else for (const ranking of report.rankings) {
    if (!exactKeys(ranking, ["id", "label", "direction", "entries"]) || ranking.entries?.length !== SPECIALIST_ORDER.length) errors.push(`rankings.${ranking?.id}: invalid`);
    else if (new Set(ranking.entries.map(({ specialist }) => specialist)).size !== SPECIALIST_ORDER.length) errors.push(`rankings.${ranking.id}: duplicate specialist`);
  }
  if (!Array.isArray(report.outliers) || !Array.isArray(report.limitations) || report.limitations.length < 5) errors.push("report: outliers or limitations missing");
  return errors;
}

export function assertSpecialistBenchmarkBudgets(report) {
  const cases = report.specialists.flatMap((specialist) => specialist.scenarios), totalTicks = cases.reduce((sum, scenario) => sum + scenario.ticks, 0);
  if (cases.length > report.budgets.maxCases) throw new Error(`benchmark cases ${cases.length} exceed ${report.budgets.maxCases}`);
  if (totalTicks > report.budgets.maxTotalTicks) throw new Error(`benchmark ticks ${totalTicks} exceed ${report.budgets.maxTotalTicks}`);
  for (const specialist of report.specialists) for (const scenario of specialist.scenarios) {
    const path = `${specialist.id}.${scenario.id}`;
    if (scenario.ticks > report.budgets.maxTicksPerCase) throw new Error(`${path}: ticks exceed budget`);
    if (scenario.structure.peakEntities > report.budgets.maxEntitiesPerCase) throw new Error(`${path}: entities exceed budget`);
    if (scenario.structure.maxSnapshotBytes > report.budgets.maxSnapshotBytes) throw new Error(`${path}: snapshot bytes exceed budget`);
    if (scenario.structure.maxWorkUnitsPerTick > report.budgets.maxWorkUnitsPerTick) throw new Error(`${path}: work units exceed budget`);
  }
  return { cases: cases.length, totalTicks };
}

export function specialistBenchmarkMarkdown(report) {
  const lines = [
    "# Lastlight specialist benchmark", "",
    `Contract: \`${report.contract}\``,
    `Balance: \`${report.versions.balanceVersion}\` / \`${report.versions.balanceHash}\``,
    `Matrix: ${report.specialists.length} specialists × ${report.scenarioDefinitions.length} fixed-seed scenarios = ${report.specialists.length * report.scenarioDefinitions.length} cases`, "",
    "## Comparable summary", "",
    "| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const specialist of report.specialists) {
    const value = (key, suffix = "") => specialist.summary[key] == null ? "—" : `${specialist.summary[key]}${suffix}`;
    lines.push(`| ${specialist.name} | ${value("level1Dps")} | ${value("matureAreaDps")} | ${value("effectiveVitality")} | ${value("escapeTimeSeconds", "s")} | ${value("soloSurvivalSeconds", "s")} | ${value("eliteTtkSeconds", "s")} | ${value("apexTtkSeconds", "s")} | ${value("squadDamageShare")} | ${value("squadSupport")} | ${value("pickupReach")} |`);
  }
  lines.push("", "## Rankings", "");
  for (const ranking of report.rankings) lines.push(`- **${ranking.label}:** ${ranking.entries.map((entry, index) => `${index + 1}. ${SPECIALISTS[entry.specialist].name} (${entry.value ?? "not completed"})`).join(" · ")}`);
  lines.push("", "## Flagged outliers", "");
  if (!report.outliers.length) lines.push("No metric crossed the 0.65× / 1.35× median audit threshold.");
  else for (const outlier of report.outliers) lines.push(`- ${SPECIALISTS[outlier.specialist].name}: ${outlier.metric} is ${outlier.direction} at ${outlier.ratioToMedian}× median (${outlier.value}).`);
  lines.push("", "## Scenario matrix", "");
  for (const scenario of report.scenarioDefinitions) lines.push(`- **${scenario.label}:** level ${scenario.level}, ${scenario.teamSize} player${scenario.teamSize === 1 ? "" : "s"}, ${scenario.durationSeconds}s cap; ${scenario.primaryMetrics.join(", ")}.`);
  lines.push("", "## Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push("");
  return lines.join("\n");
}
