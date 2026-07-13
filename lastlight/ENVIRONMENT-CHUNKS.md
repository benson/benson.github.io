# Authored environment chunks

`environment-chunks.js` owns the strict cosmetic composition contract
`lastlight.environment-chunks.v1`. It sits between the repeating floor texture and live gameplay:

- one generated transparent 2×2 landmark atlas per operation;
- a deterministic layout derived only from map id and bounded world-cell coordinates;
- fixed center, objective-corridor, world-edge, and raised-cover clearance;
- global High/Reduced/Minimal budgets of 12/8/4 chunks;
- background-only rendering below map mechanics, objectives, pickups, combatants, projectiles, and telegraphs.

Chunks have `collision: "none"`. They never enter the simulation, public snapshot, replay,
recovery, migration, telemetry, or relay protocol. The renderer derives the same cosmetic world
layout locally and camera-culls it. This makes the feature snapshot-byte neutral and prevents art
from becoming a hidden gameplay affordance.

## Theme swap

A replacement theme supplies both:

1. `assets.environmentChunks.{warehouse,outskirts,lab,beachhead}` with a unique alpha WebP atlas
   for each operation; and
2. an `environmentChunks` contract with the same strict map and quality coverage.

The current Lastlight atlases were generated as isolated top-down 3/4 prop clusters on a flat
chroma background, converted locally to alpha WebP, and validated for four frames, transparent
corners, unique paths, and the public asset budget. Renderer code never contains Lastlight-specific
landmark names or file paths.

## Readability and motion

The chunks are intentionally darkened and desaturated behind the combat hierarchy. Generated art
does not animate, so reduced-motion output is identical. Minimal quality retains four authored
world landmarks per operation while preserving the existing environmental and combat budgets.
