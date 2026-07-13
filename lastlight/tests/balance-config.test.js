import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE_CONFIG, BALANCE_HASH, BALANCE_IDS, BALANCE_VERSION,
  balanceFingerprint, canonicalBalanceData, getBalanceConfig, getBalanceManifest,
  validateBalanceConfig, valueAtLevel,
} from "../balance-config.js";
import { DIFFICULTIES, ENEMY_TYPES, PASSIVES, SPECIALISTS, WAVE_NAMES, WEAPONS } from "../data.js";
import { Simulation } from "../engine.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("the canonical movement contract has an explicit stable replay identity", () => {
  assert.equal(BALANCE_VERSION, "2026.07.13-director.1");
  assert.equal(BALANCE_HASH, "fnv1a32:fae5ab46");
  assert.equal(balanceFingerprint(BALANCE_CONFIG), BALANCE_HASH);
  assert.deepEqual(getBalanceManifest(), { balanceVersion: BALANCE_VERSION, balanceHash: BALANCE_HASH });
  assert.match(canonicalBalanceData(), /^\{"apex":/);
  assert.equal(getBalanceConfig(), BALANCE_CONFIG);
  assert.throws(() => getBalanceConfig("missing"), /Unknown balance version/);
});

test("canonical fingerprints ignore object insertion order but detect tuning changes", () => {
  const reordered = Object.fromEntries(Object.entries(clone(BALANCE_CONFIG)).reverse());
  assert.equal(balanceFingerprint(reordered), BALANCE_HASH);
  reordered.enemies.mite.health++;
  assert.notEqual(balanceFingerprint(reordered), BALANCE_HASH);
});

test("the balance object is recursively immutable", () => {
  assert.equal(Object.isFrozen(BALANCE_CONFIG), true);
  assert.equal(Object.isFrozen(BALANCE_CONFIG.enemyIdentity.spawnPhases), true);
  assert.equal(Object.isFrozen(BALANCE_CONFIG.synergies.movingScreen), true);
  assert.equal(Object.isFrozen(BALANCE_CONFIG.weapons.universal.drone), true);
  assert.throws(() => { BALANCE_CONFIG.enemies.mite.health = 1; }, TypeError);
});

test("validation exhaustively covers every authored balance id", () => {
  assert.deepEqual(validateBalanceConfig(), []);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.specialists), [...BALANCE_IDS.specialists]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.passives), [...BALANCE_IDS.passives]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.shields), [...BALANCE_IDS.shieldAbilities]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.difficulties), [...BALANCE_IDS.difficulties]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.enemies), [...BALANCE_IDS.enemies]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.weapons.signatures), [...BALANCE_IDS.specialists]);
  assert.deepEqual(Object.keys(BALANCE_CONFIG.weapons.universal), [...BALANCE_IDS.universalWeapons]);
  assert.deepEqual(BALANCE_IDS.synergies, ["breach-window", "ultimate-resonance", "moving-screen"]);

  const invalid = clone(BALANCE_CONFIG);
  delete invalid.enemies.mite;
  invalid.specialists.zuri.health = -1;
  invalid.difficulties.story.spawn = 0;
  invalid.shields.echoE.capMaxHealth = 0;
  invalid.enemyIdentity.spawnPhases[0].weights = { unknown: 100 };
  invalid.weapons.universal.uwu.damageBase = Number.NaN;
  invalid.synergies.movingScreen.directDamageMultiplier = 1;
  const errors = validateBalanceConfig(invalid);
  assert.ok(errors.some((error) => error.startsWith("enemies: expected")));
  assert.ok(errors.includes("specialists.zuri.health: must be > 0"));
  assert.ok(errors.includes("difficulties.story.spawn: must be > 0"));
  assert.ok(errors.includes("shields.echoE.capMaxHealth: must be > 0"));
  assert.ok(errors.includes("enemyIdentity.spawnPhases.0.weights.unknown: unknown archetype"));
  assert.ok(errors.includes("weapons.universal.uwu.damageBase: must be finite"));
  assert.ok(errors.includes("synergies.movingScreen.directDamageMultiplier: must be < 1"));
});

test("catalog data is a lossless view of the baseline contract", () => {
  for (const id of BALANCE_IDS.specialists) {
    const expected = BALANCE_CONFIG.specialists[id];
    assert.deepEqual(
      { health: SPECIALISTS[id].health, armor: SPECIALISTS[id].armor, speed: SPECIALISTS[id].speed, cooldownE: SPECIALISTS[id].cooldownE, cooldownR: SPECIALISTS[id].cooldownR },
      expected,
    );
  }
  for (const id of BALANCE_IDS.passives) assert.equal(PASSIVES[id].max, BALANCE_CONFIG.passives[id].max);
  for (const id of BALANCE_IDS.universalWeapons) assert.equal(WEAPONS[id].max, BALANCE_CONFIG.core.maxWeaponLevel);
  for (const id of BALANCE_IDS.difficulties) {
    for (const key of ["health", "attack", "spell", "gold", "spawn", "passiveRegen"]) assert.equal(DIFFICULTIES[id][key], BALANCE_CONFIG.difficulties[id][key]);
  }
  for (const id of BALANCE_IDS.enemies) {
    for (const key of ["radius", "health", "speed", "damage", "xp"]) assert.equal(ENEMY_TYPES[id][key], BALANCE_CONFIG.enemies[id][key]);
  }
  assert.deepEqual(WAVE_NAMES, BALANCE_CONFIG.waves.names);
});

test("versioned pacing and combat scalars match the authored identity release", () => {
  assert.deepEqual(BALANCE_CONFIG.difficulties, {
    story: { health: 1.2, attack: 1.3, spell: 1.2, gold: 1, spawn: 0.98, passiveRegen: 0.015 },
    hard: { health: 3, attack: 2, spell: 1.5, gold: 1.5, spawn: 1.35, passiveRegen: 0 },
    extreme: { health: 7, attack: 3, spell: 2, gold: 2.25, spawn: 1.68, passiveRegen: 0 },
  });
  assert.deepEqual(BALANCE_CONFIG.enemyIdentity.spawnPhases.at(-1), {
    after: 0.68, weights: { mite: 25, hound: 25, spitter: 20, brute: 12, bomber: 18 },
  });
  assert.deepEqual(BALANCE_CONFIG.shields, {
    echoE: { flatBase: 1.5, flatPerLevel: 0.25, maxHealth: 0, capMaxHealth: 0.5 },
    solaE: { flatBase: 0, flatPerLevel: 0, maxHealth: 0.25, capMaxHealth: 0.5 },
    galeE: { flatBase: 1.5, flatPerLevel: 0, maxHealth: 0.1, capMaxHealth: 0.5 },
    riftE: { flatBase: 2.5, flatPerLevel: 0, maxHealth: 0, capMaxHealth: 0.5 },
  });
  assert.deepEqual(
    Object.fromEntries(BALANCE_IDS.specialists.map((id) => [id, BALANCE_CONFIG.weapons.signatures[id].cycle])),
    { zuri: 2.5, echo: 3, sola: 2.75, bront: 4.8, fang: 2, gale: 0.25, rift: 0.9, nova: 2.8, vesper: 2.5 },
  );
  assert.deepEqual(
    Object.fromEntries(BALANCE_IDS.universalWeapons.map((id) => [id, BALANCE_CONFIG.weapons.universal[id].damageBase ?? null])),
    { uwu: 28, slicers: 24, aura: 16, mines: 60, crossbow: 48, boomerang: 65, rail: 45, glove: 31, transit: 135, ice: null, annihilator: 450, drone: 40 },
  );
});

test("simulation headers carry immutable balance identity and baseline enemy math", () => {
  const sim = new Simulation({ difficulty: "story", players: [{ id: "p", name: "P", specialist: "zuri" }] });
  const snapshot = sim.snapshot();
  assert.equal(snapshot.balanceVersion, BALANCE_VERSION);
  assert.equal(snapshot.balanceHash, BALANCE_HASH);
  const enemy = sim.spawnEnemy("mite");
  assert.equal(enemy.maxHp, 42 * 1.2);
  assert.equal(enemy.damage, 0.75 * 1.3);
});

test("signature cadence matches the versioned rank-one and rank-five contract", () => {
  const expected = {
    zuri: [2.5, 2.5], echo: [3, 2], sola: [2.75, 1.75], bront: [4.8, 4],
    fang: [2, 1.6], gale: [0.25, 0.25], rift: [0.9, 0.9], nova: [2.8, 2.8], vesper: [2.5, 2],
  };
  for (const [id, [rankOne, rankFive]] of Object.entries(expected)) {
    const tuning = BALANCE_CONFIG.weapons.signatures[id];
    assert.equal(valueAtLevel(tuning.cycle, tuning.cyclePerLevel, 1), rankOne, `${id} rank one`);
    assert.ok(Math.abs(valueAtLevel(tuning.cycle, tuning.cyclePerLevel, 5) - rankFive) < 1e-12, `${id} rank five`);
  }
});

test("all universal weapon cooldown formulas remain equivalent at rank one", () => {
  const expected = {
    uwu: 0.68, slicers: 0.24, aura: 0.34, mines: 6.35, crossbow: 3.95, boomerang: 3.6,
    rail: 3.48, glove: 2.7, transit: 13.2, ice: 12.4, annihilator: 28.6, drone: 1.5,
  };
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.5;
    for (const [id, cooldown] of Object.entries(expected)) {
      const sim = new Simulation({ players: [{ id: "p", name: "P", specialist: "zuri" }] });
      const player = sim.players[0];
      sim.spawnEnemy("mite");
      const actual = sim.fireCommonWeapon(player, id, { level: 1, evolved: false });
      assert.ok(Math.abs(actual - cooldown) < 1e-12, `${id}: expected ${cooldown}, got ${actual}`);
    }
  } finally {
    Math.random = originalRandom;
  }
});
