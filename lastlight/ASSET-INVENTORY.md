# Lastlight asset inventory

Version: `lastlight.brand.v1`  
Applies to: build `2026.07.18.4`

Every checked-in runtime asset is project-authored. Generated imagery was directed and curated for Lastlight, normalized by the repository tooling where applicable, and carries no external stock or third-party asset dependency. Source files stay beside their runtime derivatives so replacements remain attributable and reversible.

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
| Audio | `audio-cues.js` | 0 binary assets | generated Web Audio | Project-authored synthesis with no external samples; every critical cue has a visual equivalent. |

The 202 files under `assets/` are covered by the visual families above. Audio is deliberately code-generated and therefore adds no binary asset. Counts include source records and generation documentation, not just decoded runtime images.

## Source-to-runtime rules

1. Never overwrite a source file with a compressed derivative.
2. Keep direction, crop, cell geometry, anchors, dimensions, and expected runtime path in the owning manifest or generation record.
3. Run sprite and motion-atlas verification after any source change.
4. Do not encode gameplay state, rarity, allegiance, or danger in color or an image alone.
5. A missing decorative image may degrade to geometry or text; it must never change simulation, replay, recovery, multiplayer, archive, report, or telemetry identity.
6. Update this inventory and `brand-contract.js` together when a family or provenance rule changes.
