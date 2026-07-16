# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | — | 30.95s | 0.133s | 31.567s | 0.205 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | — | 10.067s | 1.467s | 13.933s | 0.126 | 27.75 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | — | 22.75s | 5.05s | 27.667s | 0.189 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | — | 25.75s | 3.05s | 59.65s | 0.346 | 7.68 | 80 |
| Fang | 33.113 | 5921.805 | 13.8 | — | 6.85s | 1.817s | 14.083s | 0.82 | 0 | 80 |
| Gale | 23.092 | 1984.725 | 10.45 | — | 3.8s | 7.667s | 30.617s | 0.387 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | — | 33.917s | 14.617s | 86.433s | 0.234 | 0 | 80 |
| Nova | 32.919 | 1588.337 | 9 | — | 23.033s | 6.067s | — | 0.186 | 0 | 80 |
| Vesper | 30.789 | 2021.107 | 9.5 | — | 9.3s | 4.983s | — | 0.069 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (5921.805) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2021.107) · 8. Gale (1984.725) · 9. Nova (1588.337)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Bront (not completed) · 2. Echo (not completed) · 3. Fang (not completed) · 4. Gale (not completed) · 5. Nova (not completed) · 6. Rift (not completed) · 7. Sola (not completed) · 8. Vesper (not completed) · 9. Zuri (not completed)
- **Solo pressure survival:** 1. Rift (33.917) · 2. Zuri (30.95) · 3. Bront (25.75) · 4. Nova (23.033) · 5. Sola (22.75) · 6. Echo (10.067) · 7. Vesper (9.3) · 8. Fang (6.85) · 9. Gale (3.8)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (1.817) · 4. Bront (3.05) · 5. Vesper (4.983) · 6. Sola (5.05) · 7. Nova (6.067) · 8. Gale (7.667) · 9. Rift (14.617)
- **Apex time-to-kill:** 1. Echo (13.933) · 2. Fang (14.083) · 3. Sola (27.667) · 4. Gale (30.617) · 5. Zuri (31.567) · 6. Bront (59.65) · 7. Rift (86.433) · 8. Nova (not completed) · 9. Vesper (not completed)
- **Four-player damage share:** 1. Fang (0.82) · 2. Gale (0.387) · 3. Bront (0.346) · 4. Rift (0.234) · 5. Zuri (0.205) · 6. Sola (0.189) · 7. Nova (0.186) · 8. Echo (0.126) · 9. Vesper (0.069)
- **Four-player support score:** 1. Echo (27.75) · 2. Bront (7.68) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Bront: apexTtkSeconds is high at 1.948× median (59.65).
- Echo: apexTtkSeconds is low at 0.455× median (13.933).
- Fang: apexTtkSeconds is low at 0.46× median (14.083).
- Rift: apexTtkSeconds is high at 2.823× median (86.433).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.612× median (3.05).
- Echo: eliteTtkSeconds is low at 0.294× median (1.467).
- Fang: eliteTtkSeconds is low at 0.365× median (1.817).
- Gale: eliteTtkSeconds is high at 1.539× median (7.667).
- Rift: eliteTtkSeconds is high at 2.933× median (14.617).
- Zuri: eliteTtkSeconds is low at 0.027× median (0.133).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 1.996× median (5921.805).
- Nova: matureAreaDps is low at 0.535× median (1588.337).
- Vesper: pickupReach is high at 5× median (400).
- Echo: soloSurvivalSeconds is low at 0.443× median (10.067).
- Fang: soloSurvivalSeconds is low at 0.301× median (6.85).
- Gale: soloSurvivalSeconds is low at 0.167× median (3.8).
- Rift: soloSurvivalSeconds is high at 1.491× median (33.917).
- Vesper: soloSurvivalSeconds is low at 0.409× median (9.3).
- Zuri: soloSurvivalSeconds is high at 1.36× median (30.95).
- Bront: squadDamageShare is high at 1.688× median (0.346).
- Echo: squadDamageShare is low at 0.615× median (0.126).
- Fang: squadDamageShare is high at 4× median (0.82).
- Gale: squadDamageShare is high at 1.888× median (0.387).
- Vesper: squadDamageShare is low at 0.337× median (0.069).

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
