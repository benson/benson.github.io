# Material-aware impact responses

The cosmetic endpoint system combines each weapon's authored impact plan with one of six strict
theme-owned target classes: metal/armor, concrete/ground, liquid/ice, flesh/organic,
shield/energy, and void/corrupted.

Each class defines bounded particles, a decal, local flash, synthesized sound variation, total
lifetime, and a color-independent fallback pattern. Target metadata covers every enemy and apex,
all 14 raised-cover rectangles, supply caches, four terrain themes, uplinks, breach trials,
operation devices, and relay cores.

## Determinism boundary

Material contact is inferred in `Renderer` from existing snapshots and the last render position of
a disappearing projectile. Procedural angles use a stable FNV-derived value from cosmetic entity
IDs. The system never calls gameplay RNG and never adds fields to `Simulation`, network messages,
snapshots, recovery, or replays. Damage and collision timing remain authoritative and unchanged.

## Budgets and accessibility

- At most six material particles per contact.
- Active local endpoints are capped at 96 and share the existing effect-density budget.
- Audio cues are capped at 12 queued and drained one at a time.
- Decals last no more than two seconds and are culled offscreen.
- Low density drops ordinary particles and decals. Critical mine/objective-scale cues retain one
  static particle plus their fallback mark.
- Reduced motion sets particle travel to zero, disables impact-driven movement, shortens lifetime,
  and keeps telegraph/fallback shapes.
- User flash intensity scales every local material flash. Hostile warnings draw after material
  effects and therefore retain visual priority.

## Practice and stress surfaces

The Upgrade Archive's **Materials** section explains the six classes and their non-color cues.
`createMaterialImpactStressFixture()` emits the complete 42 weapon variants × six materials = 252
case matrix for renderer and browser stress checks.

For visual QA, inspect the matrix at high and minimal quality, then verify a live dense build over
Subzero Lab and Beachhead terrain. Confirm hostile red/black telegraphs remain dominant, impact
audio stays below weapon fire, and fallback patterns remain distinguishable with color filters.
