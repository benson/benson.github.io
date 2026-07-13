# Lastlight

Lastlight is a free 1–4 player browser bullet-heaven prototype with original characters, artwork, maps, enemies, upgrades, and events.

## Local use

Serve the repository root over HTTP, then open `/lastlight/`. Solo requires no backend.

For multiplayer, run the Durable Object relay in `lastlight/worker` and open the frontend with the local relay override:

```text
http://localhost:4173/lastlight/?relay=ws://localhost:8787/room/
```

## Balance contract

Simulation tuning lives in `balance-config.js`. Every contract revision must:

1. change `BALANCE_VERSION`;
2. update the canonical `BALANCE_HASH` assertion in `tests/balance-config.test.js`;
3. keep the catalog and runtime equivalence tests green; and
4. record both values in replay or fixture headers.

The contract is recursively immutable and `getBalanceConfig(version)` rejects
unknown versions rather than silently running them with current values.

## Runtime rollback controls

The browser loads a strict, identity-free runtime config from the relay before
deployment. Operator controls, emergency procedures, and the complete allowlist
are documented in `worker/FEATURE-FLAGS.md`.

## Motion assets

Directional atlas metadata, safe fallbacks, and the exact outstanding authored
art matrix are documented in `MOTION-ASSETS.md`.

## Multiplayer protocol

Sequenced input, snapshot acknowledgements, rolling compatibility, and replay
boundaries are documented in `MULTIPLAYER-PROTOCOL.md`.

Squad synergy state uses the same deterministic contract: the runtime flag and
registry version are pinned in replay headers, interrupted-run recovery, and
host-migration compatibility. Only allowlisted team-level synergy aggregates
are accepted by run telemetry; see `worker/TELEMETRY.md` for the schema and
privacy limits.

Shared participation credit is pinned by anonymous replay slot across replay,
interrupted-run recovery, reconnect, and host migration. Only effective support,
actual prevention, qualified assists, completed revive work, objective work,
and elite/apex participation count. Telemetry receives aggregate totals only.

## Checks

- `npm run check` in `lastlight`
- `npm test` in `lastlight`
- `npm test` in `lastlight/worker`
