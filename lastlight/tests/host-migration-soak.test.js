import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOST_MIGRATION_SOAK_SEED,
  HOST_MIGRATION_SOAK_SCHEMA,
  HostMigrationSoakBudgetError,
  runHostMigrationSoak,
} from "../soak/host-migration-soak.js";

test("real recovery checkpoints survive repeated authority promotion through draft and apex state", () => {
  const report = runHostMigrationSoak();

  assert.equal(report.schema, HOST_MIGRATION_SOAK_SCHEMA);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.coverage, {
    migrations: 3,
    repeatedMigrations: true,
    draftPausedCheckpoint: true,
    apexWindupCheckpoint: true,
    identityRemaps: 3,
  });
  assert.deepEqual(report.checkpoints.map(({ label }) => label), ["running", "draft-paused", "apex-windup"]);
  assert.ok(report.checkpoints.every(({ sourceHash, restoredHash }) => sourceHash === restoredHash));
  assert.ok(report.checkpoints.every(({ bytes }) => bytes <= report.metrics.checkpointBudgetBytes));
  assert.equal(report.finalHash.length, 16);
});

test("host migration soak is repeatable for the same command schedule", () => {
  const first = runHostMigrationSoak({ seed: DEFAULT_HOST_MIGRATION_SOAK_SEED, steps: 240 });
  const second = runHostMigrationSoak({ seed: DEFAULT_HOST_MIGRATION_SOAK_SEED, steps: 240 });

  assert.equal(first.finalHash, second.finalHash);
  assert.equal(first.finalTick, second.finalTick);
  assert.deepEqual(first.checkpoints, second.checkpoints);
});

test("host migration soak fails closed when a checkpoint exceeds its configured budget", () => {
  assert.throws(
    () => runHostMigrationSoak({ steps: 240, maxCheckpointBytes: 128 }),
    (error) => error instanceof HostMigrationSoakBudgetError && error.bytes > error.maxBytes,
  );
});
