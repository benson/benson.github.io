import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { combatChoreographyAuditHtml, runCombatChoreographyAudit } from "../combat-choreography-audit.js";

const command = process.argv[2] || "verify", report = runCombatChoreographyAudit();
if (command === "report") {
  const directory = resolve("artifacts/combat-choreography-audit");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(directory, "index.html"), combatChoreographyAuditHtml(report));
  console.log(`Wrote ${directory} (${report.passed}/${report.total})`);
} else console.log(`Combat choreography audit ${report.passed}/${report.total}`);
if (report.passed !== report.total) process.exitCode = 1;
