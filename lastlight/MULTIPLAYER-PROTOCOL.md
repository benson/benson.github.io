# Multiplayer authority protocol

Protocol v3 adds authority epochs and deterministic host migration to the v2
sequenced-input contract. The relay remains a transport and election arbiter;
exactly one browser owns the authoritative `Simulation` and replay recorder at
any point in a run.

Host migration is fail-closed. Peers freeze the battlefield while authority is
unavailable. A run continues only when the relay has granted a new epoch and a
compatible successor has validated the latest deterministic checkpoint.

## Authority epochs and envelopes

The relay starts a run in epoch `0`. Every active-run host election attempt
increments the epoch before offering authority to a successor. Epochs are
monotonic integers from `0` through `2147483647`; they never move backwards or
wrap during a room's lifetime.

A v3 guest input binds its monotonic input sequence to the current authority
epoch:

```json
{"type":"input","protocolVersion":3,"epoch":2,"seq":17,"input":{"x":1,"y":0,"aim":0.5,"autoAim":true}}
```

The host accepts only an input in its committed epoch with a sequence newer
than the last accepted sequence for that peer. Its snapshot carries the epoch,
an authority-local monotonic snapshot sequence, the authoritative simulation
tick, and each peer's accepted input frontier:

```json
{"type":"snapshot","protocolVersion":3,"epoch":2,"snapshotSeq":41,"tick":912,"ack":{"peer-id":17},"state":{"tick":912}}
```

The snapshot `tick` must equal `state.tick`. A guest accepts a snapshot only
when all of these are true:

- its epoch equals the guest's committed epoch;
- `_from` is the relay-announced host for that epoch;
- `(tick, snapshotSeq)` is newer than the last accepted authority frame.

This gate fences delayed snapshots from the old host, duplicate frames, and
presentation rewinds. Casts, draft actions, choice messages, and cast-audio
messages are epoch-framed as well. Draft actions retain their round and revision
guards, so a delayed choice cannot mutate a newer offer.

## Migration capabilities and compatibility

The WebSocket `hello` message advertises the strict host-migration capability
schema and the deterministic compatibility tuple:

```json
{
  "schema":"lastlight.host-migration.v1",
  "protocolVersion":4,
  "compatibility":{
    "build":"build-id",
    "balanceVersion":"balance-v1",
    "balanceHash":"fnv1a32:01234567",
    "configVersion":"release-2026.07.13.8",
    "gameplayVersion":"downed-v1",
    "objectiveEvents":true,
    "squadSynergies":true,
    "sharedParticipationCredit":true,
    "downedActivity":true,
    "registryVersion":"lastlight.squad-synergy.v1",
    "recoveryVersion":6
  }
}
```

All fields must match exactly. A missing, malformed, or incompatible capability
makes that peer ineligible to receive active-run authority. Compatibility is
checked before a checkpoint is retained and again before a successor is
offered it; recovery is never attempted on a best-effort or mixed-build basis.

## Deterministic checkpoints

While checkpoint replication is enabled, the current host publishes at most
one `migration_checkpoint` every 60 simulation ticks. The relay retains only
the latest valid, strictly newer checkpoint.

A checkpoint is bound to one epoch, tick, canonical state hash, compatibility
tuple, and ordered anonymous roster. Its identity is
`e{epoch}-t{tick}-{hash}`. It contains:

- the complete anonymous `Simulation.exportRecoveryState()` payload;
- the deterministic replay draft at the same tick, when replay is enabled;
- the last accepted input sequence for each roster peer;
- the roster's transient relay IDs mapped to unique replay slots `0..3`.

The recovery state's tick, replay draft tick, checkpoint tick, and canonical
hash must agree before the candidate can declare readiness. Callsigns, room
codes, resume tokens, contact details, and client identity fields are forbidden
from durable recovery and replay state. Resume tokens remain relay-scoped seat
proof and are not embedded in a checkpoint.
The browser stores that proof per tab in session storage, so opening the same
invite in another tab creates a distinct seat. The relay also strips a token
from any second live session that presents the same proof, preventing a tab
collision from overwriting replay-slot ownership.

The deterministic checkpoint body is capped at 1,500,000 bytes. The relay and
developer network lab allow a 1,550,000-byte wire envelope; ordinary gameplay
messages retain their smaller relay limit. The adverse-network simulator caps
each direction's delayed queue at 8 MiB and records explicit `message_bytes` or
`queue_bytes` drops instead of growing without bound.

## Election and readiness barrier

When the active host socket closes, the relay clears `hostId`, increments the
authority epoch, freezes ordinary run traffic, and selects from connected peers
that are present in the retained checkpoint and exactly compatible with it.
Candidates are ordered by ascending replay slot, then original join order as a
deterministic tie-breaker.

The relay broadcasts `migration_started` and sends only the selected candidate
a `migration_offer` containing the checkpoint. The candidate must:

1. validate the checkpoint schema, bounds, compatibility, and identity;
2. restore the simulation with the checkpoint's live relay-ID-to-slot map;
3. verify the restored canonical hash;
4. restore the replay draft and accepted-input frontier;
5. send `migration_ready` bound to the offered epoch, checkpoint ID, tick, and
   hash.

The prepare window is 6 seconds per candidate. A timeout or candidate
disconnect moves to the next eligible replay slot. The relay commits `hostId`
and broadcasts `host_changed` only after a matching readiness message. Until
that commit, nobody may publish snapshots or advance gameplay.

On commit, every client installs the new `(epoch, hostId)` authority gate. The
successor begins from the checkpoint tick and applies only guest inputs newer
than the restored acknowledgement frontier. The old host, if it reconnects,
returns as a guest in the current epoch and cannot reclaim authority with
old-epoch traffic.

## Failure behavior and fencing

The relay rejects or ignores:

- authority messages from a sender other than the committed host;
- active-run messages whose epoch differs from the room epoch;
- checkpoints from a non-host, an incompatible host, the wrong epoch, or a tick
  no newer than the retained checkpoint;
- readiness from any peer except the current candidate, or readiness whose
  epoch/checkpoint/tick/hash tuple differs from the offer;
- all ordinary run traffic while an election is in progress.

If there is no checkpoint, migration is disabled, every compatible candidate
fails, or no successor remains, the relay broadcasts `migration_failed`. Clients
show an unavailable state and do not fork the run, promote a render snapshot,
or silently continue solo. Local interrupted-run recovery remains a separate,
explicit flow.

## Rolling compatibility

- Epoch `0` accepts legacy unsequenced or v2 input only until that peer sends
  its first v3 input. After v3 traffic, legacy input is rejected.
- Any migrated epoch (`>0`) rejects legacy input because it cannot be fenced.
- V3 readers can parse legacy v2 snapshots during the epoch-0 rollout, but
  legacy peers are not eligible migration successors.
- Sequence state resets for a genuinely new run or socket lifecycle. During
  migration, the successor restores the accepted v3 acknowledgement frontier
  instead of resetting it.

Static client and Worker rollout may therefore occur in either order without
granting legacy clients unsafe post-migration authority.

## Squad synergy deterministic state

Squad synergies are authoritative simulation state, not a client-side combat
effect. The `squadSynergies` flag and exact `registryVersion` are part of the
gameplay feature contract. A run with a disabled flag or different registry
cannot be replayed, restored, or offered to a migration successor as though it
were compatible.

Replay schema v6 records both values in its feature header. Recovery simulation
version 5 serializes the bounded synergy state: Breach Window control windows
and target cooldowns, Ultimate Resonance cast history and cooldown, Moving
Screen pair hysteresis, and aggregate per-slot counters. Host-migration protocol
version 3 includes the flag, registry version, and recovery version in its
strict compatibility tuple. Every restored state is validated before play
resumes, and its canonical hash includes the synergy state.

Presentation remains derived from the authoritative snapshot. Formation links,
HUD chips, announcements, guide copy, and result cards do not feed back into
simulation or command ordering. Run analytics receives only allowlisted team
aggregates; the schema and privacy bounds are documented in
[`worker/TELEMETRY.md`](worker/TELEMETRY.md).

## Shared participation deterministic state

Shared participation credit is authoritative, anonymous replay-slot state. Runtime
config schema v3 adds the `sharedParticipationCredit` flag to the exact gameplay
contract. When enabled, `lastlight.participation.v1` records bounded per-slot
healing, shielding, damage prevention, control and revive assists, objective
presence and movement, elite/apex participation, and synergy contribution.
Actual effective amounts are counted: over-heal, over-shield, overkill, duplicate
periodic effects, duplicate network traffic, and idle proximity do not create
credit.

Replay schema v6 and replay-draft schema v3 record the flag. Replay v5 and older,
and replay-draft v2 and older, normalize it to `false` without mutating the legacy
manifest. Recovery envelope v3 and simulation version 5 persist and validate the
participation state. Host-migration protocol v3 includes the flag and recovery
version in its exact compatibility tuple, so mixed attribution contracts cannot
inherit authority. Anonymous replay slots survive disconnect, reconnect, recovery,
and migration; callsigns, room codes, resume tokens, and transient relay IDs do not
enter durable participation state.

Disabling `sharedParticipationCredit` is the rollback boundary. It leaves combat,
objectives, health, shields, and existing squad synergies unchanged while omitting
new credit state, live acknowledgements, result details, and v3 participation
telemetry. Runs created under opposite flag values are deliberately incompatible
for replay, recovery, and migration.

## Downed activity deterministic state

Runtime config schema v4 adds the independent `downedActivity` flag. When it is
enabled, `lastlight.downed-activity.v1` owns anonymous per-slot crawl position,
velocity, facing, bleedout ticks, and support-pulse cooldown. Crawl uses the same
fixed 60 Hz authority clock, cover rectangles, and world bounds as the run. A
downed E command can grant only a small effective shield to nearby standing
allies; weapons, damage, healing, pickups, objectives, relay work, revive work,
and self-revive remain unavailable.

Replay schema v7 and draft schema v4 record the flag; replay v6 and draft v3
normalize it to `false` and retain their legacy canonical hash shape. Recovery
envelope v4 and simulation version 6 validate the exact bounded activity state.
Host-migration protocol v4 includes the flag and recovery version in its strict
compatibility tuple. Disabling `downedActivity` restores the previous immobile
downed behavior for newly created runs without changing the active run in place.

## Replay, privacy, and diagnostics

Only commands accepted by the authoritative host reach `ReplayRecorder`.
Replay command order follows authority application order, never client wall
clock time or transport sequence values. Migration restores the anonymous
replay draft at the checkpoint tick so final verification continues across the
authority change.

Problem-report diagnostics expose aggregate epoch, acknowledgement, rejection,
queue, and migration status only. They do not include message bodies, room
codes, callsigns, resume tokens, transient peer identifiers, or the checkpoint
payload.

## Feature flags, rollout, and rollback

Migration has three independently reversible runtime flags:

- `migrationCheckpointReplication`: publish and retain checkpoints; may run in
  shadow mode without electing or resuming;
- `hostMigrationElection`: allow the relay to select and offer a successor;
- `hostMigrationResume`: allow a validated candidate to commit authority and
  continue the run.

Participation attribution has its own reversible `sharedParticipationCredit`
flag. Because it affects deterministic state, a flag change applies only to new
runs; an active run never changes compatibility in place.

Downed activity has its own reversible `downedActivity` flag with the same
new-run-only compatibility rule.

Roll out in that order. Checkpoint shadow validation should precede election,
and election telemetry should precede live resume. Disabling checkpoint
replication makes future host losses fail safely. Disabling election or resume
keeps the run frozen and unavailable rather than reverting to unfenced host
assignment.

Immediately disable `hostMigrationResume` for any canonical hash divergence,
old-epoch acceptance, split authority, duplicate terminal result, or privacy
leak. Disable election as well for candidate-selection or timeout loops. Disable
checkpoint replication for serialization, bandwidth, queue, or memory growth.
The previous v2 behavior is not used as a live-run fallback; rollback means
safe run termination while lobby host reassignment remains available.

Release gates for enabling resume are:

- zero split-brain, stale-epoch acceptance, canonical divergence, privacy leak,
  or duplicate result across the forced-migration soak;
- migration success at least 99.5%;
- gameplay freeze p95 no more than 4 seconds and p99 no more than 6 seconds;
- invalid restore below 0.1%;
- client migration memory no more than 2 MiB above the retained checkpoint and
  delayed transport queues no more than their 8 MiB per-direction cap;
- steady-state network growth no more than 25% and long-frame regression no
  more than one percentage point.

Any hard invariant failure blocks the build. Operational rollback also triggers
when success falls below 99%, p95 exceeds 5 seconds, invalid restore exceeds
0.5%, or the memory/network budgets are breached.

## Upgrade recommendation coordination v1

Upgrade recommendations use a separate presentation-only protocol. They never
enter `Simulation`, snapshots, recovery, replay, RNG, combat hashes, balance
contracts, or run telemetry. Identity is limited to authenticated replay slots.

A guest sends a strict `draft_recommendation` request containing the current
authority epoch, a per-seat sequence, target replay slot, target draft round and
revision, option index, and active state. The relay adds the authenticated
sender and recommender slot, rate-limits the seat, and routes the request only
to the current host. The host resolves the option index against authoritative
pending choices and rejects self-targeting, stale drafts, locked targets,
duplicates, and nonparticipants before publishing `draft_recommendation_state`.
The relay broadcasts only a state delta matching a pending guest request, or a
properly attributed host-owned recommendation.

Each recommender may hold one active recommendation per target draft, so a
four-player room is bounded to 12 entries. A new recommendation moves the
existing marker atomically; selecting the same marker again removes it. A host
may send a strict, sorted `draft_recommendation_sync` directly to one peer after
`sync_game`. Connected clients retain the replay-slot store through migration;
the successor rebases it to the new epoch, prunes against restored pending
choices, and sends a new directed sync to every peer. Recommendation sequence
and pending-request fences reset at migration, while relay abuse budgets remain
seat-bound.

`upgradeRecommendations` disables request, state, sync, controls, and markers
without changing gameplay compatibility. Disabling it clears client
presentation state and leaves the active draft and deterministic run untouched.
