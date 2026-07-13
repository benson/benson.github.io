import test from "node:test";
import assert from "node:assert/strict";
import { SeededRng } from "../rng.js";
import {
  ELITE_AFFIXES,
  ELITE_AFFIX_IDS,
  ENEMY_ARCHETYPES,
  ENEMY_ARCHETYPE_IDS,
  ENEMY_IDENTITY_CONTRACT,
  ENEMY_SPAWN_PHASES,
  MAX_ELITE_AFFIXES,
  codePointCompare,
  createEliteAffixState,
  createEnemyBehaviorState,
  eliteAffixEligibility,
  selectEliteAffixes,
  selectSpawnArchetype,
  spawnPhaseAt,
  validateEnemyIdentityContract,
  validateSpawnPhases,
} from "../enemy-archetypes.js";

const SEED = "0123456789abcdef0123456789abcdef";

test("the frozen identity contract exactly covers six behaviorally distinct archetypes", () => {
  assert.deepEqual(Object.keys(ENEMY_ARCHETYPES), [...ENEMY_ARCHETYPE_IDS]);
  assert.deepEqual(validateEnemyIdentityContract(), []);
  assert.equal(Object.isFrozen(ENEMY_ARCHETYPES), true);
  assert.equal(Object.isFrozen(ENEMY_ARCHETYPES.hound), true);
  assert.equal(Object.isFrozen(ENEMY_IDENTITY_CONTRACT.elite.affixes.volatile.excludes), true);
  assert.equal(new Set(Object.values(ENEMY_ARCHETYPES).map(({ handler }) => handler)).size, 6);
  assert.deepEqual(Object.keys(ELITE_AFFIXES).sort(codePointCompare), [...ELITE_AFFIX_IDS].sort(codePointCompare));
  assert.equal(MAX_ELITE_AFFIXES, 1);
});

test("spawn phases use explicit complete weights and preserve late-wave brute coverage", () => {
  assert.deepEqual(validateSpawnPhases(), []);
  assert.equal(spawnPhaseAt(0).after, 0);
  assert.equal(spawnPhaseAt(0.519).after, 0.34);
  assert.equal(spawnPhaseAt(0.52).after, 0.52);
  assert.equal(spawnPhaseAt(1).after, 0.68);
  assert.equal(ENEMY_SPAWN_PHASES.at(-1).weights.brute, 12);

  const invalid = structuredClone(ENEMY_SPAWN_PHASES);
  invalid[1].weights.mite = 61;
  assert.match(validateSpawnPhases(invalid).join("\n"), /must total 100/);
  invalid[1].weights.ghost = 1;
  assert.match(validateSpawnPhases(invalid).join("\n"), /unknown archetype/);
});

test("spawn selection is stable, sorted by code point, and consumes one bounded integer decision", () => {
  const calls = [];
  const rng = { int(maximum) { calls.push(maximum); return 70; } };
  assert.equal(selectSpawnArchetype(rng, 0.9), "mite");
  assert.deepEqual(calls, [100]);

  const left = SeededRng.fromHex(SEED).fork("spawn"), right = SeededRng.fromHex(SEED).fork("spawn");
  assert.deepEqual(
    Array.from({ length: 20 }, () => selectSpawnArchetype(left, 0.9)),
    Array.from({ length: 20 }, () => selectSpawnArchetype(right, 0.9)),
  );
});

test("only scheduled regular elites are eligible and volatile excludes bombers", () => {
  const regular = { spawnContext: "scheduled-elite", elite: true, archetypeId: "hound", eventType: "", miniboss: false, boss: false };
  for (const id of ELITE_AFFIX_IDS) assert.equal(eliteAffixEligibility(regular, id).eligible, true, id);
  assert.deepEqual(eliteAffixEligibility({ ...regular, archetypeId: "bomber" }, "volatile"), { eligible: false, reason: "incompatible-archetype" });
  assert.equal(eliteAffixEligibility({ ...regular, eventType: "treasure" }, "hasted").reason, "event-enemy");
  assert.equal(eliteAffixEligibility({ ...regular, miniboss: true }, "shielded").reason, "miniboss");
  assert.equal(eliteAffixEligibility({ ...regular, boss: true }, "shielded").reason, "boss");
  assert.equal(eliteAffixEligibility({ ...regular, spawnContext: "fixture" }, "shielded").reason, "not-scheduled-elite");
});

test("affix assignment forks by enemy id without advancing the supplied root", () => {
  const context = { spawnContext: "scheduled-elite", elite: true, archetypeId: "hound", eventType: "", miniboss: false, boss: false };
  const root = SeededRng.fromHex(SEED).fork("affix-root"), before = root.snapshot();
  const first = selectEliteAffixes({ rng: root.fork("m42"), context });
  const again = selectEliteAffixes({ rng: root.fork("m42"), context });
  assert.deepEqual(first, again);
  assert.equal(first.length, 1);
  assert.ok(ELITE_AFFIX_IDS.includes(first[0]));
  assert.deepEqual(root.snapshot(), before);
  assert.equal(Object.isFrozen(first), true);

  const bomberDefinitions = structuredClone(ELITE_AFFIXES);
  bomberDefinitions.hasted.weight = 0;
  assert.throws(() => selectEliteAffixes({ rng: root.fork("b1"), context: { ...context, archetypeId: "bomber" }, definitions: bomberDefinitions }), /must be a positive|total 100/i);
  assert.deepEqual(selectEliteAffixes({ rng: root.fork("event"), context: { ...context, eventType: "treasure" } }), []);
});

test("plain behavior and affix state factories are bounded, canonical, and frozen", () => {
  assert.deepEqual(createEnemyBehaviorState(90), {
    behaviorState: "approach", behaviorStartedTick: 90, behaviorUntilTick: 90,
    abilityReadyTick: 90, actionSequence: 0, attackAngle: 0, behaviorHitIds: [],
  });
  const affixes = createEliteAffixState(["shielded"], 100);
  assert.deepEqual(affixes, { shield: 35 });
  assert.equal(Object.isFrozen(affixes), true);
  assert.throws(() => createEnemyBehaviorState(-1), /non-negative/);
  assert.throws(() => createEliteAffixState(["hasted", "shielded"]), /invalid/);
  assert.throws(() => createEliteAffixState(["unknown"]), /invalid/);
});
