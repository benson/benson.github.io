# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.13-discoveries.1` / `fnv1a32:bc731c2c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2917.846 | 10 | 2.05s | 13.733s | 0.133s | 22.033s | 0.372 | 0 | 80 |
| Echo | 30.756 | 3714.04 | 10 | 1.1s | 21.95s | 1.467s | 21.767s | 0.519 | 44.977 | 80 |
| Sola | 24.041 | 3139.643 | 13.75 | 2.4s | 19.233s | 5.067s | 33.367s | 0.215 | 0 | 80 |
| Bront | 24.27 | 2967.307 | 17.25 | 1.15s | 12.45s | 3.033s | 80.117s | 0.302 | 6.86 | 80 |
| Fang | 33.113 | 7227.885 | 13.8 | 0.017s | 45s | 2.683s | 14.383s | 0.59 | 0 | 80 |
| Gale | 23.092 | 1984.525 | 10.45 | 0.417s | 43.333s | 8.45s | — | 0.09 | 0 | 80 |
| Rift | 51.904 | 3854.694 | 12 | 0.383s | 45s | 10.4s | 58.2s | 0.327 | 0 | 80 |
| Nova | 32.919 | 1498.977 | 9 | 0.017s | 9.417s | 6.4s | — | 0.207 | 0 | 80 |
| Vesper | 30.789 | 2021.107 | 9.5 | 1.1s | 8.967s | 5.35s | 46.1s | 0.07 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Echo (30.756) · 7. Bront (24.27) · 8. Sola (24.041) · 9. Gale (23.092)
- **Mature area DPS:** 1. Fang (7227.885) · 2. Rift (3854.694) · 3. Echo (3714.04) · 4. Sola (3139.643) · 5. Bront (2967.307) · 6. Zuri (2917.846) · 7. Vesper (2021.107) · 8. Gale (1984.525) · 9. Nova (1498.977)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Fang (45) · 2. Rift (45) · 3. Gale (43.333) · 4. Echo (21.95) · 5. Sola (19.233) · 6. Zuri (13.733) · 7. Bront (12.45) · 8. Nova (9.417) · 9. Vesper (8.967)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.467) · 3. Fang (2.683) · 4. Bront (3.033) · 5. Sola (5.067) · 6. Vesper (5.35) · 7. Nova (6.4) · 8. Gale (8.45) · 9. Rift (10.4)
- **Apex time-to-kill:** 1. Fang (14.383) · 2. Echo (21.767) · 3. Zuri (22.033) · 4. Sola (33.367) · 5. Vesper (46.1) · 6. Rift (58.2) · 7. Bront (80.117) · 8. Gale (not completed) · 9. Nova (not completed)
- **Four-player damage share:** 1. Fang (0.59) · 2. Echo (0.519) · 3. Zuri (0.372) · 4. Rift (0.327) · 5. Bront (0.302) · 6. Sola (0.215) · 7. Nova (0.207) · 8. Gale (0.09) · 9. Vesper (0.07)
- **Four-player support score:** 1. Echo (44.977) · 2. Bront (6.86) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Bront: apexTtkSeconds is high at 2.401× median (80.117).
- Fang: apexTtkSeconds is low at 0.431× median (14.383).
- Rift: apexTtkSeconds is high at 1.744× median (58.2).
- Vesper: apexTtkSeconds is high at 1.382× median (46.1).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.599× median (3.033).
- Echo: eliteTtkSeconds is low at 0.29× median (1.467).
- Fang: eliteTtkSeconds is low at 0.53× median (2.683).
- Gale: eliteTtkSeconds is high at 1.668× median (8.45).
- Rift: eliteTtkSeconds is high at 2.052× median (10.4).
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
- Bront: soloSurvivalSeconds is low at 0.647× median (12.45).
- Fang: soloSurvivalSeconds is high at 2.34× median (45).
- Gale: soloSurvivalSeconds is high at 2.253× median (43.333).
- Nova: soloSurvivalSeconds is low at 0.49× median (9.417).
- Rift: soloSurvivalSeconds is high at 2.34× median (45).
- Vesper: soloSurvivalSeconds is low at 0.466× median (8.967).
- Echo: squadDamageShare is high at 1.719× median (0.519).
- Fang: squadDamageShare is high at 1.954× median (0.59).
- Gale: squadDamageShare is low at 0.298× median (0.09).
- Vesper: squadDamageShare is low at 0.232× median (0.07).

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
