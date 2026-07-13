# Lastlight evolution audit

Contract: `actual-simulation-paired-evolution-v1` / `fnv1a32:78b199d4`
Balance: `2026.07.13-apex.1` / `fnv1a32:873c43bc`

Matrix: 21 legal L5 paired base/evolved cases

| Source | Status | Declared capabilities | Damage | Activations/s | Invariant | Outcome |
|---|---|---|---:|---:|---|---|
| signature:zuri | meaningful | cadence, pierce | 4816→13244 | 0.444→0.889 | pierce | pass |
| signature:echo | meaningful | cadence, lifetime | 10266→14160 | 0.5→0.778 | lifetime | pass |
| signature:sola | meaningful | cadence, guard-return | 3091.5→3194.55 | 0.611→0.667 | guard-return | pass |
| signature:bront | meaningful | cadence, repeat | 5320→10840 | 0.278→0.389 | repeat | pass |
| signature:fang | meaningful | cadence, predator-hook | 8825.5→10683.5 | 0.667→0.833 | predator-hook | pass |
| signature:gale | meaningful | cadence, pierce, flow-regeneration | 6077.5→6587.5 | 0.278→0.333 | flow-regeneration | pass |
| signature:rift | meaningful | cadence, kinetic-reserve | 5913.6→16878.4 | 1.111→1.5 | kinetic-reserve | pass |
| signature:nova | meaningful | cadence, lifetime | 2145→3575 | 0.389→0.611 | lifetime | pass |
| signature:vesper | meaningful | cadence, pierce | 3536→5168 | 0.5→0.833 | pierce | pass |
| universal:uwu | meaningful | cadence, retarget | 7644→13556.4 | 2.778→3 | needle-retarget | pass |
| universal:slicers | stat-only | orbit-speed | 7383→7383 | 4→4 | orbit-speed | pass |
| universal:aura | meaningful | occupied-charge-eruption | 17343.2→19886 | 2.889→2.889 | aura-eruption | pass |
| universal:mines | meaningful | mine-grid-chain | 10175→11470 | 0.222→0.222 | mine-grid-chain | pass |
| universal:crossbow | meaningful | pierce, corridor-targeting, deep-crit | 3524.5→12202.75 | 0.389→0.389 | ballista-deep-crit | pass |
| universal:boomerang | meaningful | phase-hits, movement-return-damage | 6290→11220 | 0.389→0.389 | boomerang-return | pass |
| universal:rail | meaningful | aim-lanes | 17010→9855 | 0.444→0.444 | rail-aim-alignment | pass |
| universal:glove | meaningful | projectile-streams | 3648→10656 | 0.389→0.389 | projectile-streams | pass |
| universal:transit | meaningful | horizontal-corridor, cover-push | 2870→4100 | 0.111→0.111 | transit-push | pass |
| universal:ice | stat-only | cadence | 0→0 | 0.111→0.111 | cadence | pass |
| universal:annihilator | stat-only | cadence | 11925→11925 | 0.056→0.056 | cadence | pass |
| universal:drone | meaningful | pierce, repair-rate, pickup-range, data-protocol, chain-retarget | 6555→7360 | 0.944→0.944 | drone-protocol | pass |

## Expected failures



## Limits

- The harness records deterministic observables and declared capabilities; it does not implement or approve evolution mechanics.
- Presentation-only impact identity and cosmetic entity-count differences are deliberately excluded from non-cosmetic delta counts.
- Expected failures preserve known gameplay-flat production evolutions as visible debt rather than weakening invariants.
