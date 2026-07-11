# Deterministic multiplayer soak

The multiplayer soak runs four independent simulations: one host and three followers. Every
replica uses distinct transient player identifiers, while convergence hashes normalize them to
anonymous replay slots. No callsign, resume token, squad code, or transient relay identifier is
written to the report.

The scenario is a complete 60-second run through the apex result. It covers four-player movement
and casts, multiple squad upgrade drafts, scheduled objectives, treasure and relay events, a guest
disconnect/reconnect, and the final result. Stable five-second checkpoints require all four
canonical simulation hashes to match. A mismatch stops at the first divergent checkpoint and
prints the first different canonical field as well as the expected and actual hashes.

## Release gate

Run the same short gate used by CI:

```powershell
npm --prefix lastlight run soak:ci
```

CI also writes `lastlight/artifacts/multiplayer-soak.json` and uploads it beside the deterministic
fixture report. `lastlight/artifacts/` is gitignored.

Structural failures gate a release. The default per-replica/run budgets are:

| Budget | Limit |
| --- | ---: |
| Total live simulation entities | 900 |
| Serialized host snapshot | 1,000,000 bytes |
| Replication messages | 5,000 |
| Pending replication queue | 64 |
| Scheduled simulation tasks | 128 |
| Pending upgrade options | 12 |

Wall-clock timing varies across CI and developer hardware, so p50/p95/p99/max tick timings are
recorded as advisory data and never used as pass/fail thresholds.

## Extended local soak

Run eight full deterministic scenarios with successive seeds and save a report:

```powershell
npm --prefix lastlight run soak:extended
```

For a custom count (maximum 50):

```powershell
node lastlight/soak/run-soak.js --runs 20 --report lastlight/artifacts/multiplayer-soak-20.json
```

## BEN-809 integration adapters

`runMultiplayerSoak({ adapters })` intentionally exposes these seams:

- `transportFactory({ followerCount, hooks })` returns `enqueue`, `drain`, `pendingCount`, and
  `metrics` functions.
- `transportHooks` supports `onSend`, `onDeliver`, and `onAck` for sequence/ack instrumentation.
- `onTick` can drive a deterministic network lab.
- `beforeCheckpoint` can perform an explicit authoritative resync before convergence is checked.
- `onCheckpoint` receives each converged hash.

The stock peer-simulation queue delivers commands at their declared logical tick. A latency/loss
adapter must either preserve that effective tick or perform an authoritative resync in
`beforeCheckpoint`; otherwise the first-divergence diagnostic is expected to fail the run.
