# Runtime feature flags and rollback

The relay exposes `GET /config`. It is read-only, origin-aware, and always sends
`Cache-Control: no-store`. There is no HTTP mutation route. Operators control the
response through the Worker's `LASTLIGHT_RUNTIME_CONFIG` secret.

The current release defaults enable the versioned gameplay systems shipped in
build `2026.07.13.18`:

```json
{"schemaVersion":13,"configVersion":"release-2026.07.13.18","gameplayVersion":"rare-discoveries-v1","registryVersion":"lastlight.squad-synergy.v1","flags":{"deterministicReplay":true,"runTelemetry":true,"objectiveEvents":true,"migrationCheckpointReplication":true,"hostMigrationElection":true,"hostMigrationResume":true,"contextualPings":true,"upgradeRecommendations":true,"squadSynergies":true,"sharedParticipationCredit":true,"downedActivity":true,"joinInProgressNormalization":true,"squadEnemyDirector":true,"mapMechanics":true,"campaignMutations":true,"specialistMastery":true,"rareDiscoveries":true,"challengeAchievements":true,"seededOperations":true,"sharedSquadRunArchive":true}}
```

Unknown keys, missing keys, wrong types, and malformed JSON fail closed to those
defaults. A config contains no callsign, room, resume token, seed, replay hash, or
other player/run identity.

## Safe rollout

From `lastlight/worker`, prepare the complete one-line JSON value before running:

```powershell
npx wrangler secret put LASTLIGHT_RUNTIME_CONFIG
```

Paste the JSON at the prompt. Change `configVersion` for every operator change.
If `objectiveEvents` changes, also change `gameplayVersion`; that identity and the
effective objective flag are embedded in new deterministic replay manifests.

Verify the active value without sending credentials:

```powershell
Invoke-RestMethod -Uri https://lastlight-relay.bensonperry.workers.dev/config -Headers @{ Origin = "https://bensonperry.com" }
```

Then use a fresh browser load and copy problem-report diagnostics. They include
the active config version, gameplay version, source, load status, and flags.

## Emergency controls

- Replay export problem: set `deterministicReplay` to `false`.
- Analytics/telemetry problem: set `runTelemetry` to `false`.
- Treasure runner, relay ball, or optional objective problem: set
  `objectiveEvents` to `false` and publish a new `gameplayVersion`.
- Checkpoint bandwidth or serialization problem: set
  `migrationCheckpointReplication` to `false`; new host losses fail safely instead of attempting a restore.
- Relay election problem: set `hostMigrationElection` to `false`; lobby host reassignment remains available, but active runs freeze and fail safely.
- Restore/continuation problem: set `hostMigrationResume` to `false`; checkpoints may continue in shadow mode while active-run promotion is disabled.
- Downed crawl, support, recovery, or presentation problem: set `downedActivity`
  to `false` and publish a new `configVersion` and `gameplayVersion` for new runs.
- Late-join deployment, reserved-seat, or catch-up problem: set
  `joinInProgressNormalization` to `false` and publish a new `configVersion` and
  `gameplayVersion` for new runs. Existing runs retain the contract they started
  with.
- Squad formation or objective-convergence problem: set `squadEnemyDirector` to
  `false` and publish a new `configVersion` and `gameplayVersion` for new runs.
- Freight Grid, Ion Front, Cryo Grid, Undertow, or map-composition problem: set
  `mapMechanics` to `false` and publish a new `configVersion` and
  `gameplayVersion` for new runs.
- Retaliation, surge, pressure-advance, or mutation reward problem: set
  `campaignMutations` to `false` and publish a new `configVersion` and
  `gameplayVersion` for new runs. Existing runs retain their starting contract.
- Mastery award, Field Kit, or progression presentation problem: set
  `specialistMastery` to `false` and publish a new `configVersion` and
  `gameplayVersion` for new runs. Existing runs retain their starting contract;
  local mastery data remains stored but inactive.
- Discovery evidence, dossier selection, Field Manual, or result-award problem:
  set `rareDiscoveries` to `false` and publish a new `configVersion` and
  `gameplayVersion` for new runs. Existing runs retain their starting contract;
  the bounded local collection remains stored but inactive.
- Challenge predicate, award, progress, archive, or presentation problem: set
  `challengeAchievements` to `false` and publish a new `configVersion`. This
  client-only flag does not alter simulation, replay, recovery, migration, or
  signed run-report output; bounded local achievement state remains stored but inactive.
- Seeded schedule, UTC rollover, local-best, report-evidence, or presentation problem:
  set `seededOperations` to `false` and publish a new `configVersion`. This
  client-selected contract flag does not alter standard operations; bounded local
  daily/weekly records remain stored but inactive and standard deployment remains available.
- Shared run-history import or archive problem: set `sharedSquadRunArchive` to
  `false`. This client-only flag does not change deterministic simulation state.
- Restore release defaults: delete the override with
  `npx wrangler secret delete LASTLIGHT_RUNTIME_CONFIG`, then verify `/config` says
  `source: built-in`.

Clients fetch once before deployment with a 1.5-second bound. A validated
last-known-good config is used when the relay is temporarily unreachable; if no
valid cache exists, release defaults are used. Existing runs never change rules
mid-operation.

## Full Worker rollback

List known versions with `npx wrangler versions list`. A previous version can be
restored with:

```powershell
npx wrangler versions deploy <version-id>@100% --yes
```

Prefer a feature override for a feature-specific incident. Before rolling back to
a Worker version that predates `/config`, restore the release-default override
and verify it from a fresh client; otherwise temporarily offline clients can
correctly retain their last-known-good setting.
