import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVOLUTION_AUDIT_BUDGETS,
  assertEvolutionAuditBudgets,
  evolutionAuditMarkdown,
  runEvolutionAudit,
  validateEvolutionAudit,
} from "./evolution-audit.js";

const root = dirname(fileURLToPath(import.meta.url));

export const evolutionAuditReportPaths = () => ({
  json: resolve(root, "reports", "evolution-audit.json"),
  markdown: resolve(root, "reports", "evolution-audit.md"),
});

const jsonText = (report) => `${JSON.stringify(report, null, 2)}\n`;

export function writeEvolutionAuditReport(report) {
  const paths = evolutionAuditReportPaths();
  mkdirSync(dirname(paths.json), { recursive: true });
  writeFileSync(paths.json, jsonText(report));
  writeFileSync(paths.markdown, evolutionAuditMarkdown(report));
  return paths;
}

export function verifyCommittedEvolutionAudit(report) {
  const errors = validateEvolutionAudit(report);
  if (errors.length) throw new Error(`Evolution audit validation failed:\n${errors.join("\n")}`);
  const paths = evolutionAuditReportPaths();
  for (const path of Object.values(paths)) if (!existsSync(path)) throw new Error(`Missing committed evolution audit artifact: ${path}`);
  if (readFileSync(paths.json, "utf8") !== jsonText(report)) throw new Error("Committed evolution audit JSON is stale; run npm run benchmarks:evolutions:update");
  if (readFileSync(paths.markdown, "utf8") !== evolutionAuditMarkdown(report)) throw new Error("Committed evolution audit Markdown is stale; run npm run benchmarks:evolutions:update");
  return assertEvolutionAuditBudgets(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const report = runEvolutionAudit();
  const elapsedMs = performance.now() - started;
  const errors = validateEvolutionAudit(report);
  if (errors.length) throw new Error(`Evolution audit validation failed:\n${errors.join("\n")}`);
  const structural = assertEvolutionAuditBudgets(report);
  if (elapsedMs > EVOLUTION_AUDIT_BUDGETS.maxSuiteRuntimeMs) throw new Error(`Evolution audit runtime ${Math.round(elapsedMs)}ms exceeds budget`);
  if (process.argv.includes("--write")) {
    const paths = writeEvolutionAuditReport(report);
    console.log(`Wrote ${paths.json}`);
    console.log(`Wrote ${paths.markdown}`);
  } else if (process.argv.includes("--verify")) verifyCommittedEvolutionAudit(report);
  console.log(`Lastlight evolutions: ${structural.cases} cases, ${structural.totalTicks} ticks, ${structural.expectedFailures} expected failures, ${Math.round(elapsedMs)} ms`);
  for (const item of report.cases) console.log(`${item.sourceKey.padEnd(23)} ${item.invariant.outcome.padEnd(16)} ${item.invariant.metric}=${item.invariant.value}`);
}
