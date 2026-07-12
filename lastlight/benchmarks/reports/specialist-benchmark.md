# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.12-cover.1` / `fnv1a32:4b3f3e5e`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2948.999 | 10 | 2.05s | 45s | 0.133s | 17.517s | 0.149 | 0 | 80 |
| Echo | 25.32 | 3211.3 | 10 | 1.1s | 36.767s | 2.25s | 25.017s | 0.071 | 46.173 | 80 |
| Sola | 83.077 | 3236.887 | 13.75 | 2.4s | 45s | 2.317s | 28.083s | 0.103 | 0 | 80 |
| Bront | 24.27 | 2945.347 | 17.25 | 1.883s | 45s | 2.6s | — | 0.172 | 7.017 | 80 |
| Fang | 38.624 | 3357.565 | 13.8 | 0.017s | 6.45s | 2.717s | — | 0.556 | 0 | 80 |
| Gale | 28.919 | 2031.906 | 10.45 | 0.417s | 45s | 8.85s | 26.917s | 0.123 | 0 | 80 |
| Rift | 147.016 | 2929.099 | 12 | 0.383s | 45s | 16.267s | 56.583s | 0.174 | 0 | 80 |
| Nova | 50.686 | 927.967 | 9 | 0.017s | 44.317s | 12.4s | — | 0.101 | 0 | 80 |
| Vesper | 26.416 | 2642.98 | 9.5 | 1.1s | 11.133s | 8.95s | — | 0.118 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Rift (147.016) · 2. Sola (83.077) · 3. Zuri (61.31) · 4. Nova (50.686) · 5. Fang (38.624) · 6. Gale (28.919) · 7. Vesper (26.416) · 8. Echo (25.32) · 9. Bront (24.27)
- **Mature area DPS:** 1. Fang (3357.565) · 2. Sola (3236.887) · 3. Echo (3211.3) · 4. Zuri (2948.999) · 5. Bront (2945.347) · 6. Rift (2929.099) · 7. Vesper (2642.98) · 8. Gale (2031.906) · 9. Nova (927.967)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.883) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Gale (45) · 3. Rift (45) · 4. Sola (45) · 5. Zuri (45) · 6. Nova (44.317) · 7. Echo (36.767) · 8. Vesper (11.133) · 9. Fang (6.45)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (2.25) · 3. Sola (2.317) · 4. Bront (2.6) · 5. Fang (2.717) · 6. Gale (8.85) · 7. Vesper (8.95) · 8. Nova (12.4) · 9. Rift (16.267)
- **Apex time-to-kill:** 1. Zuri (17.517) · 2. Echo (25.017) · 3. Gale (26.917) · 4. Sola (28.083) · 5. Rift (56.583) · 6. Bront (not completed) · 7. Fang (not completed) · 8. Nova (not completed) · 9. Vesper (not completed)
- **Four-player damage share:** 1. Fang (0.556) · 2. Rift (0.174) · 3. Bront (0.172) · 4. Zuri (0.149) · 5. Gale (0.123) · 6. Vesper (0.118) · 7. Sola (0.103) · 8. Nova (0.101) · 9. Echo (0.071)
- **Four-player support score:** 1. Echo (46.173) · 2. Bront (7.017) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Rift: apexTtkSeconds is high at 2.102× median (56.583).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Gale: eliteTtkSeconds is high at 3.257× median (8.85).
- Nova: eliteTtkSeconds is high at 4.564× median (12.4).
- Rift: eliteTtkSeconds is high at 5.987× median (16.267).
- Vesper: eliteTtkSeconds is high at 3.294× median (8.95).
- Zuri: eliteTtkSeconds is low at 0.049× median (0.133).
- Bront: escapeTimeSeconds is high at 1.712× median (1.883).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Bront: level1Dps is low at 0.628× median (24.27).
- Rift: level1Dps is high at 3.806× median (147.016).
- Sola: level1Dps is high at 2.151× median (83.077).
- Zuri: level1Dps is high at 1.587× median (61.31).
- Nova: matureAreaDps is low at 0.315× median (927.967).
- Vesper: pickupReach is high at 5× median (400).
- Fang: soloSurvivalSeconds is low at 0.143× median (6.45).
- Vesper: soloSurvivalSeconds is low at 0.247× median (11.133).
- Bront: squadDamageShare is high at 1.398× median (0.172).
- Echo: squadDamageShare is low at 0.577× median (0.071).
- Fang: squadDamageShare is high at 4.52× median (0.556).
- Rift: squadDamageShare is high at 1.415× median (0.174).

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
