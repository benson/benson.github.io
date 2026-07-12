import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIGNATURE_BREAKPOINT_BUDGETS,
  assertSignatureBreakpointBudgets,
  runSignatureBreakpointBenchmarks,
  signatureBreakpointMarkdown,
} from "./signature-breakpoint-benchmark.js";

const root = dirname(fileURLToPath(import.meta.url));
export const signatureBreakpointReportPaths = () => ({
  json: resolve(root, "reports", "signature-breakpoints.json"),
  markdown: resolve(root, "reports", "signature-breakpoints.md"),
});

const jsonText = (report) => `${JSON.stringify(report, null, 2)}\n`;

export function writeSignatureBreakpointReport(report) {
  const paths = signatureBreakpointReportPaths();
  mkdirSync(dirname(paths.json), { recursive: true });
  writeFileSync(paths.json, jsonText(report));
  writeFileSync(paths.markdown, signatureBreakpointMarkdown(report));
  return paths;
}

export function verifyCommittedSignatureBreakpointReport(report) {
  const paths = signatureBreakpointReportPaths();
  for (const path of Object.values(paths)) if (!existsSync(path)) throw new Error(`Missing committed signature breakpoint artifact: ${path}`);
  if (readFileSync(paths.json, "utf8") !== jsonText(report)) throw new Error("Committed signature breakpoint JSON is stale; run npm run benchmarks:signatures:update");
  if (readFileSync(paths.markdown, "utf8") !== signatureBreakpointMarkdown(report)) throw new Error("Committed signature breakpoint Markdown is stale; run npm run benchmarks:signatures:update");
  return assertSignatureBreakpointBudgets(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const report = runSignatureBreakpointBenchmarks();
  const elapsedMs = performance.now() - started;
  const structural = assertSignatureBreakpointBudgets(report);
  if (elapsedMs > SIGNATURE_BREAKPOINT_BUDGETS.maxSuiteRuntimeMs) throw new Error(`Signature benchmark runtime ${Math.round(elapsedMs)}ms exceeds advisory budget`);
  if (process.argv.includes("--write")) {
    const paths = writeSignatureBreakpointReport(report);
    console.log(`Wrote ${paths.json}`);
    console.log(`Wrote ${paths.markdown}`);
  } else if (process.argv.includes("--verify")) verifyCommittedSignatureBreakpointReport(report);
  console.log(`Lastlight signatures: ${structural.cases} cases, ${structural.totalTicks} ticks, ${Math.round(elapsedMs)} ms advisory`);
  for (const specialist of report.specialists) {
    const l1 = specialist.states[0].metrics.singleTargetDps;
    const evolved = specialist.states.at(-1).metrics.singleTargetDps;
    console.log(`${specialist.id.padEnd(8)} L1 ${String(l1).padStart(8)} DPS  evolved ${String(evolved).padStart(8)} DPS`);
  }
}
