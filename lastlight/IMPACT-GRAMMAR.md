# Weapon impact grammar

`impact-grammar.js` is the renderer-facing contract for all nine signature weapons and all twelve
universal weapons. Every base and evolved form specifies:

- projectile or field silhouette;
- material and motion language;
- trail, contact, impact, and ground-decal language;
- camera-shake and flash-intensity tier;
- synthesized sound family;
- accessibility priority, palette, and non-color pattern;
- the behavior conveyed by the base form and its evolved difference.

The resolver reads a weapon's current evolved state from its anonymous owner slot in an existing
snapshot. The grammar never enters `Simulation`, damage calculations, gameplay RNG, snapshots,
replays, or the multiplayer protocol. It therefore cannot change authoritative timing or hashes.

## Motion and accessibility rules

- Trails and decals explain direction, area, fuse, or contact; they are not decorative particles.
- The renderer adds no new simulation entities. Every extra stroke stays inside the existing
  projectile/effect budgets.
- Reduced motion removes weapon shake and collapses moving trails to a short direction line while
  preserving mine, annihilator, hostile, and objective telegraphs.
- Flash strength is multiplied by the user's quality/accessibility flash setting.
- Hostile fire remains red/black with a winged arrowhead, XP remains a cyan diamond, and objectives
  remain gold rings. Weapon palettes cannot override those categories.
- Evolutions gain a stronger authored read, but no bounce or repeated full-screen motion.

## Visual stress hook

`createImpactStressFixture()` in `fixtures/impact-stress.js` returns all 42 base/evolved render
plans. Renderer tests exercise that grid at high and minimal quality without adding it to the
authoritative deterministic fixture manifest.

Before release, inspect that grid and representative live runs at 100%, 75%, and minimal quality.
Pay special attention to dense pink/purple builds, mines beneath enemies, evolved train/annihilator
flashes, color-vision readability, and the relative loudness of industrial, void, and blade sound
families. Timing measurements are secondary to stable silhouettes and preserved telegraphs.
