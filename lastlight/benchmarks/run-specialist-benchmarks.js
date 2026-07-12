import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SPECIALIST_BENCHMARK_BUDGETS,
  assertSpecialistBenchmarkBudgets,
  runSpecialistBenchmarks,
  specialistBenchmarkMarkdown,
  validateSpecialistBenchmarkReport,
} from "./specialist-benchmark.js";

const ROOT = new URL("./", import.meta.url);
const REPORT_DIRECTORY = new URL("reports/", ROOT);
const JSON_REPORT = new URL("reports/specialist-benchmark.json", ROOT);
const MARKDOWN_REPORT = new URL("reports/specialist-benchmark.md", ROOT);

function serializeJson(report) { return `${JSON.stringify(report, null, 2)}\n`; }

export function specialistBenchmarkReportPaths() {
  return { json: fileURLToPath(JSON_REPORT), markdown: fileURLToPath(MARKDOWN_REPORT) };
}
export function verifyCommittedSpecialistBenchmark(report) {
  const errors = validateSpecialistBenchmarkReport(report);
  if (errors.length) throw new Error(`Specialist benchmark report is invalid:\n- ${errors.join("\n- ")}`);
  const wantedJson = serializeJson(report), wantedMarkdown = specialistBenchmarkMarkdown(report);
  if (!existsSync(JSON_REPORT) || !existsSync(MARKDOWN_REPORT)) throw new Error("Committed specialist benchmark artifacts are missing; run npm run benchmarks:specialists:update");
  if (readFileSync(JSON_REPORT, "utf8") !== wantedJson) throw new Error("Committed specialist benchmark JSON is stale; run npm run benchmarks:specialists:update");
  if (readFileSync(MARKDOWN_REPORT, "utf8") !== wantedMarkdown) throw new Error("Committed specialist benchmark Markdown is stale; run npm run benchmarks:specialists:update");
  return assertSpecialistBenchmarkBudgets(report);
}

export function writeSpecialistBenchmark(report) {
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  writeFileSync(JSON_REPORT, serializeJson(report));
  writeFileSync(MARKDOWN_REPORT, specialistBenchmarkMarkdown(report));
  return specialistBenchmarkReportPaths();
}

function printSummary(report, elapsedMs) {
  const structural = assertSpecialistBenchmarkBudgets(report);
  console.log(`Lastlight specialist benchmark: ${report.specialists.length} specialists, ${structural.cases} cases, ${structural.totalTicks} ticks, ${Math.round(elapsedMs)} ms advisory`);
  for (const ranking of report.rankings) {
    const first = ranking.entries[0];
    console.log(`${ranking.label.padEnd(30)} ${first.specialist.padEnd(8)} ${first.value ?? "not completed"}`);
  }
  if (report.outliers.length) console.log(`Outliers: ${report.outliers.map((outlier) => `${outlier.specialist}/${outlier.metric}/${outlier.ratioToMedian}x`).join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const started = performance.now(), report = runSpecialistBenchmarks(), elapsedMs = performance.now() - started;
  if (elapsedMs > SPECIALIST_BENCHMARK_BUDGETS.maxSuiteRuntimeMs) throw new Error(`Specialist benchmark runtime ${Math.round(elapsedMs)}ms exceeds advisory budget ${SPECIALIST_BENCHMARK_BUDGETS.maxSuiteRuntimeMs}ms`);
  if (process.argv.includes("--write")) {
    const paths = writeSpecialistBenchmark(report);
    console.log(`Wrote ${paths.json}`); console.log(`Wrote ${paths.markdown}`);
  } else if (process.argv.includes("--verify")) verifyCommittedSpecialistBenchmark(report);
  printSummary(report, elapsedMs);
}
