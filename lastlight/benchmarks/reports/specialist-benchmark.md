# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | 2.05s | 10.1s | 0.133s | 23.3s | 0.332 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | 1.1s | 22.6s | 1.467s | 63.683s | 0.333 | 44.977 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | 2.4s | 45s | 5.05s | 61.45s | 0.22 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | 1.15s | 16.8s | 3.033s | 36.517s | 0.281 | 6.86 | 80 |
| Fang | 33.113 | 7227.885 | 13.8 | 0.017s | 45s | 2.683s | 14.317s | 0.632 | 0 | 80 |
| Gale | 23.092 | 1984.525 | 10.45 | 0.417s | 22.667s | 7.983s | 33.3s | 0.239 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | 0.383s | 45s | 11.033s | 62.283s | 0.114 | 0 | 80 |
| Nova | 32.919 | 1498.977 | 9 | 0.017s | 9.233s | 6.567s | 45.617s | 0.084 | 0 | 80 |
| Vesper | 30.789 | 2021.107 | 9.5 | 1.1s | 19.317s | 7.967s | 35.817s | 0.071 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (7227.885) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2021.107) · 8. Gale (1984.525) · 9. Nova (1498.977)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Fang (45) · 2. Rift (45) · 3. Sola (45) · 4. Gale (22.667) · 5. Echo (22.6) · 6. Vesper (19.317) · 7. Bront (16.8) · 8. Zuri (10.1) · 9. Nova (9.233)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (2.683) · 4. Bront (3.033) · 5. Sola (5.05) · 6. Nova (6.567) · 7. Vesper (7.967) · 8. Gale (7.983) · 9. Rift (11.033)
- **Apex time-to-kill:** 1. Fang (14.317) · 2. Zuri (23.3) · 3. Gale (33.3) · 4. Vesper (35.817) · 5. Bront (36.517) · 6. Nova (45.617) · 7. Sola (61.45) · 8. Rift (62.283) · 9. Echo (63.683)
- **Four-player damage share:** 1. Fang (0.632) · 2. Echo (0.333) · 3. Zuri (0.332) · 4. Bront (0.281) · 5. Gale (0.239) · 6. Sola (0.22) · 7. Rift (0.114) · 8. Nova (0.084) · 9. Vesper (0.071)
- **Four-player support score:** 1. Echo (44.977) · 2. Bront (6.86) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Echo: apexTtkSeconds is high at 1.744× median (63.683).
- Fang: apexTtkSeconds is low at 0.392× median (14.317).
- Rift: apexTtkSeconds is high at 1.706× median (62.283).
- Sola: apexTtkSeconds is high at 1.683× median (61.45).
- Zuri: apexTtkSeconds is low at 0.638× median (23.3).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.601× median (3.033).
- Echo: eliteTtkSeconds is low at 0.29× median (1.467).
- Fang: eliteTtkSeconds is low at 0.531× median (2.683).
- Gale: eliteTtkSeconds is high at 1.581× median (7.983).
- Rift: eliteTtkSeconds is high at 2.185× median (11.033).
- Vesper: eliteTtkSeconds is high at 1.578× median (7.967).
- Zuri: eliteTtkSeconds is low at 0.026× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 2.436× median (7227.885).
- Nova: matureAreaDps is low at 0.505× median (1498.977).
- Vesper: pickupReach is high at 5× median (400).
- Fang: soloSurvivalSeconds is high at 1.991× median (45).
- Nova: soloSurvivalSeconds is low at 0.409× median (9.233).
- Rift: soloSurvivalSeconds is high at 1.991× median (45).
- Sola: soloSurvivalSeconds is high at 1.991× median (45).
- Zuri: soloSurvivalSeconds is low at 0.447× median (10.1).
- Echo: squadDamageShare is high at 1.393× median (0.333).
- Fang: squadDamageShare is high at 2.644× median (0.632).
- Nova: squadDamageShare is low at 0.351× median (0.084).
- Rift: squadDamageShare is low at 0.477× median (0.114).
- Vesper: squadDamageShare is low at 0.297× median (0.071).
- Zuri: squadDamageShare is high at 1.389× median (0.332).

## Scenario matrix

- **Level 1 single target:** level 1, 1 player, 30s cap; singleTargetDps, ttkSeconds, effectiveVitality.
- **First ability unlock:** level 3, 1 player, 20s cap; areaDps, shieldGranted, controlEnemySeconds.
- **Ultimate unlock:** level 6, 1 player, 20s cap; areaDps, abilityDamage, abilityUptimeSeconds.
- **Mature signature and loadout:** level 20, 1 player, 30s cap; areaDps, signatureDamage, peakEffectiveVitality.
- **Travel and escape:** level 6, 1 player, 8s cap; travelDistance, escapeTimeSeconds.
- **Pickup and objective value:** level 20, 1 player, 6s cap; pickupReach, xpPickedUp, objectiveProgress.
- **Solo pressure:** level 20, 1 player, 45s cap; survivalSeconds, damageTaken, combatUptime.
- **Elite duel:** level 20, 1 player, 60s cap; ttkSeconds, damagePerSecond, survivalSeconds.
- **Apex duel:** level 20, 1 player, 90s cap; ttkSeconds, damagePerSecond, damageTaken.
- **Four-player contribution:** level 20, 4 players, 45s cap; teamDamageShare, shieldGranted, repairAllies.

## Limitations

- Fixed seeds and scripted inputs are deterministic comparisons, not confidence intervals or substitutes for human playtests.
- Stationary single-target and radial pack geometry deliberately isolate mechanics and can favor piercing, radial, or close-range damage shapes differently.
- Four-player contribution holds three allies to standardized mature loadouts and lets only the candidate cast abilities, improving attribution at the cost of realistic coordination.
- Shield and invulnerability contribution use immediate cast deltas; repair uses net positive health movement and can undercount healing that lands on the same tick as damage.
- Objective participation is intentionally identical when no specialist mechanic modifies capture rate; it documents the current lack of objective-specific differentiation.
- The report is diagnostic only. It does not approve balance changes or replace the immutable balance-version and fixture-migration process.
