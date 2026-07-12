import { BALANCE_CONFIG, BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { SIMULATION_TICK_RATE } from "../engine.js";
import { deterministicWorkUnits } from "../fixtures/fixture-runner.js";
import { hashCanonicalState } from "../replay.js";
import { WEAPON_EVOLUTION_CAPABILITIES, WEAPON_EVOLUTION_CONTRACT, WEAPON_EVOLUTION_HASH } from "../weapon-evolution.js";
import {
  applySpecialistBenchmarkUpgrade,
  createSpecialistBenchmarkSimulation,
  placeSpecialistBenchmarkEnemy,
  roundSpecialistBenchmarkValue as round,
  specialistBenchmarkEntityCount,
  specialistBenchmarkSeed,
} from "./specialist-benchmark.js";

export const EVOLUTION_AUDIT_SCHEMA = "lastlight.evolution-audit.v1";
export const EVOLUTION_AUDIT_VERSION = 1;
export const EVOLUTION_AUDIT_STEP = 1 / SIMULATION_TICK_RATE;
export const EVOLUTION_CAPABILITIES = WEAPON_EVOLUTION_CAPABILITIES;
export const EVOLUTION_STATUSES = Object.freeze(["meaningful", "stat-only", "expected-no-op"]);

const EVOLUTION_CONTRACT_ENTRIES = Object.freeze([
  ...Object.values(WEAPON_EVOLUTION_CONTRACT.signatures),
  ...Object.values(WEAPON_EVOLUTION_CONTRACT.universal),
]);
const INVARIANT_METRICS = Object.freeze({
  "signature:zuri": "pierce", "signature:echo": "lifetime", "signature:sola": "guard-return", "signature:bront": "repeat",
  "signature:fang": "predator-hook", "signature:gale": "flow-regeneration", "signature:rift": "kinetic-reserve", "signature:nova": "lifetime",
  "signature:vesper": "pierce", "universal:uwu": "needle-retarget", "universal:slicers": "orbit-speed", "universal:aura": "aura-eruption",
  "universal:mines": "mine-grid-chain", "universal:crossbow": "ballista-deep-crit", "universal:boomerang": "boomerang-return",
  "universal:rail": "rail-aim-alignment", "universal:glove": "projectile-streams", "universal:transit": "transit-push",
  "universal:ice": "cadence", "universal:annihilator": "cadence", "universal:drone": "drone-protocol",
});
const STAT_ONLY_KEYS = new Set(["universal:slicers", "universal:ice", "universal:annihilator"]);

const definition = (entry) => {
  const status = entry.status === "presentation-only" ? "expected-no-op" : STAT_ONLY_KEYS.has(entry.key) ? "stat-only" : "meaningful";
  return Object.freeze({
    sourceKey: entry.key,
    scope: entry.scope,
    passiveId: entry.pairedPassive,
    capabilities: Object.freeze(entry.capabilities.map(({ id }) => id)),
    status,
    invariant: Object.freeze({ metric: INVARIANT_METRICS[entry.key], comparison: "increase", expectedFailure: status === "expected-no-op" }),
  });
};

export const EVOLUTION_CASE_DEFINITIONS = Object.freeze(EVOLUTION_CONTRACT_ENTRIES.map(definition));

export const EVOLUTION_AUDIT_BUDGETS = Object.freeze({
  maxCases: 21,
  maxTicksPerVariant: 3_600,
  maxTotalTicks: 110_000,
  maxEntitiesPerVariant: 300,
  maxSnapshotBytes: 150_000,
  maxWorkUnitsPerTick: 150_000,
  maxSuiteRuntimeMs: 30_000,
});

const COMMON_KEYS = Object.freeze(["damage", "hits", "uniqueTargets", "activations", "activationRate", "projectiles", "effects", "tasks", "maxEntities"]);
const CAPABILITY_KEYS = Object.freeze(["cadence", "pierce", "lifetime", "repeat", "flowRegeneration", "orbitSpeed", "projectileStreams", "repairRate", "pickupRange", "guardReturn", "predatorHook", "kineticReserve", "needleRetarget", "auraEruption", "mineGridChain", "ballistaDeepCrit", "boomerangReturn", "railAimAlignment", "transitPush", "droneProtocol", "impactIdentity"]);
const ROOT_KEYS = Object.freeze(["schema", "schemaVersion", "contract", "versions", "definitions", "cases", "budgets", "limitations"]);
const VERSION_KEYS = Object.freeze(["balanceVersion", "balanceHash", "evolutionContractHash", "tickRate"]);
const CASE_KEYS = Object.freeze(["sourceKey", "scope", "passiveId", "capabilities", "status", "seed", "base", "evolved", "delta", "nonCosmeticDeltaCount", "invariant"]);
const VARIANT_KEYS = Object.freeze(["variantId", "loadout", "common", "capabilityMetrics", "finalHash", "ticks", "structure"]);
const LOADOUT_KEYS = Object.freeze(["level", "pairedPassiveRank", "evolved"]);
const DELTA_KEYS = Object.freeze(["common", "capabilityMetrics"]);
const INVARIANT_KEYS = Object.freeze(["metric", "comparison", "expectedFailure", "value", "passed", "accepted", "outcome"]);
const STRUCTURE_KEYS = Object.freeze(["peakEntities", "maxWorkUnitsPerTick", "maxSnapshotBytes"]);
const NO_OPS = Object.freeze(EVOLUTION_CONTRACT_ENTRIES.filter(({ status }) => status === "presentation-only").map(({ key }) => key));

function sourceParts(sourceKey) {
  const entry = EVOLUTION_CONTRACT_ENTRIES.find(({ key }) => key === sourceKey);
  if (!entry) throw new Error(`${sourceKey}: missing authoritative evolution entry`);
  return {
    scope: entry.scope,
    id: entry.scope === "signature" ? entry.specialistId : entry.sourceId,
    specialistId: entry.specialistId || "zuri",
    sourceId: entry.sourceId,
  };
}

function snapshotHash(sim) { return hashCanonicalState(JSON.parse(JSON.stringify(sim.snapshot()))); }
function snapshotBytes(sim) { return new TextEncoder().encode(JSON.stringify(sim.snapshot())).byteLength; }

function configureVariant(def, evolved) {
  const parts = sourceParts(def.sourceKey);
  const seed = specialistBenchmarkSeed(def.sourceKey, "evolution-audit");
  const sim = createSpecialistBenchmarkSimulation([parts.specialistId], seed, "story");
  const player = sim.players[0];
  sim.level = 1; sim.obstacles = [];
  if (parts.scope === "signature") applySpecialistBenchmarkUpgrade(player, "weapon:signature", WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel);
  else applySpecialistBenchmarkUpgrade(player, `weapon:${parts.id}`, WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel);
  applySpecialistBenchmarkUpgrade(player, `passive:${def.passiveId}`, WEAPON_EVOLUTION_CONTRACT.requirement.passiveLevel);
  if (evolved) {
    sim.useAccessCard();
    const weapon = parts.scope === "signature" ? player.weapons.signature : player.weapons[parts.id];
    if (!weapon?.evolved) throw new Error(`${def.sourceKey}: legal access-card evolution failed`);
  }
  player.weaponTimers = {};
  if (parts.scope === "universal") player.weaponTimers.signature = 1_000_000;
  player.damage = 0; player.damageBySource = {}; player.invuln = 0;
  sim.events = []; sim.gold = 0;
  const positions = [[110, 0], [155, 0], [200, 0], [245, 0], [125, 65], [125, -65], [-125, 0], [0, 125], [0, -125]];
  for (const [x, y] of positions) {
    const enemy = placeSpecialistBenchmarkEnemy(sim, "brute", { x, y, stationary: true, harmless: true });
    enemy.hp = enemy.maxHp = 1_000_000;
  }
  sim.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: true });
  return { sim, player, parts, seed };
}

function instrument(sim, player, parts, expectedVariantId) {
  const trace = {
    activations: 0, projectiles: 0, effects: 0, tasks: 0, hits: 0, targets: new Set(),
    maxPierce: 0, maxLife: 0, projectilesByActivation: [], slicerAngles: [], seenEffects: new Set(), variantEmissions: 0,
  };
  let inActivation = false, activationProjectiles = 0, firstSlicer = false;
  const originalShoot = sim.shoot.bind(sim);
  sim.shoot = (...args) => {
    const projectile = originalShoot(...args);
    if (projectile?.variantId === expectedVariantId) {
      trace.projectiles++; trace.variantEmissions++; activationProjectiles += inActivation ? 1 : 0;
      trace.maxPierce = Math.max(trace.maxPierce, Number(projectile.pierce || 0));
      trace.maxLife = Math.max(trace.maxLife, Number(projectile.life || 0));
    }
    return projectile;
  };
  const originalBlast = sim.blast.bind(sim);
  sim.blast = (...args) => {
    const blastVariantId = typeof args[9] === "string" ? args[9] : args[9]?.variantId;
    if (blastVariantId === expectedVariantId) trace.variantEmissions++;
    if (blastVariantId === expectedVariantId && parts.id === "slicers" && inActivation && !firstSlicer) {
      firstSlicer = true;
      trace.slicerAngles.push({ time: sim.time, angle: Math.atan2(args[1] - player.y, args[0] - player.x) });
    }
    return originalBlast(...args);
  };
  const originalSchedule = sim.scheduleTask.bind(sim);
  sim.scheduleTask = (...args) => {
    const task = originalSchedule(...args);
    if (task?.variantId === expectedVariantId) { trace.tasks++; trace.variantEmissions++; }
    return task;
  };
  const originalDamage = sim.damageEnemy.bind(sim);
  sim.damageEnemy = (...args) => {
    const [enemy, amount, owner, critical, source] = args;
    if (source === parts.sourceId) { trace.hits++; trace.targets.add(enemy.id); }
    return originalDamage(...args);
  };
  if (parts.scope === "signature") {
    const originalFire = sim.fireSignature.bind(sim);
    sim.fireSignature = (candidate) => {
      inActivation = true; activationProjectiles = 0; firstSlicer = false;
      const fired = originalFire(candidate);
      if (fired) { trace.activations++; trace.projectilesByActivation.push(activationProjectiles); }
      inActivation = false;
      return fired;
    };
  } else {
    const originalFire = sim.fireCommonWeapon.bind(sim);
    sim.fireCommonWeapon = (candidate, weaponId, weapon) => {
      const target = weaponId === parts.id;
      if (target) { inActivation = true; activationProjectiles = 0; firstSlicer = false; }
      const result = originalFire(candidate, weaponId, weapon);
      if (target) { trace.activations++; trace.projectilesByActivation.push(activationProjectiles); inActivation = false; }
      return result;
    };
  }
  return trace;
}

function orbitSpeed(samples) {
  if (samples.length < 2) return 0;
  let travel = 0;
  for (let index = 1; index < samples.length; index++) {
    let delta = samples[index].angle - samples[index - 1].angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    travel += Math.abs(delta);
  }
  return travel / Math.max(EVOLUTION_AUDIT_STEP, samples.at(-1).time - samples[0].time);
}

function auxiliaryCapabilities(def, evolved) {
  const { sim, player, parts } = configureVariant(def, evolved);
  let cadence = 0, flowRegeneration = 0, repairRate = 0, pickupRange = 0, kineticReserve = 0;
  let needleRetarget = 0, auraEruption = 0, mineGridChain = 0, ballistaDeepCrit = 0, boomerangReturn = 0;
  let railAimAlignment = 0, transitPush = 0, droneProtocol = 0, ticks = 0;
  if (def.capabilities.includes("cadence")) {
    const timerKey = parts.scope === "signature" ? "signature" : parts.id;
    player.weaponTimers[timerKey] = 0;
    sim.update(EVOLUTION_AUDIT_STEP);
    ticks++;
    const observedCooldown = Number(player.weaponTimers[timerKey]) + EVOLUTION_AUDIT_STEP;
    cadence = observedCooldown > 0 ? 1 / observedCooldown : 0;
  }
  if (def.capabilities.includes("flow-regeneration")) {
    player.weaponTimers.signature = 1_000_000; player.flow = 0;
    for (let tick = 0; tick < SIMULATION_TICK_RATE; tick++) sim.update(EVOLUTION_AUDIT_STEP);
    ticks += SIMULATION_TICK_RATE;
    flowRegeneration = player.flow;
  }
  if (def.capabilities.includes("repair-rate")) {
    sim.enemies = []; player.weaponTimers.signature = 1_000_000; player.weaponTimers[parts.id] = 1_000_000;
    let repairs = 0;
    for (let tick = 0; tick < 36 * SIMULATION_TICK_RATE; tick++) {
      const before = sim.drones[0]?.repairClock;
      sim.update(EVOLUTION_AUDIT_STEP);
      const after = sim.drones[0]?.repairClock;
      if (Number.isFinite(before) && Number.isFinite(after) && after > before) repairs++;
    }
    ticks += 36 * SIMULATION_TICK_RATE;
    repairRate = repairs / 36;
  }
  if (def.capabilities.includes("pickup-range")) {
    sim.enemies = [];
    const drone = sim.ensureDrone(player, player.weapons[parts.id]);
    player.x = -10_000; player.y = 0; drone.x = 0; drone.y = 0;
    let lower = 0, upper = 1_000;
    for (let probe = 0; probe < 24; probe++) {
      const distance = (lower + upper) / 2;
      const orb = { id: `range-${probe}`, x: distance, y: 0, radius: 6, value: 1, color: "#fff", dead: false };
      sim.orbs = [orb];
      sim.updatePickups(EVOLUTION_AUDIT_STEP);
      if (orb.x < distance) lower = distance; else upper = distance;
    }
    pickupRange = lower;
  }
  if (def.capabilities.includes("kinetic-reserve") && evolved) {
    const scales = [];
    for (const distance of [0, BALANCE_CONFIG.identityTuning.rift.kineticReserveDistance]) {
      const probe = configureVariant(def, true);
      probe.player.kineticReserve = distance;
      probe.sim.fireSignature(probe.player);
      const event = probe.sim.events.find(({ type, mechanicId }) => type === "signature-evolution-proc" && mechanicId === "kinetic-reserve");
      scales.push(Number(event?.knockbackScale || 0));
    }
    kineticReserve = Math.max(...scales) - Math.min(...scales);
  }
  if (def.capabilities.includes("retarget")) {
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    for (let tick = 0; tick < 120; tick++) sim.updateProjectiles(EVOLUTION_AUDIT_STEP);
    ticks += 120;
    needleRetarget = sim.events.filter(({ type, mechanicId }) => type === "weapon-evolution-proc" && mechanicId === "needle-retarget").length;
  }
  if (def.capabilities.includes("occupied-charge-eruption")) {
    for (let activation = 0; activation < BALANCE_CONFIG.weapons.universal.aura.evolvedChargeThreshold; activation++) {
      sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    }
    auraEruption = sim.events.filter(({ type, mechanicId }) => type === "weapon-evolution-proc" && mechanicId === "aura-eruption").length;
  }
  if (def.capabilities.includes("mine-grid-chain")) {
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    const first = sim.effects.find(({ sourceId }) => sourceId === parts.sourceId);
    if (first) {
      first.life = 0;
      sim.updateEffects(0);
      mineGridChain = sim.events.filter(({ type, mechanicId }) => type === "weapon-evolution-proc" && mechanicId === "mine-grid-chain").length;
    }
  }
  if (def.capabilities.includes("deep-crit")) {
    sim.chance = () => false;
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    const heavy = sim.projectiles.find(({ ballistaHeavy }) => ballistaHeavy);
    for (const projectile of sim.projectiles) if (projectile !== heavy) projectile.dead = true;
    for (let tick = 0; tick < 180; tick++) sim.updateProjectiles(EVOLUTION_AUDIT_STEP);
    ticks += 180;
    ballistaDeepCrit = sim.events.filter(({ type, mechanicId }) => type === "weapon-evolution-proc" && mechanicId === "ballista-deep-crit").length;
  }
  if (def.capabilities.includes("movement-return-damage")) {
    player.weaponTimers[parts.id] = 0;
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    const projectile = sim.projectiles.find(({ sourceId }) => sourceId === parts.sourceId);
    if (projectile) {
      player.x += BALANCE_CONFIG.weapons.universal.boomerang.evolvedReturnTravelForMaxBonus;
      for (let tick = 0; tick < 60; tick++) sim.updateProjectiles(EVOLUTION_AUDIT_STEP);
      ticks += 60;
      boomerangReturn = Math.max(0, Number(projectile.boomerangReturnDamageMultiplier || 0) - 1);
    }
  }
  if (def.capabilities.includes("aim-lanes")) {
    const authoredAim = Math.PI / 2;
    player.input = { ...player.input, autoAim: false, aim: authoredAim };
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    const projectile = sim.projectiles.find(({ sourceId }) => sourceId === parts.sourceId);
    if (projectile) {
      let error = Math.abs(Math.atan2(projectile.vy, projectile.vx) - authoredAim) % (Math.PI * 2);
      if (error > Math.PI) error = Math.PI * 2 - error;
      railAimAlignment = error <= 1e-9 ? 1 : 0;
    }
  }
  if (def.capabilities.includes("cover-push")) {
    sim.fireCommonWeapon(player, parts.id, player.weapons[parts.id]);
    const train = sim.effects.find(({ sourceId }) => sourceId === parts.sourceId);
    const target = sim.enemies.find(({ dead }) => !dead);
    if (train && target) {
      train.x = target.x; train.y = target.y;
      sim.updateEffects(0);
      transitPush = Math.max(0, ...sim.events.filter(({ type, mechanicId }) => type === "weapon-evolution-proc" && mechanicId === "transit-cover-push").map(({ resolvedDistance }) => Number(resolvedDistance || 0)));
    }
  }
  if (def.capabilities.includes("data-protocol")) {
    sim.enemies = [];
    const drone = sim.ensureDrone(player, player.weapons[parts.id]);
    player.x = -10_000; player.y = 0; drone.x = 0; drone.y = 0;
    for (let mote = 0; mote < BALANCE_CONFIG.weapons.universal.drone.protocolMotes; mote++) {
      sim.orbs = [{ id: `protocol-${mote}`, x: 0, y: 0, radius: 5, value: 1, color: "#fff", dead: false }];
      sim.updatePickups(EVOLUTION_AUDIT_STEP);
      ticks++;
    }
    droneProtocol = Number(drone.protocolCharge || 0);
  }
  return { cadence: round(cadence), flowRegeneration: round(flowRegeneration), repairRate: round(repairRate), pickupRange: round(pickupRange), kineticReserve: round(kineticReserve), needleRetarget: round(needleRetarget), auraEruption: round(auraEruption), mineGridChain: round(mineGridChain), ballistaDeepCrit: round(ballistaDeepCrit), boomerangReturn: round(boomerangReturn), railAimAlignment: round(railAimAlignment), transitPush: round(transitPush), droneProtocol: round(droneProtocol), ticks };
}

function runVariant(def, evolved) {
  const { sim, player, parts, seed } = configureVariant(def, evolved);
  const expectedVariantId = `${def.sourceKey}:${evolved ? "evolved" : "base"}`;
  const trace = instrument(sim, player, parts, expectedVariantId);
  const duration = 18, ticks = duration * SIMULATION_TICK_RATE;
  let peakEntities = 0, maxWorkUnitsPerTick = 0, maxSnapshotBytes = 0;
  for (let tick = 0; tick < ticks; tick++) {
    sim.update(EVOLUTION_AUDIT_STEP);
    for (const effect of sim.effects) if (effect.variantId === expectedVariantId && !trace.seenEffects.has(effect.id)) { trace.seenEffects.add(effect.id); trace.effects++; }
    if (tick % SIMULATION_TICK_RATE === 0 || tick === ticks - 1) {
      peakEntities = Math.max(peakEntities, specialistBenchmarkEntityCount(sim));
      maxWorkUnitsPerTick = Math.max(maxWorkUnitsPerTick, deterministicWorkUnits(sim));
      maxSnapshotBytes = Math.max(maxSnapshotBytes, snapshotBytes(sim));
    }
  }
  const auxiliary = auxiliaryCapabilities(def, evolved);
  const common = {
    damage: round(player.damageBySource[parts.sourceId] || 0), hits: trace.hits, uniqueTargets: trace.targets.size,
    activations: trace.activations, activationRate: round(trace.activations / duration), projectiles: trace.projectiles,
    effects: trace.effects, tasks: trace.tasks, maxEntities: peakEntities,
  };
  const procEvents = sim.events.filter(({ type }) => type === "signature-evolution-proc" || type === "weapon-evolution-proc");
  const capabilityMetrics = {
    cadence: def.capabilities.includes("cadence") ? auxiliary.cadence : common.activationRate, pierce: trace.maxPierce, lifetime: round(trace.maxLife), repeat: trace.tasks,
    flowRegeneration: auxiliary.flowRegeneration, orbitSpeed: round(orbitSpeed(trace.slicerAngles)),
    projectileStreams: round(Math.max(0, ...trace.projectilesByActivation)), repairRate: auxiliary.repairRate, pickupRange: auxiliary.pickupRange,
    guardReturn: round(Math.max(0, ...procEvents.filter(({ mechanicId }) => mechanicId === "guard-return").map(({ shieldGranted }) => Number(shieldGranted || 0)))),
    predatorHook: round(Math.max(0, ...procEvents.filter(({ mechanicId, affected }) => mechanicId === "predator-hook" && affected > 0).map(({ pullDistance }) => Number(pullDistance || 0)))),
    kineticReserve: auxiliary.kineticReserve,
    needleRetarget: auxiliary.needleRetarget,
    auraEruption: auxiliary.auraEruption,
    mineGridChain: auxiliary.mineGridChain,
    ballistaDeepCrit: auxiliary.ballistaDeepCrit,
    boomerangReturn: auxiliary.boomerangReturn,
    railAimAlignment: auxiliary.railAimAlignment,
    transitPush: auxiliary.transitPush,
    droneProtocol: auxiliary.droneProtocol,
    impactIdentity: trace.variantEmissions + trace.effects,
  };
  return {
    variantId: expectedVariantId,
    loadout: { level: WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel, pairedPassiveRank: WEAPON_EVOLUTION_CONTRACT.requirement.passiveLevel, evolved },
    common, capabilityMetrics, finalHash: snapshotHash(sim), ticks: ticks + auxiliary.ticks,
    structure: { peakEntities, maxWorkUnitsPerTick, maxSnapshotBytes }, seed,
  };
}

function deltaRecord(base, evolved) {
  const common = Object.fromEntries(COMMON_KEYS.map((key) => [key, round(evolved.common[key] - base.common[key])]));
  const capabilityMetrics = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, round(evolved.capabilityMetrics[key] - base.capabilityMetrics[key])]));
  return { common, capabilityMetrics };
}

function metricValue(path, delta, nonCosmeticDeltaCount) {
  if (path === "nonCosmeticDeltaCount") return nonCosmeticDeltaCount;
  const key = path.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return delta.capabilityMetrics[key];
}

function benchmarkCase(def) {
  const baseResult = runVariant(def, false), evolvedResult = runVariant(def, true);
  const seed = baseResult.seed;
  delete baseResult.seed; delete evolvedResult.seed;
  const delta = deltaRecord(baseResult, evolvedResult);
  const values = [
    ...Object.entries(delta.common).filter(([key]) => !["effects", "maxEntities"].includes(key)).map(([, value]) => value),
    ...Object.entries(delta.capabilityMetrics).filter(([key]) => key !== "impactIdentity").map(([, value]) => value),
  ];
  const nonCosmeticDeltaCount = values.filter((value) => Math.abs(Number(value) || 0) > 1e-9).length;
  const value = metricValue(def.invariant.metric, delta, nonCosmeticDeltaCount);
  const passed = value > 0;
  const accepted = passed || def.invariant.expectedFailure;
  return {
    ...def, seed, base: baseResult, evolved: evolvedResult, delta, nonCosmeticDeltaCount,
    invariant: { ...def.invariant, value, passed, accepted, outcome: passed ? "pass" : def.invariant.expectedFailure ? "expected-failure" : "failure" },
  };
}

export function runEvolutionAudit() {
  return {
    schema: EVOLUTION_AUDIT_SCHEMA, schemaVersion: EVOLUTION_AUDIT_VERSION, contract: "actual-simulation-paired-evolution-v1",
    versions: { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, evolutionContractHash: WEAPON_EVOLUTION_HASH, tickRate: SIMULATION_TICK_RATE },
    definitions: EVOLUTION_CASE_DEFINITIONS, cases: EVOLUTION_CASE_DEFINITIONS.map(benchmarkCase), budgets: EVOLUTION_AUDIT_BUDGETS,
    limitations: [
      "The harness records deterministic observables and declared capabilities; it does not implement or approve evolution mechanics.",
      "Presentation-only impact identity and cosmetic entity-count differences are deliberately excluded from non-cosmetic delta counts.",
      "Expected failures preserve known gameplay-flat production evolutions as visible debt rather than weakening invariants.",
    ],
  };
}

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

export function validateEvolutionAudit(report) {
  const errors = [];
  if (!exactKeys(report, ROOT_KEYS)) errors.push("report: fields mismatch");
  if (report?.schema !== EVOLUTION_AUDIT_SCHEMA || report?.schemaVersion !== EVOLUTION_AUDIT_VERSION) errors.push("schema: unsupported evolution audit");
  if (!exactKeys(report?.versions, VERSION_KEYS)) errors.push("versions: fields mismatch");
  if (report?.versions?.balanceVersion !== BALANCE_VERSION || report?.versions?.balanceHash !== BALANCE_HASH || report?.versions?.evolutionContractHash !== WEAPON_EVOLUTION_HASH || report?.versions?.tickRate !== SIMULATION_TICK_RATE) errors.push("versions: runtime identity mismatch");
  if (JSON.stringify(report?.definitions) !== JSON.stringify(EVOLUTION_CASE_DEFINITIONS)) errors.push("definitions: authored contract drift");
  if (JSON.stringify(report?.budgets) !== JSON.stringify(EVOLUTION_AUDIT_BUDGETS)) errors.push("budgets: authored contract drift");
  if (report?.cases?.length !== EVOLUTION_CASE_DEFINITIONS.length) errors.push("cases: expected 21 legal evolutions");
  for (const [index, item] of (report?.cases || []).entries()) {
    const def = EVOLUTION_CASE_DEFINITIONS[index], path = `cases.${index}`;
    if (!exactKeys(item, CASE_KEYS)) errors.push(`${path}: fields mismatch`);
    if (item?.sourceKey !== def?.sourceKey || item?.seed !== specialistBenchmarkSeed(def?.sourceKey, "evolution-audit")) errors.push(`${path}: order or seed mismatch`);
    if (!EVOLUTION_STATUSES.includes(item?.status) || item?.capabilities?.some((id) => !EVOLUTION_CAPABILITIES.includes(id))) errors.push(`${path}: invalid declaration`);
    for (const name of ["base", "evolved"]) {
      const variant = item?.[name];
      if (!exactKeys(variant, VARIANT_KEYS)) errors.push(`${path}.${name}: fields mismatch`);
      if (variant?.variantId !== `${item.sourceKey}:${name}`) errors.push(`${path}.${name}.variantId: mismatch`);
      if (!exactKeys(variant?.loadout, LOADOUT_KEYS) || variant?.loadout?.level !== WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel || variant?.loadout?.pairedPassiveRank !== WEAPON_EVOLUTION_CONTRACT.requirement.passiveLevel || variant?.loadout?.evolved !== (name === "evolved")) errors.push(`${path}.${name}.loadout: mismatch`);
      if (!exactKeys(variant?.common, COMMON_KEYS) || !exactKeys(variant?.capabilityMetrics, CAPABILITY_KEYS) || !exactKeys(variant?.structure, STRUCTURE_KEYS)) errors.push(`${path}.${name}: metric fields mismatch`);
      if (![...Object.values(variant?.common || {}), ...Object.values(variant?.capabilityMetrics || {}), ...Object.values(variant?.structure || {})].every(Number.isFinite)) errors.push(`${path}.${name}: metrics must be finite`);
      if (!/^[0-9a-f]{16}$/.test(variant?.finalHash || "")) errors.push(`${path}.${name}.finalHash: invalid`);
    }
    if (!exactKeys(item?.delta, DELTA_KEYS) || !exactKeys(item?.delta?.common, COMMON_KEYS) || !exactKeys(item?.delta?.capabilityMetrics, CAPABILITY_KEYS)) errors.push(`${path}.delta: fields mismatch`);
    if (![...Object.values(item?.delta?.common || {}), ...Object.values(item?.delta?.capabilityMetrics || {})].every(Number.isFinite)) errors.push(`${path}.delta: metrics must be finite`);
    if (!Number.isInteger(item?.nonCosmeticDeltaCount) || item.nonCosmeticDeltaCount < 0) errors.push(`${path}.nonCosmeticDeltaCount: invalid`);
    if (!exactKeys(item?.invariant, INVARIANT_KEYS)) errors.push(`${path}.invariant: fields mismatch`);
    const shouldNoOp = NO_OPS.includes(item?.sourceKey);
    if (shouldNoOp !== (item?.status === "expected-no-op") || shouldNoOp !== Boolean(item?.invariant?.expectedFailure)) errors.push(`${path}: expected-failure classification mismatch`);
    if (!item?.invariant?.accepted || (shouldNoOp && item?.invariant?.outcome !== "expected-failure") || (!shouldNoOp && item?.invariant?.outcome !== "pass")) errors.push(`${path}.invariant: unexpected outcome`);
  }
  return errors;
}

export function assertEvolutionAuditBudgets(report) {
  const cases = report.cases.length;
  const variants = report.cases.flatMap((item) => [item.base, item.evolved]);
  const totalTicks = variants.reduce((sum, variant) => sum + variant.ticks, 0);
  if (cases > EVOLUTION_AUDIT_BUDGETS.maxCases) throw new Error(`cases ${cases} exceeds budget`);
  for (const variant of variants) {
    if (variant.ticks > EVOLUTION_AUDIT_BUDGETS.maxTicksPerVariant) throw new Error(`${variant.variantId}: tick budget exceeded`);
    if (variant.structure.peakEntities > EVOLUTION_AUDIT_BUDGETS.maxEntitiesPerVariant) throw new Error(`${variant.variantId}: entity budget exceeded`);
    if (variant.structure.maxSnapshotBytes > EVOLUTION_AUDIT_BUDGETS.maxSnapshotBytes) throw new Error(`${variant.variantId}: snapshot budget exceeded`);
    if (variant.structure.maxWorkUnitsPerTick > EVOLUTION_AUDIT_BUDGETS.maxWorkUnitsPerTick) throw new Error(`${variant.variantId}: work budget exceeded`);
  }
  if (totalTicks > EVOLUTION_AUDIT_BUDGETS.maxTotalTicks) throw new Error(`ticks ${totalTicks} exceeds budget`);
  return { cases, variants: variants.length, totalTicks, expectedFailures: report.cases.filter((item) => item.invariant.expectedFailure).length };
}

export function evolutionAuditMarkdown(report) {
  const rows = report.cases.map((item) => `| ${item.sourceKey} | ${item.status} | ${item.capabilities.join(", ")} | ${item.base.common.damage}→${item.evolved.common.damage} | ${item.base.common.activationRate}→${item.evolved.common.activationRate} | ${item.invariant.metric} | ${item.invariant.outcome} |`).join("\n");
  return `# Lastlight evolution audit\n\nContract: \`${report.contract}\` / \`${report.versions.evolutionContractHash}\`\nBalance: \`${report.versions.balanceVersion}\` / \`${report.versions.balanceHash}\`\n\nMatrix: ${report.cases.length} legal L5 paired base/evolved cases\n\n| Source | Status | Declared capabilities | Damage | Activations/s | Invariant | Outcome |\n|---|---|---|---:|---:|---|---|\n${rows}\n\n## Expected failures\n\n${report.cases.filter((item) => item.invariant.expectedFailure).map((item) => `- **${item.sourceKey}:** no authored non-cosmetic evolution delta is observable.`).join("\n")}\n\n## Limits\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}
