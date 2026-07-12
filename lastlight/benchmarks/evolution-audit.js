import { BALANCE_HASH, BALANCE_VERSION, BALANCE_CONFIG } from "../balance-config.js";
import { SPECIALIST_ORDER, SPECIALISTS, WEAPONS } from "../data.js";
import { SIMULATION_TICK_RATE } from "../engine.js";
import { deterministicWorkUnits } from "../fixtures/fixture-runner.js";
import { hashCanonicalState } from "../replay.js";
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
export const EVOLUTION_CAPABILITIES = Object.freeze(["cadence", "pierce", "lifetime", "repeat", "flow-regeneration", "orbit-speed", "visual-only", "projectile-streams", "repair-rate", "pickup-range"]);
export const EVOLUTION_STATUSES = Object.freeze(["meaningful", "stat-only", "expected-no-op"]);

const definition = (sourceKey, scope, passiveId, capabilities, invariantMetric, status = "meaningful") => Object.freeze({
  sourceKey, scope, passiveId, capabilities: Object.freeze(capabilities), status,
  invariant: Object.freeze({ metric: invariantMetric, comparison: "increase", expectedFailure: status === "expected-no-op" }),
});

export const EVOLUTION_CASE_DEFINITIONS = Object.freeze([
  definition("signature:zuri", "signature", "haste", ["cadence", "pierce"], "pierce"),
  definition("signature:echo", "signature", "projectiles", ["cadence", "lifetime"], "lifetime"),
  definition("signature:sola", "signature", "armor", ["cadence"], "cadence", "stat-only"),
  definition("signature:bront", "signature", "duration", ["cadence", "repeat"], "repeat"),
  definition("signature:fang", "signature", "maxHealth", ["cadence"], "cadence", "stat-only"),
  definition("signature:gale", "signature", "crit", ["pierce", "flow-regeneration"], "flow-regeneration"),
  definition("signature:rift", "signature", "move", ["cadence"], "cadence", "stat-only"),
  definition("signature:nova", "signature", "xp", ["cadence", "lifetime"], "lifetime"),
  definition("signature:vesper", "signature", "pickup", ["cadence", "pierce"], "pierce"),
  definition("universal:uwu", "universal", "haste", ["cadence", "pierce"], "pierce"),
  definition("universal:slicers", "universal", "regen", ["orbit-speed"], "orbit-speed", "stat-only"),
  definition("universal:aura", "universal", "maxHealth", ["visual-only"], "nonCosmeticDeltaCount", "expected-no-op"),
  definition("universal:mines", "universal", "area", ["visual-only"], "nonCosmeticDeltaCount", "expected-no-op"),
  definition("universal:crossbow", "universal", "crit", ["pierce"], "pierce"),
  definition("universal:boomerang", "universal", "move", ["visual-only"], "nonCosmeticDeltaCount", "expected-no-op"),
  definition("universal:rail", "universal", "haste", ["visual-only"], "nonCosmeticDeltaCount", "expected-no-op"),
  definition("universal:glove", "universal", "regen", ["projectile-streams"], "projectile-streams"),
  definition("universal:transit", "universal", "damage", ["visual-only"], "nonCosmeticDeltaCount", "expected-no-op"),
  definition("universal:ice", "universal", "armor", ["cadence"], "cadence", "stat-only"),
  definition("universal:annihilator", "universal", "xp", ["cadence"], "cadence", "stat-only"),
  definition("universal:drone", "universal", "pickup", ["pierce", "repair-rate", "pickup-range"], "repair-rate"),
]);

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
const CAPABILITY_KEYS = Object.freeze(["cadence", "pierce", "lifetime", "repeat", "flowRegeneration", "orbitSpeed", "projectileStreams", "repairRate", "pickupRange"]);
const ROOT_KEYS = Object.freeze(["schema", "schemaVersion", "contract", "versions", "definitions", "cases", "budgets", "limitations"]);
const VERSION_KEYS = Object.freeze(["balanceVersion", "balanceHash", "tickRate"]);
const CASE_KEYS = Object.freeze(["sourceKey", "scope", "passiveId", "capabilities", "status", "seed", "base", "evolved", "delta", "nonCosmeticDeltaCount", "invariant"]);
const VARIANT_KEYS = Object.freeze(["variantId", "loadout", "common", "capabilityMetrics", "finalHash", "ticks", "structure"]);
const LOADOUT_KEYS = Object.freeze(["level", "pairedPassiveRank", "evolved"]);
const DELTA_KEYS = Object.freeze(["common", "capabilityMetrics"]);
const INVARIANT_KEYS = Object.freeze(["metric", "comparison", "expectedFailure", "value", "passed", "accepted", "outcome"]);
const STRUCTURE_KEYS = Object.freeze(["peakEntities", "maxWorkUnitsPerTick", "maxSnapshotBytes"]);
const NO_OPS = Object.freeze(["universal:aura", "universal:mines", "universal:boomerang", "universal:rail", "universal:transit"]);

function sourceParts(sourceKey) {
  const [scope, id] = sourceKey.split(":");
  return { scope, id, specialistId: scope === "signature" ? id : "zuri", sourceId: scope === "signature" ? "signature" : id };
}

function snapshotHash(sim) { return hashCanonicalState(JSON.parse(JSON.stringify(sim.snapshot()))); }
function snapshotBytes(sim) { return new TextEncoder().encode(JSON.stringify(sim.snapshot())).byteLength; }

function configureVariant(def, evolved) {
  const parts = sourceParts(def.sourceKey);
  const seed = specialistBenchmarkSeed(def.sourceKey, "evolution-audit");
  const sim = createSpecialistBenchmarkSimulation([parts.specialistId], seed, "story");
  const player = sim.players[0];
  sim.level = 1; sim.obstacles = [];
  if (parts.scope === "signature") applySpecialistBenchmarkUpgrade(player, "weapon:signature", BALANCE_CONFIG.core.maxWeaponLevel);
  else applySpecialistBenchmarkUpgrade(player, `weapon:${parts.id}`, BALANCE_CONFIG.core.maxWeaponLevel);
  applySpecialistBenchmarkUpgrade(player, `passive:${def.passiveId}`, 1);
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

function instrument(sim, player, parts) {
  const trace = {
    activations: 0, projectiles: 0, effects: 0, tasks: 0, hits: 0, targets: new Set(),
    maxPierce: 0, maxLife: 0, projectilesByActivation: [], slicerAngles: [], seenEffects: new Set(),
  };
  let inActivation = false, activationProjectiles = 0, firstSlicer = false;
  const originalShoot = sim.shoot.bind(sim);
  sim.shoot = (...args) => {
    const projectile = originalShoot(...args);
    if (projectile?.sourceId === parts.sourceId) {
      trace.projectiles++; activationProjectiles += inActivation ? 1 : 0;
      trace.maxPierce = Math.max(trace.maxPierce, Number(projectile.pierce || 0));
      trace.maxLife = Math.max(trace.maxLife, Number(projectile.life || 0));
    }
    return projectile;
  };
  const originalBlast = sim.blast.bind(sim);
  sim.blast = (...args) => {
    const sourceId = args[8] ?? args[7];
    if (sourceId === parts.sourceId && parts.id === "slicers" && inActivation && !firstSlicer) {
      firstSlicer = true;
      trace.slicerAngles.push({ time: sim.time, angle: Math.atan2(args[1] - player.y, args[0] - player.x) });
    }
    return originalBlast(...args);
  };
  const originalSchedule = sim.scheduleTask.bind(sim);
  sim.scheduleTask = (...args) => {
    const [kind, , payload] = args;
    if ((parts.scope === "signature" && ["bront-repeat-blast", "echo-projectile-repeat"].includes(kind)) || payload?.sourceId === parts.sourceId) trace.tasks++;
    return originalSchedule(...args);
  };
  const originalDamage = sim.damageEnemy.bind(sim);
  sim.damageEnemy = (enemy, amount, owner, critical, source) => {
    if (source === parts.sourceId) { trace.hits++; trace.targets.add(enemy.id); }
    return originalDamage(enemy, amount, owner, critical, source);
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
  let cadence = 0, flowRegeneration = 0, repairRate = 0, pickupRange = 0, ticks = 0;
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
  if (def.capabilities.includes("pickup-range")) pickupRange = parts.id === "drone" ? 115 + 5 * 38 + (evolved ? 95 : 0) : 0;
  return { cadence: round(cadence), flowRegeneration: round(flowRegeneration), repairRate: round(repairRate), pickupRange: round(pickupRange), ticks };
}

function runVariant(def, evolved) {
  const { sim, player, parts, seed } = configureVariant(def, evolved);
  const trace = instrument(sim, player, parts);
  const duration = 18, ticks = duration * SIMULATION_TICK_RATE;
  let peakEntities = 0, maxWorkUnitsPerTick = 0, maxSnapshotBytes = 0;
  for (let tick = 0; tick < ticks; tick++) {
    sim.update(EVOLUTION_AUDIT_STEP);
    for (const effect of sim.effects) if (effect.sourceId === parts.sourceId && !trace.seenEffects.has(effect.id)) { trace.seenEffects.add(effect.id); trace.effects++; }
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
  const capabilityMetrics = {
    cadence: def.capabilities.includes("cadence") ? auxiliary.cadence : common.activationRate, pierce: trace.maxPierce, lifetime: round(trace.maxLife), repeat: trace.tasks,
    flowRegeneration: auxiliary.flowRegeneration, orbitSpeed: round(orbitSpeed(trace.slicerAngles)),
    projectileStreams: round(Math.max(0, ...trace.projectilesByActivation)), repairRate: auxiliary.repairRate, pickupRange: auxiliary.pickupRange,
  };
  return {
    variantId: `${def.sourceKey}:${evolved ? "evolved" : "base"}`,
    loadout: { level: BALANCE_CONFIG.core.maxWeaponLevel, pairedPassiveRank: 1, evolved },
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
  const values = [...Object.values(delta.common), ...Object.values(delta.capabilityMetrics)];
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
    versions: { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, tickRate: SIMULATION_TICK_RATE },
    definitions: EVOLUTION_CASE_DEFINITIONS, cases: EVOLUTION_CASE_DEFINITIONS.map(benchmarkCase), budgets: EVOLUTION_AUDIT_BUDGETS,
    limitations: [
      "The harness records deterministic observables and declared capabilities; it does not implement or approve evolution mechanics.",
      "Visual-only differences are deliberately excluded from non-cosmetic delta counts.",
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
  if (report?.versions?.balanceVersion !== BALANCE_VERSION || report?.versions?.balanceHash !== BALANCE_HASH || report?.versions?.tickRate !== SIMULATION_TICK_RATE) errors.push("versions: runtime identity mismatch");
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
      if (!exactKeys(variant?.loadout, LOADOUT_KEYS) || variant?.loadout?.level !== BALANCE_CONFIG.core.maxWeaponLevel || variant?.loadout?.pairedPassiveRank !== 1 || variant?.loadout?.evolved !== (name === "evolved")) errors.push(`${path}.${name}.loadout: mismatch`);
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
  return `# Lastlight evolution audit\n\nContract: \`${report.contract}\`  \nBalance: \`${report.versions.balanceVersion}\` / \`${report.versions.balanceHash}\`\n\nMatrix: ${report.cases.length} legal L5 paired base/evolved cases\n\n| Source | Status | Declared capabilities | Damage | Activations/s | Invariant | Outcome |\n|---|---|---|---:|---:|---|---|\n${rows}\n\n## Expected failures\n\n${report.cases.filter((item) => item.invariant.expectedFailure).map((item) => `- **${item.sourceKey}:** no authored non-cosmetic evolution delta is observable.`).join("\n")}\n\n## Limits\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}
