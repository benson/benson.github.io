import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_MUTATIONS, CAMPAIGN_MUTATION_DIFFICULTIES, CAMPAIGN_MUTATION_MAPS,
  campaignMutationObjectiveCompleted, campaignMutationWaveStarted, cancelCampaignMutationEncounter, consumeCampaignMutationEncounter,
  campaignMutationPackageVisible, createCampaignMutationState, resolveCampaignMutationEncounter, validateCampaignMutationState, validateCampaignMutations,
} from "../campaign-mutations.js";

const frozen = (value) => !value || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(frozen));

test("campaign mutation registry is strict, immutable, and covers every tier and map", () => {
  assert.deepEqual(validateCampaignMutations(CAMPAIGN_MUTATIONS), []);
  assert.ok(frozen(CAMPAIGN_MUTATIONS));
  assert.deepEqual(Object.keys(CAMPAIGN_MUTATIONS.difficulties), [...CAMPAIGN_MUTATION_DIFFICULTIES]);
  assert.deepEqual(Object.keys(CAMPAIGN_MUTATIONS.maps), [...CAMPAIGN_MUTATION_MAPS]);
  const bad = structuredClone(CAMPAIGN_MUTATIONS); bad.difficulties.extreme.surge.enemyCount = 99;
  assert.match(validateCampaignMutations(bad).join("\n"), /enemyCount/);
});

test("Story is inert while Hard objective retaliation is exact, bounded, and rewarded", () => {
  const story = createCampaignMutationState("story");
  assert.equal(story.enabled, false);
  assert.equal(campaignMutationPackageVisible(story), false);
  assert.equal(campaignMutationObjectiveCompleted(story, { tick: 60 }), story);

  const hard = createCampaignMutationState("hard");
  assert.equal(campaignMutationPackageVisible(hard), true);
  const scheduled = campaignMutationObjectiveCompleted(hard, { tick: 120, objectiveKind: "uplink" });
  assert.equal(scheduled.objectiveCompletions, 1);
  assert.equal(scheduled.pressureAdvanceTicks, 180);
  assert.deepEqual(scheduled.pending, { id: "mutation-1", kind: "retaliation", triggerTick: 120, dueTick: 300, wave: 0, objectiveKind: "uplink" });
  assert.equal(consumeCampaignMutationEncounter(scheduled, 299).encounter, null);
  const due = consumeCampaignMutationEncounter(scheduled, 300);
  assert.equal(due.encounter.id, "mutation-1");
  assert.equal(due.state.active.id, "mutation-1");
  const resolved = resolveCampaignMutationEncounter(due.state, "mutation-1");
  assert.equal(resolved.resolvedEncounters, 1);
  assert.equal(resolved.active, null);
});

test("Extreme wave surges are one-shot, ordered, and never stack with retaliation", () => {
  let state = createCampaignMutationState("extreme");
  state = campaignMutationWaveStarted(state, { tick: 600, wave: 2 });
  assert.deepEqual(state.triggeredSurgeWaves, [2]);
  assert.equal(state.pending.kind, "surge");
  assert.equal(campaignMutationWaveStarted(state, { tick: 601, wave: 4 }), state);
  state = consumeCampaignMutationEncounter(state, state.pending.dueTick).state;
  assert.equal(campaignMutationWaveStarted(state, { tick: 1_200, wave: 4 }), state, "active encounters block a second mutation");
  state = cancelCampaignMutationEncounter(state);
  state = campaignMutationWaveStarted(state, { tick: 1_200, wave: 2 });
  assert.equal(state.pending, null);
  state = campaignMutationWaveStarted(state, { tick: 1_201, wave: 4 });
  assert.equal(state.pending.wave, 4);
  assert.ok(validateCampaignMutationState(state));
});
