import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOAK_BUDGETS,
  SOAK_REPORT_SCHEMA,
  SoakDivergenceError,
  createSoakReport,
  runMultiplayerSoak,
} from "../soak/multiplayer-soak.js";

test("four-player soak converges through a complete run, drafts, objectives, reconnect, and result", () => {
  let sends = 0, acknowledgements = 0, checkpoints = 0;
  const result = runMultiplayerSoak({
    adapters: {
      transportHooks: { onSend: () => sends++, onAck: () => acknowledgements++ },
      onCheckpoint: () => checkpoints++,
    },
  });
  assert.equal(result.schema, SOAK_REPORT_SCHEMA);
  assert.equal(result.status, "passed");
  assert.equal(result.contract.players, 4);
  assert.equal(result.coverage.result, "won");
  assert.equal(result.coverage.disconnected, true);
  assert.equal(result.coverage.reconnected, true);
  assert.ok(result.coverage.upgrades >= 4);
  assert.ok(result.coverage.objectiveEvents.length >= 3);
  assert.equal(new Set(result.checkpoints.map(({ hash }) => hash)).size, result.checkpoints.length);
  assert.equal(checkpoints, result.checkpoints.length);
  assert.equal(sends, result.metrics.transport.sent);
  assert.equal(acknowledgements, result.metrics.transport.delivered);
  assert.equal(result.metrics.transport.pending, 0);
  assert.ok(result.metrics.maxTotalEntities <= DEFAULT_SOAK_BUDGETS.maxTotalEntities);
  assert.ok(result.metrics.maxSnapshotBytes <= DEFAULT_SOAK_BUDGETS.maxSnapshotBytes);
  assert.ok(result.metrics.timingAdvisoryMs.p99 >= 0);

  const serialized = JSON.stringify(createSoakReport([result]));
  assert.doesNotMatch(serialized, /transient|reconnected-|resume|token|callsign|squad.?code|Replica /i);
});

test("the first stable divergence reports its tick, replica, hash, and canonical path", () => {
  assert.throws(
    () => runMultiplayerSoak({
      checkpointEvery: 60,
      adapters: {
        onTick: ({ tick, replicas }) => { if (tick === 1) replicas[1].simulation.gold += 1; },
      },
    }),
    (error) => {
      assert.ok(error instanceof SoakDivergenceError);
      assert.equal(error.tick, 60);
      assert.equal(error.replica, "follower-1");
      assert.match(error.expectedHash, /^[0-9a-f]{16}$/);
      assert.match(error.actualHash, /^[0-9a-f]{16}$/);
      assert.match(error.difference.path, /gold/);
      assert.match(error.message, /first divergence at tick 60/);
      return true;
    },
  );
});

test("soak inputs and transport adapters fail closed", () => {
  assert.throws(() => runMultiplayerSoak({ seed: "not-a-seed" }), /128-bit/);
  assert.throws(() => runMultiplayerSoak({ durationSeconds: 59 }), /durationSeconds/);
  assert.throws(() => runMultiplayerSoak({ adapters: { transportFactory: () => ({}) } }), /invalid replication queue/);
  assert.throws(() => createSoakReport([]), /results/);
});
