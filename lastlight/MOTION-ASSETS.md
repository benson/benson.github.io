# Motion atlas production contract

The runtime motion schema is `lastlight.motion.v1`. It is implemented now, but
the current art set is not a completed animation set.

## Compact physical atlas

Production atlases use a configurable grid. New Lastlight atlases use four
direction columns by six physical pose rows, with transparent 256 × 256 cells:

| Column | Direction |
| --- | --- |
| 0 | South |
| 1 | West |
| 2 | North |
| 3 | East |

| Row | Physical pose |
| --- | --- |
| 0 | Idle A |
| 1 | Idle B / anticipation |
| 2 | Run A |
| 3 | Run B |
| 4 | Action or attack contact |
| 5 | Hurt / down / death |

The final WebP is exactly 1024 × 1536. Every cell uses foot anchor `[0.5,
0.875]`: the contact point between feet and ground is at pixel `(128, 224)`.
Keep that point stationary between cells. Atlases must not include shadows,
glows, selection rings, health bars, labels, camera movement, or opaque
background pixels.

Logical clips reuse physical rows with authored timing and small transforms.
Specialists expose `idle`, `run`, `mobility`, `cast`, `hurt`, `down`, `revive`,
and `victory`; engine states `dash`, `castE`, and `castR` bind to the appropriate
logical clip. Enemies and bosses expose `idle`, `locomotion`, `attackWindup`,
`attackContact`, `attackRecovery`, `hurt`, and `death`.

Reduced-motion mode keeps the physical anticipation and contact poses and their
timing, but removes metadata-driven offset, rotation, and squash/stretch.

## Exact outstanding files

Specialists:

- `assets/motion/specialists/zuri.webp`
- `assets/motion/specialists/echo.webp`
- `assets/motion/specialists/sola.webp`
- `assets/motion/specialists/bront.webp`
- `assets/motion/specialists/fang.webp`
- `assets/motion/specialists/gale.webp`
- `assets/motion/specialists/rift.webp`
- `assets/motion/specialists/nova.webp`
- `assets/motion/specialists/vesper.webp`

Enemy archetypes:

- `assets/motion/enemies/mite.webp`
- `assets/motion/enemies/hound.webp`
- `assets/motion/enemies/spitter.webp`
- `assets/motion/enemies/brute.webp`
- `assets/motion/enemies/bomber.webp`
- `assets/motion/enemies/shark.webp`

Map apexes:

- `assets/motion/bosses/warehouse.webp`
- `assets/motion/bosses/outskirts.webp`
- `assets/motion/bosses/lab.webp`
- `assets/motion/bosses/beachhead.webp`

## Honest current state

`assets/sprites/zuri-motion-atlas.png` is a 1254 × 1254, 4 × 5 prototype. It
contains real directional idle, run, action, and hurt poses. Cast, down, revive,
and victory currently reuse those physical rows and are therefore marked
unauthored. The other eight specialists have one static cutout each.
The six enemy archetypes have static cutouts. Map apexes currently use the safe
procedural fallback and have no dedicated image.

`getMissingMotionAssets()` returns all 19 incomplete rigs. Missing atlases are
not requested by the browser, so there are no intentional 404s. To activate a
delivered atlas, place it at the exact path, set its manifest `available` to
`true` and `status` to `ready`, confirm `expectedSize`, and mark only genuinely
authored logical clips as `authored: true`. The renderer verifies dimensions at
runtime and falls back to the existing cutout if they do not match.
