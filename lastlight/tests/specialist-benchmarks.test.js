import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPECIALIST_ORDER } from "../data.js";
import {
  SPECIALIST_BENCHMARK_BUDGETS,
  SPECIALIST_BENCHMARK_SCENARIOS,
  SPECIALIST_BENCHMARK_SCHEMA,
  assertSpecialistBenchmarkBudgets,
  runSpecialistBenchmarks,
  specialistBenchmarkMarkdown,
  validateSpecialistBenchmarkReport,
} from "../benchmarks/specialist-benchmark.js";
import { specialistBenchmarkReportPaths, verifyCommittedSpecialistBenchmark } from "../benchmarks/run-specialist-benchmarks.js";

const started = performance.now();
const report = runSpecialistBenchmarks();
const runtimeMs = performance.now() - started;

test("benchmark report strictly covers every specialist and authored scenario", () => {
  assert.equal(report.schema, SPECIALIST_BENCHMARK_SCHEMA);
  assert.deepEqual(validateSpecialistBenchmarkReport(report), []);
  assert.deepEqual(report.specialists.map(({ id }) => id), SPECIALIST_ORDER);
  assert.deepEqual(report.scenarioDefinitions.map(({ id }) => id), SPECIALIST_BENCHMARK_SCENARIOS.map(({ id }) => id));
  assert.equal(report.specialists.flatMap(({ scenarios }) => scenarios).length, 90);
  for (const specialist of report.specialists) {
    assert.equal(specialist.scenarios.length, 10);
    assert.equal(specialist.matureLoadout.weapons.signature.level, 5);
    assert.equal(specialist.matureLoadout.weapons.signature.evolved, true);
  }
});
test("deterministic report matches a same-process replay and committed artifacts byte-for-byte", () => {
  const repeated = runSpecialistBenchmarks();
  assert.deepEqual(repeated, report);
  assert.deepEqual(verifyCommittedSpecialistBenchmark(report), assertSpecialistBenchmarkBudgets(report));
  const paths = specialistBenchmarkReportPaths();
  assert.equal(readFileSync(paths.markdown, "utf8"), specialistBenchmarkMarkdown(report));
});

test("every case has finite comparable metrics, hashes, and structural headroom", () => {
  const structural = assertSpecialistBenchmarkBudgets(report);
  assert.equal(structural.cases, 90);
  assert.ok(structural.totalTicks <= SPECIALIST_BENCHMARK_BUDGETS.maxTotalTicks);
  assert.ok(runtimeMs <= SPECIALIST_BENCHMARK_BUDGETS.maxSuiteRuntimeMs);
  for (const specialist of report.specialists) for (const scenario of specialist.scenarios) {
    assert.match(scenario.seed, /^[0-9a-f]{32}$/);
    assert.match(scenario.finalHash, /^[0-9a-f]{16}$/);
    assert.ok(scenario.ticks > 0 && scenario.ticks <= SPECIALIST_BENCHMARK_BUDGETS.maxTicksPerCase);
    assert.ok(Object.values(scenario.metrics).every((value) => value === null || typeof value === "boolean" || Number.isFinite(value)));
  }
});

test("report exposes survival, support, pickup, objective, elite, and apex differentiation", () => {
  const byId = Object.fromEntries(report.specialists.map((specialist) => [specialist.id, specialist]));
  assert.ok(byId.bront.summary.effectiveVitality > byId.nova.summary.effectiveVitality);
  assert.ok(byId.echo.summary.squadSupport > byId.zuri.summary.squadSupport);
  assert.ok(byId.vesper.summary.pickupReach > byId.zuri.summary.pickupReach);
  assert.ok(report.specialists.every((specialist) => specialist.summary.objectiveProgress === 1));
  const apexTimes = report.specialists.map((specialist) => specialist.summary.apexTtkSeconds).filter(Number.isFinite);
  assert.ok(apexTimes.length >= 2 && Math.max(...apexTimes) > Math.min(...apexTimes));
  assert.ok(report.specialists.some((specialist) => specialist.summary.soloSurvivalSeconds < 45));
  assert.ok(report.rankings.every((ranking) => ranking.entries.length === SPECIALIST_ORDER.length));
  assert.ok(report.outliers.length > 0);
});

test("schema validation rejects stale balance identity and metric drift", () => {
  const stale = structuredClone(report);
  stale.versions.balanceVersion = "stale";
  assert.match(validateSpecialistBenchmarkReport(stale).join("\n"), /runtime identity mismatch/);
  const unknownMetric = structuredClone(report);
  unknownMetric.specialists[0].scenarios[0].metrics.unreviewedPower = 9001;
  assert.match(validateSpecialistBenchmarkReport(unknownMetric).join("\n"), /metrics: fields mismatch/);
});

test("harness calls actual Simulation, cast, upgrade, elite, apex, pickup, and objective APIs without gameplay edits", () => {
  const source = readFileSync(new URL("../benchmarks/specialist-benchmark.js", import.meta.url), "utf8");
  assert.match(source, /new Simulation\(/);
  assert.match(source, /sim\.cast\(/);
  assert.match(source, /applyPlayerUpgrade\(/);
  assert.match(source, /sim\.spawnEnemy\(/);
  assert.match(source, /sim\.spawnBoss\(\)/);
  assert.match(source, /sim\.orbs\.push/);
  assert.match(source, /sim\.objectives\.push/);
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /specialist-benchmark|SPECIALIST_BENCHMARK/);
});
