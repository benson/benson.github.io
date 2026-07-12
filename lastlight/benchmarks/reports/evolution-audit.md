# Lastlight evolution audit

Contract: `actual-simulation-paired-evolution-v1` / `fnv1a32:2dfdf409`
Balance: `2026.07.12-evolutions.1` / `fnv1a32:20c3fe1d`

Matrix: 21 legal L5 paired base/evolved cases

| Source | Status | Declared capabilities | Damage | Activations/s | Invariant | Outcome |
|---|---|---|---:|---:|---|---|
| signature:zuri | meaningful | cadence, pierce | 4816→13244 | 0.444→0.889 | pierce | pass |
| signature:echo | meaningful | cadence, lifetime | 9204→11918 | 0.5→0.778 | lifetime | pass |
| signature:sola | meaningful | cadence, guard-return | 3091.5→3194.55 | 0.611→0.667 | guard-return | pass |
| signature:bront | meaningful | cadence, repeat | 5320→10840 | 0.278→0.389 | repeat | pass |
| signature:fang | meaningful | cadence, predator-hook | 10567.375→15328.5 | 0.667→0.833 | predator-hook | pass |
| signature:gale | meaningful | cadence, pierce, flow-regeneration | 7437.5→8372.5 | 0.278→0.333 | flow-regeneration | pass |
| signature:rift | meaningful | cadence, kinetic-reserve | 12073.6→19588.8 | 1.111→1.5 | kinetic-reserve | pass |
| signature:nova | meaningful | cadence, lifetime | 2145→3575 | 0.389→0.611 | lifetime | pass |
| signature:vesper | meaningful | cadence, pierce | 3536→5168 | 0.5→0.833 | pierce | pass |
| universal:uwu | meaningful | cadence, pierce | 7644→10140 | 2.778→3 | pierce | pass |
| universal:slicers | stat-only | orbit-speed | 7383→7383 | 4→4 | orbit-speed | pass |
| universal:aura | expected-no-op | impact-identity | 17343.2→17343.2 | 2.889→2.889 | nonCosmeticDeltaCount | expected-failure |
| universal:mines | expected-no-op | impact-identity | 9435→9435 | 0.222→0.222 | nonCosmeticDeltaCount | expected-failure |
| universal:crossbow | meaningful | pierce | 4688.25→6084.75 | 0.389→0.389 | pierce | pass |
| universal:boomerang | expected-no-op | impact-identity | 6290→6290 | 0.389→0.389 | nonCosmeticDeltaCount | expected-failure |
| universal:rail | expected-no-op | impact-identity | 17010→17010 | 0.444→0.444 | nonCosmeticDeltaCount | expected-failure |
| universal:glove | meaningful | projectile-streams | 3648→10656 | 0.389→0.389 | projectile-streams | pass |
| universal:transit | expected-no-op | impact-identity | 820→820 | 0.111→0.111 | nonCosmeticDeltaCount | expected-failure |
| universal:ice | stat-only | cadence | 0→0 | 0.111→0.111 | cadence | pass |
| universal:annihilator | stat-only | cadence | 11925→11925 | 0.056→0.056 | cadence | pass |
| universal:drone | meaningful | pierce, repair-rate, pickup-range | 6555→7360 | 0.944→0.944 | repair-rate | pass |

## Expected failures

- **universal:aura:** no authored non-cosmetic evolution delta is observable.
- **universal:mines:** no authored non-cosmetic evolution delta is observable.
- **universal:boomerang:** no authored non-cosmetic evolution delta is observable.
- **universal:rail:** no authored non-cosmetic evolution delta is observable.
- **universal:transit:** no authored non-cosmetic evolution delta is observable.

## Limits

- The harness records deterministic observables and declared capabilities; it does not implement or approve evolution mechanics.
- Presentation-only impact identity and cosmetic entity-count differences are deliberately excluded from non-cosmetic delta counts.
- Expected failures preserve known gameplay-flat production evolutions as visible debt rather than weakening invariants.
