#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { AGGREGATE_SCHEMA, buildAnalyticsQuery, buildDashboardModel, normalizeApiRows, renderDashboardHtml, validateAggregatePayload } from "./lastlight-dashboard-lib.mjs";

function args(argv) {
  const result = { days: 30, minCohort: 5, output: ".lastlight-dashboard/report.html", fixture: "", printSql: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--days") result.days = Number(argv[++index]);
    else if (arg === "--min-cohort") result.minCohort = Number(argv[++index]);
    else if (arg === "--output") result.output = argv[++index];
    else if (arg === "--fixture") result.fixture = argv[++index];
    else if (arg === "--print-sql") result.printSql = true;
    else throw new TypeError(`Unknown argument: ${arg}`);
  }
  return result;
}

async function fetchAggregates(options) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or use --fixture");
  const sql = buildAnalyticsQuery({ windowDays: options.days, minCohort: options.minCohort });
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: sql,
  });
  if (!response.ok) throw new Error(`Cloudflare Analytics query failed (${response.status})`);
  const json = await response.json();
  const rows = json?.data || json?.result?.data;
  return normalizeApiRows(rows, { windowDays: options.days, minCohort: options.minCohort });
}

const options = args(process.argv.slice(2));
if (options.printSql) {
  process.stdout.write(`${buildAnalyticsQuery({ windowDays: options.days, minCohort: options.minCohort })}\n`);
  process.exit(0);
}
const payload = options.fixture
  ? validateAggregatePayload(JSON.parse(await readFile(resolve(options.fixture), "utf8")), { minCohort: options.minCohort })
  : await fetchAggregates(options);
if (payload.schema !== AGGREGATE_SCHEMA) throw new Error("Unexpected dashboard schema");
const model = buildDashboardModel(payload, { minCohort: options.minCohort });
const html = renderDashboardHtml(model);
const output = resolve(options.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`Wrote aggregate-only report to ${output}\n`);
