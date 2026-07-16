# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | 2.05s | 9.65s | 0.133s | 23.1s | 0.285 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | 1.1s | 20.067s | 1.467s | 25.033s | 0.203 | 27.75 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | 2.4s | 21.35s | 5.05s | 29.167s | 0.165 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | 1.15s | 10.183s | 3.05s | 47.417s | 0.089 | 0 | 80 |
| Fang | 33.113 | 4140.645 | 13.8 | 0.017s | 21.05s | 2.683s | 16.083s | 0.759 | 0 | 80 |
| Gale | 23.092 | 1984.725 | 10.45 | 0.417s | 13.667s | 8.067s | 82.383s | 0.323 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | 0.383s | 27.8s | 13.733s | 61.75s | 0.126 | 0 | 80 |
| Nova | 32.919 | 1498.977 | 9 | 0.017s | 22.65s | 17.517s | 58.233s | 0.051 | 0 | 80 |
| Vesper | 30.789 | 2021.107 | 9.5 | 1.1s | 8.533s | 7.917s | 35.683s | 0.16 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (4140.645) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2021.107) · 8. Gale (1984.725) · 9. Nova (1498.977)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Rift (27.8) · 2. Nova (22.65) · 3. Sola (21.35) · 4. Fang (21.05) · 5. Echo (20.067) · 6. Gale (13.667) · 7. Bront (10.183) · 8. Zuri (9.65) · 9. Vesper (8.533)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (2.683) · 4. Bront (3.05) · 5. Sola (5.05) · 6. Vesper (7.917) · 7. Gale (8.067) · 8. Rift (13.733) · 9. Nova (17.517)
- **Apex time-to-kill:** 1. Fang (16.083) · 2. Zuri (23.1) · 3. Echo (25.033) · 4. Sola (29.167) · 5. Vesper (35.683) · 6. Bront (47.417) · 7. Nova (58.233) · 8. Rift (61.75) · 9. Gale (82.383)
- **Four-player damage share:** 1. Fang (0.759) · 2. Gale (0.323) · 3. Zuri (0.285) · 4. Echo (0.203) · 5. Sola (0.165) · 6. Vesper (0.16) · 7. Rift (0.126) · 8. Bront (0.089) · 9. Nova (0.051)
- **Four-player support score:** 1. Echo (27.75) · 2. Bront (0) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Fang: apexTtkSeconds is low at 0.451× median (16.083).
- Gale: apexTtkSeconds is high at 2.309× median (82.383).
- Nova: apexTtkSeconds is high at 1.632× median (58.233).
- Rift: apexTtkSeconds is high at 1.731× median (61.75).
- Zuri: apexTtkSeconds is low at 0.647× median (23.1).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.604× median (3.05).
- Echo: eliteTtkSeconds is low at 0.29× median (1.467).
- Fang: eliteTtkSeconds is low at 0.531× median (2.683).
- Gale: eliteTtkSeconds is high at 1.597× median (8.067).
- Nova: eliteTtkSeconds is high at 3.469× median (17.517).
- Rift: eliteTtkSeconds is high at 2.719× median (13.733).
- Vesper: eliteTtkSeconds is high at 1.568× median (7.917).
- Zuri: eliteTtkSeconds is low at 0.026× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 1.395× median (4140.645).
- Nova: matureAreaDps is low at 0.505× median (1498.977).
- Vesper: pickupReach is high at 5× median (400).
- Bront: soloSurvivalSeconds is low at 0.507× median (10.183).
- Rift: soloSurvivalSeconds is high at 1.385× median (27.8).
- Vesper: soloSurvivalSeconds is low at 0.425× median (8.533).
- Zuri: soloSurvivalSeconds is low at 0.481× median (9.65).
- Bront: squadDamageShare is low at 0.539× median (0.089).
- Fang: squadDamageShare is high at 4.6× median (0.759).
- Gale: squadDamageShare is high at 1.958× median (0.323).
- Nova: squadDamageShare is low at 0.309× median (0.051).
- Zuri: squadDamageShare is high at 1.727× median (0.285).

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
