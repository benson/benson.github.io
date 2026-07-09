# Lastlight

Lastlight is a free 1–4 player browser bullet-heaven prototype built from a mechanical study of League of Legends' 2024 Swarm mode. The playable game uses original characters and artwork because Riot's fan-project policy prohibits using its IP in unauthorized games/apps.

## Local use

Serve the repository root over HTTP, then open `/loldemo/`. Solo requires no backend.

For multiplayer, run the Durable Object relay in `loldemo/worker` and open the frontend with the local relay override:

```text
http://localhost:4173/loldemo/?relay=ws://localhost:8787/room/
```

## Checks

- `npm run check` in `loldemo`
- `npm test` in `loldemo`
- `npm test` in `loldemo/worker`

See `RESEARCH.md` for the source breakdown, exact original mechanics, and prototype coverage.
