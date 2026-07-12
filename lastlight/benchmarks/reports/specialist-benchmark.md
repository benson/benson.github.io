# Lastlight specialist benchmark

Contract: `actual-simulation-fixed-seed-v1`
Balance: `2026.07.12-evolutions.1` / `fnv1a32:1f4e921f`
Matrix: 9 specialists × 10 fixed-seed scenarios = 90 cases

## Comparable summary

| Specialist | L1 DPS | Mature area DPS | Effective vitality | Escape | Solo survival | Elite TTK | Apex TTK | Squad damage | Support | Pickup reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zuri | 61.31 | 2941.902 | 10 | 2.05s | 45s | 0.133s | 17.517s | 0.151 | 0 | 80 |
| Echo | 25.667 | 3581.713 | 10 | 1.1s | 34.55s | 1.533s | 24.5s | 0.081 | 46.173 | 80 |
| Sola | 24.041 | 3197.108 | 13.75 | 2.4s | 45s | 6.333s | 34.417s | 0.102 | 0 | 80 |
| Bront | 24.27 | 3093.24 | 17.25 | 1.15s | 45s | 3.183s | 25.417s | 0.129 | 0 | 80 |
| Fang | 33.113 | 3955.795 | 13.8 | 0.017s | 6.333s | 2.683s | 7.95s | 0.572 | 0 | 80 |
| Gale | 27.747 | 2081.108 | 10.45 | 0.417s | 45s | 10.35s | 27.983s | 0.176 | 0 | 80 |
| Rift | 51.904 | 3770.138 | 12 | 0.383s | 45s | 16.833s | 57.083s | 0.171 | 0 | 80 |
| Nova | 32.919 | 2305.73 | 9 | 0.017s | 44.2s | 11.517s | — | 0.112 | 0 | 80 |
| Vesper | 30.789 | 2178.78 | 9.5 | 1.1s | 45s | 9.6s | — | 0.114 | 0 | 400 |

## Rankings

- **Level 1 single-target DPS:** 1. Zuri (61.31) · 2. Rift (51.904) · 3. Fang (33.113) · 4. Nova (32.919) · 5. Vesper (30.789) · 6. Gale (27.747) · 7. Echo (25.667) · 8. Bront (24.27) · 9. Sola (24.041)
- **Mature area DPS:** 1. Fang (3955.795) · 2. Rift (3770.138) · 3. Echo (3581.713) · 4. Sola (3197.108) · 5. Bront (3093.24) · 6. Zuri (2941.902) · 7. Nova (2305.73) · 8. Vesper (2178.78) · 9. Gale (2081.108)
- **Base effective vitality:** 1. Bront (17.25) · 2. Fang (13.8) · 3. Sola (13.75) · 4. Rift (12) · 5. Gale (10.45) · 6. Echo (10) · 7. Zuri (10) · 8. Vesper (9.5) · 9. Nova (9)
- **Escape time:** 1. Fang (0.017) · 2. Nova (0.017) · 3. Rift (0.383) · 4. Gale (0.417) · 5. Echo (1.1) · 6. Vesper (1.1) · 7. Bront (1.15) · 8. Zuri (2.05) · 9. Sola (2.4)
- **Solo pressure survival:** 1. Bront (45) · 2. Gale (45) · 3. Rift (45) · 4. Sola (45) · 5. Vesper (45) · 6. Zuri (45) · 7. Nova (44.2) · 8. Echo (34.55) · 9. Fang (6.333)
- **Elite time-to-kill:** 1. Zuri (0.133) · 2. Echo (1.533) · 3. Fang (2.683) · 4. Bront (3.183) · 5. Sola (6.333) · 6. Vesper (9.6) · 7. Gale (10.35) · 8. Nova (11.517) · 9. Rift (16.833)
- **Apex time-to-kill:** 1. Fang (7.95) · 2. Zuri (17.517) · 3. Echo (24.5) · 4. Bront (25.417) · 5. Gale (27.983) · 6. Sola (34.417) · 7. Rift (57.083) · 8. Nova (not completed) · 9. Vesper (not completed)
- **Four-player damage share:** 1. Fang (0.572) · 2. Gale (0.176) · 3. Rift (0.171) · 4. Zuri (0.151) · 5. Bront (0.129) · 6. Vesper (0.114) · 7. Nova (0.112) · 8. Sola (0.102) · 9. Echo (0.081)
- **Four-player support score:** 1. Echo (46.173) · 2. Bront (0) · 3. Fang (0) · 4. Gale (0) · 5. Nova (0) · 6. Rift (0) · 7. Sola (0) · 8. Vesper (0) · 9. Zuri (0)
- **Measured pickup reach:** 1. Vesper (400) · 2. Bront (80) · 3. Echo (80) · 4. Fang (80) · 5. Gale (80) · 6. Nova (80) · 7. Rift (80) · 8. Sola (80) · 9. Zuri (80)

## Flagged outliers

- Fang: apexTtkSeconds is low at 0.313× median (7.95).
- Rift: apexTtkSeconds is high at 2.246× median (57.083).
- Sola: apexTtkSeconds is high at 1.354× median (34.417).
- Bront: effectiveVitality is high at 1.651× median (17.25).
- Bront: eliteTtkSeconds is low at 0.503× median (3.183).
- Echo: eliteTtkSeconds is low at 0.242× median (1.533).
- Fang: eliteTtkSeconds is low at 0.424× median (2.683).
- Gale: eliteTtkSeconds is high at 1.634× median (10.35).
- Nova: eliteTtkSeconds is high at 1.819× median (11.517).
- Rift: eliteTtkSeconds is high at 2.658× median (16.833).
- Vesper: eliteTtkSeconds is high at 1.516× median (9.6).
- Zuri: eliteTtkSeconds is low at 0.021× median (0.133).
- Fang: escapeTimeSeconds is low at 0.015× median (0.017).
- Gale: escapeTimeSeconds is low at 0.379× median (0.417).
- Nova: escapeTimeSeconds is low at 0.015× median (0.017).
- Rift: escapeTimeSeconds is low at 0.348× median (0.383).
- Sola: escapeTimeSeconds is high at 2.182× median (2.4).
- Zuri: escapeTimeSeconds is high at 1.864× median (2.05).
- Rift: level1Dps is high at 1.686× median (51.904).
- Zuri: level1Dps is high at 1.991× median (61.31).
- Vesper: pickupReach is high at 5× median (400).
- Fang: soloSurvivalSeconds is low at 0.141× median (6.333).
- Echo: squadDamageShare is low at 0.628× median (0.081).
- Fang: squadDamageShare is high at 4.434× median (0.572).
- Gale: squadDamageShare is high at 1.364× median (0.176).

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
