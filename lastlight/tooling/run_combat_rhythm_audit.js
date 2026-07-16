import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { combatRhythmAuditHtml, runCombatRhythmAudit } from "../combat-rhythm-audit.js";

const command = process.argv[2] || "verify", report = runCombatRhythmAudit();
if (command === "report") {
  const directory = resolve("artifacts/combat-rhythm-audit");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(directory, "index.html"), combatRhythmAuditHtml(report));
  console.log(`Wrote ${directory} (${report.passed}/${report.total})`);
} else console.log(`Combat rhythm audit ${report.passed}/${report.total}`);
if (report.passed !== report.total) process.exitCode = 1;
