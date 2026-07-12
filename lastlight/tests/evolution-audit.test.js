import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEAPON_EVOLUTION_CONTRACT, WEAPON_EVOLUTION_HASH } from "../weapon-evolution.js";
import {
  EVOLUTION_AUDIT_BUDGETS,
  EVOLUTION_AUDIT_SCHEMA,
  EVOLUTION_CASE_DEFINITIONS,
  assertEvolutionAuditBudgets,
  evolutionAuditMarkdown,
  runEvolutionAudit,
  validateEvolutionAudit,
} from "../benchmarks/evolution-audit.js";
import { evolutionAuditReportPaths, verifyCommittedEvolutionAudit } from "../benchmarks/run-evolution-audit.js";

const contractEntries = [...Object.values(WEAPON_EVOLUTION_CONTRACT.signatures), ...Object.values(WEAPON_EVOLUTION_CONTRACT.universal)];
const expectedOrder = contractEntries.map(({ key }) => key);
const expectedNoOps = ["universal:aura", "universal:mines", "universal:boomerang", "universal:rail", "universal:transit"];
const started = performance.now();
const report = runEvolutionAudit();
const runtimeMs = performance.now() - started;

test("evolution audit covers all 21 legal L5 plus paired-rank-1 cases in stable order", () => {
  assert.equal(report.schema, EVOLUTION_AUDIT_SCHEMA);
  assert.deepEqual(validateEvolutionAudit(report), []);
  assert.equal(report.cases.length, 21);
  assert.deepEqual(report.cases.map(({ sourceKey }) => sourceKey), expectedOrder);
  assert.deepEqual(EVOLUTION_CASE_DEFINITIONS.map(({ sourceKey }) => sourceKey), expectedOrder);
  assert.equal(report.versions.evolutionContractHash, WEAPON_EVOLUTION_HASH);
  for (const [index, item] of report.cases.entries()) {
    const contract = contractEntries[index];
    assert.equal(item.passiveId, contract.pairedPassive, item.sourceKey);
    assert.deepEqual(item.capabilities, contract.capabilities.map(({ id }) => id), item.sourceKey);
    assert.equal(item.base.loadout.level, WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel);
    assert.equal(item.evolved.loadout.level, WEAPON_EVOLUTION_CONTRACT.requirement.weaponLevel);
    assert.equal(item.base.loadout.pairedPassiveRank, WEAPON_EVOLUTION_CONTRACT.requirement.passiveLevel);
    assert.equal(item.evolved.loadout.pairedPassiveRank, WEAPON_EVOLUTION_CONTRACT.requirement.passiveLevel);
    assert.equal(item.base.loadout.evolved, false);
    assert.equal(item.evolved.loadout.evolved, true);
    assert.equal(item.base.variantId, `${item.sourceKey}:base`);
    assert.equal(item.evolved.variantId, `${item.sourceKey}:evolved`);
  }
});

test("fixed-seed paired probes repeat and match committed reports byte-for-byte", () => {
  const repeated = runEvolutionAudit();
  assert.deepEqual(repeated, report);
  assert.deepEqual(verifyCommittedEvolutionAudit(report), assertEvolutionAuditBudgets(report));
  assert.equal(readFileSync(evolutionAuditReportPaths().markdown, "utf8"), evolutionAuditMarkdown(report));
  for (const item of report.cases) assert.match(item.seed, /^[0-9a-f]{32}$/);
});

test("every evolution has an accepted authored non-cosmetic invariant", () => {
  assert.deepEqual(report.cases.filter((item) => item.invariant.expectedFailure).map(({ sourceKey }) => sourceKey), expectedNoOps);
  for (const item of report.cases) {
    assert.equal(item.invariant.accepted, true, item.sourceKey);
    if (expectedNoOps.includes(item.sourceKey)) {
      assert.equal(item.invariant.outcome, "expected-failure", item.sourceKey);
      assert.equal(item.invariant.passed, false, item.sourceKey);
      assert.equal(item.nonCosmeticDeltaCount, 0, item.sourceKey);
    } else {
      assert.equal(item.invariant.outcome, "pass", item.sourceKey);
      assert.equal(item.invariant.passed, true, item.sourceKey);
      assert.ok(item.invariant.value > 0, item.sourceKey);
    }
  }
});

test("all observable and capability metrics are finite and structurally bounded", () => {
  const structural = assertEvolutionAuditBudgets(report);
  assert.equal(structural.cases, 21);
  assert.equal(structural.variants, 42);
  assert.equal(structural.expectedFailures, 5);
  assert.ok(structural.totalTicks <= EVOLUTION_AUDIT_BUDGETS.maxTotalTicks);
  assert.ok(runtimeMs <= EVOLUTION_AUDIT_BUDGETS.maxSuiteRuntimeMs);
  for (const item of report.cases) for (const variant of [item.base, item.evolved]) {
    assert.match(variant.finalHash, /^[0-9a-f]{16}$/);
    assert.ok(variant.ticks > 0 && variant.ticks <= EVOLUTION_AUDIT_BUDGETS.maxTicksPerVariant);
    assert.ok(Object.values(variant.common).every(Number.isFinite));
    assert.ok(Object.values(variant.capabilityMetrics).every(Number.isFinite));
    assert.ok(Object.values(variant.structure).every(Number.isFinite));
  }
});

test("schema rejects stale identity, unknown metrics, and weakened expected failures", () => {
  const stale = structuredClone(report);
  stale.versions.balanceVersion = "stale";
  assert.match(validateEvolutionAudit(stale).join("\n"), /runtime identity mismatch/);
  const metric = structuredClone(report);
  metric.cases[0].base.common.unknown = 1;
  assert.match(validateEvolutionAudit(metric).join("\n"), /metric fields mismatch/);
  const weakened = structuredClone(report);
  weakened.cases.find((item) => item.sourceKey === expectedNoOps[0]).invariant.outcome = "pass";
  assert.match(validateEvolutionAudit(weakened).join("\n"), /unexpected outcome/);
});

test("audit uses production simulation and evolution APIs without benchmark-only engine hooks", () => {
  const source = readFileSync(new URL("../benchmarks/evolution-audit.js", import.meta.url), "utf8");
  assert.match(source, /createSpecialistBenchmarkSimulation\(/);
  assert.match(source, /applySpecialistBenchmarkUpgrade\(/);
  assert.match(source, /placeSpecialistBenchmarkEnemy\(/);
  assert.match(source, /sim\.fireSignature/);
  assert.match(source, /sim\.fireCommonWeapon/);
  assert.match(source, /sim\.useAccessCard\(\)/);
  assert.match(source, /WEAPON_EVOLUTION_CONTRACT/);
  assert.match(source, /WEAPON_EVOLUTION_HASH/);
  assert.match(source, /variantId === expectedVariantId/);
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /evolution-audit|EVOLUTION_AUDIT/);
});
