# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | 2.05s | 45s | 0.133s | 24.033s | 0.22 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | 1.1s | 23.85s | 1.467s | 14.867s | 0.386 | 39.814 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | 2.4s | 45s | 5.05s | 34.217s | 0.171 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | 1.15s | 21.683s | 3.05s | 31.933s | 0.174 | 6.86 | 80 |
| Fang | 33.113 | 4140.645 | 13.8 | 0.017s | 21.05s | 2.683s | 16.083s | 0.759 | 0 | 80 |
| Gale | 23.092 | 1984.725 | 10.45 | 0.417s | 17.133s | 8.067s | 23.233s | 0.285 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | 0.383s | 45s | 13.733s | 51.6s | 0.126 | 0 | 80 |
| Nova | 32.919 | 1498.977 | 9 | 0.017s | 10.183s | 10.183s | 43.6s | 0.286 | 0 | 80 |
| Vesper | 30.789 | 2232.227 | 9.5 | 1.1s | 12.233s | 5.467s | 31.783s | 0.087 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (4140.645) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2232.227) · 8. Gale (1984.725) · 9. Nova (1498.977)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Rift (45) · 2. Sola (45) · 3. Zuri (45) · 4. Echo (23.85) · 5. Bront (21.683) · 6. Fang (21.05) · 7. Gale (17.133) · 8. Vesper (12.233) · 9. Nova (10.183)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (2.683) · 4. Bront (3.05) · 5. Sola (5.05) · 6. Vesper (5.467) · 7. Gale (8.067) · 8. Nova (10.183) · 9. Rift (13.733)
- **Apex time-to-kill:** 1. Echo (14.867) · 2. Fang (16.083) · 3. Gale (23.233) · 4. Zuri (24.033) · 5. Vesper (31.783) · 6. Bront (31.933) · 7. Sola (34.217) · 8. Nova (43.6) · 9. Rift (51.6)
- **Four-player damage share:** 1. Fang (0.759) · 2. Echo (0.386) · 3. Nova (0.286) · 4. Gale (0.285) · 5. Zuri (0.22) · 6. Bront (0.174) · 7. Sola (0.171) · 8. Rift (0.126) · 9. Vesper (0.087)
- **Four-player support score:** 1. Echo (39.814) · 2. Bront (6.86) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Echo: apexTtkSeconds is low at 0.468× median (14.867).
- Fang: apexTtkSeconds is low at 0.506× median (16.083).
- Nova: apexTtkSeconds is high at 1.372× median (43.6).
- Rift: apexTtkSeconds is high at 1.624× median (51.6).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.604× median (3.05).
- Echo: eliteTtkSeconds is low at 0.29× median (1.467).
- Fang: eliteTtkSeconds is low at 0.531× median (2.683).
- Gale: eliteTtkSeconds is high at 1.597× median (8.067).
- Nova: eliteTtkSeconds is high at 2.016× median (10.183).
- Rift: eliteTtkSeconds is high at 2.719× median (13.733).
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
- Nova: soloSurvivalSeconds is low at 0.47× median (10.183).
- Rift: soloSurvivalSeconds is high at 2.075× median (45).
- Sola: soloSurvivalSeconds is high at 2.075× median (45).
- Vesper: soloSurvivalSeconds is low at 0.564× median (12.233).
- Zuri: soloSurvivalSeconds is high at 2.075× median (45).
- Echo: squadDamageShare is high at 1.755× median (0.386).
- Fang: squadDamageShare is high at 3.45× median (0.759).
- Rift: squadDamageShare is low at 0.573× median (0.126).
- Vesper: squadDamageShare is low at 0.395× median (0.087).

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
