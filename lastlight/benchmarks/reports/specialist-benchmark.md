# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.12-evolutions.2` / `fnv1a32:f06f76bb`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2949.054 | 10 | 2.05s | 45s | 0.133s | 17.533s | 0.153 | 0 | 80 |
| Echo | 30.259 | 3664.96 | 10 | 1.1s | 28.683s | 2.25s | 24.517s | 0.074 | 46.173 | 80 |
| Sola | 24.041 | 3186.676 | 13.75 | 2.4s | 45s | 6.767s | 34.417s | 0.101 | 0 | 80 |
| Bront | 24.27 | 3107.24 | 17.25 | 1.15s | 45s | 3.183s | 25.417s | 0.126 | 0 | 80 |
| Fang | 33.113 | 8239.209 | 13.8 | 0.017s | 6.433s | 2.683s | 7.95s | 0.493 | 0 | 80 |
| Gale | 23.149 | 2234.235 | 10.45 | 0.417s | 45s | 10.35s | 26.067s | 0.221 | 0 | 80 |
| Rift | 51.904 | 3839.41 | 12 | 0.383s | 45s | 16.317s | 57.1s | 0.172 | 0 | 80 |
| Nova | 32.919 | 2325.583 | 9 | 0.017s | 21.467s | 11.3s | — | 0.119 | 0 | 80 |
| Vesper | 30.789 | 2181.293 | 9.5 | 1.1s | 11.333s | 9.567s | — | 0.115 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.259) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.149)
- **Mature area DPS:** 1. Fang (8239.209) · 2. Rift (3839.41) · 3. Echo (3664.96) · 4. Sola (3186.676) · 5. Bront (3107.24) · 6. Zuri (2949.054) · 7. Nova (2325.583) · 8. Gale (2234.235) · 9. Vesper (2181.293)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Gale (45) · 3. Rift (45) · 4. Sola (45) · 5. Zuri (45) · 6. Echo (28.683) · 7. Nova (21.467) · 8. Vesper (11.333) · 9. Fang (6.433)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (2.25) · 3. Fang (2.683) · 4. Bront (3.183) · 5. Sola (6.767) · 6. Vesper (9.567) · 7. Gale (10.35) · 8. Nova (11.3) · 9. Rift (16.317)
- **Apex time-to-kill:** 1. Fang (7.95) · 2. Zuri (17.533) · 3. Echo (24.517) · 4. Bront (25.417) · 5. Gale (26.067) · 6. Sola (34.417) · 7. Rift (57.1) · 8. Nova (not completed) · 9. Vesper (not completed)
- **Four-player damage share:** 1. Fang (0.493) · 2. Gale (0.221) · 3. Rift (0.172) · 4. Zuri (0.153) · 5. Bront (0.126) · 6. Nova (0.119) · 7. Vesper (0.115) · 8. Sola (0.101) · 9. Echo (0.074)
- **Four-player support score:** 1. Echo (46.173) · 2. Bront (0) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Fang: apexTtkSeconds is low at 0.313× median (7.95).
- Rift: apexTtkSeconds is high at 2.247× median (57.1).
- Sola: apexTtkSeconds is high at 1.354× median (34.417).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.47× median (3.183).
- Echo: eliteTtkSeconds is low at 0.332× median (2.25).
- Fang: eliteTtkSeconds is low at 0.396× median (2.683).
- Gale: eliteTtkSeconds is high at 1.529× median (10.35).
- Nova: eliteTtkSeconds is high at 1.67× median (11.3).
- Rift: eliteTtkSeconds is high at 2.411× median (16.317).
- Vesper: eliteTtkSeconds is high at 1.414× median (9.567).
- Zuri: eliteTtkSeconds is low at 0.02× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Fang: matureAreaDps is high at 2.652× median (8239.209).
- Vesper: pickupReach is high at 5× median (400).
- Echo: soloSurvivalSeconds is low at 0.637× median (28.683).
- Fang: soloSurvivalSeconds is low at 0.143× median (6.433).
- Nova: soloSurvivalSeconds is low at 0.477× median (21.467).
- Vesper: soloSurvivalSeconds is low at 0.252× median (11.333).
- Echo: squadDamageShare is low at 0.587× median (0.074).
- Fang: squadDamageShare is high at 3.913× median (0.493).
- Gale: squadDamageShare is high at 1.754× median (0.221).
- Rift: squadDamageShare is high at 1.365× median (0.172).

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
