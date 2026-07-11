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

The normalized runtime WebP is exactly 1024 × 1536 (or 1024 × 1280 for a
five-row atlas). Every cell uses foot anchor `[0.5, 0.875]`: the contact point
between feet and ground is at pixel `(128, 224)`.
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

## Delivered runtime files

Specialists:

- `assets/sprites/zuri-motion-atlas.png` (prototype grid)
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

The authored WebPs above are immutable, SHA-pinned normalization sources. Live
runtime atlases are the corresponding WebPs under `assets/motion-normalized/`.
Spitter, Bomber, and the Beachhead apex normalize to five physical rows (1024 ×
1280) because their authored locomotion uses one key pose; all others normalize
to six rows (1024 × 1536).

## Delivered map apexes

- `assets/motion/bosses/warehouse.webp`
- `assets/motion/bosses/outskirts.webp`
- `assets/motion/bosses/lab.webp`
- `assets/motion/bosses/beachhead.webp`

## Current state

`assets/sprites/zuri-motion-atlas.png` is a 1256 × 1255, 4 × 5 prototype. It
contains real directional idle, run, action, and hurt poses. Cast, down, revive,
and victory currently reuse those physical rows and are therefore marked
unauthored. The other eight specialists now have directional idle, run, action,
hurt, and down art. All six field enemy archetypes have directional idle,
locomotion, attack-contact, hurt, and death art. Logical recovery frames reuse
those authored poses with bounded transforms. Tunnelmaw, Red Hunger, Void
Empress, and Abyss Blade each have a dedicated directional apex atlas.

`getMissingMotionAssets()` returns only the Zuri prototype because it still uses
the legacy 4 × 5 grid. Any future unavailable atlas is not requested by the
browser, so there are no intentional 404s. To activate a delivered atlas, place
it at the exact path, set its manifest `available` to `true` and `status` to
`ready`, confirm `expectedSize`, and mark only genuinely authored logical clips
as `authored: true`. The renderer verifies dimensions at runtime and falls back
to the existing cutout if they do not match.
