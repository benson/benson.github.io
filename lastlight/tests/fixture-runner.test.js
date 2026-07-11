import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import {
  compareGoldens, deterministicWorkUnits, fixturePaths, loadFixtureSuite,
  runFixtureSuite, runScenario, validateManifest, validateScenario,
} from "../fixtures/fixture-runner.js";

test("fixture manifest strictly pins balance, replay, RNG, and seven scenarios", () => {
  const suite = loadFixtureSuite();
  assert.equal(suite.manifest.balance.version, BALANCE_VERSION);
  assert.equal(suite.manifest.balance.hash, BALANCE_HASH);
  assert.equal(suite.manifest.replay.schema, "lastlight.replay.v1");
  assert.equal(suite.manifest.replay.rng, "xoshiro128ss-v1");
  assert.equal(suite.scenarios.length, 7);
  assert.deepEqual(suite.scenarios.map(({ id }) => id), [
    "early-solo-contact", "mid-solo-build", "late-solo-storm", "objective-coordination",
    "multiplayer-four-player", "apex-beachhead", "stress-entity-ceiling",
  ]);
});

test("fixture contracts reject stale versions, unknown fields, and unordered actions", () => {
  const suite = loadFixtureSuite();
  assert.throws(() => validateManifest({ ...suite.manifest, balance: { ...suite.manifest.balance, version: "stale" } }), /balance mismatch/);
  const scenario = structuredClone(suite.scenarios[0]);
  scenario.secret = "identity";
  assert.throws(() => validateScenario(scenario, "early-solo-contact.json"), /unexpected/);
  const unordered = structuredClone(suite.scenarios[0]);
  unordered.actions.reverse();
  assert.throws(() => validateScenario(unordered, "early-solo-contact.json"), /ordered/);
});

test("same fixture seed and commands produce identical replay hashes", () => {
  const suite = loadFixtureSuite(), scenario = suite.scenarios[0];
  const left = runScenario(scenario, suite.manifest, { timing: false });
  const right = runScenario(scenario, suite.manifest, { timing: false });
  assert.deepEqual(left.hashes, right.hashes);
  assert.deepEqual(left.summary, right.summary);
});

test("work units reflect collision candidates instead of wall-clock speed", () => {
  const sim = {
    players: [{ dead: false, downed: false }], enemies: Array(10), pods: Array(2), projectiles: Array(3), hostile: Array(4),
    effects: [{ damage: 1 }, { damage: 0 }], orbs: Array(5), drones: Array(1), drops: Array(2),
  };
  assert.equal(deterministicWorkUnits(sim), 10 + 3 * 12 + 4 + 12 + 5 * 2 + 2);
});

test("all fixtures match committed goldens and structural budgets", () => {
  const report = runFixtureSuite({ timing: false, repeatability: false });
  const expected = JSON.parse(readFileSync(fixturePaths().goldens, "utf8"));
  assert.doesNotThrow(() => compareGoldens(report.results, expected));
  assert.equal(report.status, "passed");
});

test("golden verification reports the first divergent checkpoint", () => {
  const report = runFixtureSuite({ timing: false, repeatability: false });
  const expected = JSON.parse(readFileSync(fixturePaths().goldens, "utf8"));
  expected.fixtures[0].hashes[1].hash = "0000000000000000";
  assert.throws(() => compareGoldens(report.results, expected), /early-solo-contact: first divergence at tick 60/);
});
