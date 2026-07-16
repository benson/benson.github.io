# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | — | 10.567s | 0.133s | 22.167s | 0.217 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | — | 10.25s | 1.467s | 12.983s | 0.169 | 44.802 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | — | 45s | 5.05s | 42.25s | 0.163 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | — | 18.1s | 3.033s | 25.883s | 0.333 | 7.68 | 80 |
| Fang | 33.113 | 6133.34 | 13.8 | — | 45s | 1.683s | 14.017s | 0.855 | 0 | 80 |
| Gale | 23.092 | 1984.725 | 10.45 | — | 45s | 10.433s | 72.7s | 0.334 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | — | 45s | 16.4s | 82.533s | 0.109 | 0 | 80 |
| Nova | 32.919 | 1694 | 9 | — | 20.667s | 10.933s | 69.25s | 0.109 | 0 | 80 |
| Vesper | 30.789 | 2232.227 | 9.5 | — | 7.6s | 4.9s | 52.333s | 0.079 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (6133.34) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2232.227) · 8. Gale (1984.725) · 9. Nova (1694)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Bront (not completed) · 2. Echo (not completed) · 3. Fang (not completed) · 4. Gale (not completed) · 5. Nova (not completed) · 6. Rift (not completed) · 7. Sola (not completed) · 8. Vesper (not completed) · 9. Zuri (not completed)
- **Solo pressure survival:** 1. Fang (45) · 2. Gale (45) · 3. Rift (45) · 4. Sola (45) · 5. Nova (20.667) · 6. Bront (18.1) · 7. Zuri (10.567) · 8. Echo (10.25) · 9. Vesper (7.6)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (1.683) · 4. Bront (3.033) · 5. Vesper (4.9) · 6. Sola (5.05) · 7. Gale (10.433) · 8. Nova (10.933) · 9. Rift (16.4)
- **Apex time-to-kill:** 1. Echo (12.983) · 2. Fang (14.017) · 3. Zuri (22.167) · 4. Bront (25.883) · 5. Sola (42.25) · 6. Vesper (52.333) · 7. Nova (69.25) · 8. Gale (72.7) · 9. Rift (82.533)
- **Four-player damage share:** 1. Fang (0.855) · 2. Gale (0.334) · 3. Bront (0.333) · 4. Zuri (0.217) · 5. Echo (0.169) · 6. Sola (0.163) · 7. Nova (0.109) · 8. Rift (0.109) · 9. Vesper (0.079)
- **Four-player support score:** 1. Echo (44.802) · 2. Bront (7.68) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Bront: apexTtkSeconds is low at 0.613× median (25.883).
- Echo: apexTtkSeconds is low at 0.307× median (12.983).
- Fang: apexTtkSeconds is low at 0.332× median (14.017).
- Gale: apexTtkSeconds is high at 1.721× median (72.7).
- Nova: apexTtkSeconds is high at 1.639× median (69.25).
- Rift: apexTtkSeconds is high at 1.953× median (82.533).
- Zuri: apexTtkSeconds is low at 0.525× median (22.167).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.619× median (3.033).
- Echo: eliteTtkSeconds is low at 0.299× median (1.467).
- Fang: eliteTtkSeconds is low at 0.343× median (1.683).
- Gale: eliteTtkSeconds is high at 2.129× median (10.433).
- Nova: eliteTtkSeconds is high at 2.231× median (10.933).
- Rift: eliteTtkSeconds is high at 3.347× median (16.4).
- Zuri: eliteTtkSeconds is low at 0.027× median (0.133).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 2.067× median (6133.34).
- Nova: matureAreaDps is low at 0.571× median (1694).
- Vesper: pickupReach is high at 5× median (400).
- Echo: soloSurvivalSeconds is low at 0.496× median (10.25).
- Fang: soloSurvivalSeconds is high at 2.177× median (45).
- Gale: soloSurvivalSeconds is high at 2.177× median (45).
- Rift: soloSurvivalSeconds is high at 2.177× median (45).
- Sola: soloSurvivalSeconds is high at 2.177× median (45).
- Vesper: soloSurvivalSeconds is low at 0.368× median (7.6).
- Zuri: soloSurvivalSeconds is low at 0.511× median (10.567).
- Bront: squadDamageShare is high at 1.97× median (0.333).
- Fang: squadDamageShare is high at 5.059× median (0.855).
- Gale: squadDamageShare is high at 1.976× median (0.334).
- Nova: squadDamageShare is low at 0.645× median (0.109).
- Rift: squadDamageShare is low at 0.645× median (0.109).
- Vesper: squadDamageShare is low at 0.467× median (0.079).

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
