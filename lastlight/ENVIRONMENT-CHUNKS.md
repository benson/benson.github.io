# Asset-derived environment collision

`environment-chunks.js` owns the strict world-geometry contract
`lastlight.environment-chunks.v4`. It connects authored map art to live gameplay:

- one transparent 2×2 landmark atlas per level;
- deterministic layouts derived only from the level id and bounded world cells;
- fixed center, objective-corridor, world-edge, and raised-cover clearance;
- eight solid structures per level at High, Reduced, and Minimal quality;
- exact asset-alpha collision for movement, routing, downed crawling, and ordinary projectile cover;
- Y-sorted rendering so a specialist passes visibly behind or in front of a structure.

Every frame's collision mask is generated directly from its atlas alpha at a fixed threshold. The
same anchor, scale, horizontal flip, and rotation transform is used by Canvas rendering and collision.
Transparent corners and openings stay traversable; every visible opaque pixel is solid. There are no
manually traced polygons or rectangular platforms to drift from the art.

Chunks have `collision: "solid"`. Simulation and renderer derive the same fixed layout from level id,
so geometry is identical in solo, multiplayer, replay, recovery, migration, and every graphics tier
without adding coordinates to snapshots or relay messages. The layout remains snapshot-byte neutral,
and graphics settings cannot change cover.

## Rebuilding masks

Run `npm run collision-masks:build` after replacing an atlas. The generator splits each atlas into its
four frames, encodes opaque runs for every pixel row, records the source SHA-256, and writes
`environment-collision-masks.js`. CI runs `npm run collision-masks:verify` to reject stale masks.

This row-run alpha mask representation scales to arbitrary silhouettes, holes, rotation, mirroring,
and non-uniform rendered size without requiring new runtime geometry code.

## Theme swap

A replacement theme supplies both:

1. `assets.environmentChunks.{warehouse,outskirts,lab,beachhead}` with a unique alpha WebP atlas for
   each level; and
2. an `environmentChunks` contract with the same strict map, mask, and quality coverage.

The current Lastlight atlases were generated as isolated top-down 3/4 prop clusters, converted to
alpha WebP, and validated for four frames, transparent corners, unique paths, and the public asset
budget. Renderer code contains no Lastlight-specific landmark names or file paths.
