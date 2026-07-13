import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MASTERY_RUN_CLAIMS, SPECIALIST_MASTERY, SPECIALIST_MASTERY_IDS, awardSpecialistMastery,
  emptySpecialistMasteryState, loadSpecialistMasteryState, masteryLevel, normalizeSpecialistMasteryState, saveSpecialistMasteryState, selectMasteryStart,
  validateSpecialistMasteryRegistry, validateSpecialistMasteryState,
} from "../specialist-mastery.js";
import { createSquadRunReport } from "../run-archive.js";
import { Simulation } from "../engine.js";
import { DEFAULT_RUNTIME_CONFIG, gameplayFeatureContract } from "../feature-config.js";

function terminal({ specialist = "zuri", slot = 0, difficulty = "story", outcome = "won", player = {}, mutations = null } = {}) {
  const game = {
    seed: "0123456789abcdef0123456789abcdef", stage: outcome, map: "warehouse", difficulty, duration: 240, time: 240, bossElapsed: 0,
    level: 12, kills: 300, gold: 100,
    mutationState: mutations || { packageId: difficulty === "story" ? "base-line" : difficulty === "hard" ? "contested-operations" : "breach-cascade", enabled: difficulty !== "story", objectiveCompletions: 0, encounterSequence: 0, resolvedEncounters: 0, triggeredSurgeWaves: [] },
    participationState: { slots: [{ slot, effectiveHealing: 0, effectiveShielding: 0, shieldDamagePrevented: 0, mitigationPrevented: 0, damageAssists: 0, controlAssists: 0, revives: 0, reviveTicks: 0, objectivePresenceTicks: 0, objectiveMovement: 0, objectiveCompletions: 0, eliteParticipations: 0, apexParticipations: 0 }] },
    synergyState: { stats: [] },
    players: [{ id: "private", replaySlot: slot, name: "Rookie", specialist, damage: 80_000, kills: 300, xpCollected: 4_000, damageTaken: 0, revives: 0, traveled: 30_000, weapons: { signature: { level: 1, evolved: false } }, passives: {}, ...player }],
  };
  return createSquadRunReport(game, { build: "2026.07.13.15" });
}

test("mastery registry strictly covers nine immutable tracks, challenges, sidegrades, and unlocks", () => {
  assert.deepEqual(validateSpecialistMasteryRegistry(SPECIALIST_MASTERY), []);
  assert.deepEqual(Object.keys(SPECIALIST_MASTERY.tracks), SPECIALIST_MASTERY_IDS);
  assert.ok(Object.isFrozen(SPECIALIST_MASTERY) && Object.isFrozen(SPECIALIST_MASTERY.tracks.zuri.starts.fieldKit));
  assert.equal(SPECIALIST_MASTERY.tracks.zuri.starts.fieldKit.vitalityMultiplier, .9);
  const changed = structuredClone(SPECIALIST_MASTERY); changed.tracks.echo.challenge.id = changed.tracks.zuri.challenge.id;
  assert.match(validateSpecialistMasteryRegistry(changed).join(" "), /duplicate/);
});

test("mastery state is exact, bounded, normalizable, and gates alternate starts", () => {
  const empty = emptySpecialistMasteryState();
  assert.equal(validateSpecialistMasteryState(empty), true);
  assert.deepEqual([0, 119, 120, 300, 600, 1_000].map(masteryLevel), [1, 1, 2, 3, 4, 5]);
  assert.throws(() => selectMasteryStart(empty, "zuri", "field-kit"), /locked/);
  const normalized = normalizeSpecialistMasteryState({ tracks: { zuri: { points: 300, completedChallenges: ["zuri-overclock"], selectedStart: "field-kit" } }, appliedClaims: ["a".repeat(16), "a".repeat(16), "private"] });
  assert.equal(validateSpecialistMasteryState(normalized), true);
  assert.equal(normalized.tracks.zuri.level, 3); assert.deepEqual(normalized.appliedClaims, ["a".repeat(16)]);
  assert.equal(selectMasteryStart(normalized, "zuri", "field-kit").tracks.zuri.selectedStart, "field-kit");
});

test("validated terminal reports award exact points, challenges, unlocks, and deduplicate per anonymous slot", () => {
  const report = terminal();
  const first = awardSpecialistMastery(emptySpecialistMasteryState(), report, 0);
  assert.deepEqual(first.award, { specialist: "zuri", points: 85, beforeLevel: 1, level: 1, challenge: "zuri-overclock", unlocked: [] });
  assert.equal(first.state.tracks.zuri.points, 85);
  assert.equal(awardSpecialistMastery(first.state, report, 0).award, null);
  const second = awardSpecialistMastery(first.state, terminal({ difficulty: "extreme", player: { damage: 1 } }), 0);
  assert.equal(second.award.points, 90); assert.equal(second.award.level, 2); assert.equal(second.award.challenge, null);
  assert.deepEqual(second.award.unlocked, [{ level: 2, kind: "cosmetic", id: "zuri-overclock-signal" }]);
  assert.doesNotMatch(JSON.stringify(second.state), /Rookie|private|0123456789abcdef|ll-/);
});

test("fresh late joiners without campaign eligibility cannot earn mastery and claims remain bounded", () => {
  const report = terminal({ player: { joinKind: "fresh", preApexDeployedTicks: 1 } });
  assert.equal(awardSpecialistMastery(emptySpecialistMasteryState(), report, 0).award, null);
  const malformed = emptySpecialistMasteryState(); malformed.appliedClaims = Array.from({ length: MAX_MASTERY_RUN_CLAIMS + 1 }, (_, index) => index.toString(16).padStart(16, "0"));
  assert.equal(validateSpecialistMasteryState(malformed), false);
});

test("field kits are deterministic sidegrades and flag-off runs preserve the baseline player shape", () => {
  const features = gameplayFeatureContract(DEFAULT_RUNTIME_CONFIG);
  const player = { id: "p", name: "P", specialist: "zuri", replaySlot: 0, masteryStart: "field-kit" };
  const fieldKit = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [player], features }, { seed: "0123456789abcdef0123456789abcdef", features });
  assert.equal(fieldKit.players[0].masteryStart, "field-kit");
  assert.equal(fieldKit.players[0].passives.haste, 1);
  assert.equal(fieldKit.players[0].maxHp, 9);
  const recovered = Simulation.fromRecoveryState(fieldKit.exportRecoveryState());
  assert.equal(recovered.players[0].masteryStart, "field-kit");
  assert.deepEqual(recovered.players[0].passives, fieldKit.players[0].passives);

  const disabled = { ...features, specialistMastery: false };
  const baseline = new Simulation({ map: "warehouse", difficulty: "story", duration: 240, players: [player], features: disabled }, { seed: "0123456789abcdef0123456789abcdef", features: disabled });
  assert.equal(baseline.players[0].masteryStart, "baseline");
  assert.equal(baseline.players[0].passives.haste, undefined);
  assert.equal(baseline.players[0].maxHp, 10);
});

test("mastery storage normalizes malformed legacy data without retaining identity", () => {
  const entries = new Map([["lastlight:mastery:v1", JSON.stringify({ tracks: { zuri: { points: 300, selectedStart: "field-kit" } }, callsign: "Private" })]]);
  const storage = { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) };
  const loaded = loadSpecialistMasteryState(storage);
  assert.equal(loaded.tracks.zuri.level, 3); assert.equal(loaded.tracks.zuri.selectedStart, "field-kit");
  const saved = saveSpecialistMasteryState(storage, loaded);
  assert.equal(validateSpecialistMasteryState(saved), true);
  assert.doesNotMatch(entries.get("lastlight:mastery:v1"), /Private|callsign|room|token/i);
});
