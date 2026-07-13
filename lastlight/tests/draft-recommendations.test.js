import test from "node:test";
import assert from "node:assert/strict";
import { DraftRecommendationStore, recommendationMarkerModel } from "../draft-recommendations.js";

const entry = (overrides = {}) => ({ epoch: 0, seq: 0, recommenderSlot: 0, targetSlot: 1, round: 1, revision: 0, optionIndex: 0, active: true, ...overrides });
const game = (revision = 0) => ({
  players: [
    { id: "a", replaySlot: 0, name: "A", specialist: "zuri", draft: { round: 1, revision: 0 } },
    { id: "b", replaySlot: 1, name: "B", specialist: "echo", draft: { round: 1, revision } },
    { id: "c", replaySlot: 2, name: "C", specialist: "sola", draft: { round: 1, revision: 0 } },
  ],
  pendingChoices: { b: [{ id: "weapon:a" }, { id: "weapon:b" }, { id: "weapon:c" }] },
});

test("a recommender has one movable recommendation per target draft", () => {
  const store = new DraftRecommendationStore();
  assert.equal(store.apply(entry()).accepted, true);
  assert.equal(store.apply(entry({ seq: 1, optionIndex: 2 })).accepted, true);
  assert.equal(store.entries().length, 1);
  assert.equal(store.entries()[0].optionIndex, 2);
  assert.equal(store.apply(entry({ seq: 2, optionIndex: 2, active: false })).accepted, true);
  assert.equal(store.entries().length, 0);
});

test("multiple squad members can recommend the same target option", () => {
  const store = new DraftRecommendationStore();
  store.apply(entry()); store.apply(entry({ recommenderSlot: 2 }));
  assert.deepEqual(store.forOption(1, 1, 0, 0).map(({ recommenderSlot }) => recommenderSlot), [0, 2]);
});

test("stale sequences, self-targeting, and mismatched clears are safe", () => {
  const store = new DraftRecommendationStore(); store.apply(entry({ seq: 3, optionIndex: 1 }));
  assert.equal(store.apply(entry({ seq: 2 })).reason, "sequence");
  assert.equal(store.apply(entry({ seq: 4, optionIndex: 2, active: false })).accepted, true);
  assert.equal(store.entries().length, 1);
  assert.equal(store.apply(entry({ seq: 5, targetSlot: 0 })).reason, "identity");
});

test("sync replacement is bounded and migration rebasing preserves active entries", () => {
  const store = new DraftRecommendationStore(); store.apply(entry());
  store.rebase(2);
  assert.equal(store.entries()[0].epoch, 2);
  assert.equal(store.replace({ epoch: 2, entries: [entry({ epoch: undefined, seq: 4, recommenderSlot: 2, active: undefined })] }).accepted, true);
  assert.equal(store.entries()[0].recommenderSlot, 2);
  assert.equal(store.replace({ epoch: 2, entries: Array.from({ length: 13 }, (_, seq) => entry({ seq })) }).accepted, false);
});

test("an authenticated resumed seat gets a fresh sequence fence", () => {
  const store = new DraftRecommendationStore(); store.apply(entry({ seq: 8 }));
  assert.equal(store.resetSeat(0), true);
  assert.equal(store.apply(entry({ seq: 0, optionIndex: 2 })).accepted, true);
  assert.equal(store.entries().length, 1);
});

test("pruning follows authoritative target identity without touching gameplay state", () => {
  const store = new DraftRecommendationStore(); store.apply(entry());
  const before = JSON.stringify(game());
  assert.equal(store.prune(game()), false);
  assert.equal(store.prune(game(1)), true);
  assert.equal(JSON.stringify(game()), before);
});

test("a future draft identity waits for its authoritative snapshot instead of disappearing", () => {
  const store = new DraftRecommendationStore(); store.apply(entry({ revision: 1 }));
  assert.equal(store.prune(game(0)), false);
  assert.equal(store.entries().length, 1);
  assert.equal(store.prune(game(1)), false);
  assert.equal(store.forOption(1, 1, 1, 0).length, 1);
});

test("marker models resolve names by anonymous replay slot", () => {
  assert.deepEqual(recommendationMarkerModel([entry()], game().players), [{ replaySlot: 0, name: "A", specialist: "zuri" }]);
});
