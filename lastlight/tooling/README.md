# Lastlight sprite atlas toolchain

This directory is the production contract between authored character art and
Lastlight's runtime animation metadata. The manifest is canonical: source files,
hashes, physical rows, direction columns, render anchors, sockets, and logical
clip timing must change together.

## Commands

Run from `lastlight/`:

```bash
npm run sprites:verify
npm run sprites:build
npm run sprites:report
```

- `verify` rebuilds every atlas in memory, validates it, and requires the result
  to be byte-identical to the committed runtime PNG.
- `build` writes the atlas, a checkerboard contact sheet, deterministic preview
  metadata, and a report under the gitignored `artifacts/sprite-tooling/` folder.
- `build -- --runtime` deliberately replaces the committed runtime PNG. Update
  `output.sha256` in the manifest, then run `verify` before committing.
- `report` validates the committed outputs and writes a stable JSON report under
  `artifacts/sprite-tooling/`.

The tool requires Python 3.13 and Pillow 12.1.1. Pillow is pinned in CI because
the committed PNG bytes, not just decoded pixels, are part of the contract.

## Manifest contract

The top level is strict and rejects unknown keys:

```text
{
  schema: "lastlight.sprite-atlas.v1",
  tool: { name, version, pillowVersion },
  theme: { id, module, requiredAnimatedSpecialists[] },
  atlases: Atlas[]
}
```

Each `Atlas` contains exactly:

```text
{
  id,
  specialist,
  source: { path, sha256, width, height, mode },
  output: { path, sha256, width, height, mode: "RGBA" },
  layout: {
    columns, rows, cellWidth, cellHeight,
    directions, states, frames, unusedCells
  },
  render: {
    anchor, drawSize, spriteBounds, collisionOffset,
    groundY, shadow, sockets
  },
  clips,
  processing: { method, chromaKey, bleed, edgePolicy, png }
}
```

The grid is generic from one to 32 rows. Direction columns are deliberately
fixed to `south`, `west`, `north`, `east` so runtime angle mapping cannot drift.
The module named by `theme.module` must export `LASTLIGHT_THEME`; verification
compares its `animations.specialists` registry to the manifest exactly.
Physical state rows are arbitrary lowercase kebab ids. A current 4x6 authoring
sheet should use:

```text
row 0  idle-a
row 1  idle-b
row 2  run-a
row 3  run-b
row 4  action
row 5  hurt-down       (or hurt-death for an enemy toolchain)
```

Every physical frame is explicit and row-major:

```text
{
  id: "run-a.west",
  state: "run-a",
  direction: "west",
  cell: [1, 2],
  sourceRect: [x, y, width, height],
  offset: [0, 0]                  // optional legacy alignment
}
```

`frames` plus `unusedCells` must account for every destination cell exactly
once. Frame ids, destination cells, specialist ids, output paths, and physical
pixels must be unique. Source rectangles may be different sizes, but each must
fit its uniform destination cell after the optional non-negative `offset`.
New exact-cell sources should omit `offset`; it exists to align poses extracted
from legacy generated sheets without changing their pixels.

Logical `clips` are separate from physical rows. The runtime clip order is
`idle`, `run`, `dash`, `castE`, `castR`, `hurt`, `down`, `revive`, `victory`.
Each clip owns loop behavior, timing, and optional scale/offset/rotation. Clips
may reuse rows; for example `hurt` and `down` can both use `hurt-down`, while
`dash`, `castE`, and `castR` can reuse `action`.

## Source and alpha requirements

Preferred new source files are exact-cell RGBA PNGs or an exact uniform RGBA
sheet with `processing.method: "copy"` and `edgePolicy: "validate"`.

- Leave at least the manifest's `bleed` pixels fully transparent on every side.
- Content must include both transparent and opaque pixels and stay inside its
  cell. Unused cells must be fully transparent.
- Do not include duplicate poses under different names.
- Preserve a consistent ground contact and normalized anchor across directions.
- Do not add PNG metadata; the tool strips it during assembly.

Legacy/image-generated RGB sheets may use `method: "chroma-key"`. The manifest
pins the key RGB, soft dominance range, and minimum green value. The converter
creates a soft alpha matte and removes key-color spill with integer arithmetic.
`edgePolicy: "clear"` exists only to migrate old sheets whose generated rows
touch; it deterministically clears the declared gutter. Newly authored sheets
must use `validate` so accidental clipping fails loudly.

Every source file is SHA-256 pinned. Editing or replacing a source requires an
intentional manifest hash update. The runtime atlas also has a SHA-256 and must
equal the in-memory deterministic rebuild byte for byte.

## QA output

`sprites:build` creates, per atlas:

- the rebuilt PNG;
- `contact-sheet.png`, composited over a checkerboard with cell guides;
- `preview.json`, containing frame alpha bounds, pixel hashes, directions,
  physical rows, logical clips, anchors, and sockets;
- a suite-level `report.json`.

These live under `lastlight/artifacts/`, which is gitignored. They are review
artifacts, not runtime dependencies.

## Adding a specialist or swapping the full theme

1. Put source art under the new theme's `assets/sprites/` tree. Do not overwrite
   Lastlight sources while comparing directions.
2. Add an atlas record and add the specialist id to
   `theme.requiredAnimatedSpecialists`.
3. Add the same specialist and output atlas path to the replacement theme's
   `animations.specialists` entry. Theme coverage is exact; missing and extra
   animated specialists both fail.
4. Copy render anchors, bounds, collision offsets, shadow, and sockets into the
   atlas record, then tune them there before mirroring runtime metadata.
5. Build to QA output and inspect every cell/contact sheet.
6. Build with `--runtime`, update the output SHA-256, and verify.
7. Run Lastlight tests. A full aesthetic swap keeps logical asset keys and
   specialist ids stable; only theme paths, sources, atlases, and render metadata
   change.

Never generate contact sheets with platform fonts or timestamps. The tool's QA
artifacts intentionally use only pixels and canonical sorted JSON so two builds
from identical inputs compare byte for byte.
