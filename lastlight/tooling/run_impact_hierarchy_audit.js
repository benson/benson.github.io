import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { impactHierarchyAuditHtml, runImpactHierarchyAudit } from "../impact-hierarchy-audit.js";

const command = process.argv[2] || "verify", report = runImpactHierarchyAudit();
if (command === "report") {
  const directory = resolve("artifacts/impact-hierarchy-audit");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(directory, "index.html"), impactHierarchyAuditHtml(report));
  console.log(`Wrote ${directory} (${report.passed}/${report.total})`);
} else console.log(`Impact hierarchy audit ${report.passed}/${report.total}`);
if (report.passed !== report.total) process.exitCode = 1;
