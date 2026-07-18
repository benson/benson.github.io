# Lastlight asset inventory

Version: `lastlight.brand.v1`  
Applies to: build `2026.07.18.5`

Every checked-in visual runtime asset is project-authored. Generated imagery was directed and curated for Lastlight and normalized by the repository tooling where applicable. The audio family uses curated CC0 recordings with exact source and integrity records. Source files and provenance stay beside their runtime derivatives so replacements remain attributable and reversible.

| Family | Owned paths | Files | Runtime form | Provenance and fallback |
| --- | --- | ---: | --- | --- |
| Branding | `assets/branding`, `assets/og*` | 5 | SVG, JSON, PNG, WebP | Project-authored mark and social composition; text wordmark remains the UI fallback. |
| Specialist cutouts | `assets/sprites`, `assets/squad-atlas*` | 13 | transparent PNG | Project-authored, generated, and curated; semantic specialist names and CSS framing remain available. |
| Motion | `assets/motion`, `assets/motion-normalized` | 37 | source PNG/WebP and normalized WebP atlases | Project-authored generation plus deterministic normalization; static cutouts are the fallback. |
| Weapons | `assets/weapons` | 21 | transparent WebP | Project-authored; weapon name and family glyph remain required. |
| Enemies | `assets/enemies` | 7 | transparent WebP plus generation record | Project-authored and generated; shape, label, telegraph, and audio cue preserve the role. |
| Environments | `assets/environments`, `assets/environment-chunks` | 8 | WebP backgrounds and atlases | Project-authored and generated; collision and readability contracts do not depend on the bitmap. |
| Map devices | `assets/map-devices` | 4 | transparent WebP | Project-authored and generated; each map device communicates its function visually while exact names and values remain available in Quick Pause. |
| Map mechanics | `assets/map-mechanics` | 4 | WebP terrain textures | Project-authored and generated; mechanic state changes animation rather than terrain presence. |
| Supply containers | `assets/supply-containers` | 51 | transparent PNG and WebP | Project-authored and generated; each map and container family has intact, damaged, and critical authored runtime states, with semantic Quick Pause inspection. |
| Guide | `assets/guide` | 25 | transparent WebP | Project-authored; every image has an adjacent semantic label. |
| Archive | `assets/archive` | 24 | WebP | Project-authored; event, boon, and augment records remain legible as text. |
| Effects | `assets/effects` | 3 | transparent WebP plus canvas effects | Project-authored; the readability pass order owns priority and fallback geometry. |
| Audio | `assets/audio`, `audio-assets.js`, `music-director.js`, `audio-cues.js` | 39 assets and records | streamed and decoded OGG plus generated Web Audio | CC0 recordings with source/license/hash records plus project-authored synthesis fallback; every critical cue has a visual equivalent. |

The 241 files under `assets/` are covered by the families above: 202 existing visual files plus 37 OGG recordings and two audio provenance records. Counts include source records and generation documentation, not just decoded runtime media.

## Source-to-runtime rules

1. Never overwrite a source file with a compressed derivative.
2. Keep direction, crop, cell geometry, anchors, dimensions, and expected runtime path in the owning manifest or generation record.
3. Run sprite and motion-atlas verification after any source change.
4. Do not encode gameplay state, rarity, allegiance, or danger in color or an image alone.
5. A missing decorative image may degrade to geometry or text; it must never change simulation, replay, recovery, multiplayer, archive, report, or telemetry identity.
6. Update this inventory and `brand-contract.js` together when a family or provenance rule changes.
