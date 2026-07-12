import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPECIALIST_ORDER, WEAPONS } from "../data.js";
import { createImpactStressFixture } from "../fixtures/impact-stress.js";
import {
  FEEDBACK_TIERS,
  IMPACT_GRAMMAR_VERSION,
  SEMANTIC_VISUAL_GRAMMAR,
  SIGNATURE_IMPACT_GRAMMAR,
  UNIVERSAL_IMPACT_GRAMMAR,
  getWeaponImpactGrammar,
  impactRenderPlan,
  impactSummary,
  resolveEntityImpact,
  validateImpactGrammar,
} from "../impact-grammar.js";

test("impact grammar exhaustively covers every base and evolved weapon", () => {
  assert.equal(IMPACT_GRAMMAR_VERSION, "lastlight.impact-grammar.v1");
  assert.deepEqual(Object.keys(SIGNATURE_IMPACT_GRAMMAR), SPECIALIST_ORDER);
  assert.deepEqual(Object.keys(UNIVERSAL_IMPACT_GRAMMAR), Object.keys(WEAPONS));
  assert.deepEqual(validateImpactGrammar(), []);

  for (const [scope, catalog] of [["signature", SIGNATURE_IMPACT_GRAMMAR], ["universal", UNIVERSAL_IMPACT_GRAMMAR]]) {
    for (const [id, record] of Object.entries(catalog)) {
      assert.notDeepEqual(record.base, record.evolved, `${scope}.${id} evolution must change its read`);
      assert.ok(record.evolvedDifference.length > 20);
      for (const variant of [record.base, record.evolved]) {
        assert.ok(variant.silhouette && variant.material && variant.motion && variant.contact && variant.impact && variant.decal);
        assert.ok(variant.trail.style && Number.isFinite(variant.trail.length) && Number.isFinite(variant.trail.width));
        assert.ok(FEEDBACK_TIERS.includes(variant.shake));
        assert.ok(FEEDBACK_TIERS.includes(variant.flash));
        assert.ok(variant.soundFamily && variant.behavior);
        assert.match(variant.accessibility.palette.keyline, /^#[0-9a-f]{6}$/i);
        assert.match(variant.accessibility.palette.body, /^#[0-9a-f]{6}$/i);
        assert.match(variant.accessibility.palette.core, /^#[0-9a-f]{6}$/i);
      }
    }
  }
});

test("signature evolution copy does not promise mechanics the engine does not implement", () => {
  assert.match(SIGNATURE_IMPACT_GRAMMAR.sola.evolvedDifference, /1\.50 seconds instead of 1\.75/);
  assert.match(SIGNATURE_IMPACT_GRAMMAR.sola.evolvedDifference, /Guard Return shield/i);
  assert.doesNotMatch(SIGNATURE_IMPACT_GRAMMAR.sola.evolvedDifference, /extra|added penetration/i);
  assert.match(SIGNATURE_IMPACT_GRAMMAR.fang.evolvedDifference, /every third swipe.+Predator Hook.+without adding bleed/i);
  assert.match(SIGNATURE_IMPACT_GRAMMAR.rift.evolvedDifference, /Kinetic Reserve.+0\.12× to 0\.32×/i);
  assert.match(SIGNATURE_IMPACT_GRAMMAR.gale.evolvedDifference, /pierce from 5 to 12.+Flow 15% faster/i);
  assert.match(SIGNATURE_IMPACT_GRAMMAR.vesper.evolvedDifference, /pierce from 7 to 14.+Blade Recall is unchanged/i);
});

test("entity resolver reads anonymous owner loadouts without mutating simulation state", () => {
  const state = { players: [{ id: "transient-private-id", specialist: "echo", weapons: { signature: { level: 5, evolved: true }, mines: { level: 5, evolved: true } } }] };
  const before = JSON.stringify(state);
  const signature = resolveEntityImpact({ owner: "transient-private-id", sourceId: "signature" }, state);
  const mine = resolveEntityImpact({ owner: "transient-private-id", sourceId: "mines" }, state);
  assert.equal(signature.silhouette, "double-crescent");
  assert.equal(mine.silhouette, "tri-diamond-mine");
  assert.match(impactSummary(signature), /sonic.*double ripple.*resonance/i);
  assert.equal(JSON.stringify(state), before);
  assert.equal(resolveEntityImpact({ owner: "enemy", sourceId: "mines" }, state), null);
  assert.equal(getWeaponImpactGrammar("unknown"), null);
});

test("quality and reduced-motion plans retain essential telegraphs without extra motion", () => {
  const mineState = { players: [{ id: "p0", specialist: "zuri", weapons: { mines: { evolved: false } } }] };
  const mine = { id: "mine-1", owner: "p0", sourceId: "mines" };
  const reduced = impactRenderPlan(mine, mineState, { reducedMotion: true, density: 0 });
  assert.equal(reduced.essential, true);
  assert.equal(reduced.shake, "none");
  assert.equal(reduced.trail.style, "none");
  assert.equal(reduced.pattern, "diamond-with-ticks");

  const needleState = { players: [{ id: "p1", specialist: "zuri", weapons: { uwu: { evolved: false } } }] };
  const needle = { id: "needle-1", owner: "p1", sourceId: "uwu" };
  assert.equal(impactRenderPlan(needle, needleState, { density: .2 }).trail.style, "none");
  assert.equal(impactRenderPlan(needle, needleState, { density: 1 }).trail.style, "speedline");
  assert.deepEqual(impactRenderPlan(needle, needleState, { density: .2 }), impactRenderPlan(needle, needleState, { density: .2 }), "quality sampling is state-stable");
});

test("friendly, hostile, XP, and objective categories retain distinct shape and palette channels", () => {
  const entries = Object.values(SEMANTIC_VISUAL_GRAMMAR);
  assert.equal(new Set(entries.map((entry) => entry.silhouette)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.palette.body)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.pattern)).size, entries.length);
  assert.equal(SEMANTIC_VISUAL_GRAMMAR.hostile.palette.body, "#ff3857");
  assert.equal(SEMANTIC_VISUAL_GRAMMAR.xp.silhouette, "diamond-shard");
  assert.equal(SEMANTIC_VISUAL_GRAMMAR.objective.palette.body, "#f7d76a");
});

test("visual stress hook emits every base/evolved plan and a reduced-motion equivalent", () => {
  const full = createImpactStressFixture();
  const reduced = createImpactStressFixture({ reducedMotion: true, density: 0 });
  assert.equal(full.length, (SPECIALIST_ORDER.length + Object.keys(WEAPONS).length) * 2);
  assert.equal(reduced.length, full.length);
  assert.equal(new Set(full.map((entry) => `${entry.sourceId}:${entry.specialistId || "universal"}:${entry.evolved}`)).size, full.length);
  assert.ok(full.every((entry) => entry.grammar && entry.plan));
  assert.ok(reduced.every((entry) => entry.plan.shake === "none"));
});

test("renderer, HUD, guide, and sound use grammar without touching the engine", () => {
  const renderer = readFileSync(new URL("../render.js", import.meta.url), "utf8");
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
  assert.match(renderer, /impactRenderPlan/);
  assert.match(renderer, /drawImpactTrail/);
  assert.match(renderer, /drawImpactDecal/);
  assert.match(game, /impactSummary\(impact\)/);
  assert.match(game, /weaponAudioCueName\(grammar\)/);
  assert.match(game, /Audio: impact\?\.soundFamily/);
  assert.doesNotMatch(engine, /impact-grammar|impactRenderPlan|IMPACT_GRAMMAR/);
});
