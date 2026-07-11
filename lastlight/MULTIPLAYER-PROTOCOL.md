# Multiplayer input protocol

Build `2026.07.11.5` uses input protocol v2. The relay remains a transport; the
host browser is authoritative for simulation and deterministic replay.

## Envelopes

A v2 guest input is:

```json
{"type":"input","protocolVersion":2,"seq":17,"input":{"x":1,"y":0,"aim":0.5,"autoAim":true}}
```

Sequences are monotonic integers from `0` through `2147483647`. The host applies
only a sequence newer than the last accepted sequence for that relay peer. Its
snapshots acknowledge the last applied sequence for each active sequenced peer:

```json
{"type":"snapshot","protocolVersion":2,"ack":{"peer-id":17},"state":{}}
```

Both envelopes have exact allowlisted fields. Inputs, sequences, acknowledgement
keys, squad size, and the existing relay message byte limit are bounded.

## Rolling compatibility

- A v2 host accepts legacy unsequenced input until that peer sends its first v2
  input. It then rejects legacy and stale input for that connection.
- A v2 guest accepts legacy snapshots and reports `mode: legacy` in diagnostics.
- A legacy host ignores v2 input metadata and continues reading `input`.
- A legacy guest ignores acknowledgement metadata and continues reading `state`.

This permits Worker and static-client rollout in either order. Sequence state is
reset on a new run, socket teardown, lobby return, and peer removal, so a
reconnecting browser can begin again at sequence zero under its new relay ID.

## Replay and privacy

Only inputs accepted by the authoritative host reach `ReplayRecorder`. Replay
command order therefore matches host application order, never client timestamps
or network sequence values. Transport sequence numbers and relay peer IDs are not
included in replay exports or problem-report protocol diagnostics. Diagnostics
contain only protocol version/mode, counts, acknowledgement age, and aggregate
rejection counters.
