# Lastlight

Lastlight is a free 1–4 player browser bullet-heaven prototype with original characters, artwork, maps, enemies, upgrades, and events.

## Local use

Serve the repository root over HTTP, then open `/lastlight/`. Solo requires no backend.

For multiplayer, run the Durable Object relay in `lastlight/worker` and open the frontend with the local relay override:

```text
http://localhost:4173/lastlight/?relay=ws://localhost:8787/room/
```

## Checks

- `npm run check` in `lastlight`
- `npm test` in `lastlight`
- `npm test` in `lastlight/worker`
