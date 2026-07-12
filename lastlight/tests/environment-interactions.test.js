import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEnvironmentInteractionStressFixture } from "../fixtures/environment-stress.js";
import {
  ENVIRONMENT_INTERACTION_SCHEMA,
  ENVIRONMENT_MAP_IDS,
  ENVIRONMENT_PROP_KINDS,
  ENVIRONMENT_QUALITY_TIERS,
  EnvironmentInteractionField,
  LASTLIGHT_ENVIRONMENT_INTERACTIONS,
  environmentBudget,
  environmentContactPlan,
  environmentalPropsForBounds,
  stableEnvironmentUnit,
  validateEnvironmentInteractions,
} from "../environment-interactions.js";
import { MATERIAL_CLASSES } from "../material-impacts.js";

const bounds = Object.freeze({ left: -600, top: -400, right: 600, bottom: 400 });

test("theme-owned environment contract is strict, exhaustive, and bounded", () => {
  const theme = LASTLIGHT_ENVIRONMENT_INTERACTIONS;
  assert.equal(theme.schema, ENVIRONMENT_INTERACTION_SCHEMA);
  assert.deepEqual(Object.keys(theme.props), ENVIRONMENT_PROP_KINDS);
  assert.deepEqual(Object.keys(theme.contacts), MATERIAL_CLASSES);
  assert.deepEqual(Object.keys(theme.maps), ENVIRONMENT_MAP_IDS);
  assert.deepEqual(Object.keys(theme.budgets), ENVIRONMENT_QUALITY_TIERS);
  assert.deepEqual(validateEnvironmentInteractions(theme), []);
  assert.equal(Object.isFrozen(theme.props.debris), true);
  for (const tier of ENVIRONMENT_QUALITY_TIERS) {
    const budget = theme.budgets[tier];
    assert.ok(budget.visibleProps <= 96 && budget.activeProps <= 48 && budget.contacts <= 36 && budget.impacts <= 24);
    assert.ok(budget.activeProps <= budget.visibleProps);
  }
});

test("validation rejects unknown fields and unsafe response budgets", () => {
  const withUnknown = structuredClone(LASTLIGHT_ENVIRONMENT_INTERACTIONS);
  withUnknown.props.debris.surprise = true;
  assert.match(validateEnvironmentInteractions(withUnknown).join("\n"), /debris: fields mismatch/);
  const unsafe = structuredClone(LASTLIGHT_ENVIRONMENT_INTERACTIONS);
  unsafe.budgets.high.visibleProps = 1000;
  unsafe.contacts.liquid.lifetimeMs = 900;
  assert.match(validateEnvironmentInteractions(unsafe).join("\n"), /visibleProps: invalid/);
  assert.match(validateEnvironmentInteractions(unsafe).join("\n"), /liquid\.lifetimeMs: invalid/);
});

test("visible props are stable world-cell samples and quality density is a strict subset", () => {
  const first = environmentalPropsForBounds({ mapId: "outskirts", bounds, tier: "high", effectsDensity: 1 });
  const again = environmentalPropsForBounds({ mapId: "outskirts", bounds, tier: "high", effectsDensity: 1 });
  const reduced = environmentalPropsForBounds({ mapId: "outskirts", bounds, tier: "reduced", effectsDensity: .6 });
  assert.deepEqual(first, again);
  assert.ok(first.length > 40 && first.length <= 96);
  assert.ok(reduced.length <= 56);
  assert.ok(reduced.every((prop) => first.some((candidate) => candidate.id === prop.id)));
  assert.notDeepEqual(environmentalPropsForBounds({ mapId: "lab", bounds, tier: "high", effectsDensity: 1 }), first);
  assert.deepEqual(environmentalPropsForBounds({ mapId: "lab", bounds, tier: "minimal", effectsDensity: 0 }), []);
});

test("all surface kinds and material contact grammars are represented without color-only cues", () => {
  const kinds = new Set(ENVIRONMENT_MAP_IDS.flatMap((mapId) => environmentalPropsForBounds({ mapId, bounds: { left: -1800, top: -1200, right: 1800, bottom: 1200 }, tier: "high", effectsDensity: 1 }).map((prop) => prop.kind)));
  assert.deepEqual(kinds, new Set(ENVIRONMENT_PROP_KINDS));
  for (const material of MATERIAL_CLASSES) {
    const full = environmentContactPlan(material);
    const reduced = environmentContactPlan(material, { reducedMotion: true, effectsDensity: 0 });
    assert.ok(full.style && full.count >= 1 && full.drift > 0);
    assert.equal(reduced.count, 1);
    assert.equal(reduced.drift, 0);
    assert.equal(reduced.reducedMotion, true);
  }
  assert.throws(() => environmentContactPlan("wood"), /Unsupported environment material/);
});

test("shared movement and impact events drive local reactions without mutating snapshots", () => {
  const props = environmentalPropsForBounds({ mapId: "warehouse", bounds, tier: "high", effectsDensity: 1 });
  const prop = props[0], field = new EnvironmentInteractionField();
  const state = { map: "warehouse", players: [{ id: "slot-0", x: prop.x, y: prop.y, radius: 18 }], enemies: [], effects: [], projectiles: [] };
  const previous = { players: [{ id: "slot-0", x: prop.x - 24, y: prop.y, radius: 18 }], enemies: [] };
  const pristineState = structuredClone(state), pristinePrevious = structuredClone(previous);
  field.update({ mapId: "warehouse", bounds, state, previous, frameSeconds: 1 / 60, tier: "high", effectsDensity: 1 });
  assert.ok(field.contacts.some((contact) => contact.plan.material === "concrete"));
  assert.ok(field.reactions.size > 0);
  field.update({ mapId: "warehouse", bounds, state, previous, materialImpacts: [{ id: "impact-1", x: prop.x, y: prop.y, angle: 0, essential: true, response: { material: "metal" } }], frameSeconds: 1 / 60, tier: "high", effectsDensity: 1 });
  assert.ok(field.contacts.some((contact) => contact.plan.material === "metal"));
  assert.equal(field.seenImpactIds.has("impact-1"), true);
  assert.deepEqual(state, pristineState);
  assert.deepEqual(previous, pristinePrevious);
});

test("two multiplayer renderers derive equivalent reactions from the same shared snapshots", () => {
  const fixture = createEnvironmentInteractionStressFixture();
  const run = () => {
    const field = new EnvironmentInteractionField();
    field.update({ mapId: "outskirts", bounds: fixture.bounds, state: { map: "outskirts", players: fixture.movers.slice(0, 4), enemies: fixture.movers.slice(4) }, previous: { players: fixture.movers.slice(0, 4).map((mover) => ({ ...mover, x: mover.x - 16 })), enemies: fixture.movers.slice(4).map((mover) => ({ ...mover, x: mover.x - 16 })) }, materialImpacts: fixture.impacts, frameSeconds: 1 / 60, tier: "high", effectsDensity: 1 });
    return {
      props: field.props.map(({ id, kind, x, y }) => ({ id, kind, x, y })),
      reactions: [...field.reactions].map(([id, value]) => [id, { ...value }]),
      contacts: field.contacts.map((contact) => ({ ...contact, plan: { ...contact.plan } })),
      diagnostics: field.diagnostics(),
    };
  };
  assert.deepEqual(run(), run());
});

test("stress surface obeys every frame and entity budget at full and reduced quality", () => {
  for (const [tier, effectsDensity, reducedMotion] of [["high", 1, false], ["reduced", .6, false], ["minimal", .3, true]]) {
    const fixture = createEnvironmentInteractionStressFixture({ tier, effectsDensity, reducedMotion });
    const budget = environmentBudget(tier, effectsDensity);
    assert.ok(fixture.diagnostics.visibleProps <= budget.visibleProps);
    assert.ok(fixture.diagnostics.activeProps <= budget.activeProps);
    assert.ok(fixture.diagnostics.contacts <= budget.contacts);
    if (tier === "high") assert.deepEqual(new Set(fixture.frame.contacts.filter((contact) => contact.id.startsWith("environment:stress-impact")).map((contact) => contact.plan.material)), new Set(MATERIAL_CLASSES));
    if (reducedMotion) assert.equal(fixture.diagnostics.activeProps, 0);
  }
});

test("cosmetic sampling is stable and cannot reach gameplay RNG or protocol", () => {
  assert.equal(stableEnvironmentUnit("field-1"), stableEnvironmentUnit("field-1"));
  assert.notEqual(stableEnvironmentUnit("field-1"), stableEnvironmentUnit("field-2"));
  const source = readFileSync(new URL("../environment-interactions.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  const protocol = readFileSync(new URL("../protocol.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/);
  assert.doesNotMatch(engine, /environment-interactions|EnvironmentInteractionField/);
  assert.doesNotMatch(protocol, /environment-interactions|EnvironmentInteractionField/);
});
