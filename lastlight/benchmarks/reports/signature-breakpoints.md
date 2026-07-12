# Starting signature breakpoint report

Contract: `actual-simulation-fixed-seed-signature-v1`
Balance: `2026.07.12-identity.2` / `fnv1a32:4ba2b39c`

Matrix: 9 specialists × 5 states = 45 deterministic breakpoint cases

## Measured breakpoints

| Specialist | State | Single DPS | Area DPS | Burst | Activations/s | Hit band |
|---|---:|---:|---:|---:|---:|---:|
| Zuri | rank-1 | 56 | 56 | 126 | 0.444 | 60–900 |
| Zuri | rank-3 | 142.222 | 142.222 | 320 | 0.444 | 60–900 |
| Zuri | rank-5 | 200.667 | 267.556 | 602 | 0.444 | 60–900 |
| Zuri | paired-passive | 243.667 | 367.889 | 602 | 0.611 | 60–900 |
| Zuri | evolved | 387 | 1958.889 | 602 | 1.222 | 60–900 |
| Echo | rank-1 | 24.111 | 192.889 | 62 | 0.333 | 60–900 |
| Echo | rank-3 | 140 | 805 | 270 | 0.444 | 60–900 |
| Echo | rank-5 | 196.667 | 1304.556 | 590 | 0.5 | 60–900 |
| Echo | paired-passive | 177 | 1357 | 472 | 0.5 | 60–900 |
| Echo | evolved | 255.667 | 1750.333 | 472 | 0.778 | 60–900 |
| Sola | rank-1 | 78.167 | 517.389 | 201 | 0.389 | 60–400 |
| Sola | rank-3 | 138.444 | 761.444 | 356 | 0.444 | 60–400 |
| Sola | rank-5 | 209.667 | 1110 | 555 | 0.611 | 60–400 |
| Sola | paired-passive | 265 | 1448.667 | 795 | 0.611 | 60–400 |
| Sola | evolved | 282.667 | 1660.667 | 795 | 0.667 | 60–400 |
| Bront | rank-1 | 20.889 | 146.222 | 94 | 0.222 | 60–600 |
| Bront | rank-3 | 39.444 | 355 | 142 | 0.278 | 60–600 |
| Bront | rank-5 | 52.778 | 475 | 190 | 0.278 | 60–600 |
| Bront | paired-passive | 52.778 | 475 | 190 | 0.278 | 60–600 |
| Bront | evolved | 163.333 | 1470 | 420 | 0.389 | 60–600 |
| Fang | rank-1 | 36.5 | 202.778 | 73 | 0.5 | 60–180 |
| Fang | rank-3 | 61.667 | 382.333 | 111 | 0.556 | 60–180 |
| Fang | rank-5 | 99.333 | 645.667 | 149 | 0.667 | 60–260 |
| Fang | paired-passive | 106.833 | 676.611 | 160.25 | 0.667 | 60–260 |
| Fang | evolved | 151.347 | 783.444 | 160.25 | 0.944 | 60–260 |
| Gale | rank-1 | 27.472 | 143.333 | 86 | 0.278 | 60–900 |
| Gale | rank-3 | 87.111 | 426.667 | 256 | 0.278 | 60–900 |
| Gale | rank-5 | 170 | 826.389 | 510 | 0.278 | 60–900 |
| Gale | paired-passive | 226.667 | 1105 | 637.5 | 0.278 | 60–900 |
| Gale | evolved | 226.667 | 1319.861 | 637.5 | 0.333 | 60–900 |
| Rift | rank-1 | 60.439 | 168.178 | 47.3 | 1.667 | 60–120 |
| Rift | rank-3 | 80.117 | 257.217 | 75.9 | 1.667 | 60–180 |
| Rift | rank-5 | 98.694 | 365.75 | 104.5 | 1.667 | 60–180 |
| Rift | paired-passive | 98.694 | 365.75 | 104.5 | 1.667 | 60–180 |
| Rift | evolved | 98.694 | 365.75 | 104.5 | 2.444 | 60–180 |
| Nova | rank-1 | 44.667 | 268 | 134 | 0.333 | 60–600 |
| Nova | rank-3 | 52.778 | 432.778 | 285 | 0.333 | 60–600 |
| Nova | rank-5 | 82 | 519.333 | 246 | 0.333 | 60–600 |
| Nova | paired-passive | 82 | 519.333 | 246 | 0.333 | 60–600 |
| Nova | evolved | 123 | 717.5 | 246 | 0.5 | 60–720 |
| Vesper | rank-1 | 28.889 | 231.111 | 65 | 0.444 | 60–900 |
| Vesper | rank-3 | 82.667 | 609.667 | 186 | 0.444 | 60–900 |
| Vesper | rank-5 | 121 | 705.833 | 242 | 0.5 | 60–900 |
| Vesper | paired-passive | 121 | 705.833 | 242 | 0.5 | 60–900 |
| Vesper | evolved | 174.778 | 880.611 | 242 | 0.778 | 60–900 |

## Finite differences

| Specialist | Delta | Single DPS | Area DPS | Burst | Activation rate | Direct measured effect |
|---|---:|---:|---:|---:|---:|---:|
| Zuri | rank-1-to-3 | 154% | 154% | 154% | 0% | yes |
| Zuri | rank-3-to-5 | 41.1% | 88.1% | 88.1% | 0% | yes |
| Zuri | paired-passive | 21.4% | 37.5% | 0% | 37.6% | yes |
| Zuri | evolution | 58.8% | 432.5% | 0% | 100% | yes |
| Echo | rank-1-to-3 | 480.6% | 317.3% | 335.5% | 33.3% | yes |
| Echo | rank-3-to-5 | 40.5% | 62.1% | 118.5% | 12.6% | yes |
| Echo | paired-passive | -10% | 4% | -20% | 0% | yes |
| Echo | evolution | 44.4% | 29% | 0% | 55.6% | yes |
| Sola | rank-1-to-3 | 77.1% | 47.2% | 77.1% | 14.1% | yes |
| Sola | rank-3-to-5 | 51.4% | 45.8% | 55.9% | 37.6% | yes |
| Sola | paired-passive | 26.4% | 30.5% | 43.2% | 0% | yes |
| Sola | evolution | 6.7% | 14.6% | 0% | 9.2% | yes |
| Bront | rank-1-to-3 | 88.8% | 142.8% | 51.1% | 25.2% | yes |
| Bront | rank-3-to-5 | 33.8% | 33.8% | 33.8% | 0% | yes |
| Bront | paired-passive | 0% | 0% | 0% | 0% | no |
| Bront | evolution | 209.5% | 209.5% | 121.1% | 39.9% | yes |
| Fang | rank-1-to-3 | 69% | 88.5% | 52.1% | 11.2% | yes |
| Fang | rank-3-to-5 | 61.1% | 68.9% | 34.2% | 20% | yes |
| Fang | paired-passive | 7.6% | 4.8% | 7.6% | 0% | yes |
| Fang | evolution | 41.7% | 15.8% | 0% | 41.5% | yes |
| Gale | rank-1-to-3 | 217.1% | 197.7% | 197.7% | 0% | yes |
| Gale | rank-3-to-5 | 95.2% | 93.7% | 99.2% | 0% | yes |
| Gale | paired-passive | 33.3% | 33.7% | 25% | 0% | yes |
| Gale | evolution | 0% | 19.4% | 0% | 19.8% | yes |
| Rift | rank-1-to-3 | 32.6% | 52.9% | 60.5% | 0% | yes |
| Rift | rank-3-to-5 | 23.2% | 42.2% | 37.7% | 0% | yes |
| Rift | paired-passive | 0% | 0% | 0% | 0% | no |
| Rift | evolution | 0% | 0% | 0% | 46.6% | yes |
| Nova | rank-1-to-3 | 18.2% | 61.5% | 112.7% | 0% | yes |
| Nova | rank-3-to-5 | 55.4% | 20% | -13.7% | 0% | yes |
| Nova | paired-passive | 0% | 0% | 0% | 0% | no |
| Nova | evolution | 50% | 38.2% | 0% | 50.2% | yes |
| Vesper | rank-1-to-3 | 186.2% | 163.8% | 186.2% | 0% | yes |
| Vesper | rank-3-to-5 | 46.4% | 15.8% | 30.1% | 12.6% | yes |
| Vesper | paired-passive | 0% | 0% | 0% | 0% | no |
| Vesper | evolution | 44.4% | 24.8% | 0% | 55.6% | yes |

## Interpretation

- **Zuri — Pulse Carbine → Overdrive Barrage:** paired haste passive changes the isolated signature metrics; evolution changes single DPS 58.8% and area DPS 432.5%.
- **Echo — Sound Wave → Anima Echo:** paired projectiles passive changes the isolated signature metrics; evolution changes single DPS 44.4% and area DPS 29%.
- **Sola — Shield Beam → Lion's Light:** paired armor passive changes the isolated signature metrics; evolution changes single DPS 6.7% and area DPS 14.6%.
- **Bront — Tidal Hammer → Grizzly Surge:** paired duration passive does not directly change the isolated signature metrics; evolution changes single DPS 209.5% and area DPS 209.5%.
- **Fang — Rending Swipe → Savage Slice:** paired maxHealth passive changes the isolated signature metrics; evolution changes single DPS 41.7% and area DPS 15.8%.
- **Gale — Steel Current → Wandering Storms:** paired crit passive changes the isolated signature metrics; evolution changes single DPS 0% and area DPS 19.4%.
- **Rift — Kinetic Crash → Golden Overrun:** paired move passive does not directly change the isolated signature metrics; evolution changes single DPS 0% and area DPS 0%.
- **Nova — Guiding Hex → Hopped-Up Hex:** paired xp passive does not directly change the isolated signature metrics; evolution changes single DPS 50% and area DPS 38.2%.
- **Vesper — Winged Dagger → Lover's Ricochet:** paired pickup passive does not directly change the isolated signature metrics; evolution changes single DPS 44.4% and area DPS 24.8%.

## Limitations

- Breakpoints isolate the starting signature with no active, ultimate, common weapon, movement, or metaprogression contribution.
- The frontal cluster is a stable area-throughput probe, not a claim that every signature should cover the same shape or safety envelope.
- Range samples are discrete clear-lane distances; max hit distance is a measured bracket, not the exact analytical edge of a projectile or blast.
- Paired-passive deltas can correctly be zero when the passive is an evolution prerequisite rather than a direct signature scalar.
- Fixed seeds expose exact finite differences but are not confidence intervals or substitutes for human playtests.
- This artifact is diagnostic and intentionally does not tune gameplay or establish final target envelopes.
