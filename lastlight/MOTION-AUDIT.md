# Specialist runtime motion audit

The motion audit produces review evidence from the same theme manifest, motion
state resolver, frame timing, facing hysteresis, and `specialistAtlasRenderPlan`
used by `Renderer.drawPlayers`. It does not infer rows from atlas filenames or
crop a separately maintained layout. A renderer change therefore changes the
audit's deterministic metadata or decoded-pixel expectations.

## Commands

Run from `lastlight/` with Python 3.13, Pillow 12.1.1, and Node.js:

```bash
npm run motion-audit:verify
npm run motion-audit:report
```

`motion-audit:verify` is the CI path. It resolves and renders the full matrix in
memory, checks committed metadata and decoded RGBA hashes, and writes no media.
It fails on an invalid rig, missing or incorrectly sized atlas, empty occupied
cell, opaque cell background, source crop outside the atlas, missing matrix or
scenario coverage, unexpected fallback, changed runtime selection, or changed
decoded pixels.

`motion-audit:report` runs the same checks and writes review-only output under
the ignored `artifacts/motion-audit/` directory:

- `index.html` links every specialist's evidence;
- one labeled 1440 × 2520 runtime contact sheet per specialist and mode;
- one six-second transition-preview WebP per specialist and mode;
- `report.json` contains complete labels and deterministic runtime metadata.

Open `artifacts/motion-audit/index.html` after generation and inspect all nine
rows. Generated PNG/WebP container bytes are deliberately not committed or
used as expectations; CI compares decoded RGBA pixels and runtime metadata.

## Coverage

The still matrix is nine specialists × nine requests × four requested
directions × normal/reduced motion: 648 frames. Requests cover idle, run,
mobility/dash, cast E, cast R, hurt, down, revive, and victory. Each full label
records specialist, requested and resolved states, requested and resolved
direction/atlas column/row, clip time and duration, authored/synthetic status,
asset path and decoded-pixel hash, anchor, draw size, muzzle socket, and fallback
status.

Each of the 18 previews uses fixed 100 ms samples and includes manual cursor
aim, nearest-threat signature aim, movement opposing aim/backpedal, rapid
west/east turns, direction changes around the diagonal hysteresis boundary,
idle-to-run, run-to-cast, cast-to-run, mobility, hurt, down, revive, and
victory.

Inputs are fixed at DPR 1, high quality, a fixed viewport, fixed timestamps, and
fixed entity fields. The audit imports presentation modules only, never creates
an engine or RNG, and never mutates authoritative state. Pillow reproduces the
shared render plan for offline QA; the live Canvas2D path remains responsible
for browser compositing and consumes that same plan.

## Updating expectations

Do not update `tooling/motion-audit-expectations.json` to silence a failure.
First generate the report, inspect the affected contact sheets and previews,
and confirm the theme, motion resolver, renderer plan, anchors, sockets, art,
and authored/synthetic declarations are intentional. Then replace expectations
with the exact output of:

```bash
python tooling/motion_audit.py summary
```

Keep Pillow pinned to 12.1.1 anywhere deterministic pixel verification runs.
