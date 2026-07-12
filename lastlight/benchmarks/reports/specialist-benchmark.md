# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.12-identity.2` / `fnv1a32:4ba2b39c`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2941.902 | 10 | 2.05s | 45s | 0.133s | 17.533s | 0.154 | 0 | 80 |
| Echo | 30.756 | 3807.633 | 10 | 1.1s | 28.9s | 2.25s | 24.667s | 0.077 | 46.173 | 80 |
| Sola | 83.077 | 3317.52 | 13.75 | 2.4s | 45s | 1.75s | 27.583s | 0.1 | 0 | 80 |
| Bront | 24.27 | 3053.907 | 17.25 | 1.15s | 45s | 3.2s | 25.417s | 0.128 | 0 | 80 |
| Fang | 38.624 | 3406.9 | 13.8 | 0.017s | 6.533s | 2.717s | 10.85s | 0.418 | 0 | 80 |
| Gale | 27.747 | 2419.053 | 10.45 | 0.417s | 45s | 10.333s | 26.567s | 0.191 | 0 | 80 |
| Rift | 86.4 | 3203.582 | 12 | 0.383s | 45s | 16.233s | 57.1s | 0.172 | 0 | 80 |
| Nova | 50.686 | 1252.827 | 9 | 0.017s | 21.133s | 12.4s | — | 0.111 | 0 | 80 |
| Vesper | 26.416 | 2627.9 | 9.5 | 1.1s | 11.567s | 9.283s | — | 0.117 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Rift (86.4) · 2. Sola (83.077) · 3. Zuri (61.31) · 4. Nova (50.686) · 5. Fang (38.624) · 6. Echo (30.756) · 7. Gale (27.747) · 8. Vesper (26.416) · 9. Bront (24.27)
- **Mature area DPS:** 1. Echo (3807.633) · 2. Fang (3406.9) · 3. Sola (3317.52) · 4. Rift (3203.582) · 5. Bront (3053.907) · 6. Zuri (2941.902) · 7. Vesper (2627.9) · 8. Gale (2419.053) · 9. Nova (1252.827)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Gale (45) · 3. Rift (45) · 4. Sola (45) · 5. Zuri (45) · 6. Echo (28.9) · 7. Nova (21.133) · 8. Vesper (11.567) · 9. Fang (6.533)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Sola (1.75) · 3. Echo (2.25) · 4. Fang (2.717) · 5. Bront (3.2) · 6. Vesper (9.283) · 7. Gale (10.333) · 8. Nova (12.4) · 9. Rift (16.233)
- **Apex time-to-kill:** 1. Fang (10.85) · 2. Zuri (17.533) · 3. Echo (24.667) · 4. Bront (25.417) · 5. Gale (26.567) · 6. Sola (27.583) · 7. Rift (57.1) · 8. Nova (not completed) · 9. Vesper (not completed)
- **Four-player damage share:** 1. Fang (0.418) · 2. Gale (0.191) · 3. Rift (0.172) · 4. Zuri (0.154) · 5. Bront (0.128) · 6. Vesper (0.117) · 7. Nova (0.111) · 8. Sola (0.1) · 9. Echo (0.077)
- **Four-player support score:** 1. Echo (46.173) · 2. Bront (0) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Fang: apexTtkSeconds is low at 0.427× median (10.85).
- Rift: apexTtkSeconds is high at 2.247× median (57.1).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Gale: eliteTtkSeconds is high at 3.229× median (10.333).
- Nova: eliteTtkSeconds is high at 3.875× median (12.4).
- Rift: eliteTtkSeconds is high at 5.073× median (16.233).
- Sola: eliteTtkSeconds is low at 0.547× median (1.75).
- Vesper: eliteTtkSeconds is high at 2.901× median (9.283).
- Zuri: eliteTtkSeconds is low at 0.042× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Bront: level1Dps is low at 0.628× median (24.27).
- Rift: level1Dps is high at 2.237× median (86.4).
- Sola: level1Dps is high at 2.151× median (83.077).
- Zuri: level1Dps is high at 1.587× median (61.31).
- Nova: matureAreaDps is low at 0.41× median (1252.827).
- Vesper: pickupReach is high at 5× median (400).
- Echo: soloSurvivalSeconds is low at 0.642× median (28.9).
- Fang: soloSurvivalSeconds is low at 0.145× median (6.533).
- Nova: soloSurvivalSeconds is low at 0.47× median (21.133).
- Vesper: soloSurvivalSeconds is low at 0.257× median (11.567).
- Echo: squadDamageShare is low at 0.602× median (0.077).
- Fang: squadDamageShare is high at 3.266× median (0.418).
- Gale: squadDamageShare is high at 1.492× median (0.191).

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
