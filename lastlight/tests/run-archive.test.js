import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RUN_SHARE_CHARS, RUN_ARCHIVE_STORAGE_VERSION, SQUAD_RUN_REPORT_SCHEMA,
  createSquadRunReport, decodeSquadRunFragment, decodeSquadRunShare, encodeSquadRunShare,
  normalizeRunArchiveStorage, squadRunShareFragment, upsertRunArchive, validateSquadRunReport,
} from "../run-archive.js";
import { canonicalStringify, fnv1a64 } from "../replay.js";
import { Simulation } from "../engine.js";

const SEED = "0123456789abcdef0123456789abcdef";

function run(overrides = {}) {
  return {
    seed: SEED, stage: "won", map: "warehouse", difficulty: "story", duration: 240,
    time: 240, bossElapsed: 18.5, level: 14, kills: 401, gold: 775,
    participationState: { slots: [
      { slot: 0, effectiveHealing: 25, effectiveShielding: 90, shieldDamagePrevented: 57, mitigationPrevented: 4, damageAssists: 8, controlAssists: 2, revives: 1, reviveTicks: 130, objectivePresenceTicks: 610, objectiveMovement: 440, objectiveCompletions: 1, eliteParticipations: 4, apexParticipations: 1 },
      { slot: 2, effectiveHealing: 0, effectiveShielding: 0, shieldDamagePrevented: 0, mitigationPrevented: 0, damageAssists: 4, controlAssists: 0, revives: 0, reviveTicks: 0, objectivePresenceTicks: 320, objectiveMovement: 210, objectiveCompletions: 1, eliteParticipations: 2, apexParticipations: 1 },
    ] },
    synergyState: { stats: [
      { slot: 0, triggers: 3, assists: 2, damage: 220, shielding: 90, mitigated: 14, formationTicks: 460, ultimateChains: 1 },
      { slot: 2, triggers: 1, assists: 3, damage: 80, shielding: 0, mitigated: 8, formationTicks: 300, ultimateChains: 1 },
    ] },
    players: [
      { id: "relay-a", replaySlot: 0, name: "Alpha", specialist: "zuri", joinKind: "initial", joinedAtTick: 0, catchUpRanks: 0, damage: 110_500, kills: 280, xpCollected: 4_100, damageTaken: 5.2, revives: 1, traveled: 42_500, weapons: { signature: { level: 5, evolved: true }, aura: { level: 3, evolved: false } }, passives: { haste: 5, maxHealth: 2 }, damageBySource: { signature: 90_000, aura: 20_500 } },
      { id: "relay-c", replaySlot: 2, name: "Bravo", specialist: "rift", joinKind: "fresh", joinedAtTick: 3_600, preApexDeployedTicks: 4_000, catchUpRanks: 7, damage: 60_250, kills: 121, xpCollected: 2_200, damageTaken: 8, revives: 0, traveled: 23_200, weapons: { signature: { level: 4, evolved: false }, ice: { level: 3, evolved: false } }, passives: { armor: 3 }, damageBySource: { signature: 45_000, ice: 15_250 } },
    ],
    ...overrides,
  };
}

test("terminal squad state becomes one immutable canonical report without transport identity", () => {
  const report = createSquadRunReport(run(), { build: "2026.07.13.11" });
  assert.equal(report.schema, "lastlight.squad-run-report.v4");
  assert.equal(Object.hasOwn(report, "seededOperation"), false);
  assert.match(report.id, /^ll-[0-9a-f]{8}-[0-9a-f]{8}$/);
  assert.equal(report.players[0].slot, 0); assert.equal(report.players[1].slot, 2);
  assert.equal(report.players[1].campaignEligible, true);
  assert.deepEqual(report.mutations, { packageId: "base-line", enabled: false, objectiveCompletions: 0, encounters: 0, clears: 0, failures: 0, surgeWaves: 0 });
  assert.deepEqual(report.totals, { damage: 170_750, kills: 401, xpCollected: 6_300, damageTaken: 13.2, revives: 1, distance: 65_700 });
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.players[0].weapons));
  assert.doesNotMatch(JSON.stringify(report), /relay-a|relay-c|0123456789abcdef|room|resumeToken|reconnect/i);
  assert.equal(validateSquadRunReport(report), report);
});

test("clients with different transient ids and local ordering converge on the same squad report identity", () => {
  const first = createSquadRunReport(run(), { build: "2026.07.13.11" });
  const secondRun = run({ players: run().players.map((player) => ({ ...player, id: `other-${player.replaySlot}` })).reverse() });
  const second = createSquadRunReport(secondRun, { build: "2026.07.13.11" });
  assert.equal(first.id, second.id); assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first, second);
  const different = createSquadRunReport(run({ seed: "fedcba9876543210fedcba9876543210" }), { build: "2026.07.13.11" });
  assert.notEqual(first.id, different.id);
});

test("an authoritative Simulation and its guest snapshot produce byte-equivalent reports", () => {
  const sim = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [
    { id: "host", name: "Host", specialist: "zuri", replaySlot: 0 },
    { id: "guest", name: "Guest", specialist: "echo", replaySlot: 1 },
  ] }, { seed: SEED });
  sim.stage = "won"; sim.time = 240; sim.bossElapsed = 12.34; sim.level = 9; sim.kills = 33; sim.gold = 101.27;
  sim.players[0].damage = 1234.56; sim.players[0].damageBySource.signature = 1234.56; sim.players[0].kills = 21;
  sim.players[1].damage = 654.32; sim.players[1].damageBySource.signature = 654.32; sim.players[1].kills = 12;
  const host = createSquadRunReport(sim, { build: "2026.07.13.11" });
  const guest = createSquadRunReport(sim.snapshot(), { build: "2026.07.13.11" });
  assert.deepEqual(guest, host);
});

test("anonymous sharing is the default and named sharing requires an explicit option", () => {
  const report = createSquadRunReport(run(), { build: "2026.07.13.11" });
  const anonymous = decodeSquadRunShare(encodeSquadRunShare(report));
  assert.equal(anonymous.mode, "anonymous");
  assert.deepEqual(anonymous.report.players.map(({ callsign }) => callsign), ["Specialist 1", "Specialist 3"]);
  assert.equal(anonymous.report.id, report.id, "redaction must preserve squad report identity");
  const named = decodeSquadRunShare(encodeSquadRunShare(report, { includeCallsigns: true }));
  assert.equal(named.mode, "named"); assert.deepEqual(named.report.players.map(({ callsign }) => callsign), ["Alpha", "Bravo"]);
  const fragment = squadRunShareFragment(report);
  assert.equal(decodeSquadRunFragment(fragment).report.id, report.id);
  assert.ok(fragment.length < MAX_RUN_SHARE_CHARS);
});

test("share payload validation rejects mutation, unknown private fields, invalid anonymous disclosure, and oversize input", () => {
  const report = createSquadRunReport(run(), { build: "2026.07.13.11" });
  const encoded = encodeSquadRunShare(report);
  const mutated = `${encoded.slice(0, -1)}${encoded.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decodeSquadRunShare(mutated), /payload|checksum|integrity/i);
  assert.throws(() => decodeSquadRunShare("A".repeat(MAX_RUN_SHARE_CHARS + 1)), /payload|large/i);
  assert.throws(() => validateSquadRunReport({ ...structuredClone(report), roomCode: "SECRET" }), /private|unsupported/i);
  const changed = structuredClone(report); changed.players[0].damage += 1;
  assert.throws(() => validateSquadRunReport(changed), /integrity|reconcile/i);
  const exposed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); exposed.report.players[0].callsign = "Alpha";
  exposed.checksum = fnv1a64(canonicalStringify({ schema: exposed.schema, mode: exposed.mode, report: exposed.report }));
  assert.throws(() => decodeSquadRunShare(Buffer.from(canonicalStringify(exposed)).toString("base64url")), /exposes callsigns/i);
});

test("v4 storage deduplicates canonical reports and isolates malformed entries", () => {
  const report = createSquadRunReport(run(), { build: "2026.07.13.11" });
  const first = upsertRunArchive([], report, "2026-07-13T16:30:00.000Z");
  const second = upsertRunArchive(first, report, "2026-07-13T16:31:00.000Z");
  assert.equal(second.length, 1); assert.equal(second[0].schemaVersion, RUN_ARCHIVE_STORAGE_VERSION);
  assert.equal(second[0].savedAt, "2026-07-13T16:31:00.000Z");
  const normalized = normalizeRunArchiveStorage([{ bad: true }, ...second, second[0]]);
  assert.equal(normalized.length, 1); assert.equal(normalized[0].report.id, report.id);
});

test("legacy v1/v2 local entries migrate to bounded current reports without blocking", () => {
  const legacy = { schemaVersion: 2, id: "old", finishedAt: "2026-07-12T12:00:00.000Z", won: true, map: "warehouse", difficulty: "story", elapsed: 244, level: 12, kills: 90, gold: 100, players: [{ name: "Old", specialist: "echo", damage: 500, kills: 90, xpCollected: 300, damageTaken: 2, revives: 0, traveled: 1_000 }] };
  const migrated = normalizeRunArchiveStorage([legacy]);
  assert.equal(migrated.length, 1); assert.equal(migrated[0].schemaVersion, RUN_ARCHIVE_STORAGE_VERSION); assert.equal(migrated[0].report.build, "legacy");
  assert.equal(migrated[0].report.players[0].callsign, "Old"); assert.equal(migrated[0].report.players[0].damage, 500);
});

test("signed v2 reports migrate to v5 with baseline mastery, empty discoveries, and no seeded operation", () => {
  const legacy = structuredClone(createSquadRunReport(run(), { build: "2026.07.13.14" }));
  legacy.schema = "lastlight.squad-run-report.v2";
  delete legacy.discoveries;
  delete legacy.seededOperation;
  for (const player of legacy.players) delete player.masteryStart;
  const identity = {
    schema: legacy.schema, build: legacy.build, runKey: legacy.runKey, outcome: legacy.outcome, map: legacy.map,
    difficulty: legacy.difficulty, elapsed: legacy.elapsed, level: legacy.level, squadKills: legacy.squadKills,
    gold: legacy.gold, mutations: legacy.mutations, players: legacy.players.map((player) => ({ ...player, callsign: "" })), totals: legacy.totals,
  };
  legacy.fingerprint = fnv1a64(canonicalStringify(identity));
  legacy.id = `ll-${legacy.runKey.slice(0, 8)}-${legacy.fingerprint.slice(0, 8)}`;
  const [entry] = normalizeRunArchiveStorage([{ schemaVersion: 4, savedAt: "2026-07-13T16:31:00.000Z", report: legacy }]);
  assert.equal(entry.report.schema, SQUAD_RUN_REPORT_SCHEMA);
  assert.ok(entry.report.players.every(({ masteryStart }) => masteryStart === "baseline"));
  assert.deepEqual(entry.report.discoveries, []);
  assert.equal(entry.report.seededOperation, null);
  assert.doesNotThrow(() => validateSquadRunReport(entry.report));
});

test("signed v4 reports migrate from v6 storage with explicit empty seeded evidence", () => {
  const legacy = structuredClone(createSquadRunReport(run(), { build: "2026.07.13.17" }));
  legacy.schema = "lastlight.squad-run-report.v4";
  delete legacy.seededOperation;
  const identity = {
    schema: legacy.schema, build: legacy.build, runKey: legacy.runKey, outcome: legacy.outcome, map: legacy.map,
    difficulty: legacy.difficulty, elapsed: legacy.elapsed, level: legacy.level, squadKills: legacy.squadKills,
    gold: legacy.gold, mutations: legacy.mutations, discoveries: legacy.discoveries,
    players: legacy.players.map((player) => ({ ...player, callsign: "" })), totals: legacy.totals,
  };
  legacy.fingerprint = fnv1a64(canonicalStringify(identity));
  legacy.id = `ll-${legacy.runKey.slice(0, 8)}-${legacy.fingerprint.slice(0, 8)}`;
  const [entry] = normalizeRunArchiveStorage([{ schemaVersion: 6, savedAt: "2026-07-13T22:59:21.000Z", report: legacy }]);
  assert.equal(entry.report.schema, SQUAD_RUN_REPORT_SCHEMA);
  assert.equal(entry.report.seededOperation, null);
  assert.doesNotThrow(() => validateSquadRunReport(entry.report));
});
