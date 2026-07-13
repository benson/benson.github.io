# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-synergies.1` / `fnv1a32:4cfa0ff0`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2941.902 | 10 | 2.05s | 13.017s | 0.133s | 26s | 0.211 | 0 | 80 |
| Echo | 25.667 | 3650.927 | 10 | 1.1s | 45s | 1.533s | 78s | 0.122 | 33.673 | 80 |
| Sola | 24.041 | 3208.397 | 13.75 | 2.4s | 45s | 6.767s | 49.05s | 0.093 | 0 | 80 |
| Bront | 24.27 | 2977.2 | 17.25 | 1.15s | 45s | 3.2s | 37.7s | 0.146 | 2.56 | 80 |
| Fang | 33.113 | 6053.445 | 13.8 | 0.017s | 18.033s | 2.683s | 15.667s | 0.855 | 0 | 80 |
| Gale | 27.665 | 2099.621 | 10.45 | 0.417s | 45s | 10.683s | 26.217s | 0.189 | 0 | 80 |
| Rift | 51.904 | 3828.514 | 12 | 0.383s | 45s | 16.333s | 61.9s | 0.194 | 0 | 80 |
| Nova | 32.919 | 2315.703 | 9 | 0.017s | 45s | 11.033s | 51.867s | 0.105 | 0 | 80 |
| Vesper | 30.789 | 2178.78 | 9.5 | 1.1s | 12.5s | 9.867s | 39.383s | 0.068 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Gale (27.665) · 7. Echo (25.667) · 8. Bront (24.27) · 9. Sola (24.041)
- **Mature area DPS:** 1. Fang (6053.445) · 2. Rift (3828.514) · 3. Echo (3650.927) · 4. Sola (3208.397) · 5. Bront (2977.2) · 6. Zuri (2941.902) · 7. Nova (2315.703) · 8. Vesper (2178.78) · 9. Gale (2099.621)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Echo (45) · 3. Gale (45) · 4. Nova (45) · 5. Rift (45) · 6. Sola (45) · 7. Fang (18.033) · 8. Zuri (13.017) · 9. Vesper (12.5)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.533) · 3. Fang (2.683) · 4. Bront (3.2) · 5. Sola (6.767) · 6. Vesper (9.867) · 7. Gale (10.683) · 8. Nova (11.033) · 9. Rift (16.333)
- **Apex time-to-kill:** 1. Fang (15.667) · 2. Zuri (26) · 3. Gale (26.217) · 4. Bront (37.7) · 5. Vesper (39.383) · 6. Sola (49.05) · 7. Nova (51.867) · 8. Rift (61.9) · 9. Echo (78)
- **Four-player damage share:** 1. Fang (0.855) · 2. Zuri (0.211) · 3. Rift (0.194) · 4. Gale (0.189) · 5. Bront (0.146) · 6. Echo (0.122) · 7. Nova (0.105) · 8. Sola (0.093) · 9. Vesper (0.068)
- **Four-player support score:** 1. Echo (33.673) · 2. Bront (2.56) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Echo: apexTtkSeconds is high at 1.981× median (78).
- Fang: apexTtkSeconds is low at 0.398× median (15.667).
- Rift: apexTtkSeconds is high at 1.572× median (61.9).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.473× median (3.2).
- Echo: eliteTtkSeconds is low at 0.227× median (1.533).
- Fang: eliteTtkSeconds is low at 0.396× median (2.683).
- Gale: eliteTtkSeconds is high at 1.579× median (10.683).
- Nova: eliteTtkSeconds is high at 1.63× median (11.033).
- Rift: eliteTtkSeconds is high at 2.414× median (16.333).
- Vesper: eliteTtkSeconds is high at 1.458× median (9.867).
- Zuri: eliteTtkSeconds is low at 0.02× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 2.033× median (6053.445).
- Vesper: pickupReach is high at 5× median (400).
- Fang: soloSurvivalSeconds is low at 0.401× median (18.033).
- Vesper: soloSurvivalSeconds is low at 0.278× median (12.5).
- Zuri: soloSurvivalSeconds is low at 0.289× median (13.017).
- Fang: squadDamageShare is high at 5.856× median (0.855).
- Sola: squadDamageShare is low at 0.637× median (0.093).
- Vesper: squadDamageShare is low at 0.466× median (0.068).
- Zuri: squadDamageShare is high at 1.445× median (0.211).

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
