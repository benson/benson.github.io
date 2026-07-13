# Active-run admission protocol v2

The relay, not the browser host, owns active-run seat allocation. A run may use
at most four anonymous replay slots. Slots are assigned lowest-first and are
never reassigned to a different identity during that run. A disconnected seat
remains bound to its `hello` resume token; the token is immutable for the socket
lifetime and is never forwarded to peers.

## Hello and welcome

A v2 client adds `roomProtocolVersion: 2` to `hello`, alongside its profile and
host-migration capabilities. Fresh active-run admission requires both the
current host and joining client to advertise v2 and to have an exact migration
compatibility match. Legacy clients remain eligible only to reconnect to a
token-authenticated existing seat.

The active-run `welcome` contains:

```json
{
  "type": "welcome",
  "roomProtocolVersion": 2,
  "runActive": true,
  "admission": {
    "kind": "fresh",
    "roomProtocolVersion": 2
  }
}
```

`admission.kind` is one of:

- `fresh`: compatible client may choose a specialist and package; no slot has
  been consumed yet;
- `reconnect`: the token-authenticated seat is reserved and `slot` is present;
- `waiting`: migration is in progress; a reconnect may include `slot`, while a
  fresh request may be queued after selection;
- `denied`: `reason` explains the fail-closed result.

Denied/selecting/pending sessions do not receive active gameplay broadcasts and
cannot route input, casts, choices, pings, or draft actions.

## Fresh selection

The client may update `profile` while it is still selecting. Those updates stay
at the relay and never admit or re-admit the player. The resume token is ignored
in every post-hello profile.

Selection is committed with exactly one strict request:

```json
{
  "type": "join_request",
  "protocolVersion": 2,
  "specialist": "fang",
  "packageId": "assault"
}
```

`packageId` is exactly one of `signature`, `assault`, or `survival`. When the
request is accepted, the relay atomically binds the session token to the lowest
never-used slot before notifying the host. Repeated requests are ignored.

## Host admission barrier

The relay sends only the current host:

```json
{
  "type": "run_admission",
  "protocolVersion": 2,
  "admissionId": "a0-session-2",
  "kind": "fresh",
  "replaySlot": 2,
  "packageId": "assault",
  "profile": {
    "id": "session",
    "name": "Rookie",
    "specialist": "fang",
    "ready": false,
    "replaySlot": 2
  },
  "_from": "session"
}
```

Reconnect admissions use the same envelope with `kind: reconnect` and omit
`packageId`. The host must use the supplied slot and kind; it must never invent
a slot or infer reconnect authority from a callsign/profile.

After authoritative insertion, the host replies directly to that session with
one of:

```json
{"type":"join_committed","protocolVersion":2,"admissionId":"a0-session-2","replaySlot":2,"_to":"session"}
```

```json
{"type":"join_rejected","protocolVersion":2,"admissionId":"a0-session-2","replaySlot":2,"reason":"run-locked","_to":"session"}
```

Only the committed host may resolve an admission, and the target, ID, and slot
must match the relay's pending record. A committed session becomes eligible for
active broadcasts. A rejected slot is not reused in that run.

The host should publish an immediate migration checkpoint after commit. If host
migration begins first, the relay queues the admission and replays it exactly
once to the committed compatible successor. A session absent from the retained
checkpoint is re-admitted after migration rather than silently treated as part
of restored state.

## Lifecycle and rolling behavior

- `return_lobby` clears every run seat, token binding, admission ID, and pending
  admission.
- An active room with no committed host or migration election denies joins.
- Duplicate live tokens are denied in an active run.
- An uninitialized socket may wait in a bounded handshake queue, so a reconnect
  is not rejected merely because four identities already exist.
- A legacy host receives a single legacy `profile` only for an authenticated
  reconnect. Fresh late joins require v2 end to end and otherwise fail closed.

