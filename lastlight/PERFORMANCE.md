# Lastlight performance plan

## Decision

Keep the current Canvas 2D simulation/renderer for now. The July 10 busy-wave report was a solo run, and profiling points to draw pressure rather than simulation or networking.

This build ships the lowest-risk fixes first:

- viewport culling for high-volume world objects;
- indexed interpolation lookups instead of repeated linear searches;
- a 260-item cap for disposable cosmetic effects while preserving damaging telegraphs;
- frame-coalesced inspection hit testing;
- offscreen feather culling.

## Evidence

- A synthetic simulation with 187 effectively immortal enemies and all 12 universal weapons averaged 0.323 ms per update across 1,200 frames; p95 was 0.650 ms and p99 was 0.905 ms.
- A representative render-call proxy (150 enemies, 100 hostile shots, 200 friendly shots) fell from about 9,434 to 2,003 Canvas calls per frame after the culling/index pass, a directional 79% reduction.
- A larger proxy (300 enemies, 600 friendly shots, 1,000 orbs) fell from about 37,109 to 10,068 calls, a directional 73% reduction.

These are synthetic engineering measurements, not player-facing FPS claims. They establish which path to profile in a real browser next.

## Targets

| Budget | Desktop target | Low-end/mobile target |
| --- | ---: | ---: |
| Total frame p95 | 16.7 ms | 33 ms |
| Renderer p95 | 8 ms | 16 ms |
| Simulation p95 | 4 ms | 8 ms |
| Frames over 33 ms | under 1% | under 5% |

## Next measurement pass

Add an opt-in F3 overlay and attach its aggregate summary to problem reports. Track frame/simulation/render/HUD p50, p95 and p99; current and maximum entity counts; rendered versus culled counts; and snapshot bytes for multiplayer.

Use deterministic fixtures at the reported 1615×1060 viewport:

- representative: 170 enemies, 200 friendly shots, 100 hostile shots, 500 orbs, 200 effects;
- stress: 300 enemies, 600 friendly shots, 300 hostile shots, 1,000 orbs, 260 effects.

## Migration thresholds

Run a PixiJS spike only if the optimized Canvas renderer still exceeds 8 ms p95 or consumes more than 60% of the frame. Require at least 2× render headroom on identical recorded snapshots before committing to the swap.

Add spatial indexing before considering a broader engine migration if simulation exceeds 4 ms p95. Phaser is a strategic product choice only if the roadmap independently needs its scenes, tilemaps, physics, or editor workflow; it is not the first response to this report.

Current reference material: [PixiJS renderer guidance](https://pixijs.com/8.x/guides/components/renderers), [PixiJS culling](https://pixijs.com/8.x/guides/components/application/culler-plugin), and [Phaser 4 renderer architecture](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games).
