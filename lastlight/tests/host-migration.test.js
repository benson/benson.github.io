import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthoritySnapshotGate, HOST_MIGRATION_SCHEMA, createMigrationCapabilities, createMigrationCheckpoint,
  createMigrationReady, migrationCompatibilityMatches, validateMigrationCheckpoint,
} from "../host-migration.js";

const compatibility = Object.freeze({
  build: "2026.07.13.1", balanceVersion: "2026.07.13-apex.1", balanceHash: "fnv1a32:873c43bc",
  configVersion: "release-2026.07.13.9", gameplayVersion: "join-normalization-v1", objectiveEvents: true,
  squadSynergies: true, sharedParticipationCredit: true, downedActivity: true, joinInProgressNormalization: true,
  registryVersion: "lastlight.squad-synergy.v1", recoveryVersion: 7,
});

function checkpoint(overrides = {}) {
  return createMigrationCheckpoint({
    epoch: 3, tick: 120, hash: "0123456789abcdef", ack: { alpha: 7, beta: 9 }, compatibility,
    roster: [{ id: "alpha", replaySlot: 0 }, { id: "beta", replaySlot: 1 }],
    simulation: { version: 7, scalars: { tick: 120 } }, replay: { currentTick: 120 }, ...overrides,
  });
}

test("migration capabilities pin exact build, balance, runtime, and gameplay identity", () => {
  const capabilities = createMigrationCapabilities(compatibility);
  assert.equal(capabilities.schema, HOST_MIGRATION_SCHEMA);
  assert.equal(migrationCompatibilityMatches(capabilities.compatibility, compatibility), true);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, balanceHash: "fnv1a32:00000000" }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, squadSynergies: false }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, sharedParticipationCredit: false }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, downedActivity: false }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, joinInProgressNormalization: false }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, registryVersion: "other" }), false);
  assert.equal(migrationCompatibilityMatches(compatibility, { ...compatibility, recoveryVersion: 6 }), false);
  assert.throws(() => createMigrationCapabilities({ ...compatibility, room: "SECRET" }), /unsupported/);
});

test("migration checkpoints use strict bounded anonymous state", () => {
  const value = checkpoint();
  assert.equal(value.checkpointId, "e3-t120-0123456789abcdef");
  assert.deepEqual(value.roster.map(({ replaySlot }) => replaySlot), [0, 1]);
  assert.throws(() => validateMigrationCheckpoint({ ...value, surprise: true }), /unsupported/);
  assert.throws(() => checkpoint({ roster: [{ id: "alpha", replaySlot: 1 }, { id: "beta", replaySlot: 0 }] }), /ordered/);
  assert.throws(() => checkpoint({ ack: { stranger: 1 } }), /unknown player/);
  assert.throws(() => checkpoint({ simulation: { version: 7, scalars: { tick: 119 } } }), /match its tick/);
  assert.throws(() => checkpoint({ simulation: { version: 6, scalars: { tick: 120 } } }), /match its tick/);
  assert.throws(() => validateMigrationCheckpoint(value, { maxBytes: 32 }), /size bounds/);
});

test("migration checkpoints reject reconnect secrets and identity fields at any depth", () => {
  const value = checkpoint();
  const leaked = structuredClone(value);
  leaked.simulation.resumeToken = "a".repeat(24);
  assert.throws(() => validateMigrationCheckpoint(leaked), /private field resumeToken/);
  const nested = structuredClone(value);
  nested.simulation.private = { nested: { contact: "private@example.com" } };
  assert.throws(() => validateMigrationCheckpoint(nested), /private field contact/);
});

test("migration readiness is bound to one epoch, checkpoint, tick, and hash", () => {
  const source = checkpoint();
  const ready = createMigrationReady(source);
  assert.deepEqual(ready, {
    type: "migration_ready", schema: HOST_MIGRATION_SCHEMA, protocolVersion: 5,
    epoch: 3, checkpointId: source.checkpointId, tick: 120, hash: source.hash,
  });
  assert.throws(() => createMigrationReady({ ...source, checkpointId: "../../bad" }), /checkpoint id/);
});

test("authority snapshot gate rejects old epochs, old hosts, duplicates, and rewinds", () => {
  const gate = new AuthoritySnapshotGate();
  gate.commit({ epoch: 4, hostId: "alpha" });
  assert.equal(gate.accept({ epoch: 4, hostId: "alpha", tick: 100, sequence: 1 }), true);
  assert.equal(gate.accept({ epoch: 4, hostId: "alpha", tick: 100, sequence: 1 }), false);
  assert.equal(gate.accept({ epoch: 4, hostId: "alpha", tick: 99, sequence: 2 }), false);
  assert.equal(gate.accept({ epoch: 3, hostId: "alpha", tick: 101, sequence: 2 }), false);
  assert.equal(gate.accept({ epoch: 4, hostId: "beta", tick: 101, sequence: 2 }), false);
  assert.deepEqual(gate.diagnostics(), {
    epoch: 4, hostKnown: true, lastTick: 100, lastSequence: 1,
    staleEpoch: 1, wrongHost: 1, rewind: 2, invalid: 0,
  });
});
