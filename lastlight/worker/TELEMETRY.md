# Run telemetry

`POST /telemetry` accepts one aggregate record after a run finishes and writes it to the
`lastlight_runs` Analytics Engine dataset. The endpoint intentionally rejects unknown fields:
callsigns, player IDs, room codes, IP addresses, and request geolocation never enter the dataset.
Analytics Engine retains datapoints for its platform-defined retention period.

## Analytics Engine columns

The ordered fields in `worker.js` map to Analytics Engine columns as follows:

| Column | Meaning |
| --- | --- |
| `blob1` | schema (`run.v1`) |
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

`index1` is the shared value `lastlight-run-v1`; it is never a player/session identifier.

For balance reviews, group by `blob3`, `blob4`, and `blob6`, weight aggregates by
`_sample_interval`, and compare win rate, elapsed time, damage taken, and level reached between
builds (`blob2`).
