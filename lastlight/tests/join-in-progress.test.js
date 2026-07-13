import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG } from "../balance-config.js";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import {
  JOIN_IN_PROGRESS_REGISTRY, JOIN_IN_PROGRESS_SCHEMA, JOIN_PACKAGE_IDS, JOIN_PACKAGE_SCHEMA, JOIN_PACKAGE_STATES,
  applyJoinPackageToLoadout, campaignJoinEligibility, catchUpRankCount, generateJoinPackage,
  joinPackageUpgradeIds, transitionJoinPackage, validateJoinInProgressRegistry, validateJoinPackage,
} from "../join-in-progress.js";

const request = (fields = {}) => ({ slot: 0, specialistId: "zuri", squadLevel: 20, packageId: "signature", ...fields });
const rankTotal = (value) => value.grants.reduce((sum, grant) => sum + grant.ranks, 0);
const reverseRecord = (value) => Object.fromEntries(Object.entries(value).reverse());

test("strict v1 registry freezes package identities, lifecycle, caps, and eligibility policy", () => {
  assert.equal(JOIN_IN_PROGRESS_SCHEMA, "lastlight.join-in-progress.v1");
  assert.equal(JOIN_PACKAGE_SCHEMA, "lastlight.join-package.v1");
  assert.deepEqual(JOIN_PACKAGE_IDS, ["signature", "assault", "survival"]);
  assert.deepEqual(JOIN_PACKAGE_STATES, ["offered", "selected", "applied"]);
  assert.equal(validateJoinInProgressRegistry(), JOIN_IN_PROGRESS_REGISTRY);
  assert.ok(Object.isFrozen(JOIN_IN_PROGRESS_REGISTRY.packages.assault));
  assert.deepEqual(JOIN_IN_PROGRESS_REGISTRY.campaignEligibility, { maximumRequiredSeconds: 120, preApexCombatRatio: 0.25, tickRate: 60 });
  assert.equal(JOIN_IN_PROGRESS_REGISTRY.caps.weaponLevel, BALANCE_CONFIG.core.maxWeaponLevel);
  assert.throws(() => validateJoinInProgressRegistry({ ...JOIN_IN_PROGRESS_REGISTRY, extra: true }), /unexpected fields/);
  assert.throws(() => validateJoinInProgressRegistry({ ...JOIN_IN_PROGRESS_REGISTRY, selection: { ...JOIN_IN_PROGRESS_REGISTRY.selection, randomness: true } }), /contract mismatch/);
});

test("catch-up ranks are exactly max zero squad level minus two at boundary levels", () => {
  assert.deepEqual([1, 2, 3, 10, 20].map(catchUpRankCount), [0, 0, 1, 8, 18]);
  assert.throws(() => catchUpRankCount(0), /squadLevel/);
  assert.throws(() => catchUpRankCount(2.5), /squadLevel/);
  assert.throws(() => catchUpRankCount(JOIN_IN_PROGRESS_REGISTRY.caps.maxSquadLevel + 1), /squadLevel/);
});

test("all nine specialists receive exact, bounded packages without RNG, evolutions, economy, XP, or stats", () => {
  assert.equal(Object.keys(SPECIALISTS).length, 9);
  for (const specialistId of Object.keys(SPECIALISTS)) for (const packageId of JOIN_PACKAGE_IDS) for (const squadLevel of [1, 2, 3, 10, 20]) {
    const value = generateJoinPackage({ slot: 3, specialistId, squadLevel, packageId });
    assert.equal(validateJoinPackage(value), value);
    assert.equal(value.catchUpRanks, Math.max(0, squadLevel - 2));
    assert.equal(rankTotal(value), value.catchUpRanks);
    assert.ok(value.grants.filter(({ kind }) => kind === "weapon").length <= BALANCE_CONFIG.core.maxWeaponSlots);
    assert.ok(value.grants.filter(({ kind }) => kind === "passive").length <= BALANCE_CONFIG.core.maxPassiveSlots);
    assert.ok(value.grants.every((grant) => grant.kind === "passive" ? grant.ranks <= PASSIVES[grant.id].max : grant.ranks <= (grant.id === "signature" ? BALANCE_CONFIG.core.maxWeaponLevel - 1 : BALANCE_CONFIG.core.maxWeaponLevel)));
    assert.deepEqual(Object.keys(value), ["schema", "registryVersion", "slot", "specialistId", "squadLevel", "packageId", "state", "catchUpRanks", "grants"]);
    assert.ok(value.grants.every((grant) => Object.keys(grant).join(",") === "kind,id,ranks"));
    assert.doesNotMatch(JSON.stringify(value), /evolved|gold|currency|experience|callsign|client|room|token|seed|random/i);
  }
});

test("catalog insertion order cannot affect grants and stable IDs resolve every fallback tie", () => {
  const sources = { specialists: reverseRecord(SPECIALISTS), weapons: reverseRecord(WEAPONS), passives: reverseRecord(PASSIVES), balance: BALANCE_CONFIG };
  for (const specialistId of Object.keys(SPECIALISTS)) for (const packageId of JOIN_PACKAGE_IDS) {
    const ordinary = generateJoinPackage(request({ specialistId, packageId }));
    const reversed = generateJoinPackage(request({ specialistId, packageId }), sources);
    assert.deepEqual(reversed, ordinary);
    assert.deepEqual(ordinary.grants, [...ordinary.grants].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)));
  }
});

test("signature packages prioritize the correct specialist pairing while presets stay distinct", () => {
  for (const specialistId of Object.keys(SPECIALISTS)) {
    const value = generateJoinPackage(request({ specialistId, squadLevel: 4 }));
    assert.deepEqual([...joinPackageUpgradeIds(value)].sort(), [`passive:${SPECIALISTS[specialistId].signature.passive}`, "weapon:signature"].sort());
  }
  const outputs = JOIN_PACKAGE_IDS.map((packageId) => JSON.stringify(generateJoinPackage(request({ packageId, squadLevel: 10 })).grants));
  assert.equal(new Set(outputs).size, JOIN_PACKAGE_IDS.length);
});

test("package lifecycle is one-way and malformed or noncanonical grants are rejected", () => {
  const offered = generateJoinPackage(request({ squadLevel: 10 }));
  const selected = transitionJoinPackage(offered, "selected"), applied = transitionJoinPackage(selected, "applied");
  assert.equal(validateJoinPackage(selected, { expectedState: "selected" }), selected);
  assert.equal(applied.state, "applied");
  assert.throws(() => transitionJoinPackage(offered, "applied"), /transition/);
  assert.throws(() => transitionJoinPackage(applied, "selected"), /transition/);
  for (const malformed of [
    { ...offered, name: "Rookie" },
    { ...offered, packageId: "custom" },
    { ...offered, catchUpRanks: offered.catchUpRanks + 1 },
    { ...offered, grants: [...offered.grants].reverse() },
    { ...offered, grants: offered.grants.map((grant, index) => index ? grant : { ...grant, ranks: grant.ranks + 1 }) },
  ]) assert.throws(() => validateJoinPackage(malformed), /package|grant|rank|canonical|contract/i);
});

test("loadout application is pure, rank-exact, cap-safe, and never evolves a weapon", () => {
  const initial = { weapons: { signature: { level: 1, evolved: false } }, passives: {} };
  for (const packageId of JOIN_PACKAGE_IDS) {
    const value = generateJoinPackage(request({ packageId })), before = structuredClone(initial);
    const result = applyJoinPackageToLoadout(initial, value);
    assert.deepEqual(initial, before);
    assert.ok(Object.values(result.weapons).every(({ level, evolved }) => level <= BALANCE_CONFIG.core.maxWeaponLevel && evolved === false));
    assert.ok(Object.entries(result.passives).every(([id, level]) => level <= PASSIVES[id].max));
    const resultingRanks = Object.values(result.weapons).reduce((sum, weapon) => sum + weapon.level, 0) - 1 + Object.values(result.passives).reduce((sum, level) => sum + level, 0);
    assert.equal(resultingRanks, value.catchUpRanks);
  }
  const assault = generateJoinPackage(request({ packageId: "assault", squadLevel: 20 }));
  assert.throws(() => applyJoinPackageToLoadout({ weapons: { signature: { level: 5, evolved: false } }, passives: {} }, assault), /rank cap/);
  assert.throws(() => applyJoinPackageToLoadout({ weapons: { signature: { level: 1, evolved: true } }, passives: {} }, assault), /evolved/);
});

test("the maximum accepted squad level fills every legal rank without crossing a slot or item cap", () => {
  for (const packageId of JOIN_PACKAGE_IDS) {
    const value = generateJoinPackage(request({ packageId, squadLevel: JOIN_IN_PROGRESS_REGISTRY.caps.maxSquadLevel }));
    const result = applyJoinPackageToLoadout({ weapons: { signature: { level: 1, evolved: false } }, passives: {} }, value);
    assert.equal(value.catchUpRanks, JOIN_IN_PROGRESS_REGISTRY.caps.maxCatchUpRanks);
    assert.equal(rankTotal(value), JOIN_IN_PROGRESS_REGISTRY.caps.maxCatchUpRanks);
    assert.equal(Object.keys(result.weapons).length, BALANCE_CONFIG.core.maxWeaponSlots);
    assert.equal(Object.keys(result.passives).length, BALANCE_CONFIG.core.maxPassiveSlots);
    assert.ok(Object.values(result.weapons).every(({ level }) => level === BALANCE_CONFIG.core.maxWeaponLevel));
    assert.ok(Object.entries(result.passives).every(([id, level]) => level === PASSIVES[id].max));
  }
});

test("campaign eligibility requires min of 120 seconds or 25 percent of pre-apex combat", () => {
  assert.deepEqual(campaignJoinEligibility({ activeCombatTicks: 0, preApexCombatTicks: 0 }), {
    eligible: false, activeCombatTicks: 0, preApexCombatTicks: 0, requiredCombatTicks: 0, requiredCombatSeconds: 0,
  });
  const short = campaignJoinEligibility({ activeCombatTicks: 1_799, preApexCombatTicks: 7_200 });
  assert.equal(short.requiredCombatSeconds, 30); assert.equal(short.eligible, false);
  assert.equal(campaignJoinEligibility({ activeCombatTicks: 1_800, preApexCombatTicks: 7_200 }).eligible, true);
  const long = campaignJoinEligibility({ activeCombatTicks: 7_199, preApexCombatTicks: 60_000 });
  assert.equal(long.requiredCombatSeconds, 120); assert.equal(long.eligible, false);
  assert.equal(campaignJoinEligibility({ activeCombatTicks: 7_200, preApexCombatTicks: 60_000 }).eligible, true);
  const odd = campaignJoinEligibility({ activeCombatTicks: 1, preApexCombatTicks: 3, tickRate: 1 });
  assert.equal(odd.requiredCombatTicks, 1); assert.equal(odd.eligible, true);
  assert.throws(() => campaignJoinEligibility({ activeCombatTicks: 11, preApexCombatTicks: 10 }), /cannot exceed/);
  assert.throws(() => campaignJoinEligibility({ activeCombatTicks: -1, preApexCombatTicks: 10 }), /activeCombatTicks/);
});
