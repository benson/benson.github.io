import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  CHALLENGE_ACHIEVEMENT_IDS, CHALLENGE_ACHIEVEMENT_REGISTRY, MAX_CHALLENGE_ACHIEVEMENT_CLAIMS,
  awardChallengeAchievements, challengeAchievementTelemetry, emptyChallengeAchievementState,
  evaluateChallengeAchievements, loadChallengeAchievementState, saveChallengeAchievementState,
  validateChallengeAchievementRegistry, validateChallengeAchievementState,
} from "../challenge-achievements.js";

const participation = (values = {}) => ({
  effectiveHealing: 0, effectiveShielding: 0, shieldDamagePrevented: 0, mitigationPrevented: 0,
  damageAssists: 0, controlAssists: 0, revives: 0, reviveTicks: 0, objectivePresenceTicks: 0,
  objectiveMovement: 0, objectiveCompletions: 0, eliteParticipations: 0, apexParticipations: 0, ...values,
});
const synergy = (values = {}) => ({ triggers: 0, assists: 0, damage: 0, shielding: 0, mitigated: 0, formationTicks: 0, ultimateChains: 0, ...values });
const player = (slot, values = {}) => ({
  slot, campaignEligible: true, damage: 30_000, damageTaken: 8, distance: 30_000,
  weapons: [{ id: "signature", level: 5, evolved: false }], passives: [],
  participation: participation(), synergy: synergy(), ...values,
});
const report = (values = {}) => ({
  schema: "lastlight.squad-run-report.v4", fingerprint: "0123456789abcdef", outcome: "won", difficulty: "extreme",
  discoveries: ["affix:hasted", "boon:squad-shield", "event:relay-ball"],
  mutations: { enabled: true, encounters: 3, clears: 3, failures: 0, surgeWaves: 3 },
  players: [
    player(0, { participation: participation({ effectiveHealing: 250, effectiveShielding: 300, objectiveCompletions: 2, eliteParticipations: 5, apexParticipations: 1 }), synergy: synergy({ triggers: 3, formationTicks: 700, ultimateChains: 1 }) }),
    player(1, { participation: participation({ revives: 3, objectiveCompletions: 1, apexParticipations: 1 }), synergy: synergy({ triggers: 2, ultimateChains: 1 }) }),
  ], ...values,
});

test("challenge registry is strict, immutable, bounded, and grants no gameplay power", () => {
  assert.equal(CHALLENGE_ACHIEVEMENT_IDS.length, 18);
  assert.deepEqual(validateChallengeAchievementRegistry(CHALLENGE_ACHIEVEMENT_REGISTRY), []);
  assert.ok(Object.isFrozen(CHALLENGE_ACHIEVEMENT_REGISTRY));
  assert.ok(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.every((item) => item.reward.gameplayPower === false));
  assert.ok(CHALLENGE_ACHIEVEMENT_REGISTRY.entries.every((item) => existsSync(new URL(`../${item.icon}`, import.meta.url))));
  const duplicate = structuredClone(CHALLENGE_ACHIEVEMENT_REGISTRY);
  duplicate.entries[1].id = duplicate.entries[0].id;
  assert.match(validateChallengeAchievementRegistry(duplicate).join(" "), /duplicate/);
});

test("terminal evaluation uses exact local and qualified squad evidence", () => {
  const completed = evaluateChallengeAchievements(report(), 0);
  for (const id of ["build:minimalist-victory", "build:signature-specialist", "survival:clean-extraction", "teamwork:field-medic", "teamwork:moving-screen", "teamwork:rescue-chain", "teamwork:resonant-squad", "operation:clean-sweep", "operation:breach-cascade", "operation:objective-discipline", "operation:apex-cohort", "discovery:signal-triad", "discovery:mixed-intel", "specialist:balanced-contribution", "specialist:priority-hunter"]) assert.ok(completed.includes(id), id);
  const imported = evaluateChallengeAchievements(report(), null);
  assert.ok(imported.includes("teamwork:rescue-chain"));
  assert.ok(!imported.includes("teamwork:field-medic"));
  const ineligible = report({ players: report().players.map((member) => ({ ...member, campaignEligible: false })) });
  assert.deepEqual(evaluateChallengeAchievements(ineligible, 0), []);
});

test("validated report awards are local, idempotent, and bounded", () => {
  const first = awardChallengeAchievements(emptyChallengeAchievementState(), report(), 0);
  assert.ok(first.award.completed.length > 10);
  const repeated = awardChallengeAchievements(first.state, report(), 0);
  assert.equal(repeated.award, null);
  assert.deepEqual(repeated.state, first.state);
  let state = first.state;
  for (let index = 0; index < MAX_CHALLENGE_ACHIEVEMENT_CLAIMS + 5; index++) state = awardChallengeAchievements(state, report({ fingerprint: index.toString(16).padStart(16, "0") }), null).state;
  assert.equal(state.appliedClaims.length, MAX_CHALLENGE_ACHIEVEMENT_CLAIMS);
});

test("storage isolates malformed identity-like data and telemetry remains aggregate-only", () => {
  const entries = new Map([["lastlight:challenge-achievements:v1", JSON.stringify({ completed: ["build:minimalist-victory", "unknown"], room: "PRIVATE", appliedClaims: ["bad"] })]]);
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const loaded = loadChallengeAchievementState(storage);
  assert.deepEqual(loaded.completed, ["build:minimalist-victory"]);
  const saved = saveChallengeAchievementState(storage, loaded);
  assert.equal(validateChallengeAchievementState(saved), true);
  assert.doesNotMatch(entries.get("lastlight:challenge-achievements:v1"), /PRIVATE|room|callsign|seed|token/i);
  const aggregate = challengeAchievementTelemetry(saved, ["build:minimalist-victory"]);
  assert.deepEqual(aggregate, { completedCount: 1, newlyCompletedCount: 1, categories: { build: 1, survival: 0, teamwork: 0, operation: 0, discovery: 0, specialist: 0 } });
  assert.doesNotMatch(JSON.stringify(aggregate), /minimalist|fingerprint|slot/i);
});

test("malformed or unsigned terminal evidence fails closed", () => {
  assert.throws(() => awardChallengeAchievements(emptyChallengeAchievementState(), report({ fingerprint: "bad" }), 0), /terminal challenge evidence/);
  assert.throws(() => evaluateChallengeAchievements(report({ mutations: { enabled: true, encounters: 2, clears: 2, failures: 1, surgeWaves: 0 } }), 0), /mutation evidence/);
});
