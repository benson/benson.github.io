# Run telemetry

`POST /telemetry` accepts one aggregate record after a run finishes and writes it to the
`lastlight_runs` Analytics Engine dataset. Rolling deploys accept both schema v1 and v2 and store
them with distinct `run.v1` / `run.v2` schema blobs and schema-specific shared indexes. The
endpoint intentionally rejects unknown fields: callsigns, player IDs or slots, room codes,
reconnect tokens, browser
identity, IP addresses, and request geolocation never enter the dataset. Analytics Engine retains
datapoints for its platform-defined retention period.

## Analytics Engine columns

The ordered fields in `worker.js` map to Analytics Engine columns as follows:

| Column | Meaning |
| --- | --- |
| `blob1` | schema (`run.v1` or `run.v2`) |
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

No contributor array, replay slot, player row, name, or arbitrary synergy ID is accepted. If a
rolling client omits `synergyTelemetry`, it emits schema v1; when the field is present, it emits
schema v2. Empty `ids` are valid only when all six totals are zero.

`index1` is the shared schema value `lastlight-run-v1` or `lastlight-run-v2`; it is never a
player/session identifier.

For balance reviews, group by `blob3`, `blob4`, and `blob6`, weight aggregates by
`_sample_interval`, and compare win rate, elapsed time, damage taken, and level reached between
builds (`blob2`).
