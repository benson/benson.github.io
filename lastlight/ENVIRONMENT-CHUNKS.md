# Authored environment chunks

`environment-chunks.js` owns the strict world-geometry contract
`lastlight.environment-chunks.v2`. It connects authored map art to live gameplay:

- one generated transparent 2×2 landmark atlas per operation;
- a deterministic layout derived only from map id and bounded world-cell coordinates;
- fixed center, objective-corridor, world-edge, and raised-cover clearance;
- four canonical solid structures per operation at High, Reduced, and Minimal quality;
- authored grounded footprints for movement, enemy routing, downed crawling, and ordinary projectile cover;
- Y-sorted rendering so a specialist passes visibly behind or in front of a structure.

Chunks have `collision: "solid"`. Their fixed layout is derived from map id by both simulation and
renderer, so collision is identical in solo, multiplayer, replay, recovery, migration, and every
graphics tier without adding coordinates to snapshots or relay messages. This keeps the layout
snapshot-byte neutral while making every building-shaped landmark a truthful gameplay affordance.

## Theme swap

A replacement theme supplies both:

1. `assets.environmentChunks.{warehouse,outskirts,lab,beachhead}` with a unique alpha WebP atlas
   for each operation; and
2. an `environmentChunks` contract with the same strict map, footprint, and quality coverage.

The current Lastlight atlases were generated as isolated top-down 3/4 prop clusters on a flat
chroma background, converted locally to alpha WebP, and validated for four frames, transparent
corners, unique paths, and the public asset budget. Renderer code never contains Lastlight-specific
landmark names or file paths.

## Readability and motion

The structures remain slightly darkened behind the combat hierarchy but render near-opaque so they
read as physical objects. Generated art does not animate, so reduced-motion output is identical.
Every quality tier retains the same four structures because graphics settings cannot change cover.
