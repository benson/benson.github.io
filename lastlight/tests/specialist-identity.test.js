import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_CONFIG, BALANCE_IDS, BALANCE_VERSION } from "../balance-config.js";
import { SPECIALISTS } from "../data.js";
import {
  SPECIALIST_IDENTITY_CONTRACT, SPECIALIST_IDENTITY_VERSION,
  getSpecialistIdentity, getSpecialistIdentityManifest, validateSpecialistIdentityContract,
} from "../specialist-identity.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("the identity contract has a stable version and covers the exact roster", () => {
  assert.equal(SPECIALIST_IDENTITY_VERSION, "lastlight.specialist-identity.v1");
  assert.equal(SPECIALIST_IDENTITY_CONTRACT.balanceVersion, BALANCE_VERSION);
  assert.deepEqual(Object.keys(SPECIALIST_IDENTITY_CONTRACT.specialists), BALANCE_IDS.specialists);
  assert.deepEqual(getSpecialistIdentityManifest(), { identityVersion: SPECIALIST_IDENTITY_VERSION, balanceVersion: BALANCE_VERSION });
  assert.deepEqual(validateSpecialistIdentityContract(), []);
});

test("the contract and every identity are recursively immutable", () => {
  assert.equal(Object.isFrozen(SPECIALIST_IDENTITY_CONTRACT), true);
  for (const identity of Object.values(SPECIALIST_IDENTITY_CONTRACT.specialists)) {
    assert.equal(Object.isFrozen(identity), true);
    assert.equal(Object.isFrozen(identity.role), true);
    assert.equal(Object.isFrozen(identity.mobility.sources), true);
    assert.equal(Object.isFrozen(identity.failureModes[0]), true);
    assert.equal(Object.isFrozen(identity.breakpoints[0].trigger), true);
  }
  assert.throws(() => { SPECIALIST_IDENTITY_CONTRACT.specialists.zuri.range = "close"; }, TypeError);
});

test("baseline anchors stay aligned with balance, movement, and catalog mechanics", () => {
  for (const id of BALANCE_IDS.specialists) {
    const identity = SPECIALIST_IDENTITY_CONTRACT.specialists[id];
    const base = BALANCE_CONFIG.specialists[id];
    const movement = BALANCE_CONFIG.movement.specialists[id];
    assert.deepEqual(
      { health: identity.durability.baseHealth, armor: identity.durability.baseArmor, speed: identity.mobility.baseSpeed },
      { health: base.health, armor: base.armor, speed: base.speed },
    );
    assert.equal(identity.mobility.profile, movement.profile);
    assert.equal(identity.mobility.facing, movement.facing);
    assert.equal(identity.range, SPECIALISTS[id].range.toLowerCase());
    assert.equal(identity.breakpoints.find((value) => value.id === "signature-evolution").trigger.value, SPECIALISTS[id].signature.passive);
  }
});

test("every identity defines all dimensions and intended core breakpoints", () => {
  const dimensions = ["role", "range", "mobility", "durability", "damageShape", "scaling", "safety", "control", "support", "objectiveValue", "failureModes", "breakpoints"];
  for (const id of BALANCE_IDS.specialists) {
    const identity = SPECIALIST_IDENTITY_CONTRACT.specialists[id];
    for (const dimension of dimensions) assert.ok(dimension in identity, `${id}.${dimension}`);
    assert.ok(identity.failureModes.length >= 2, id);
    assert.ok(identity.objectiveValue.limits.includes("no-direct-objective-modifier"), id);
    const byId = Object.fromEntries(identity.breakpoints.map((value) => [value.id, value]));
    assert.deepEqual([byId["active-unlock"].trigger.value, byId["ultimate-unlock"].trigger.value, byId["signature-cap"].trigger.value], [3, 6, 5]);
    assert.match(byId["active-unlock"].effect, new RegExp(`\\(${BALANCE_CONFIG.specialists[id].cooldownE}s`));
    assert.match(byId["ultimate-unlock"].effect, new RegExp(`\\(${BALANCE_CONFIG.specialists[id].cooldownR}s`));
  }
});

test("specialist-specific engine gates are explicit", () => {
  const expected = {
    zuri: ["hot-streak", "kill-count", 70], fang: ["missing-health-maximum", "health-ratio", 0],
    gale: ["flow-ready", "flow", 100], rift: ["kinetic-pulse", "distance", 120],
    nova: ["spirit-gain", "player-level", 7], vesper: ["feather-recall", "stored-object", "feather"],
  };
  for (const [id, [breakpointId, kind, value]] of Object.entries(expected)) {
    const breakpoint = getSpecialistIdentity(id).breakpoints.find((entry) => entry.id === breakpointId);
    assert.deepEqual(breakpoint.trigger, { kind, value });
    assert.equal(breakpoint.source, "engine");
  }
});

test("strict validation rejects shape, vocabulary, and mechanics drift", () => {
  const cases = [
    ["unknown root key", (v) => { v.extra = true; }, /contract: expected keys/],
    ["missing specialist", (v) => { delete v.specialists.zuri; }, /specialists: expected ordered ids/],
    ["unknown specialist key", (v) => { v.specialists.zuri.marketing = "copy"; }, /specialists\.zuri: expected keys/],
    ["invalid role", (v) => { v.specialists.zuri.role.primary = "assassin"; }, /role\.primary: unsupported/],
    ["invalid cadence", (v) => { v.specialists.gale.damageShape.cadence = "sometimes"; }, /damageShape\.cadence: unsupported/],
    ["balance drift", (v) => { v.specialists.nova.durability.baseHealth = 10; }, /durability\.baseHealth: does not match/],
    ["movement drift", (v) => { v.specialists.rift.mobility.profile = "caster"; }, /mobility\.profile: does not match/],
    ["duplicate mechanic", (v) => { v.specialists.echo.support.tools.push(v.specialists.echo.support.tools[0]); }, /support\.tools: values must be unique/],
    ["missing failures", (v) => { v.specialists.sola.failureModes = []; }, /failureModes: at least two/],
    ["bad trigger", (v) => { v.specialists.gale.breakpoints[0].trigger.kind = "time"; }, /trigger\.kind: unsupported/],
    ["cooldown drift", (v) => { v.specialists.bront.breakpoints[0].effect = "Active unlocks (99s base cooldown)."; }, /active-unlock: must match/],
    ["evolution drift", (v) => { v.specialists.vesper.breakpoints[3].trigger.value = "haste"; }, /signature-evolution: must match/],
    ["objective overclaim", (v) => { v.specialists.fang.objectiveValue.limits.shift(); }, /must state no-direct-objective-modifier/],
    ["malformed tools", (v) => { v.specialists.echo.support.tools = null; }, /support\.tools: must be/],
    ["malformed breakpoint", (v) => { v.specialists.nova.breakpoints[0] = null; }, /breakpoints\.0: must be an object/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const candidate = clone(SPECIALIST_IDENTITY_CONTRACT); mutate(candidate);
    assert.ok(validateSpecialistIdentityContract(candidate).some((error) => pattern.test(error)), label);
  }
});

test("lookups reject unknown versions and ids", () => {
  assert.equal(getSpecialistIdentity("zuri"), SPECIALIST_IDENTITY_CONTRACT.specialists.zuri);
  assert.throws(() => getSpecialistIdentity("zuri", "v0"), /Unknown specialist identity version/);
  assert.throws(() => getSpecialistIdentity("missing"), /Unknown specialist/);
});
