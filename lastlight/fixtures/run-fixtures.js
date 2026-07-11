#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compareGoldens, fixturePaths, goldenDocument, loadFixtureSuite, runFixtureSuite } from "./fixture-runner.js";

function options(argv) {
  let mode = "verify", report = "";
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--verify") mode = "verify";
    else if (value === "--update") mode = "update";
    else if (value === "--report") { mode = "report"; report = argv[index + 1] || "artifacts/fixture-report.json"; index++; }
    else if (value.startsWith("--report=")) report = value.slice(9);
    else if (value !== "--timing") throw new TypeError(`Unknown fixture option ${value}`);
  }
  return { mode, report };
}

function table(report) {
  console.log("\nLastlight deterministic fixtures");
  for (const result of report.results) {
    const metrics = result.metrics;
    console.log(`${result.id.padEnd(28)} ${result.hashes.at(-1).hash}  ${String(metrics.maxSnapshotBytes).padStart(7)} B  ${String(metrics.maxTotalEntities).padStart(4)} entities  ${String(metrics.maxWorkUnitsPerTick).padStart(7)} work  ${metrics.timingAdvisoryMs.p95.toFixed(3)} ms p95*`);
  }
  console.log("* wall-clock timing is advisory; deterministic hashes and structural budgets are the CI gates.\n");
}

try {
  const parsed = options(process.argv.slice(2));
  const report = runFixtureSuite({ timing: true, repeatability: true });
  const suite = loadFixtureSuite(), paths = fixturePaths();
  if (parsed.mode === "update") {
    mkdirSync(dirname(paths.goldens), { recursive: true });
    writeFileSync(paths.goldens, `${JSON.stringify(goldenDocument(report.results, suite.manifest), null, 2)}\n`);
    console.log(`Updated explicit fixture goldens: ${paths.goldens}`);
  } else {
    compareGoldens(report.results, JSON.parse(readFileSync(paths.goldens, "utf8")));
  }
  if (parsed.report) {
    const target = resolve(process.cwd(), parsed.report);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote machine-readable report: ${target}`);
  }
  table(report);
} catch (error) {
  console.error(`Lastlight fixtures failed: ${error.message}`);
  process.exitCode = 1;
}
