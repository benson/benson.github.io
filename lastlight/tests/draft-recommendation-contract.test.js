import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_RECOMMENDATION_MAX_SYNC_ENTRIES, DRAFT_RECOMMENDATION_PROTOCOL_VERSION,
  DraftRecommendationSequenceTracker, DraftRecommendationTokenBucket, HostDraftRecommendationGate,
  createDraftRecommendationRequest, createDraftRecommendationState, createDraftRecommendationSync,
  sanitizeDraftRecommendationRequest, sanitizeDraftRecommendationState, sanitizeDraftRecommendationSync,
} from "../draft-recommendation-contract.js";

const request = (fields = {}) => createDraftRecommendationRequest({
  epoch: 2, seq: 3, targetSlot: 1, round: 4, revision: 2, optionIndex: 0, active: true, ...fields,
});
const transport = (fields = {}) => ({ ...request(fields), _from: "peer-1", recommenderSlot: 2 });

test("draft recommendation requests and authoritative deltas use strict identity-free schemas", () => {
  assert.equal(DRAFT_RECOMMENDATION_PROTOCOL_VERSION, 1);
  assert.deepEqual(request(), {
    type: "draft_recommendation", protocolVersion: 1, epoch: 2, seq: 3,
    targetSlot: 1, round: 4, revision: 2, optionIndex: 0, active: true,
  });
  assert.equal(sanitizeDraftRecommendationRequest(transport(), { transport: true }).recommenderSlot, 2);
  const state = createDraftRecommendationState(transport());
  assert.deepEqual(state, {
    type: "draft_recommendation_state", protocolVersion: 1, epoch: 2, seq: 3,
    targetSlot: 1, round: 4, revision: 2, optionIndex: 0, active: true, recommenderSlot: 2,
  });
  assert.equal(sanitizeDraftRecommendationState({ ...state, _from: "host" }, { transport: true })._from, "host");
  for (const invalid of [
    { ...request(), unsupported: true }, { ...request(), optionIndex: 3 }, { ...request(), targetSlot: 4 },
    { ...request(), active: 1 }, { ...transport(), recommenderSlot: 4 }, { ...transport(), name: "identity" },
  ]) assert.throws(() => sanitizeDraftRecommendationRequest(invalid, { transport: Object.hasOwn(invalid, "_from") }), /draft recommendation/);
});

test("targeted recommendation sync is bounded, unique, active-only, and deterministically sorted", () => {
  const entries = [
    createDraftRecommendationState(transport({ seq: 5, optionIndex: 2 })),
    createDraftRecommendationState({ ...transport({ seq: 4, optionIndex: 0 }), recommenderSlot: 1 }),
  ];
  const sync = createDraftRecommendationSync({ epoch: 2, entries });
  assert.deepEqual(sync.entries.map(({ optionIndex }) => optionIndex), [0, 2]);
  assert.equal(sanitizeDraftRecommendationSync({ ...sync, _from: "host" }, { transport: true })._from, "host");
  assert.throws(() => createDraftRecommendationSync({ epoch: 2, entries: Array.from({ length: DRAFT_RECOMMENDATION_MAX_SYNC_ENTRIES + 1 }, () => entries[0]) }), /entries/);
  assert.throws(() => createDraftRecommendationSync({ epoch: 2, entries: [entries[0], { ...entries[0], seq: 6, optionIndex: 1 }] }), /duplicate/);
  assert.throws(() => createDraftRecommendationSync({ epoch: 2, entries: [createDraftRecommendationState(transport({ active: false }))] }), /inactive/);
  assert.throws(() => createDraftRecommendationSync({ epoch: 3, entries }), /stale/);
});

test("client sequencing and host authority gate fence epoch, draft phase, and duplicate intent", () => {
  const tracker = new DraftRecommendationSequenceTracker(2);
  assert.equal(tracker.create({ targetSlot: 1, round: 4, revision: 2, optionIndex: 0 }).seq, 0);
  assert.equal(tracker.create({ targetSlot: 1, round: 4, revision: 2, optionIndex: 1 }).seq, 1);
  tracker.reset(3);
  assert.equal(tracker.create({ targetSlot: 0, round: 1, revision: 0, optionIndex: 0 }).seq, 0);

  const gate = new HostDraftRecommendationGate(2);
  assert.equal(gate.apply(transport(), { round: 4, revision: 2 }).accepted, true);
  assert.equal(gate.apply(transport(), { round: 4, revision: 2 }).reason, "sequence");
  assert.equal(gate.apply(transport({ seq: 4, epoch: 1 }), { round: 4, revision: 2 }).reason, "epoch");
  assert.equal(gate.apply(transport({ seq: 5, revision: 3 }), { round: 4, revision: 2 }).reason, "phase");
});

test("relay recommendation token buckets are bounded and slot keyed", () => {
  const bucket = new DraftRecommendationTokenBucket({ capacity: 2, refillMs: 250 });
  assert.equal(bucket.take("slot-1", 1_000), true);
  assert.equal(bucket.take("slot-1", 1_000), true);
  assert.equal(bucket.take("slot-1", 1_000), false);
  assert.equal(bucket.take("slot-1", 1_249), false);
  assert.equal(bucket.take("slot-1", 1_250), true);
  assert.equal(bucket.take("slot-2", 1_250), true);
  assert.equal(bucket.entries.size, 2);
});
