import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { SPECIALIST_ORDER, SPECIALISTS } from "../data.js";
import { SIMULATION_TICK_RATE } from "../engine.js";
import { deterministicWorkUnits } from "../fixtures/fixture-runner.js";
import { hashCanonicalState } from "../replay.js";
import {
  SPECIALIST_BENCHMARK_SCHEMA,
  applySpecialistBenchmarkUpgrade,
  createSpecialistBenchmarkSimulation,
  placeSpecialistBenchmarkEnemy,
  roundSpecialistBenchmarkValue as round,
  specialistBenchmarkEntityCount,
  specialistBenchmarkSeed,
} from "./specialist-benchmark.js";

export const SIGNATURE_BREAKPOINT_SCHEMA = "lastlight.signature-breakpoints.v1";
export const SIGNATURE_BREAKPOINT_VERSION = 1;
export const SIGNATURE_BREAKPOINT_STEP = 1 / SIMULATION_TICK_RATE;

export const SIGNATURE_BREAKPOINT_STATES = Object.freeze([
  Object.freeze({ id: "rank-1", rank: 1, passiveRank: 0, evolved: false }),
  Object.freeze({ id: "rank-3", rank: 3, passiveRank: 0, evolved: false }),
  Object.freeze({ id: "rank-5", rank: 5, passiveRank: 0, evolved: false }),
  Object.freeze({ id: "paired-passive", rank: 5, passiveRank: 5, evolved: false }),
  Object.freeze({ id: "evolved", rank: 5, passiveRank: 5, evolved: true }),
]);

export const SIGNATURE_BREAKPOINT_DELTAS = Object.freeze([
  Object.freeze({ id: "rank-1-to-3", from: "rank-1", to: "rank-3" }),
  Object.freeze({ id: "rank-3-to-5", from: "rank-3", to: "rank-5" }),
  Object.freeze({ id: "paired-passive", from: "rank-5", to: "paired-passive" }),
  Object.freeze({ id: "evolution", from: "paired-passive", to: "evolved" }),
]);

export const SIGNATURE_PROBE_CONTRACT = Object.freeze({
  singleTargetDistance: 110,
  sustainedSeconds: 18,
  burstSeconds: 4,
  areaPositions: Object.freeze([[100, 0], [125, -30], [125, 30], [160, 0], [190, -35], [190, 35], [230, 0], [270, -20], [270, 20]].map(Object.freeze)),
  rangeDistances: Object.freeze([60, 90, 120, 180, 260, 400, 600, 720, 900]),
});

export const SIGNATURE_BREAKPOINT_BUDGETS = Object.freeze({
  maxCases: 45,
  maxTicksPerCase: 4_800,
  maxTotalTicks: 230_000,
  maxEntitiesPerProbe: 128,
  maxSnapshotBytes: 100_000,
  maxWorkUnitsPerTick: 50_000,
  maxSuiteRuntimeMs: 30_000,
});

const METRIC_KEYS = Object.freeze([
  "singleTargetDps", "areaDps", "burstDamage", "singleDamagePerActivation",
  "areaDamagePerActivation", "activationRate", "minHitDistance", "maxHitDistance",
  "rangeBandWidth", "areaToSingleRatio",
]);
const ROOT_KEYS = Object.freeze(["schema", "schemaVersion", "contract", "versions", "probeContract", "stateDefinitions", "deltaDefinitions", "specialists", "budgets", "limitations"]);
const STRUCTURE_KEYS = Object.freeze(["peakEntities", "maxWorkUnitsPerTick", "maxSnapshotBytes"]);
const PROBE_KEYS = Object.freeze(["seed", "ticks", "elapsedSeconds", "damage", "attempts", "activations", "finalHash", "structure"]);
const RANGE_KEYS = Object.freeze(["seed", "distance", "ticks", "damage", "hit", "finalHash", "structure"]);

const LIMITATIONS = Object.freeze([
  "Breakpoints isolate the starting signature with no active, ultimate, common weapon, movement, or metaprogression contribution.",
  "The frontal cluster is a stable area-throughput probe, not a claim that every signature should cover the same shape or safety envelope.",
  "Range samples are discrete clear-lane distances; max hit distance is a measured bracket, not the exact analytical edge of a projectile or blast.",
  "Paired-passive deltas can correctly be zero when the passive is an evolution prerequisite rather than a direct signature scalar.",
  "Fixed seeds expose exact finite differences but are not confidence intervals or substitutes for human playtests.",
  "This artifact is diagnostic and intentionally does not tune gameplay or establish final target envelopes.",
]);

const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const finiteOrNull = (value) => value === null || Number.isFinite(value);
const snapshotHash = (sim) => hashCanonicalState(JSON.parse(JSON.stringify(sim.snapshot())));

function structureFor(sim) {
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(sim.snapshot())).byteLength;
  return {
    peakEntities: specialistBenchmarkEntityCount(sim),
    maxWorkUnitsPerTick: deterministicWorkUnits(sim),
    maxSnapshotBytes: snapshotBytes,
  };
}

function mergeStructure(target, next) {
  target.peakEntities = Math.max(target.peakEntities, next.peakEntities);
  target.maxWorkUnitsPerTick = Math.max(target.maxWorkUnitsPerTick, next.maxWorkUnitsPerTick);
  target.maxSnapshotBytes = Math.max(target.maxSnapshotBytes, next.maxSnapshotBytes);
}

function createProbeSimulation(specialist, state, seed) {
  const sim = createSpecialistBenchmarkSimulation([specialist], seed, "story");
  const player = sim.players[0];
  sim.level = 1;
  sim.obstacles = [];
  while (player.weapons.signature.level < state.rank) applySpecialistBenchmarkUpgrade(player, "weapon:signature", state.rank);
  if (state.passiveRank) applySpecialistBenchmarkUpgrade(player, `passive:${SPECIALISTS[specialist].signature.passive}`, state.passiveRank);
  if (state.evolved) {
    sim.useAccessCard();
    if (!player.weapons.signature.evolved) throw new Error(`${specialist}/${state.id}: access card failed to evolve signature`);
  }
  player.weaponTimers = {};
  player.damage = 0;
  player.damageBySource = {};
  sim.setInput(player.id, { x: 0, y: 0, aim: 0, autoAim: true });
  return { sim, player };
}

function durableEnemy(sim, x, y) {
  const enemy = placeSpecialistBenchmarkEnemy(sim, "brute", { x, y, stationary: true, harmless: true });
  enemy.hp = enemy.maxHp = 1_000_000;
  return enemy;
}

function instrumentSignature(sim) {
  const original = sim.fireSignature.bind(sim);
  const counter = { attempts: 0, activations: 0 };
  sim.fireSignature = (player) => {
    counter.attempts++;
    const fired = original(player);
    if (fired) counter.activations++;
    return fired;
  };
  return counter;
}

function advance(sim, seconds) {
  const ticks = Math.round(seconds * SIMULATION_TICK_RATE);
  const structure = { peakEntities: 0, maxWorkUnitsPerTick: 0, maxSnapshotBytes: 0 };
  for (let tick = 0; tick < ticks; tick++) {
    sim.update(SIGNATURE_BREAKPOINT_STEP);
    if (tick % SIMULATION_TICK_RATE === 0 || tick === ticks - 1) mergeStructure(structure, structureFor(sim));
  }
  return { ticks, structure };
}

function sustainedProbe(specialist, state, kind) {
  const seed = specialistBenchmarkSeed(specialist, `signature-breakpoint:${kind}`);
  const { sim, player } = createProbeSimulation(specialist, state, seed);
  if (kind === "single") durableEnemy(sim, SIGNATURE_PROBE_CONTRACT.singleTargetDistance, 0);
  else for (const [x, y] of SIGNATURE_PROBE_CONTRACT.areaPositions) durableEnemy(sim, x, y);
  const counter = instrumentSignature(sim);
  const { ticks, structure } = advance(sim, SIGNATURE_PROBE_CONTRACT.sustainedSeconds);
  return {
    seed,
    ticks,
    elapsedSeconds: SIGNATURE_PROBE_CONTRACT.sustainedSeconds,
    damage: round(player.damageBySource.signature || 0),
    attempts: counter.attempts,
    activations: counter.activations,
    finalHash: snapshotHash(sim),
    structure,
  };
}

function burstProbe(specialist, state) {
  const seed = specialistBenchmarkSeed(specialist, "signature-breakpoint:burst");
  const { sim, player } = createProbeSimulation(specialist, state, seed);
  durableEnemy(sim, SIGNATURE_PROBE_CONTRACT.singleTargetDistance, 0);
  if (specialist === "gale") player.flow = 100;
  const counter = instrumentSignature(sim);
  sim.fireSignature(player);
  player.weaponTimers.signature = 1_000_000;
  const { ticks, structure } = advance(sim, SIGNATURE_PROBE_CONTRACT.burstSeconds);
  return {
    seed,
    ticks,
    elapsedSeconds: SIGNATURE_PROBE_CONTRACT.burstSeconds,
    damage: round(player.damageBySource.signature || 0),
    attempts: counter.attempts,
    activations: counter.activations,
    finalHash: snapshotHash(sim),
    structure,
  };
}

function rangeProbe(specialist, state, distance) {
  const seed = specialistBenchmarkSeed(specialist, `signature-breakpoint:range:${distance}`);
  const { sim, player } = createProbeSimulation(specialist, state, seed);
  for (const y of [-240, -160, -80, 0, 80, 160, 240]) durableEnemy(sim, distance, y);
  if (specialist === "gale") player.flow = 100;
  sim.fireSignature(player);
  player.weaponTimers.signature = 1_000_000;
  const { ticks, structure } = advance(sim, SIGNATURE_PROBE_CONTRACT.burstSeconds);
  const damage = round(player.damageBySource.signature || 0);
  return { seed, distance, ticks, damage, hit: damage > 0, finalHash: snapshotHash(sim), structure };
}

function stateMetrics(single, area, burst, range) {
  const hits = range.filter((sample) => sample.hit).map((sample) => sample.distance);
  const singleTargetDps = round(single.damage / single.elapsedSeconds);
  const areaDps = round(area.damage / area.elapsedSeconds);
  return {
    singleTargetDps,
    areaDps,
    burstDamage: burst.damage,
    singleDamagePerActivation: single.activations ? round(single.damage / single.activations) : null,
    areaDamagePerActivation: area.activations ? round(area.damage / area.activations) : null,
    activationRate: round(single.activations / single.elapsedSeconds),
    minHitDistance: hits.length ? Math.min(...hits) : null,
    maxHitDistance: hits.length ? Math.max(...hits) : null,
    rangeBandWidth: hits.length ? Math.max(...hits) - Math.min(...hits) : null,
    areaToSingleRatio: singleTargetDps ? round(areaDps / singleTargetDps) : null,
  };
}

function benchmarkState(specialist, state) {
  const single = sustainedProbe(specialist, state, "single");
  const area = sustainedProbe(specialist, state, "area");
  const burst = burstProbe(specialist, state);
  const range = SIGNATURE_PROBE_CONTRACT.rangeDistances.map((distance) => rangeProbe(specialist, state, distance));
  const structure = { peakEntities: 0, maxWorkUnitsPerTick: 0, maxSnapshotBytes: 0 };
  for (const probe of [single, area, burst, ...range]) mergeStructure(structure, probe.structure);
  return {
    id: state.id,
    loadout: { signatureRank: state.rank, pairedPassiveRank: state.passiveRank, evolved: state.evolved },
    metrics: stateMetrics(single, area, burst, range),
    probes: { single, area, burst, range },
    ticks: single.ticks + area.ticks + burst.ticks + range.reduce((sum, sample) => sum + sample.ticks, 0),
    structure,
  };
}

function metricDelta(before, after) {
  const absolute = before == null || after == null ? null : round(after - before);
  const ratio = before == null || after == null || before === 0 ? null : round(after / before);
  return { absolute, ratio, percent: ratio == null ? null : round((ratio - 1) * 100) };
}

function benchmarkDeltas(states) {
  const byId = Object.fromEntries(states.map((state) => [state.id, state]));
  return SIGNATURE_BREAKPOINT_DELTAS.map((definition) => {
    const metrics = Object.fromEntries(METRIC_KEYS.map((key) => [key, metricDelta(byId[definition.from].metrics[key], byId[definition.to].metrics[key])]));
    return {
      ...definition,
      metrics,
      directSignatureEffect: ["singleTargetDps", "areaDps", "burstDamage", "activationRate", "maxHitDistance"].some((key) => metrics[key].absolute !== 0 && metrics[key].absolute !== null),
    };
  });
}

export function runSignatureBreakpointBenchmarks() {
  const specialists = SPECIALIST_ORDER.map((id) => {
    const states = SIGNATURE_BREAKPOINT_STATES.map((state) => benchmarkState(id, state));
    return {
      id,
      name: SPECIALISTS[id].name,
      signature: SPECIALISTS[id].signature.name,
      evolvedSignature: SPECIALISTS[id].signature.evolve,
      pairedPassive: SPECIALISTS[id].signature.passive,
      states,
      deltas: benchmarkDeltas(states),
    };
  });
  const report = {
    schema: SIGNATURE_BREAKPOINT_SCHEMA,
    schemaVersion: SIGNATURE_BREAKPOINT_VERSION,
    contract: "actual-simulation-fixed-seed-signature-v1",
    versions: { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH, specialistBenchmarkSchema: SPECIALIST_BENCHMARK_SCHEMA },
    probeContract: SIGNATURE_PROBE_CONTRACT,
    stateDefinitions: SIGNATURE_BREAKPOINT_STATES,
    deltaDefinitions: SIGNATURE_BREAKPOINT_DELTAS,
    specialists,
    budgets: SIGNATURE_BREAKPOINT_BUDGETS,
    limitations: LIMITATIONS,
  };
  const errors = validateSignatureBreakpointReport(report);
  if (errors.length) throw new Error(`Invalid signature breakpoint report:\n${errors.join("\n")}`);
  assertSignatureBreakpointBudgets(report);
  return report;
}

function validateStructure(errors, path, structure) {
  if (!exactKeys(structure, STRUCTURE_KEYS)) { errors.push(`${path}: fields mismatch`); return; }
  for (const key of STRUCTURE_KEYS) if (!Number.isFinite(structure[key]) || structure[key] < 0) errors.push(`${path}.${key}: must be finite and nonnegative`);
}

function validateProbe(errors, path, probe, range = false) {
  const keys = range ? RANGE_KEYS : PROBE_KEYS;
  if (!exactKeys(probe, keys)) { errors.push(`${path}: fields mismatch`); return; }
  if (!/^[0-9a-f]{32}$/.test(probe.seed)) errors.push(`${path}.seed: invalid`);
  if (!/^[0-9a-f]{16}$/.test(probe.finalHash)) errors.push(`${path}.finalHash: invalid`);
  for (const key of range ? ["distance", "ticks", "damage"] : ["ticks", "elapsedSeconds", "damage", "attempts", "activations"]) if (!Number.isFinite(probe[key]) || probe[key] < 0) errors.push(`${path}.${key}: must be finite and nonnegative`);
  if (range && typeof probe.hit !== "boolean") errors.push(`${path}.hit: must be boolean`);
  validateStructure(errors, `${path}.structure`, probe.structure);
}

export function validateSignatureBreakpointReport(report) {
  const errors = [];
  if (!exactKeys(report, ROOT_KEYS)) return ["report: fields mismatch"];
  if (report.schema !== SIGNATURE_BREAKPOINT_SCHEMA || report.schemaVersion !== SIGNATURE_BREAKPOINT_VERSION) errors.push("report: schema mismatch");
  if (!exactKeys(report.versions, ["balanceVersion", "balanceHash", "specialistBenchmarkSchema"])) errors.push("versions: fields mismatch");
  else if (report.versions.balanceVersion !== BALANCE_VERSION || report.versions.balanceHash !== BALANCE_HASH || report.versions.specialistBenchmarkSchema !== SPECIALIST_BENCHMARK_SCHEMA) errors.push("versions: runtime identity mismatch");
  if (JSON.stringify(report.probeContract) !== JSON.stringify(SIGNATURE_PROBE_CONTRACT)) errors.push("probeContract: mismatch");
  if (JSON.stringify(report.stateDefinitions) !== JSON.stringify(SIGNATURE_BREAKPOINT_STATES)) errors.push("stateDefinitions: mismatch");
  if (JSON.stringify(report.deltaDefinitions) !== JSON.stringify(SIGNATURE_BREAKPOINT_DELTAS)) errors.push("deltaDefinitions: mismatch");
  if (JSON.stringify(report.budgets) !== JSON.stringify(SIGNATURE_BREAKPOINT_BUDGETS)) errors.push("budgets: mismatch");
  if (!Array.isArray(report.specialists) || report.specialists.map(({ id }) => id).join(",") !== SPECIALIST_ORDER.join(",")) errors.push("specialists: ordered roster mismatch");
  for (const specialist of report.specialists || []) {
    const path = `specialists.${specialist.id}`;
    if (!exactKeys(specialist, ["id", "name", "signature", "evolvedSignature", "pairedPassive", "states", "deltas"])) { errors.push(`${path}: fields mismatch`); continue; }
    if (specialist.name !== SPECIALISTS[specialist.id]?.name || specialist.signature !== SPECIALISTS[specialist.id]?.signature.name || specialist.evolvedSignature !== SPECIALISTS[specialist.id]?.signature.evolve || specialist.pairedPassive !== SPECIALISTS[specialist.id]?.signature.passive) errors.push(`${path}: catalog mismatch`);
    if (!Array.isArray(specialist.states) || specialist.states.map(({ id }) => id).join(",") !== SIGNATURE_BREAKPOINT_STATES.map(({ id }) => id).join(",")) { errors.push(`${path}.states: mismatch`); continue; }
    for (const state of specialist.states) {
      const statePath = `${path}.states.${state.id}`;
      if (!exactKeys(state, ["id", "loadout", "metrics", "probes", "ticks", "structure"])) { errors.push(`${statePath}: fields mismatch`); continue; }
      const definition = SIGNATURE_BREAKPOINT_STATES.find(({ id }) => id === state.id);
      if (!exactKeys(state.loadout, ["signatureRank", "pairedPassiveRank", "evolved"]) || JSON.stringify(Object.values(state.loadout)) !== JSON.stringify([definition.rank, definition.passiveRank, definition.evolved])) errors.push(`${statePath}.loadout: mismatch`);
      if (!exactKeys(state.metrics, METRIC_KEYS)) errors.push(`${statePath}.metrics: fields mismatch`);
      else for (const [key, value] of Object.entries(state.metrics)) if (!finiteOrNull(value)) errors.push(`${statePath}.metrics.${key}: must be finite or null`);
      const probesHaveShape = exactKeys(state.probes, ["single", "area", "burst", "range"]);
      if (!probesHaveShape) errors.push(`${statePath}.probes: fields mismatch`);
      else {
        validateProbe(errors, `${statePath}.probes.single`, state.probes.single);
        validateProbe(errors, `${statePath}.probes.area`, state.probes.area);
        validateProbe(errors, `${statePath}.probes.burst`, state.probes.burst);
        if (!Array.isArray(state.probes.range) || state.probes.range.length !== SIGNATURE_PROBE_CONTRACT.rangeDistances.length) errors.push(`${statePath}.probes.range: mismatch`);
        else state.probes.range.forEach((probe, index) => validateProbe(errors, `${statePath}.probes.range.${index}`, probe, true));
      }
      if (!Number.isFinite(state.ticks) || state.ticks <= 0) errors.push(`${statePath}.ticks: invalid`);
      validateStructure(errors, `${statePath}.structure`, state.structure);
      if (probesHaveShape && Array.isArray(state.probes.range)) {
        const expectedSeeds = {
          single: specialistBenchmarkSeed(specialist.id, "signature-breakpoint:single"),
          area: specialistBenchmarkSeed(specialist.id, "signature-breakpoint:area"),
          burst: specialistBenchmarkSeed(specialist.id, "signature-breakpoint:burst"),
        };
        if (state.probes.single?.seed !== expectedSeeds.single || state.probes.area?.seed !== expectedSeeds.area || state.probes.burst?.seed !== expectedSeeds.burst) errors.push(`${statePath}.probes: paired seed mismatch`);
        if (state.probes.range.some((probe) => probe?.seed !== specialistBenchmarkSeed(specialist.id, `signature-breakpoint:range:${probe?.distance}`))) errors.push(`${statePath}.probes.range: paired seed mismatch`);
        if (state.probes.single && state.probes.area && state.probes.burst && state.probes.range.every(Boolean)) {
          const expectedMetrics = stateMetrics(state.probes.single, state.probes.area, state.probes.burst, state.probes.range);
          if (JSON.stringify(state.metrics) !== JSON.stringify(expectedMetrics)) errors.push(`${statePath}.metrics: derived values mismatch`);
          const expectedTicks = state.probes.single.ticks + state.probes.area.ticks + state.probes.burst.ticks + state.probes.range.reduce((sum, probe) => sum + probe.ticks, 0);
          if (state.ticks !== expectedTicks) errors.push(`${statePath}.ticks: derived value mismatch`);
        }
      }
    }
    if (!Array.isArray(specialist.deltas) || specialist.deltas.map(({ id }) => id).join(",") !== SIGNATURE_BREAKPOINT_DELTAS.map(({ id }) => id).join(",")) errors.push(`${path}.deltas: mismatch`);
    else for (const delta of specialist.deltas) {
      const deltaPath = `${path}.deltas.${delta.id}`;
      if (!exactKeys(delta, ["id", "from", "to", "metrics", "directSignatureEffect"])) { errors.push(`${deltaPath}: fields mismatch`); continue; }
      const definition = SIGNATURE_BREAKPOINT_DELTAS.find(({ id }) => id === delta.id);
      if (delta.from !== definition.from || delta.to !== definition.to) errors.push(`${deltaPath}: definition mismatch`);
      if (!exactKeys(delta.metrics, METRIC_KEYS)) errors.push(`${deltaPath}.metrics: fields mismatch`);
      else for (const [key, value] of Object.entries(delta.metrics)) {
        if (!exactKeys(value, ["absolute", "ratio", "percent"]) || !Object.values(value).every(finiteOrNull)) errors.push(`${deltaPath}.metrics.${key}: invalid`);
      }
      if (typeof delta.directSignatureEffect !== "boolean") errors.push(`${deltaPath}.directSignatureEffect: must be boolean`);
    }
    if (Array.isArray(specialist.states) && Array.isArray(specialist.deltas) && JSON.stringify(specialist.deltas) !== JSON.stringify(benchmarkDeltas(specialist.states))) errors.push(`${path}.deltas: derived values mismatch`);
  }
  if (!Array.isArray(report.limitations) || report.limitations.join("\n") !== LIMITATIONS.join("\n")) errors.push("limitations: mismatch");
  return errors;
}

export function assertSignatureBreakpointBudgets(report) {
  const states = report.specialists.flatMap((specialist) => specialist.states);
  const totalTicks = states.reduce((sum, state) => sum + state.ticks, 0);
  if (states.length > SIGNATURE_BREAKPOINT_BUDGETS.maxCases) throw new Error(`Signature cases ${states.length} exceed budget`);
  if (totalTicks > SIGNATURE_BREAKPOINT_BUDGETS.maxTotalTicks) throw new Error(`Signature ticks ${totalTicks} exceed budget`);
  for (const state of states) {
    if (state.ticks > SIGNATURE_BREAKPOINT_BUDGETS.maxTicksPerCase) throw new Error(`${state.id}: ticks exceed budget`);
    if (state.structure.peakEntities > SIGNATURE_BREAKPOINT_BUDGETS.maxEntitiesPerProbe) throw new Error(`${state.id}: entities exceed budget`);
    if (state.structure.maxSnapshotBytes > SIGNATURE_BREAKPOINT_BUDGETS.maxSnapshotBytes) throw new Error(`${state.id}: snapshot exceeds budget`);
    if (state.structure.maxWorkUnitsPerTick > SIGNATURE_BREAKPOINT_BUDGETS.maxWorkUnitsPerTick) throw new Error(`${state.id}: work exceeds budget`);
  }
  return { cases: states.length, totalTicks, maxTicks: Math.max(...states.map((state) => state.ticks)), maxEntities: Math.max(...states.map((state) => state.structure.peakEntities)), maxSnapshotBytes: Math.max(...states.map((state) => state.structure.maxSnapshotBytes)), maxWorkUnitsPerTick: Math.max(...states.map((state) => state.structure.maxWorkUnitsPerTick)) };
}

export function signatureBreakpointMarkdown(report) {
  const lines = [
    "# Starting signature breakpoint report", "",
    `Contract: \`${report.contract}\``,
    `Balance: \`${report.versions.balanceVersion}\` / \`${report.versions.balanceHash}\``, "",
    `Matrix: ${report.specialists.length} specialists × ${report.stateDefinitions.length} states = ${report.specialists.length * report.stateDefinitions.length} deterministic breakpoint cases`, "",
    "## Measured breakpoints", "",
    "| Specialist | State | Single DPS | Area DPS | Burst | Activations/s | Hit band |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const specialist of report.specialists) for (const state of specialist.states) {
    const metrics = state.metrics;
    lines.push(`| ${specialist.name} | ${state.id} | ${metrics.singleTargetDps} | ${metrics.areaDps} | ${metrics.burstDamage} | ${metrics.activationRate} | ${metrics.minHitDistance ?? "none"}–${metrics.maxHitDistance ?? "none"} |`);
  }
  lines.push("", "## Finite differences", "", "| Specialist | Delta | Single DPS | Area DPS | Burst | Activation rate | Direct measured effect |", "|---|---:|---:|---:|---:|---:|---:|");
  for (const specialist of report.specialists) for (const delta of specialist.deltas) lines.push(`| ${specialist.name} | ${delta.id} | ${delta.metrics.singleTargetDps.percent ?? "n/a"}% | ${delta.metrics.areaDps.percent ?? "n/a"}% | ${delta.metrics.burstDamage.percent ?? "n/a"}% | ${delta.metrics.activationRate.percent ?? "n/a"}% | ${delta.directSignatureEffect ? "yes" : "no"} |`);
  lines.push("", "## Interpretation", "");
  for (const specialist of report.specialists) {
    const passive = specialist.deltas.find(({ id }) => id === "paired-passive");
    const evolution = specialist.deltas.find(({ id }) => id === "evolution");
    lines.push(`- **${specialist.name} — ${specialist.signature} → ${specialist.evolvedSignature}:** paired ${specialist.pairedPassive} passive ${passive.directSignatureEffect ? "changes" : "does not directly change"} the isolated signature metrics; evolution changes single DPS ${evolution.metrics.singleTargetDps.percent ?? "n/a"}% and area DPS ${evolution.metrics.areaDps.percent ?? "n/a"}%.`);
  }
  lines.push("", "## Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return lines.join("\n") + "\n";
}
