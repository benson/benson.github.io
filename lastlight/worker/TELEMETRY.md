# Run telemetry

`POST /telemetry` accepts one aggregate record after a run finishes and writes it to the
`lastlight_runs` Analytics Engine dataset. Rolling deploys accept schemas v1 through v9 and store
them with distinct `run.v1` through `run.v9` schema blobs and schema-specific shared indexes. The
endpoint intentionally rejects unknown fields: callsigns, player IDs or slots, room codes,
reconnect tokens, browser
identity, IP addresses, and request geolocation never enter the dataset. Analytics Engine retains
datapoints for its platform-defined retention period.

## Analytics Engine columns

The ordered fields in `worker.js` map to Analytics Engine columns as follows:

| Column | Meaning |
| --- | --- |
| `blob1` | schema (`run.v1` through `run.v9`) |
| `blob2` | game build |
| `blob3` | map |
| `blob4` | difficulty |
| `blob5` | outcome (`won` or `lost`) |
| `blob6` | mode (`solo` or `squad`) |
| `blob7` | sorted specialist composition |
| `double1` | player count |
| `double2` | planned duration in seconds |
| `double3` | actual elapsed seconds |
| `double4` | wave reached |
| `double5` | level reached |
| `double6` | enemies killed |
| `double7` | gold earned |
| `double8` | XP collected |
| `double9` | damage dealt |
| `double10` | damage taken |
| `double11` | revives |
| `double12` | distance traveled |

Schema v2 appends the following columns without changing the v1 prefix:

| Column | Meaning | Accepted range |
| --- | --- | --- |
| `blob8` | sorted, unique activated synergy IDs | zero to three allowlisted IDs |
| `double13` | synergy triggers | integer, 0–1,000,000 |
| `double14` | synergy damage | 0–1,000,000,000 |
| `double15` | synergy shielding | 0–1,000,000,000 |
| `double16` | synergy damage mitigated | 0–1,000,000,000 |
| `double17` | aggregate per-specialist formation active seconds | 0–16,000 |
| `double18` | coordinated ultimate chains | integer, 0–10,000 |

The only accepted synergy IDs are `breach-window`, `ultimate-resonance`, and `moving-screen`.
The live game consumed by `buildRunTelemetry` exposes `synergyTelemetry()`; serialized test/result
snapshots may expose the same return value directly as `synergyTelemetry`:

```js
synergyTelemetry() {
  return {
    ids: ["breach-window"],
    totals: {
      triggers: 1,
      damage: 4.2,
      shielding: 0,
      mitigated: 0,
      formationSeconds: 0,
      ultimateChains: 0,
    },
  };
}
```

Schema v3 keeps the complete queryable v2 run datapoint and writes one supplemental,
aggregate-only participation datapoint. This is necessary because Analytics Engine accepts at
most 20 doubles per datapoint; the run datapoint already uses 18. The supplemental point has the
same aggregate run dimensions but no session identifier, so it cannot be joined to a particular
player, room, browser, or run.

| Participation column | Meaning | Accepted range |
| --- | --- | --- |
| `blob1` | schema (`participation.v1`) | exact value |
| `blob2` | game build | allowlisted build identifier |
| `blob3` | map | allowlisted map |
| `blob4` | difficulty | allowlisted difficulty |
| `blob5` | outcome | `won` or `lost` |
| `blob6` | mode | `solo` or `squad` |
| `blob7` | sorted specialist composition | one to four allowlisted specialists |
| `double1` | effective healing | 0–1,000,000,000 |
| `double2` | effective shielding granted | 0–1,000,000,000 |
| `double3` | shield damage prevented | 0–1,000,000,000 |
| `double4` | mitigation damage prevented | 0–1,000,000,000 |
| `double5` | damage assists | integer, 0–1,000,000 |
| `double6` | control assists | integer, 0–1,000,000 |
| `double7` | revives | integer, 0–10,000 |
| `double8` | active revive contribution seconds | 0–16,000 |
| `double9` | objective presence seconds | 0–16,000 |
| `double10` | positive objective movement | 0–1,000,000,000 |
| `double11` | objective completions | integer, 0–10,000 |
| `double12` | elite participations | integer, 0–1,000,000 |
| `double13` | apex participations | integer, 0–10,000 |

The live simulation exposes `participationTelemetry()` as the exact 13-key totals object. Test and
result snapshots may expose that object directly as `participationTelemetry`. Unknown, nested,
missing, non-finite, negative, fractional count, and over-cap values fail closed. No per-slot rows
or contributor arrays are accepted.

```js
participationTelemetry() {
  return {
    effectiveHealing: 120.3,
    effectiveShielding: 98.4,
    shieldDamagePrevented: 51.3,
    mitigationPrevented: 32,
    damageAssists: 7,
    controlAssists: 3,
    revives: 2,
    reviveSeconds: 5.3,
    objectivePresenceSeconds: 44.4,
    objectiveMovement: 812.3,
    objectiveCompletions: 4,
    eliteParticipations: 9,
    apexParticipations: 2,
  };
}
```

Schema v4 adds one `squad-director.v1` aggregate datapoint containing decision count, peak squad
size, the five approach totals, four formation totals, objective pressure, and elite escorts.
Approach and formation counts must each reconcile exactly to the decision total.

Schema v5 adds one `campaign-mutations.v1` aggregate datapoint. Its dimensions are build, map,
difficulty, outcome, and one allowlisted package ID (`base-line`, `contested-operations`, or
`breach-cascade`). Its ordered doubles are encounters, clears, failures, objective completions,
and surge waves; clears plus failures must equal encounters. No encounter instance, contributor,
player, room, or arbitrary string is accepted.

Schema v6 adds one `specialist-mastery.v1` aggregate datapoint for the reporting browser's local
specialist. Its dimensions are build, map, difficulty, outcome, specialist, coarse mastery band
(`1-2`, `3-4`, or `5`), and selected start (`baseline` or `field-kit`). Its two ordered doubles are
completed track challenges (0–1) and unlocked milestones (0–4). It contains no replay slot,
mastery points, claim hash, callsign, room, browser identifier, or run identifier.

Schema v7 adds one `rare-discoveries.v1` aggregate datapoint. Its dimensions are build, map,
difficulty, and outcome. Its ordered doubles are total collection count, newly revealed count,
and collection counts for events, affixes, boons, and augments. Category totals must reconcile
exactly to the collection total. Discovery IDs, dossier order, claim hashes, callsigns, slots,
rooms, browser identifiers, and run identifiers are never accepted. Mastery fields remain an
optional complete group so the `rareDiscoveries` rollback flag stays independent.

Schema v8 adds one `challenge-achievements.v1` aggregate datapoint. Its dimensions are build,
map, difficulty, and outcome. Its ordered doubles are total completed records, newly completed
records, and totals for build, survival, teamwork, operation, discovery, and specialist
categories. Category totals must reconcile exactly to the completed total. Challenge IDs,
predicates, progress history, reward selections, claim hashes, callsigns, slots, rooms, browser
identifiers, and run identifiers are never accepted. Discovery and mastery fields remain
optional complete groups so all three rollback controls stay independent.

Schema v9 adds one `seeded-operations.v1` aggregate datapoint. Its dimensions are build, map,
difficulty, outcome, schedule kind (`daily` or `weekly`), and coarse score band (`attempt`,
`silver`, or `gold`). Its ordered doubles are completion (0/1) and squad size (1â€“4). Schedule
IDs, UTC window strings, deterministic seeds, configuration hashes, report fingerprints,
callsigns, slots, rooms, browser identifiers, and arbitrary strings are never accepted. Challenge,
discovery, and mastery fields remain optional complete groups so rollback controls stay independent.

No contributor array, replay slot, player row, name, or arbitrary synergy ID is accepted. If a
rolling client omits both aggregate methods, it emits schema v1; synergy alone emits schema v2;
participation emits schema v3 and supplies an empty valid synergy aggregate when necessary. Empty
synergy `ids` are valid only when all six synergy totals are zero.

`index1` is the shared schema value `lastlight-run-v1`, `lastlight-run-v2`,
`lastlight-run-v3`, `lastlight-run-v4`, `lastlight-run-v5`, `lastlight-run-v6`, `lastlight-run-v7`, `lastlight-run-v8`, `lastlight-run-v9`,
`lastlight-participation-v1`, `lastlight-squad-director-v1`, `lastlight-campaign-mutations-v1`,
`lastlight-specialist-mastery-v1`, `lastlight-rare-discoveries-v1`, or
`lastlight-challenge-achievements-v1`, or `lastlight-seeded-operations-v1`; it is never a player/session identifier.

For balance reviews, group by `blob3`, `blob4`, and `blob6`, weight aggregates by
`_sample_interval`, and compare win rate, elapsed time, damage taken, and level reached between
builds (`blob2`).
