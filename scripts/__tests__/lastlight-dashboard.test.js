import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAnalyticsQuery,
  buildDashboardModel,
  renderDashboardHtml,
  validateAggregatePayload,
} from "../lastlight-dashboard-lib.mjs";

const fixtureUrl = new URL("../fixtures/lastlight-dashboard-aggregates.json", import.meta.url);

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8"));
}

test("Analytics SQL requests only aggregate cohorts and suppresses small cohorts at the source", () => {
  const sql = buildAnalyticsQuery({ windowDays: 14, minCohort: 7 });
  assert.match(sql, /FROM lastlight_runs/);
  assert.match(sql, /timestamp >= NOW\(\) - INTERVAL 14 DAY/);
  assert.match(sql, /HAVING runs >= 7/);
  assert.match(sql, /SUM\(_sample_interval\) AS runs/);
  assert.doesNotMatch(sql, /SELECT\s+\*/i);
  assert.doesNotMatch(sql, /seed|hash|token|callsign|room|replay/i);
  assert.throws(() => buildAnalyticsQuery({ windowDays: 14, minCohort: 1 }), /minCohort/);
});

test("aggregate schema is strict, finite, cohort-thresholded, and identity-free", async () => {
  const payload = await fixture();
  const validated = validateAggregatePayload(payload, { minCohort: 5 });
  assert.equal(validated.cohorts.length, 3);
  assert.throws(() => validateAggregatePayload({ ...payload, callsign: "private" }), /Private field/);
  assert.throws(() => validateAggregatePayload({ ...payload, cohorts: [{ ...payload.cohorts[0], resumeToken: "secret" }] }), /Private field/);
  assert.throws(() => validateAggregatePayload({ ...payload, cohorts: [{ ...payload.cohorts[0], runs: 4, wins: 2 }] }), /below minimum/);
  assert.throws(() => validateAggregatePayload({ ...payload, cohorts: [{ ...payload.cohorts[0], sumKills: Number.NaN }] }), /finite/);
});

test("dashboard derives difficulty, survival, defeat, and specialist views from safe aggregates", async () => {
  const model = buildDashboardModel(await fixture(), { minCohort: 5 });
  assert.equal(model.overview[0].runs, 26);
  assert.equal(model.overview[0].defeats, 14);
  assert.equal(model.difficulties.find((row) => row.label === "story").runs, 18);
  assert.equal(model.specialists.find((row) => row.label === "sola").runs, 8);
  assert.ok(model.overview[0].averageSurvivalRatio > 0 && model.overview[0].averageSurvivalRatio <= 1);
  assert.ok(model.unavailable.some((item) => /Weapon selection/.test(item)));
  assert.ok(model.unavailable.some((item) => /Reconnect/.test(item)));
  assert.ok(model.unavailable.some((item) => /error/.test(item)));
});

test("rendered report is static, noindex, aggregate-only, and contains no forbidden secrets", async () => {
  const model = buildDashboardModel(await fixture(), { minCohort: 5 });
  const html = renderDashboardHtml(model);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /minimum cohort 5/);
  assert.match(html, /Specialist presence/);
  assert.match(html, /Not yet measurable/);
  assert.doesNotMatch(html, /resumeToken|squadCode|callsign|replaySeed|replayHash/i);
  assert.doesNotMatch(html, /<script/i);
});
