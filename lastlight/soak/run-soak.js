#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createSoakReport, runMultiplayerSoak } from "./multiplayer-soak.js";

function parse(argv) {
  const options = { runs: 1, report: "" };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--runs") options.runs = Number(argv[++index]);
    else if (argv[index] === "--report") options.report = argv[++index];
    else throw new TypeError(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 50) throw new TypeError("--runs must be an integer from 1 to 50");
  return options;
}

const options = parse(process.argv.slice(2));
const results = [];
for (let index = 0; index < options.runs; index++) {
  const seed = (BigInt("0x51a57e11000000000000000000000001") + BigInt(index)).toString(16).padStart(32, "0");
  const result = runMultiplayerSoak({ seed });
  results.push(result);
  process.stdout.write(`run ${index + 1}/${options.runs}: ${result.status}, ${result.metrics.logicalTicks} ticks, ${result.checkpoints.length} checkpoints, ${result.metrics.transport.sent} messages\n`);
}
const report = createSoakReport(results);
if (options.report) {
  const target = resolve(options.report);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`report: ${target}\n`);
}
