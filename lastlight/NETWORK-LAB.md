# Adverse network lab

The network lab is a deterministic, developer-only transport shim. Production
traffic is unchanged unless the lab is explicitly activated in trusted local or
development context.

## Activation

Browser activation requires both a named query profile and a trusted context:

```text
http://localhost:4173/lastlight/?llNetwork=mobile&llNetworkSeed=playtest-7
```

The public production origin rejects the same query string. A development build
may instead call `resolveNetworkLabActivation({ url, development: true })`, or
provide an explicit `profile` and `seed` with that development signal. Supported
profiles are `healthy`, `regional`, `mobile`, `lossy`, and `reconnect`.

## Integration hooks

Create one lab per WebSocket connection and wrap only the serialized transport
boundary:

```js
const activation = resolveNetworkLabActivation({ url: location.href, development: DEV_BUILD });
const networkLab = createActivatedNetworkLab(activation, {
  onForcedDisconnect: () => socket.close(4100, "Network lab reconnect"),
  onError: (error) => captureClientError("network lab", error),
});

function sendSerialized(payload) {
  if (networkLab) networkLab.upstream(payload, (delayed) => socket.send(delayed));
  else socket.send(payload);
}

socket.addEventListener("message", (event) => {
  const receive = (payload) => handleMessage(JSON.parse(payload));
  if (networkLab) networkLab.downstream(event.data, receive);
  else receive(event.data);
});
```

Call `networkLab.teardown()` before replacing or closing the socket. `reset()`
clears queues, counters, timers, and PRNG streams for a fresh repeatable trial.
`diagnostics()` contains counts, bytes, queue peaks, and drop reasons, never
payload content.

## Safety and determinism

- The module owns independent seeded upstream/downstream PRNG streams and never
  imports gameplay RNG.
- It copies binary payloads and never rewrites message content.
- Hostile telegraphs and simulation time are not treated specially; this is a
  transport test, not a gameplay modifier.
- A message is capped at 256 KiB; each direction is capped at 256 queued messages
  and 2 MiB. Delays and reorder windows are also strictly bounded.
- Reconnect triggers exactly once after the profile's audited message count and
  delegates socket closure to the integration callback.
