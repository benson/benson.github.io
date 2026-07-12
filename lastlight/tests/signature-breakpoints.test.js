import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPECIALIST_ORDER, SPECIALISTS } from "../data.js";
import {
  SIGNATURE_BREAKPOINT_BUDGETS,
  SIGNATURE_BREAKPOINT_DELTAS,
  SIGNATURE_BREAKPOINT_SCHEMA,
  SIGNATURE_BREAKPOINT_STATES,
  assertSignatureBreakpointBudgets,
  runSignatureBreakpointBenchmarks,
  signatureBreakpointMarkdown,
  validateSignatureBreakpointReport,
} from "../benchmarks/signature-breakpoint-benchmark.js";
import { signatureBreakpointReportPaths, verifyCommittedSignatureBreakpointReport } from "../benchmarks/run-signature-breakpoints.js";

const started = performance.now();
const report = runSignatureBreakpointBenchmarks();
const runtimeMs = performance.now() - started;

test("starting-signature report strictly covers every roster breakpoint", () => {
  assert.equal(report.schema, SIGNATURE_BREAKPOINT_SCHEMA);
  assert.deepEqual(validateSignatureBreakpointReport(report), []);
  assert.deepEqual(report.specialists.map(({ id }) => id), SPECIALIST_ORDER);
  assert.equal(report.specialists.flatMap(({ states }) => states).length, 45);
  for (const specialist of report.specialists) {
    assert.deepEqual(specialist.states.map(({ id }) => id), SIGNATURE_BREAKPOINT_STATES.map(({ id }) => id));
    assert.deepEqual(specialist.deltas.map(({ id }) => id), SIGNATURE_BREAKPOINT_DELTAS.map(({ id }) => id));
    assert.equal(specialist.pairedPassive, SPECIALISTS[specialist.id].signature.passive);
    assert.deepEqual(specialist.states.map(({ loadout }) => loadout.signatureRank), [1, 3, 5, 5, 5]);
    assert.deepEqual(specialist.states.map(({ loadout }) => loadout.pairedPassiveRank), [0, 0, 0, 5, 5]);
    assert.deepEqual(specialist.states.map(({ loadout }) => loadout.evolved), [false, false, false, false, true]);
  }
});

test("fixed-seed signature probes repeat and match committed machine-readable artifacts", () => {
  const repeated = runSignatureBreakpointBenchmarks();
  assert.deepEqual(repeated, report);
  assert.deepEqual(verifyCommittedSignatureBreakpointReport(report), assertSignatureBreakpointBudgets(report));
  assert.equal(readFileSync(signatureBreakpointReportPaths().markdown, "utf8"), signatureBreakpointMarkdown(report));
});

test("every breakpoint and finite difference is finite, paired, and structurally bounded", () => {
  const structural = assertSignatureBreakpointBudgets(report);
  assert.equal(structural.cases, 45);
  assert.ok(structural.totalTicks <= SIGNATURE_BREAKPOINT_BUDGETS.maxTotalTicks);
  assert.ok(runtimeMs <= SIGNATURE_BREAKPOINT_BUDGETS.maxSuiteRuntimeMs);
  for (const specialist of report.specialists) {
    const byId = Object.fromEntries(specialist.states.map((state) => [state.id, state]));
    for (const state of specialist.states) {
      assert.ok(Object.values(state.metrics).every((value) => value === null || Number.isFinite(value)));
      assert.match(state.probes.single.finalHash, /^[0-9a-f]{16}$/);
      assert.match(state.probes.single.seed, /^[0-9a-f]{32}$/);
    }
    for (const delta of specialist.deltas) for (const [metric, value] of Object.entries(delta.metrics)) {
      const before = byId[delta.from].metrics[metric], after = byId[delta.to].metrics[metric];
      assert.equal(value.absolute, before == null || after == null ? null : Math.round((after - before) * 1000) / 1000);
      assert.ok(Object.values(value).every((entry) => entry === null || Number.isFinite(entry)));
    }
  }
});

test("rank scaling, paired-passive relevance, evolution, range, and area breakpoints remain observable", () => {
  const byId = Object.fromEntries(report.specialists.map((specialist) => [specialist.id, specialist]));
  for (const specialist of report.specialists) {
    assert.ok(specialist.deltas.find(({ id }) => id === "rank-1-to-3").directSignatureEffect, specialist.id);
    assert.ok(specialist.deltas.find(({ id }) => id === "rank-3-to-5").directSignatureEffect, specialist.id);
    assert.ok(specialist.deltas.find(({ id }) => id === "evolution").directSignatureEffect, specialist.id);
    assert.ok(specialist.states.every((state) => state.metrics.minHitDistance != null && state.metrics.maxHitDistance != null), specialist.id);
  }
  for (const id of ["zuri", "echo", "sola", "fang", "gale"]) assert.equal(byId[id].deltas.find(({ id }) => id === "paired-passive").directSignatureEffect, true, id);
  for (const id of ["bront", "rift", "nova", "vesper"]) assert.equal(byId[id].deltas.find(({ id }) => id === "paired-passive").directSignatureEffect, false, id);
  assert.ok(byId.echo.states[4].metrics.areaToSingleRatio > 1);
  assert.ok(byId.rift.states[0].metrics.maxHitDistance < byId.echo.states[0].metrics.maxHitDistance);
});

test("schema rejects stale identity, unknown metrics, and malformed finite differences", () => {
  const stale = structuredClone(report);
  stale.versions.balanceVersion = "stale";
  assert.match(validateSignatureBreakpointReport(stale).join("\n"), /runtime identity mismatch/);
  const metric = structuredClone(report);
  metric.specialists[0].states[0].metrics.unknown = 1;
  assert.match(validateSignatureBreakpointReport(metric).join("\n"), /metrics: fields mismatch/);
  const delta = structuredClone(report);
  delta.specialists[0].deltas[0].metrics.singleTargetDps.percent = Number.NaN;
  assert.match(validateSignatureBreakpointReport(delta).join("\n"), /singleTargetDps: invalid/);
});

test("signature harness uses actual simulation APIs and shared benchmark helpers without gameplay edits", () => {
  const source = readFileSync(new URL("../benchmarks/signature-breakpoint-benchmark.js", import.meta.url), "utf8");
  assert.match(source, /createSpecialistBenchmarkSimulation\(/);
  assert.match(source, /applySpecialistBenchmarkUpgrade\(/);
  assert.match(source, /placeSpecialistBenchmarkEnemy\(/);
  assert.match(source, /sim\.fireSignature\(/);
  assert.match(source, /sim\.useAccessCard\(\)/);
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /signature-breakpoint|SIGNATURE_BREAKPOINT/);
});
