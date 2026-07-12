# Starting signature breakpoint report

Contract: `actual-simulation-fixed-seed-signature-v1`
Balance: `2026.07.12-evolutions.2` / `fnv1a32:f06f76bb`

Matrix: 9 specialists × 5 states = 45 deterministic breakpoint cases

## Measured breakpoints

| Specialist | State | Single DPS | Area DPS | Burst | Activations/s | Hit band |
|---|---:|---:|---:|---:|---:|---:|
| Zuri | rank-1 | 56 | 56 | 126 | 0.444 | 60–900 |
| Zuri | rank-3 | 142.222 | 142.222 | 320 | 0.444 | 60–900 |
| Zuri | rank-5 | 200.667 | 267.556 | 602 | 0.444 | 60–900 |
| Zuri | paired-passive | 243.667 | 367.889 | 602 | 0.611 | 60–900 |
| Zuri | evolved | 387 | 1958.889 | 602 | 1.222 | 60–900 |
| Echo | rank-1 | 27.556 | 192.889 | 62 | 0.333 | 60–900 |
| Echo | rank-3 | 135 | 685 | 270 | 0.444 | 60–900 |
| Echo | rank-5 | 183.556 | 1363.556 | 590 | 0.5 | 60–900 |
| Echo | paired-passive | 177 | 1416 | 590 | 0.5 | 60–900 |
| Echo | evolved | 203.222 | 1855.222 | 590 | 0.778 | 60–900 |
| Sola | rank-1 | 26.125 | 206.097 | 104.5 | 0.389 | 60–400 |
| Sola | rank-3 | 41.25 | 358.875 | 222.75 | 0.444 | 60–400 |
| Sola | rank-5 | 69.514 | 524.028 | 288.75 | 0.611 | 60–400 |
| Sola | paired-passive | 94.069 | 680.194 | 390.75 | 0.611 | 60–400 |
| Sola | evolved | 101.306 | 752.556 | 390.75 | 0.667 | 60–400 |
| Bront | rank-1 | 20.889 | 146.222 | 94 | 0.222 | 60–600 |
| Bront | rank-3 | 39.444 | 355 | 142 | 0.278 | 60–600 |
| Bront | rank-5 | 52.778 | 475 | 190 | 0.278 | 60–600 |
| Bront | paired-passive | 52.778 | 475 | 190 | 0.278 | 60–600 |
| Bront | evolved | 163.333 | 1470 | 420 | 0.389 | 60–600 |
| Fang | rank-1 | 29.5 | 177 | 59 | 0.5 | 60–180 |
| Fang | rank-3 | 48.333 | 338.333 | 87 | 0.556 | 60–180 |
| Fang | rank-5 | 76.667 | 626.111 | 115 | 0.667 | 60–260 |
| Fang | paired-passive | 80.417 | 656.736 | 120.625 | 0.667 | 60–260 |
| Fang | evolved | 100.521 | 884.583 | 120.625 | 0.833 | 60–260 |
| Gale | rank-1 | 23.889 | 143.333 | 86 | 0.278 | 60–900 |
| Gale | rank-3 | 71.111 | 451.556 | 256 | 0.278 | 60–900 |
| Gale | rank-5 | 141.667 | 833.472 | 510 | 0.278 | 60–900 |
| Gale | paired-passive | 184.167 | 1097.917 | 637.5 | 0.278 | 60–900 |
| Gale | evolved | 184.167 | 1234.861 | 637.5 | 0.333 | 60–900 |
| Rift | rank-1 | 48.889 | 195.556 | 44 | 1.111 | 60–120 |
| Rift | rank-3 | 92.889 | 390.133 | 83.6 | 1.111 | 60–180 |
| Rift | rank-5 | 136.889 | 725.511 | 123.2 | 1.111 | 60–180 |
| Rift | paired-passive | 136.889 | 725.511 | 123.2 | 1.111 | 60–180 |
| Rift | evolved | 184.8 | 1067.733 | 123.2 | 1.5 | 60–180 |
| Nova | rank-1 | 37.5 | 325 | 150 | 0.389 | 60–900 |
| Nova | rank-3 | 54.5 | 490.5 | 327 | 0.389 | 60–900 |
| Nova | rank-5 | 71.5 | 579.944 | 429 | 0.389 | 60–900 |
| Nova | paired-passive | 71.5 | 579.944 | 429 | 0.389 | 60–900 |
| Nova | evolved | 103.278 | 786.5 | 429 | 0.611 | 60–900 |
| Vesper | rank-1 | 32 | 256 | 72 | 0.444 | 60–900 |
| Vesper | rank-3 | 57.778 | 456.444 | 208 | 0.444 | 60–900 |
| Vesper | rank-5 | 83.111 | 634.667 | 272 | 0.5 | 60–900 |
| Vesper | paired-passive | 83.111 | 634.667 | 272 | 0.5 | 60–900 |
| Vesper | evolved | 128.444 | 1020 | 272 | 0.833 | 60–900 |

## Finite differences

| Specialist | Delta | Single DPS | Area DPS | Burst | Activation rate | Direct measured effect |
|---|---:|---:|---:|---:|---:|---:|
| Zuri | rank-1-to-3 | 154% | 154% | 154% | 0% | yes |
| Zuri | rank-3-to-5 | 41.1% | 88.1% | 88.1% | 0% | yes |
| Zuri | paired-passive | 21.4% | 37.5% | 0% | 37.6% | yes |
| Zuri | evolution | 58.8% | 432.5% | 0% | 100% | yes |
| Echo | rank-1-to-3 | 389.9% | 255.1% | 335.5% | 33.3% | yes |
| Echo | rank-3-to-5 | 36% | 99.1% | 118.5% | 12.6% | yes |
| Echo | paired-passive | -3.6% | 3.8% | 0% | 0% | yes |
| Echo | evolution | 14.8% | 31% | 0% | 55.6% | yes |
| Sola | rank-1-to-3 | 57.9% | 74.1% | 113.2% | 14.1% | yes |
| Sola | rank-3-to-5 | 68.5% | 46% | 29.6% | 37.6% | yes |
| Sola | paired-passive | 35.3% | 29.8% | 35.3% | 0% | yes |
| Sola | evolution | 7.7% | 10.6% | 0% | 9.2% | yes |
| Bront | rank-1-to-3 | 88.8% | 142.8% | 51.1% | 25.2% | yes |
| Bront | rank-3-to-5 | 33.8% | 33.8% | 33.8% | 0% | yes |
| Bront | paired-passive | 0% | 0% | 0% | 0% | no |
| Bront | evolution | 209.5% | 209.5% | 121.1% | 39.9% | yes |
| Fang | rank-1-to-3 | 63.8% | 91.1% | 47.5% | 11.2% | yes |
| Fang | rank-3-to-5 | 58.6% | 85.1% | 32.2% | 20% | yes |
| Fang | paired-passive | 4.9% | 4.9% | 4.9% | 0% | yes |
| Fang | evolution | 25% | 34.7% | 0% | 24.9% | yes |
| Gale | rank-1-to-3 | 197.7% | 215% | 197.7% | 0% | yes |
| Gale | rank-3-to-5 | 99.2% | 84.6% | 99.2% | 0% | yes |
| Gale | paired-passive | 30% | 31.7% | 25% | 0% | yes |
| Gale | evolution | 0% | 12.5% | 0% | 19.8% | yes |
| Rift | rank-1-to-3 | 90% | 99.5% | 90% | 0% | yes |
| Rift | rank-3-to-5 | 47.4% | 86% | 47.4% | 0% | yes |
| Rift | paired-passive | 0% | 0% | 0% | 0% | no |
| Rift | evolution | 35% | 47.2% | 0% | 35% | yes |
| Nova | rank-1-to-3 | 45.3% | 50.9% | 118% | 0% | yes |
| Nova | rank-3-to-5 | 31.2% | 18.2% | 31.2% | 0% | yes |
| Nova | paired-passive | 0% | 0% | 0% | 0% | no |
| Nova | evolution | 44.4% | 35.6% | 0% | 57.1% | yes |
| Vesper | rank-1-to-3 | 80.6% | 78.3% | 188.9% | 0% | yes |
| Vesper | rank-3-to-5 | 43.8% | 39% | 30.8% | 12.6% | yes |
| Vesper | paired-passive | 0% | 0% | 0% | 0% | no |
| Vesper | evolution | 54.5% | 60.7% | 0% | 66.6% | yes |

## Interpretation

- **Zuri — Pulse Carbine → Overdrive Barrage:** paired haste passive changes the isolated signature metrics; evolution changes single DPS 58.8% and area DPS 432.5%.
- **Echo — Sound Wave → Anima Echo:** paired projectiles passive changes the isolated signature metrics; evolution changes single DPS 14.8% and area DPS 31%.
- **Sola — Shield Beam → Lion's Light:** paired armor passive changes the isolated signature metrics; evolution changes single DPS 7.7% and area DPS 10.6%.
- **Bront — Tidal Hammer → Grizzly Surge:** paired duration passive does not directly change the isolated signature metrics; evolution changes single DPS 209.5% and area DPS 209.5%.
- **Fang — Rending Swipe → Savage Slice:** paired maxHealth passive changes the isolated signature metrics; evolution changes single DPS 25% and area DPS 34.7%.
- **Gale — Steel Current → Wandering Storms:** paired crit passive changes the isolated signature metrics; evolution changes single DPS 0% and area DPS 12.5%.
- **Rift — Kinetic Crash → Golden Overrun:** paired move passive does not directly change the isolated signature metrics; evolution changes single DPS 35% and area DPS 47.2%.
- **Nova — Guiding Hex → Hopped-Up Hex:** paired xp passive does not directly change the isolated signature metrics; evolution changes single DPS 44.4% and area DPS 35.6%.
- **Vesper — Winged Dagger → Lover's Ricochet:** paired pickup passive does not directly change the isolated signature metrics; evolution changes single DPS 54.5% and area DPS 60.7%.

## Limitations

- Breakpoints isolate the starting signature with no active, ultimate, common weapon, movement, or metaprogression contribution.
- The frontal cluster is a stable area-throughput probe, not a claim that every signature should cover the same shape or safety envelope.
- Range samples are discrete clear-lane distances; max hit distance is a measured bracket, not the exact analytical edge of a projectile or blast.
- Paired-passive deltas can correctly be zero when the passive is an evolution prerequisite rather than a direct signature scalar.
- Fixed seeds expose exact finite differences but are not confidence intervals or substitutes for human playtests.
- This artifact is diagnostic and intentionally does not tune gameplay or establish final target envelopes.
