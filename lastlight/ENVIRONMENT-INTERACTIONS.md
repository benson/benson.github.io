# Environmental interaction runtime

Lastlight's battlefield reaction layer is renderer-owned and theme-swappable. It derives a stable
local prop field from the map id and world-cell coordinates, then reacts to movement already present
in shared snapshots and to material-impact events already produced by the renderer.

## Theme contract

`environment-interactions.js` defines and validates:

- five lightweight surface kinds: debris, puddles, loose cables, fibers, and dust;
- material-specific contact grammar for metal, concrete, liquid, organic, energy, and void;
- per-map prop palettes and coverage;
- strict high, reduced, and minimal caps for visible props, active reactions, contacts, movers, and
  nearby-prop checks.

Replacement themes provide the same `environmentInteractions` contract alongside assets,
materials, and animation rigs. Unknown fields, missing classes, invalid colors, long lifetimes, and
oversized budgets fail validation before the theme can be registered.

## Determinism and multiplayer boundary

The prop layout uses an FNV-derived cosmetic sample of map/cell/slot ids. Footfall cadence uses
quantized shared positions. Impact direction comes from renderer projectile velocity, with a stable
id-derived fallback. No code in this layer calls gameplay RNG or writes to Simulation, replay,
recovery, network messages, collision state, or damage state.

Two clients receiving the same snapshots and impact events derive equivalent local reactions. Minor
frame-rate differences only affect renderer-local spring settling and never feed back into gameplay.

## Readability and accessibility

- Props render below combatants, pickups, projectiles, and hostile telegraphs.
- Contact accents render below threat and feedback effect passes.
- Density settings reduce stable field coverage and every active-response budget.
- Reduced motion removes prop displacement and spatial animation; one static shape fades to retain
  material/contact meaning without color dependence.
- Offscreen props and contacts are culled before drawing.

`createEnvironmentInteractionStressFixture()` exercises a dense anonymous movement and impact field.
Use it at high, reduced, and minimal settings for contract and browser performance checks.

