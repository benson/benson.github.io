import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BALANCE_HASH, BALANCE_VERSION } from "../balance-config.js";
import { REPLAY_SCHEMA, REPLAY_STEP_HZ, hashCanonicalState } from "../replay.js";
import { RNG_ALGORITHM } from "../rng.js";
import { applyFixtureAction, createFixtureSimulation, resolveFixtureChoices } from "./fixture-bootstrap.js";

export const FIXTURE_SCHEMA = "lastlight.fixture.v1";
export const FIXTURE_MANIFEST_SCHEMA = "lastlight.fixtures.v1";
export const FIXTURE_BUDGET_SCHEMA = "lastlight.fixture-budgets.v1";
export const FIXTURE_REPORT_SCHEMA = "lastlight.fixture-report.v1";

const ROOT = new URL("./", import.meta.url);
const TOP_LEVEL_KEYS = new Set(["schema", "id", "description", "seed", "simulation", "checkpoint", "players", "population", "actions", "run", "expect"]);
const EXPECT_KEYS = new Set(["stage", "playerCount", "bossPhase", "minDamage", "minGold", "minRevives", "maxObjectives", "maxRelayBalls", "maxEffects"]);

function json(url) { return JSON.parse(readFileSync(url, "utf8")); }
function exactKeys(value, keys, path) {
  const actual = Object.keys(value || {}).sort(), expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new TypeError(`${path} has unexpected or missing fields`);
}
function allowedKeys(value, keys, path) {
  for (const key of Object.keys(value || {})) if (!keys.has(key)) throw new TypeError(`${path}.${key} is unsupported`);
}
function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${path} must be an integer from ${min} to ${max}`);
}
function finite(value, path) { if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite`); }

export function validateManifest(manifest) {
  exactKeys(manifest, ["schema", "schemaVersion", "balance", "replay", "scenarios"], "manifest");
  if (manifest.schema !== FIXTURE_MANIFEST_SCHEMA || manifest.schemaVersion !== 1) throw new TypeError("Unsupported fixture manifest schema");
  exactKeys(manifest.balance, ["version", "hash"], "manifest.balance");
  exactKeys(manifest.replay, ["schema", "stepHz", "rng"], "manifest.replay");
  if (manifest.balance.version !== BALANCE_VERSION || manifest.balance.hash !== BALANCE_HASH) throw new TypeError("Fixture manifest balance mismatch");
  if (manifest.replay.schema !== REPLAY_SCHEMA || manifest.replay.stepHz !== REPLAY_STEP_HZ || manifest.replay.rng !== RNG_ALGORITHM) throw new TypeError("Fixture manifest replay mismatch");
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 7 || new Set(manifest.scenarios).size !== 7) throw new TypeError("Fixture manifest must contain seven unique scenarios");
  for (const filename of manifest.scenarios) if (!/^[a-z0-9-]+\.json$/.test(filename)) throw new TypeError("Fixture manifest scenario filename is invalid");
  return manifest;
}

export function validateScenario(scenario, filename = scenario?.id || "scenario") {
  exactKeys(scenario, TOP_LEVEL_KEYS, filename);
  if (scenario.schema !== FIXTURE_SCHEMA) throw new TypeError(`${filename} schema mismatch`);
  if (!/^[a-z0-9-]+$/.test(scenario.id) || `${scenario.id}.json` !== filename) throw new TypeError(`${filename} id mismatch`);
  if (typeof scenario.description !== "string" || !scenario.description.trim()) throw new TypeError(`${filename} description is required`);
  if (!/^[0-9a-f]{32}$/.test(scenario.seed) || /^0+$/.test(scenario.seed)) throw new TypeError(`${filename} seed is invalid`);
  exactKeys(scenario.simulation, ["map", "difficulty", "duration"], `${filename}.simulation`);
  if (!["warehouse", "outskirts", "lab", "beachhead"].includes(scenario.simulation.map)) throw new TypeError(`${filename}.simulation.map is invalid`);
  if (!["story", "hard", "extreme"].includes(scenario.simulation.difficulty)) throw new TypeError(`${filename}.simulation.difficulty is invalid`);
  integer(scenario.simulation.duration, 60, 3600, `${filename}.simulation.duration`);
  if (!Array.isArray(scenario.players) || scenario.players.length < 1 || scenario.players.length > 4) throw new TypeError(`${filename}.players must contain one to four entries`);
  const ids = new Set();
  for (const [index, player] of scenario.players.entries()) {
    if (typeof player.id !== "string" || ids.has(player.id)) throw new TypeError(`${filename}.players.${index}.id is invalid`);
    ids.add(player.id);
  }
  if (!Array.isArray(scenario.actions)) throw new TypeError(`${filename}.actions must be an array`);
  let previousTick = -1;
  for (const [index, action] of scenario.actions.entries()) {
    const actionPath = `${filename}.actions.${index}`;
    integer(action.tick, 0, scenario.run.ticks - 1, `${filename}.actions.${index}.tick`);
    if (action.tick < previousTick) throw new TypeError(`${filename}.actions must be ordered`);
    if (!ids.has(action.player)) throw new TypeError(`${filename}.actions.${index}.player is unknown`);
    if (action.kind === "input") {
      exactKeys(action, ["tick", "kind", "player", "x", "y", "aim", "autoAim"], actionPath);
      for (const key of ["x", "y", "aim"]) finite(action[key], `${actionPath}.${key}`);
      if (typeof action.autoAim !== "boolean") throw new TypeError(`${actionPath}.autoAim must be boolean`);
    } else if (action.kind === "cast") {
      exactKeys(action, ["tick", "kind", "player", "slot"], actionPath);
      if (action.slot !== "e" && action.slot !== "r") throw new TypeError(`${filename}.actions.${index}.slot is invalid`);
    } else if (action.kind === "choose") {
      exactKeys(action, ["tick", "kind", "player", "choiceId"], actionPath);
      if (typeof action.choiceId !== "string" || !action.choiceId) throw new TypeError(`${actionPath}.choiceId is invalid`);
    } else throw new TypeError(`${filename}.actions.${index}.kind is unsupported`);
    previousTick = action.tick;
  }
  exactKeys(scenario.run, ["ticks", "captureEvery"], `${filename}.run`);
  integer(scenario.run.ticks, 1, 3600, `${filename}.run.ticks`);
  integer(scenario.run.captureEvery, 1, 600, `${filename}.run.captureEvery`);
  allowedKeys(scenario.expect, EXPECT_KEYS, `${filename}.expect`);
  return scenario;
}

export function loadFixtureSuite() {
  const manifest = validateManifest(json(new URL("manifest.json", ROOT)));
  const budgetDocument = json(new URL("budgets.json", ROOT));
  exactKeys(budgetDocument, ["schema", "schemaVersion", "budgets"], "budgets");
  if (budgetDocument.schema !== FIXTURE_BUDGET_SCHEMA || budgetDocument.schemaVersion !== 1) throw new TypeError("Unsupported fixture budget schema");
  const scenarios = manifest.scenarios.map((filename) => validateScenario(json(new URL(`scenarios/${filename}`, ROOT)), filename));
  const ids = scenarios.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new TypeError("Fixture scenario ids must be unique");
  if (JSON.stringify(Object.keys(budgetDocument.budgets).sort()) !== JSON.stringify([...ids].sort())) throw new TypeError("Fixture budgets must exactly cover the manifest");
  for (const [id, budget] of Object.entries(budgetDocument.budgets)) {
    exactKeys(budget, ["maxSnapshotBytes", "maxTotalEntities", "maxWorkUnitsPerTick"], `budgets.${id}`);
    for (const [key, value] of Object.entries(budget)) integer(value, 1, 100_000_000, `budgets.${id}.${key}`);
  }
  return { manifest, budgets: budgetDocument.budgets, scenarios };
}

function entityCounts(sim) {
  return Object.fromEntries(["players", "drones", "enemies", "projectiles", "hostile", "effects", "orbs", "drops", "pods", "objectives", "relayBalls", "feathers", "tasks"].map((key) => [key, sim[key]?.length || 0]));
}

export function deterministicWorkUnits(sim) {
  const living = sim.players.filter((player) => !player.dead && !player.downed).length;
  const damagingEffects = sim.effects.filter((effect) => effect.damage || effect.delayed).length;
  return sim.enemies.length
    + sim.projectiles.length * (sim.enemies.length + sim.pods.length)
    + sim.hostile.length * living
    + damagingEffects * (sim.enemies.length + sim.pods.length)
    + sim.orbs.length * (living + sim.drones.length)
    + sim.drops.length * living;
}

function round(value) { return Math.round(Number(value || 0) * 10) / 10; }
function semanticSummary(sim) {
  return {
    stage: sim.stage, tick: sim.tick, wave: sim.wave, level: sim.level,
    kills: sim.kills, gold: sim.gold, teamXP: round(sim.teamXP), bossPhase: sim.bossPhase,
    entities: entityCounts(sim),
    players: sim.players.map((player) => ({ slot: player.replaySlot, specialist: player.specialist, hp: round(player.hp), damage: round(player.damage), kills: player.kills, revives: player.revives, downed: player.downed, dead: player.dead })),
  };
}

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor((sorted.length - 1) * quantile)] * 1000) / 1000;
}

function capture(sim, logicalTick) {
  const serialized = JSON.stringify(sim.snapshot());
  // Hash the exact JSON-safe payload a multiplayer guest receives. Runtime
  // objects can contain optional undefined fields that JSON intentionally omits.
  const snapshot = JSON.parse(serialized);
  return { tick: logicalTick, hash: hashCanonicalState(snapshot), bytes: new TextEncoder().encode(serialized).byteLength };
}

function checkExpectations(scenario, sim) {
  const expect = scenario.expect, damage = sim.players.reduce((sum, player) => sum + player.damage, 0), revives = sim.players.reduce((sum, player) => sum + player.revives, 0);
  if (expect.stage !== undefined && sim.stage !== expect.stage) throw new Error(`${scenario.id}: expected stage ${expect.stage}, got ${sim.stage}`);
  if (expect.playerCount !== undefined && sim.players.length !== expect.playerCount) throw new Error(`${scenario.id}: expected ${expect.playerCount} players, got ${sim.players.length}`);
  if (expect.bossPhase !== undefined && sim.bossPhase !== expect.bossPhase) throw new Error(`${scenario.id}: expected boss phase ${expect.bossPhase}, got ${sim.bossPhase}`);
  if (expect.minDamage !== undefined && damage < expect.minDamage) throw new Error(`${scenario.id}: damage ${damage} is below ${expect.minDamage}`);
  if (expect.minGold !== undefined && sim.gold < expect.minGold) throw new Error(`${scenario.id}: gold ${sim.gold} is below ${expect.minGold}`);
  if (expect.minRevives !== undefined && revives < expect.minRevives) throw new Error(`${scenario.id}: revives ${revives} is below ${expect.minRevives}`);
  if (expect.maxObjectives !== undefined && sim.objectives.length > expect.maxObjectives) throw new Error(`${scenario.id}: objectives ${sim.objectives.length} exceeds ${expect.maxObjectives}`);
  if (expect.maxRelayBalls !== undefined && sim.relayBalls.length > expect.maxRelayBalls) throw new Error(`${scenario.id}: relay balls ${sim.relayBalls.length} exceeds ${expect.maxRelayBalls}`);
  if (expect.maxEffects !== undefined && sim.effects.length > expect.maxEffects) throw new Error(`${scenario.id}: effects ${sim.effects.length} exceeds ${expect.maxEffects}`);
}

export function runScenario(scenario, manifest, { timing = true } = {}) {
  const sim = createFixtureSimulation(scenario, manifest);
  const actions = new Map();
  for (const action of scenario.actions) actions.set(action.tick, [...(actions.get(action.tick) || []), action]);
  const hashes = [], samples = [], peakEntities = {};
  let maxSnapshotBytes = 0, maxTotalEntities = 0, maxWorkUnitsPerTick = 0;
  const record = (logicalTick) => {
    const point = capture(sim, logicalTick); hashes.push({ tick: point.tick, hash: point.hash }); maxSnapshotBytes = Math.max(maxSnapshotBytes, point.bytes);
  };
  record(0);
  for (let tick = 0; tick < scenario.run.ticks; tick++) {
    for (const action of actions.get(tick) || []) applyFixtureAction(sim, action);
    const started = timing ? performance.now() : 0;
    sim.update(1 / REPLAY_STEP_HZ);
    if (timing) samples.push(performance.now() - started);
    resolveFixtureChoices(sim);
    const counts = entityCounts(sim), total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    for (const [key, value] of Object.entries(counts)) peakEntities[key] = Math.max(peakEntities[key] || 0, value);
    maxTotalEntities = Math.max(maxTotalEntities, total);
    maxWorkUnitsPerTick = Math.max(maxWorkUnitsPerTick, deterministicWorkUnits(sim));
    const logicalTick = tick + 1;
    if (logicalTick % scenario.run.captureEvery === 0 || logicalTick === scenario.run.ticks) record(logicalTick);
  }
  checkExpectations(scenario, sim);
  return {
    id: scenario.id, description: scenario.description, seed: scenario.seed, hashes, summary: semanticSummary(sim),
    metrics: {
      ticks: scenario.run.ticks, maxSnapshotBytes, maxTotalEntities, maxWorkUnitsPerTick, peakEntities,
      timingAdvisoryMs: { p50: percentile(samples, .5), p95: percentile(samples, .95), p99: percentile(samples, .99), max: percentile(samples, 1) },
    },
  };
}

function assertBudget(result, budget) {
  for (const key of ["maxSnapshotBytes", "maxTotalEntities", "maxWorkUnitsPerTick"]) {
    if (result.metrics[key] > budget[key]) throw new Error(`${result.id}: ${key} ${result.metrics[key]} exceeds budget ${budget[key]}`);
  }
}

function stableResult(result) {
  return { id: result.id, seed: result.seed, hashes: result.hashes, summary: result.summary, baselineMetrics: { maxSnapshotBytes: result.metrics.maxSnapshotBytes, maxTotalEntities: result.metrics.maxTotalEntities, maxWorkUnitsPerTick: result.metrics.maxWorkUnitsPerTick } };
}

export function goldenDocument(results, manifest) {
  return { schema: "lastlight.fixture-goldens.v1", schemaVersion: 1, balance: manifest.balance, replay: manifest.replay, fixtures: results.map(stableResult) };
}

export function compareGoldens(results, expected) {
  exactKeys(expected, ["schema", "schemaVersion", "balance", "replay", "fixtures"], "goldens");
  if (expected.schema !== "lastlight.fixture-goldens.v1" || expected.schemaVersion !== 1) throw new TypeError("Unsupported fixture golden schema");
  if (expected.balance.version !== BALANCE_VERSION || expected.balance.hash !== BALANCE_HASH) throw new TypeError("Fixture golden balance mismatch");
  if (expected.replay.schema !== REPLAY_SCHEMA || expected.replay.stepHz !== REPLAY_STEP_HZ || expected.replay.rng !== RNG_ALGORITHM) throw new TypeError("Fixture golden replay mismatch");
  if (expected.fixtures.length !== results.length) throw new Error(`Fixture golden count mismatch: expected ${expected.fixtures.length}, ran ${results.length}`);
  for (const result of results) {
    const golden = expected.fixtures.find((entry) => entry.id === result.id);
    if (!golden) throw new Error(`${result.id}: missing golden fixture`);
    for (const actual of result.hashes) {
      const wanted = golden.hashes.find((point) => point.tick === actual.tick);
      if (!wanted) throw new Error(`${result.id}: missing golden at tick ${actual.tick}`);
      if (wanted.hash !== actual.hash) throw new Error(`${result.id}: first divergence at tick ${actual.tick}: expected ${wanted.hash}, got ${actual.hash}`);
    }
    if (JSON.stringify(golden.summary) !== JSON.stringify(result.summary)) throw new Error(`${result.id}: semantic summary diverged after the final checkpoint`);
  }
}

export function runFixtureSuite({ timing = true, repeatability = true } = {}) {
  const suite = loadFixtureSuite(), results = [];
  for (const scenario of suite.scenarios) {
    const result = runScenario(scenario, suite.manifest, { timing });
    assertBudget(result, suite.budgets[scenario.id]);
    if (repeatability) {
      const repeated = runScenario(scenario, suite.manifest, { timing: false });
      if (JSON.stringify(result.hashes) !== JSON.stringify(repeated.hashes)) throw new Error(`${scenario.id}: same-seed repeatability diverged`);
    }
    results.push(result);
  }
  return {
    schema: FIXTURE_REPORT_SCHEMA, schemaVersion: 1,
    versions: { balance: suite.manifest.balance, replay: suite.manifest.replay },
    status: "passed", generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, results,
  };
}

export function fixturePaths() {
  return { root: fileURLToPath(ROOT), goldens: fileURLToPath(new URL("expected/fixture-results.json", ROOT)) };
}
