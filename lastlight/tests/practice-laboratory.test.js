import test from "node:test";
import assert from "node:assert/strict";
import { PASSIVES, SPECIALISTS, WEAPONS } from "../data.js";
import {
  PRACTICE_LABORATORY_SCHEMA, PRACTICE_MAX_PASSIVES, PRACTICE_MAX_WEAPONS,
  createPracticeLaboratory, defaultPracticeLaboratoryConfig, measurePracticeLaboratory,
  normalizePracticeLaboratoryConfig, validatePracticeLaboratoryConfig,
} from "../practice-laboratory.js";

function configured(overrides = {}) {
  return normalizePracticeLaboratoryConfig({ ...defaultPracticeLaboratoryConfig(), ...overrides });
}

test("the strict laboratory contract is canonical, bounded, immutable, and identity-free", () => {
  const config = configured({
    specialist: "echo", map: "lab", difficulty: "hard", measurementSeconds: 5,
    target: { type: "brute", eliteAffix: "hasted", behavior: "active" },
    weapons: [{ id: "uwu", level: 3, evolved: false }, { id: "signature", level: 5, evolved: false }],
    passives: [{ id: "haste", rank: 2 }],
  });
  assert.equal(config.schema, PRACTICE_LABORATORY_SCHEMA);
  assert.deepEqual(config.weapons.map(({ id }) => id), ["signature", "uwu"]);
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.target));
  assert.doesNotMatch(JSON.stringify(config), /callsign|room|slot|replay|report|token/);
  assert.equal(validatePracticeLaboratoryConfig(config), config);
});

test("malformed builds, incompatible affixes, arbitrary fields, capacity, and false evolutions fail closed", () => {
  const base = structuredClone(defaultPracticeLaboratoryConfig());
  for (const patch of [
    { arbitrary: true },
    { target: { type: "apex", eliteAffix: "hasted", behavior: "active" } },
    { target: { type: "bomber", eliteAffix: "volatile", behavior: "active" } },
    { weapons: [{ id: "signature", level: 4, evolved: true }] },
    { weapons: [{ id: "signature", level: 1, evolved: false }, ...Object.keys(WEAPONS).slice(0, PRACTICE_MAX_WEAPONS).map((id) => ({ id, level: 1, evolved: false }))] },
    { passives: Object.keys(PASSIVES).slice(0, PRACTICE_MAX_PASSIVES + 1).map((id) => ({ id, rank: 1 })) },
  ]) assert.throws(() => validatePracticeLaboratoryConfig({ ...base, ...patch }));
});

test("all specialists, universal weapons, passives, enemy targets, elite affixes, and apexes build through authoritative state", () => {
  for (const specialist of Object.keys(SPECIALISTS)) {
    const { player } = createPracticeLaboratory(configured({ specialist }));
    assert.equal(player.specialist, specialist);
  }
  for (const [id, weapon] of Object.entries(WEAPONS)) {
    const config = configured({ weapons: [{ id: "signature", level: 1, evolved: false }, { id, level: 5, evolved: true }], passives: [{ id: weapon.passive, rank: 1 }] });
    assert.equal(createPracticeLaboratory(config).player.weapons[id].evolved, true);
  }
  for (const [id, passive] of Object.entries(PASSIVES)) {
    const { player } = createPracticeLaboratory(configured({ passives: [{ id, rank: passive.max }] }));
    assert.equal(player.passives[id], passive.max);
  }
  for (const target of ["mite", "hound", "spitter", "brute", "bomber", "shark", "apex"]) assert.ok(createPracticeLaboratory(configured({ target: { type: target, eliteAffix: "none", behavior: "stationary" } })).target);
  for (const [type, eliteAffix] of [["mite", "hasted"], ["hound", "shielded"], ["brute", "volatile"]]) assert.deepEqual(createPracticeLaboratory(configured({ target: { type, eliteAffix, behavior: "stationary" } })).target.affixIds, [eliteAffix]);
});

test("fixed laboratory measurements are reproducible and expose authoritative build/source statistics", () => {
  const config = configured({
    measurementSeconds: 5,
    weapons: [{ id: "signature", level: 5, evolved: true }, { id: "uwu", level: 3, evolved: false }],
    passives: [{ id: SPECIALISTS.zuri.signature.passive, rank: 2 }, { id: "damage", rank: 3 }],
  });
  const first = measurePracticeLaboratory(config), second = measurePracticeLaboratory(config);
  assert.deepEqual(first, second);
  assert.equal(first.ticks, 300);
  assert.ok(first.totalDamage > 0 && first.dps > 0 && first.sources.length > 0);
  assert.equal(first.weapons[0].evolved, true);
  assert.ok(first.stats.damage > 1);
});

test("Field Kit practice uses the real sidegrade and requires its paired passive", () => {
  const passive = SPECIALISTS.sola.signature.passive;
  const config = configured({ specialist: "sola", masteryStart: "field-kit", passives: [{ id: passive, rank: 1 }] });
  const baseline = createPracticeLaboratory(configured({ specialist: "sola" })).player;
  const fieldKit = createPracticeLaboratory(config).player;
  assert.equal(fieldKit.passives[passive], 1);
  assert.ok(fieldKit.maxHp < baseline.maxHp);
  assert.throws(() => validatePracticeLaboratoryConfig({ ...structuredClone(config), passives: [] }));
});
